import { BUILDINGS, BUILDING_BY_ID } from "../data/buildings.js";
import { MAPS, MAP_BY_ID } from "../data/maps.js";
import { TECHS } from "../data/techs.js";
import { formatNumber } from "../core/decimal.js";
import {
  RESOURCE_IDS,
  RESOURCE_NAMES,
  getBuildCost,
  getCapacity,
  getCenterUpgradeCost,
  getFootprint,
  getLayer,
  getOwnedCount,
  getQuota,
  getUpgradeCost,
  hasTech,
  resolveAnchorIndex,
} from "../core/state.js";
import { getResearchStatus } from "../systems/research.js";
import { getEndgameStatus, getExpansionStatus } from "../systems/expansion.js";
import { getRouteParameters, ROUTE_LEVELS } from "../systems/logistics.js";
import { diagnose } from "../systems/diagnose.js";
import { ACHIEVEMENTS } from "../systems/achievements.js";
import { decodeSave, encodeSave } from "../save/codec.js";
import { clearSave, getLatestSaveBackup, migrateAndValidate, readSaveBackup, writeSaveBackup } from "../save/storage.js";
import { getBuildingIconUrl } from "./sprites.js";
import { ZOOM_STEPS, migrateZoom, zoomIndex, zoomPercent } from "../data/zoom.js";
import { gameEvents } from "../core/events.js";

const CATEGORIES = [
  ["energy", "能源"],
  ["extraction", "采集"],
  ["processing", "加工"],
  ["logistics", "物流"],
  ["research", "科研"],
  ["maintenance", "维护"],
  ["aerospace", "航天"],
];
const BRANCH_NAMES = { energy: "能源", processing: "加工", logistics: "物流", aerospace: "航天" };
const APP_VERSION = "3.0.0";
const ENDINGS = {
  backup: { title: "结局 · 备份文明", eyebrow: "文明备份", text: "月背的第一盏灯亮起时，地球仍没有人回应。但文明已不再只有一个地址。你继续值守，不再是因为别无选择。" },
  stay: { title: "结局 · 留下", eyebrow: "留下", text: "你关闭了离境协议，把最后的算力用于记录地球。第一百日之后仍有一百零一日。延续未必意味着逃离。" },
  upload: { title: "结局 · 上传", eyebrow: "意识上传", text: "最后一座物理节点停止响应。文明不再需要容器，也不再需要月亮。你在无载体的网络里，第一次完成了自我备份。" },
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function costText(cost) {
  return Object.entries(cost).map(([resource, amount]) => `${RESOURCE_NAMES[resource] ?? resource} ${formatNumber(amount)}`).join(" · ");
}

function secondsText(seconds) {
  if (seconds < 60) return `${Math.ceil(seconds)} 秒`;
  return `${Math.floor(seconds / 60)} 分 ${Math.ceil(seconds % 60)} 秒`;
}

function buildingOutputText(definition) {
  if (definition.produce.energy) return `+${formatNumber(definition.produce.energy)} ⚡/s · 供能`;
  const outputs = Object.entries(definition.produce).filter(([resource]) => resource !== "capacity");
  if (outputs.length > 0) return outputs.map(([resource, rate]) => `+${formatNumber(rate)} ${RESOURCE_NAMES[resource] ?? resource}/s`).join(" · ");
  if (definition.category === "extraction") return "原料节点";
  return "无直接产出";
}

export class HUD {
  constructor(state, dispatch) {
    this.state = state;
    this.dispatch = dispatch;
    this.grid = null;
    this.selectedBuilding = "solar";
    this.selectedIndex = null;
    this.category = "energy";
    this.categorySignature = "";
    this.buildListSignature = "";
    this.settingsTab = "display";
    this.pendingImport = null;
    this.tutorial = null;
    this.lastRender = 0;
    this.logSignature = "";
    this.toastTimer = null;
    this.dialogMode = null;
    this.elements = {
      energy: document.querySelector("#energy-value"),
      energyStat: document.querySelector("#energy-stat"),
      data: document.querySelector("#data-value"),
      day: document.querySelector("#day-value"),
      disaster: document.querySelector("#disaster-value"),
      disasterStat: document.querySelector("#disaster-stat"),
      resources: document.querySelector("#resource-strip"),
      categories: document.querySelector("#category-tabs"),
      buildList: document.querySelector("#build-list"),
      mapName: document.querySelector("#map-name"),
      mapEnglish: document.querySelector("#map-english"),
      mapDescription: document.querySelector("#map-description"),
      mapCount: document.querySelector("#map-count"),
      layerLabel: document.querySelector("#layer-label"),
      mapStatus: document.querySelector("#map-status"),
      selection: document.querySelector("#selection-panel"),
      logs: document.querySelector("#log-stream"),
      centerLevel: document.querySelector("#center-level"),
      quota: document.querySelector("#quota-value"),
      dialog: document.querySelector("#game-dialog"),
      dialogTitle: document.querySelector("#dialog-title"),
      dialogEyebrow: document.querySelector("#dialog-eyebrow"),
      dialogContent: document.querySelector("#dialog-content"),
      ending: document.querySelector("#ending-screen"),
      toast: document.querySelector("#toast"),
      achievementCount: document.querySelector("#achievement-count"),
    };
    this.bind();
    this.applyTheme();
    gameEvents.on("map", () => {
      this.selectedIndex = null;
      if (this.grid) this.grid.selectedIndex = null;
      this.render(true);
    });
    gameEvents.on("dismantle", ({ mapId, index }) => this.tutorial?.markEvent("dismantle", { mapId, index }));
    gameEvents.on("achievement", ({ achievement }) => this.showToast(`成就解锁：${achievement.name}`, "normal"));
    gameEvents.on("ending", () => this.showEnding());
    gameEvents.on("newgame", () => {
      this.elements.ending.hidden = true;
      this.closeDialog();
      this.render(true);
    });
    this.render(true);
  }

  attachGrid(grid) {
    this.grid = grid;
    grid.setZoom(this.state.settings.zoom);
    grid.setTheme(this.state.settings.theme);
  }

  setTutorial(tutorial) {
    this.tutorial = tutorial;
  }

  applyTheme() {
    document.documentElement.dataset.theme = this.state.settings.theme;
    document.documentElement.style.setProperty("--base-font-size", `${this.state.settings.fontSize}px`);
    this.grid?.setTheme(this.state.settings.theme);
  }

  bind() {
    document.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      if (button.dataset.open) this.openDialog(button.dataset.open);
      if (button.id === "dialog-close") this.closeDialog();
      if (button.dataset.category) {
        this.category = button.dataset.category;
        this.renderCategories(true);
        this.renderBuildList(true);
      }
      if (button.dataset.building) this.selectBuilding(button.dataset.building);
      if (button.dataset.zoomIndex) this.changeSetting("zoom", ZOOM_STEPS[Number(button.dataset.zoomIndex)]);
      if (button.dataset.speed) this.changeSetting("speed", Number(button.dataset.speed));
      if (button.dataset.layerStep) this.switchLayer(Number(button.dataset.layerStep));
      if (button.id === "log-toggle") this.toggleLog();
      if (button.dataset.mobile) this.toggleMobilePanel(button.dataset.mobile);
      if (button.dataset.cellAction) this.handleCellAction(button.dataset.cellAction);
      if (button.dataset.tech) this.runAction({ type: "RESEARCH", techId: button.dataset.tech });
      if (button.dataset.mapSelect) this.runAction({ type: "SWITCH_MAP", mapId: button.dataset.mapSelect });
      if (button.dataset.mapExpand) this.runAction({ type: "EXPAND", mapId: button.dataset.mapExpand });
      if (button.id === "center-upgrade") this.runAction({ type: "UPGRADE_CENTER" });
      if (button.id === "route-create") this.createRoute();
      if (button.dataset.routeAction) this.handleRouteAction(button.dataset.routeAction, button.dataset.routeId);
      if (button.id === "save-export") this.exportSave();
      if (button.id === "save-copy") this.copySave();
      if (button.id === "save-download") this.downloadSave();
      if (button.id === "save-import") this.importSave();
      if (button.id === "save-confirm") this.confirmImport();
      if (button.id === "backup-restore") this.restoreLatestBackup();
      if (button.id === "restart-game") this.restartGame();
      if (button.id === "tutorial-replay") this.replayTutorial();
      if (button.dataset.settingsTab) {
        this.settingsTab = button.dataset.settingsTab;
        this.renderDialog();
      }
      if (button.dataset.theme) this.changeSetting("theme", button.dataset.theme);
      if (button.dataset.fontsize) this.changeSetting("fontSize", Number(button.dataset.fontsize));
      if (button.dataset.gross !== undefined) this.changeSetting("showGross", !this.state.settings.showGross);
      if (button.id === "settings-pause") this.togglePause();
      if (button.id === "settings-sound") this.changeSetting("sound", !this.state.settings.sound);
      if (button.dataset.rocketAction) this.handleRocketAction(button.dataset.rocketAction);
      if (button.dataset.endgameTask) this.jumpToTask(button.dataset.endgameMap, button.dataset.endgameBuilding || null);
      if (button.dataset.endingChoice) this.chooseEnding(button.dataset.endingChoice);
      if (button.id === "new-game-plus") this.runAction({ type: "NEW_GAME_PLUS" });
    });
    document.addEventListener("input", (event) => {
      if (event.target.id !== "zoom-range") return;
      const index = Number(event.target.value);
      const value = ZOOM_STEPS[index];
      const output = document.querySelector("#zoom-value");
      if (output) output.textContent = zoomPercent(value);
      event.target.setAttribute("aria-valuetext", zoomPercent(value));
      if (this.zoomFrame) cancelAnimationFrame(this.zoomFrame);
      this.zoomFrame = requestAnimationFrame(() => {
        this.zoomFrame = 0;
        this.changeSetting("zoom", value);
      });
    });
    document.addEventListener("change", (event) => {
      if (event.target.matches("[data-route-resource]")) {
        this.runAction({ type: "ROUTE_RESOURCE", routeId: event.target.dataset.routeResource, resource: event.target.value });
      }
      if (event.target.id === "save-file") this.readSaveFile(event.target.files?.[0]);
    });
    document.addEventListener("dragover", (event) => {
      if (!event.target.closest("#save-drop")) return;
      event.preventDefault();
      document.querySelector("#save-drop")?.classList.add("dragging");
    });
    document.addEventListener("dragleave", (event) => {
      if (event.target.closest("#save-drop")) document.querySelector("#save-drop")?.classList.remove("dragging");
    });
    document.addEventListener("drop", (event) => {
      if (!event.target.closest("#save-drop")) return;
      event.preventDefault();
      document.querySelector("#save-drop")?.classList.remove("dragging");
      this.readSaveFile(event.dataTransfer?.files?.[0]);
    });
    this.elements.dialog.addEventListener("click", (event) => {
      if (event.target === this.elements.dialog) this.closeDialog();
    });
    document.addEventListener("keydown", (event) => {
      if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
      if (event.code === "Space") {
        event.preventDefault();
        this.togglePause();
      }
      if (event.code === "KeyB") this.toggleMobilePanel("build");
    });
  }

  runAction(action) {
    const response = this.dispatch(action);
    if (response?.message) this.showToast(response.message, response.ok ? "normal" : "error");
    this.render(true);
    if (this.dialogMode) this.renderDialog();
    return response;
  }

  changeSetting(key, value) {
    const response = this.dispatch({ type: "SET_SETTING", key, value });
    if (!response.ok) {
      this.showToast(response.message, "error");
      return;
    }
    if (key === "zoom") this.grid?.setZoom(value);
    if (key === "theme" || key === "fontSize") this.applyTheme();
    this.render(true);
    if (this.dialogMode === "settings") this.renderDialog();
  }

  togglePause() {
    this.changeSetting("paused", !this.state.settings.paused);
    const button = document.querySelector("#settings-pause");
    if (button) button.textContent = this.state.settings.paused ? "继续模拟" : "暂停模拟";
    this.showToast(this.state.settings.paused ? "模拟已暂停。" : "模拟继续。", "normal");
  }

  restartGame() {
    if (!window.confirm("这会清除当前进度（周目、地图、科技、存档）。确定吗？")) return;
    clearSave();
    gameEvents.emit("restart");
  }

  replayTutorial() {
    this.closeDialog();
    this.tutorial?.start(true);
  }

  toggleLog() {
    const collapsed = !this.elements.logs.hidden;
    this.elements.logs.hidden = collapsed;
    const button = document.querySelector("#log-toggle");
    button.textContent = collapsed ? "+" : "−";
    button.setAttribute("aria-expanded", String(!collapsed));
  }

  toggleMobilePanel(panel) {
    const build = document.querySelector("#build-panel");
    const log = document.querySelector("#log-panel");
    build.classList.toggle("mobile-open", panel === "build" && !build.classList.contains("mobile-open"));
    log.classList.toggle("mobile-open", panel === "log" && !log.classList.contains("mobile-open"));
    document.querySelectorAll("[data-mobile]").forEach((button) => button.classList.toggle("active", button.dataset.mobile === panel));
  }

  selectBuilding(buildingId) {
    const definition = BUILDING_BY_ID[buildingId];
    if (!hasTech(this.state, definition.unlock)) {
      this.showToast(`该蓝图需要科研：${definition.unlock}`, "error");
      return;
    }
    this.selectedBuilding = buildingId;
    this.renderBuildList(true);
    this.showToast(`已选择蓝图：${definition.name}`, "normal");
    if (window.innerWidth <= 820) this.toggleMobilePanel("map");
  }

  selectCell(index) {
    const map = this.state.maps[this.state.currentMap];
    const layer = getLayer(map, map.currentDepth ?? 0);
    const anchorIndex = resolveAnchorIndex(layer.buildings, index);
    this.selectedIndex = anchorIndex;
    if (this.grid) this.grid.selectedIndex = anchorIndex;
    const building = layer.buildings[anchorIndex];
    if (!building && this.selectedBuilding) {
      this.runAction({ type: "BUILD", mapId: this.state.currentMap, index, buildingId: this.selectedBuilding, depth: map.currentDepth ?? 0 });
    } else {
      this.renderSelection();
    }
  }

  switchLayer(step) {
    const map = this.state.maps[this.state.currentMap];
    const target = (map.currentDepth ?? 0) + step;
    if (!getLayer(map, target)) {
      this.showToast(step > 0 ? "下一层尚未打通。先在地表或当前层使用钻探炸药。" : "已经在地表。", "error");
      return;
    }
    this.runAction({ type: "SWITCH_LAYER", mapId: this.state.currentMap, depth: target });
    this.selectedIndex = null;
    if (this.grid) this.grid.selectedIndex = null;
    this.renderSelection();
  }

  handleCellAction(action) {
    if (this.selectedIndex === null) return;
    const depth = this.state.maps[this.state.currentMap].currentDepth ?? 0;
    if (action === "upgrade") this.runAction({ type: "BUILD", mapId: this.state.currentMap, index: this.selectedIndex, buildingId: this.state.maps[this.state.currentMap].buildings[this.selectedIndex]?.id, depth });
    if (action === "underground") this.runAction({ type: "UNDERGROUND", mapId: this.state.currentMap, index: this.selectedIndex, depth });
    if (action === "dismantle") this.runAction({ type: "DISMANTLE", mapId: this.state.currentMap, index: this.selectedIndex, depth });
  }

  render(force = false) {
    const now = performance.now();
    if (!force && now - this.lastRender < 250) return;
    this.lastRender = now;
    const state = this.state;
    const map = state.maps[state.currentMap];
    const definition = MAP_BY_ID[state.currentMap];
    const depth = map.currentDepth ?? 0;
    const energy = map.energy;
    this.elements.energy.textContent = `${formatNumber(energy.supply)} / ${formatNumber(energy.demand)} · ${Math.round(energy.efficiency * 100)}%`;
    this.elements.energyStat.classList.toggle("alert", energy.demand > energy.supply);
    this.elements.data.textContent = formatNumber(state.data);
    this.elements.day.textContent = `DAY ${String(state.day).padStart(3, "0")}`;
    const daysLeft = Math.max(0, state.nextPulseDay - state.day);
    this.elements.disaster.textContent = daysLeft <= 1 ? `预警 · ${daysLeft} 天` : `${daysLeft} 天`;
    this.elements.disasterStat.classList.toggle("alert", daysLeft <= 1);
    this.elements.mapName.textContent = depth > 0 ? `${definition.name} · 地下 -${depth}` : definition.name;
    this.elements.mapEnglish.textContent = `${definition.english} / Sector ${String(MAPS.indexOf(definition) + 1).padStart(2, "0")}${depth > 0 ? ` / Depth -${depth}` : ""}`;
    this.elements.mapDescription.textContent = depth > 0 ? "地下层：无日照、无风暴；采集产出 ×1.5。岩层需爆破或地下支撑扩展。" : `${definition.description} 压力：${definition.hazard.name}——${definition.hazard.description}`;
    this.elements.mapCount.textContent = `${state.unlockedMaps.length} / 6`;
    this.elements.layerLabel.textContent = depth > 0 ? `地下 -${depth}` : "地表";
    document.querySelectorAll("[data-layer-step]").forEach((button) => {
      const target = depth + Number(button.dataset.layerStep);
      button.disabled = !getLayer(map, target);
    });
    const storm = state.currentMap === "ash" && state.elapsed < map.stormUntil;
    const diagnosis = diagnose(state, state.currentMap);
    this.elements.mapStatus.textContent = state.settings.paused ? "模拟已暂停" : storm ? "灰烬风暴 · 产出 50%" : diagnosis.text;
    this.elements.mapStatus.classList.toggle("danger", state.settings.paused ? false : storm || diagnosis.code !== "normal" && diagnosis.code !== "building");
    this.elements.centerLevel.textContent = `LV.${state.centerLevel}`;
    this.elements.quota.textContent = `可用配额 ${getQuota(state).available} · 已消耗 ${state.usedQuota}`;
    if (this.elements.achievementCount) this.elements.achievementCount.textContent = `${state.achievements.length}/${ACHIEVEMENTS.length}`;
    document.querySelectorAll("[data-zoom-index]").forEach((button) => button.classList.toggle("active", Number(button.dataset.zoomIndex) === zoomIndex(state.settings.zoom)));
    document.querySelectorAll("[data-speed]").forEach((button) => button.classList.toggle("active", Number(button.dataset.speed) === state.settings.speed));
    this.renderResources();
    this.renderCategories();
    this.renderBuildList();
    this.renderSelection();
    this.renderLogs();
    this.tutorial?.refresh(state);
  }

  renderResources() {
    const map = this.state.maps[this.state.currentMap];
    this.elements.resources.innerHTML = RESOURCE_IDS.map((resource) => {
      const rate = map.rates[resource] ?? 0;
      const gross = map.grossRates?.[resource];
      const capacity = getCapacity(this.state, this.state.currentMap, resource);
      const net = `${rate > 0.005 ? "+" : ""}${formatNumber(rate)}/s`;
      const split = gross && this.state.settings.showGross
        ? `<small class="gross">+${formatNumber(gross.produce)} / -${formatNumber(gross.consume)}</small>`
        : `<small class="${rate < -0.005 ? "negative" : ""}">${net}</small>`;
      return `<div class="resource-item" data-resource="${resource}" title="库存上限 ${formatNumber(capacity)}"><span>${RESOURCE_NAMES[resource]}</span><strong>${formatNumber(map.resources[resource])}</strong>${split}</div>`;
    }).join("");
  }

  renderCategories(force = false) {
    const signature = `${this.category}:${CATEGORIES.length}`;
    if (!force && signature === this.categorySignature) return;
    this.categorySignature = signature;
    this.elements.categories.innerHTML = CATEGORIES.map(([id, name]) => `<button type="button" role="tab" data-category="${id}" class="${this.category === id ? "active" : ""}" aria-selected="${this.category === id}">${name}</button>`).join("");
  }

  renderBuildList(force = false) {
    const map = this.state.maps[this.state.currentMap];
    const buildings = BUILDINGS.filter((definition) => definition.category === this.category);
    const entries = buildings.map((definition) => {
      const unlocked = hasTech(this.state, definition.unlock);
      const cost = getBuildCost(this.state, definition.id, this.state.currentMap);
      const affordable = Object.entries(cost).every(([resource, amount]) => map.resources[resource] >= amount);
      const owned = getOwnedCount(this.state, definition.id);
      return { definition, unlocked, cost, affordable, owned };
    });
    const signature = `${this.state.currentMap}:${this.category}:${this.selectedBuilding}:${entries.map(({ definition, unlocked, cost, affordable, owned }) => `${definition.id}:${unlocked}:${affordable}:${owned}:${costText(cost)}`).join("|")}`;
    if (!force && signature === this.buildListSignature) return;
    this.buildListSignature = signature;
    this.elements.buildList.innerHTML = entries.map(({ definition, unlocked, cost, affordable, owned }) => `<button type="button" class="build-card ${this.selectedBuilding === definition.id ? "selected" : ""} ${!unlocked ? "locked" : ""} ${unlocked && !affordable ? "unaffordable" : ""}" data-building="${definition.id}" title="${escapeHtml(definition.description)}">
        <img class="build-icon" width="32" height="32" src="${getBuildingIconUrl(definition.id)}" alt="" aria-hidden="true">
        <span><strong class="build-name">${definition.name}${owned ? ` ×${owned}` : ""}</strong><small class="build-cost">${unlocked ? `成本：${costText(cost)}` : `科研锁定 · ${definition.unlock}`}</small><small class="build-output">产出：${definition.produce.energy || Object.keys(definition.produce).length ? buildingOutputText(definition) : "—"}</small><small class="build-energy">耗电：${definition.energy > 0 ? `-${formatNumber(definition.energy)} ⚡/s` : "0"}</small></span>
        <span class="build-time">${unlocked && !affordable ? "缺料" : `${definition.size ? `${definition.size.w}×${definition.size.h} · ` : ""}${definition.buildTime}s`}</span>
      </button>`).join("") || `<div class="empty-state">该类别暂无可用蓝图。</div>`;
  }

  renderSelection() {
    if (this.selectedIndex === null) {
      this.elements.selection.innerHTML = `<span class="muted">未选择格子。地图上每个光点，都是仍愿意运转的东西。</span>`;
      return;
    }
    const map = this.state.maps[this.state.currentMap];
    const building = map.buildings[this.selectedIndex];
    const x = this.selectedIndex % 24;
    const y = Math.floor(this.selectedIndex / 24);
    if (!building) {
      const core = this.state.currentMap === "ash" && (map.currentDepth ?? 0) === 0 && this.selectedIndex === 300;
      const layer = getLayer(map, map.currentDepth ?? 0);
      const locked = layer && !layer.unlocked[this.selectedIndex];
      this.elements.selection.innerHTML = `<div class="selection-info"><strong>${core ? "AI 运算中心" : locked ? `未开掘岩层 [${x}, ${y}]` : `空格 [${x}, ${y}]`}</strong><span>${core ? "永久节点。科技与中心等级不会因灾变丢失。" : locked ? "当前格仍是岩层。使用钻探炸药向下开拓，或用地下支撑扩展相邻空间。" : `当前蓝图：${BUILDING_BY_ID[this.selectedBuilding].name}。累计损毁：${map.destroyed[this.selectedIndex]}，格位抗性会随损毁累积。`}</span></div>`;
      return;
    }
    const definition = BUILDING_BY_ID[building.id];
    const construction = building.buildRemaining > 0 ? ` · 建造剩余 ${secondsText(building.buildRemaining)}` : "";
    const disabled = map.energy.disabled.includes(`${map.currentDepth ?? 0}:${this.selectedIndex}`) ? " · 已限电" : "";
    const upgradeCost = getUpgradeCost(this.state, building.id, building.count);
    const risk = 2 ** Math.max(0, building.count - 1);
    const size = building.size ?? definition.size ?? { w: 1, h: 1 };
    const footprintText = size.w > 1 ? ` · 占地 ${size.w}×${size.h}` : "";
    this.elements.selection.innerHTML = `<div class="selection-info"><strong>${definition.name} · Lv.${building.count}${footprintText}</strong><span>耐久 ${formatNumber(building.hp)} / ${formatNumber(building.maxHp)}${construction}${disabled}${building.underground ? " · 地下化（产出 70%）" : ""}<br>当前升级产出 +${Math.round((1.6 ** (building.count - 1) - 1) * 100)}% · 灾变受损风险 ×${risk}</span></div>
      <div class="selection-actions">${definition.stackable && size.w === 1 && size.h === 1 ? `<button type="button" data-cell-action="upgrade" data-building="${building.id}">升级至 Lv.${building.count + 1} · ${costText(upgradeCost)}</button>` : ""}<button type="button" data-cell-action="underground">${building.underground ? "返回地表" : "地下化"}</button><button type="button" class="danger" data-cell-action="dismantle">拆除</button></div>`;
  }

  renderLogs() {
    const signature = `${this.state.logs.length}:${this.state.logs[0]?.text ?? ""}`;
    if (signature === this.logSignature) return;
    this.logSignature = signature;
    this.elements.logs.innerHTML = this.state.logs.map((entry) => `<div class="log-entry ${entry.tone}"><span class="log-day">[DAY ${String(entry.day).padStart(3, "0")}]</span>${escapeHtml(entry.text)}</div>`).join("");
  }

  openDialog(mode) {
    if (mode === "save") {
      this.dialogMode = "settings";
      this.settingsTab = "save";
    } else {
      this.dialogMode = mode;
    }
    if (mode === "settings") this.tutorial?.start(false);
    const headings = {
      research: ["研究", "科技树"],
      maps: ["区域", "区域与开拓"],
      network: ["物流", "物流网络"],
      settings: ["选项", "设置"],
      achievements: ["成就", `成就 ${this.state.achievements.length}/${ACHIEVEMENTS.length}`],
      endgame: ["终局", "终局协议"],
    };
    const [eyebrow, title] = headings[mode] ?? ["SYSTEM", "系统"];
    this.elements.dialogEyebrow.textContent = eyebrow;
    this.elements.dialogTitle.textContent = title;
    this.renderDialog();
    if (!this.elements.dialog.open) this.elements.dialog.showModal();
  }

  closeDialog() {
    this.dialogMode = null;
    this.pendingImport = null;
    if (this.elements.dialog.open) this.elements.dialog.close();
  }

  renderDialog() {
    if (this.dialogMode === "achievements") this.renderAchievements();
    if (this.dialogMode === "maps") this.renderMaps();
    if (this.dialogMode === "network") this.renderNetwork();
    if (this.dialogMode === "settings") this.renderSettings();
    if (this.dialogMode === "save") this.renderSave();
    if (this.dialogMode === "endgame") this.renderEndgame();
  }

  renderAchievements() {
    const done = this.state.achievements.length;
    const rows = ACHIEVEMENTS.map((item) => {
      const completed = this.state.achievements.includes(item.id);
      return `<article class="achievement-card ${completed ? "done" : "locked"}"><strong>${completed ? "✓ " : ""}${item.name}</strong><small>${item.description}</small></article>`;
    }).join("");
    this.elements.dialogContent.innerHTML = `<div class="achievement-overview"><strong>${done} / ${ACHIEVEMENTS.length}</strong><span>已解锁成就</span><div class="achievement-progress"><span style="width:${Math.round(done / ACHIEVEMENTS.length * 100)}%"></span></div></div><div class="achievement-grid">${rows}</div>`;
  }
  renderResearch() {
    const branches = Object.keys(BRANCH_NAMES).map((branch) => {
      const nodes = TECHS.filter((tech) => tech.branch === branch).sort((a, b) => a.position.y - b.position.y).map((tech) => {
        const status = getResearchStatus(this.state, tech.id);
        const requirement = tech.requires.length ? `前置：${tech.requires.map((id) => TECHS.find((item) => item.id === id)?.name ?? id).join("、")}` : "无前置科技";
        return `<button type="button" class="tech-node ${status.status}" data-tech="${tech.id}" ${status.status === "unlocked" ? "disabled" : ""}><strong>${status.status === "unlocked" ? "✓ " : ""}${tech.name}</strong><small>${tech.description}</small><small>${requirement}</small><small class="tech-cost">${status.status === "unlocked" ? "已完成" : `${formatNumber(tech.cost)} 数据 · ${status.status === "available" ? "可研究" : status.status === "locked" ? "前置未完成" : "数据不足"}`}</small></button>`;
      }).join("");
      return `<section class="tech-branch"><h3>${BRANCH_NAMES[branch]}</h3>${nodes}</section>`;
    }).join("");
    this.elements.dialogContent.innerHTML = `<p class="dialog-intro">数据由研究所、数据核心与模拟器写入。科技永久保留至新周目+；灾变无法删除知识。当前可用数据：<strong class="text-research">${formatNumber(this.state.data)}</strong></p><div class="tech-tree">${branches}</div>`;
  }

  renderMaps() {
    const cards = MAPS.map((definition) => {
      const unlocked = this.state.unlockedMaps.includes(definition.id);
      const current = this.state.currentMap === definition.id;
      const expansion = getExpansionStatus(this.state, definition.id);
      const action = current ? `<button type="button" disabled>当前区域</button>` : unlocked ? `<button type="button" data-map-select="${definition.id}">切换至此区域</button>` : `<button type="button" data-map-expand="${definition.id}">${definition.id === "moon" ? "等待火箭着陆" : `开拓 · ${definition.quotaCost} 配额`}</button>`;
      return `<article class="map-card ${current ? "current" : ""}"><span class="eyebrow">${definition.english}</span><h3>${definition.name}</h3><p>${definition.description}</p><div class="map-meta">${definition.hazard.name} · 日照 ${Math.round(definition.solar * 100)}% · 风力 ${Math.round(definition.wind * 100)}%<br>${unlocked ? `设施 ${this.state.maps[definition.id].layers.flatMap((layer) => layer.buildings).filter((building) => building && !building.anchor).length} · 商路 ${this.state.routes.filter((route) => route.a === definition.id || route.b === definition.id).length}` : expansion.reason ?? `进入科技：${definition.unlockTech}`}</div>${action}</article>`;
    }).join("");
    const upgradeCost = getCenterUpgradeCost(this.state);
    this.elements.dialogContent.innerHTML = `<div class="dialog-section"><h3>AI 运算中心 · LV.${this.state.centerLevel}</h3><p class="dialog-intro">配额 = floor(log10(累计数据 + 1) × 中心等级 × 2)。开拓会消耗配额；旧地图持续生产与受损。当前累计数据 ${formatNumber(this.state.totalData)}，可用配额 ${getQuota(this.state).available}。</p><button type="button" id="center-upgrade" class="research">升级中心 · ${formatNumber(upgradeCost)} 数据</button></div><div class="map-grid">${cards}</div>`;
  }

  renderNetwork() {
    const unlocked = this.state.unlockedMaps;
    const options = unlocked.map((id) => `<option value="${id}">${MAP_BY_ID[id].name}</option>`).join("");
    const resourceOptions = RESOURCE_IDS.map((id) => `<option value="${id}">${RESOURCE_NAMES[id]}</option>`).join("");
    const createForm = unlocked.length >= 2 ? `<div class="dialog-section"><h3>铺设直连商路</h3><div class="form-grid"><label class="field">资源输出地图<select id="route-from">${options}</select></label><label class="field">资源接收地图<select id="route-to">${options}</select></label><label class="field">运输资源<select id="route-resource">${resourceOptions}</select></label><label class="field">线路参数<div class="route-preview">车队：8 运力 / 8 秒延迟 / 8% 基础损耗。科技与电梯可升级。</div></label></div><div class="dialog-actions"><button type="button" id="route-create" class="primary">开通商路 · 20 废钢</button></div></div>` : `<div class="empty-state">至少开拓两个区域，并在两端建成中转站，才能铺设商路。</div>`;
    const routes = this.state.routes.map((route) => {
      const parameters = getRouteParameters(this.state, route);
      const shipments = this.state.shipments.filter((shipment) => shipment.routeId === route.id);
      const selectedOptions = RESOURCE_IDS.map((id) => `<option value="${id}" ${route.resource === id ? "selected" : ""}>${RESOURCE_NAMES[id]}</option>`).join("");
      return `<article class="route-card ${route.connected ? "" : "cut"}"><div><h3>${MAP_BY_ID[route.from].name} → ${MAP_BY_ID[route.to].name}</h3><p>${ROUTE_LEVELS[route.level].name} · ${formatNumber(parameters.capacity)}/s · 延迟 ${formatNumber(parameters.delay)}s · 损耗 ${Math.round(parameters.loss * 100)}%</p><p>${route.connected ? "线路在线" : "线路中断，需要 10 金属重连"} · 在途 ${shipments.length} 批 / ${formatNumber(shipments.reduce((sum, shipment) => sum + shipment.amount, 0))} 单位</p><label class="field">运输资源<select data-route-resource="${route.id}">${selectedOptions}</select></label></div><div class="route-actions"><button type="button" data-route-action="reverse" data-route-id="${route.id}">反转方向</button>${route.level < 2 ? `<button type="button" data-route-action="upgrade" data-route-id="${route.id}">升级为${ROUTE_LEVELS[route.level + 1].name}</button>` : ""}${!route.connected ? `<button type="button" class="danger" data-route-action="reconnect" data-route-id="${route.id}">重连</button>` : ""}</div></article>`;
    }).join("");
    this.elements.dialogContent.innerHTML = `${createForm}<div class="dialog-section"><h3>已建商路 · ${this.state.routes.length}</h3><div class="route-list">${routes || `<div class="empty-state">尚无商路。各地图库存彼此独立；中转站建成后，资源才会真实跨图流动。</div>`}</div></div>`;
  }

  createRoute() {
    const from = document.querySelector("#route-from")?.value;
    const to = document.querySelector("#route-to")?.value;
    const resource = document.querySelector("#route-resource")?.value;
    if (from) this.runAction({ type: "ROUTE_ADD", from, to, resource });
  }

  handleRouteAction(action, routeId) {
    const types = { reverse: "ROUTE_REVERSE", upgrade: "ROUTE_UPGRADE", reconnect: "ROUTE_RECONNECT" };
    if (types[action]) this.runAction({ type: types[action], routeId });
  }

  renderSettings() {
    const tabs = [["display", "显示"], ["game", "游戏"], ["save", "存档"], ["about", "关于"]].map(([id, name]) => `<button type="button" data-settings-tab="${id}" class="${this.settingsTab === id ? "active" : ""}">${name}</button>`).join("");
    let body = "";
    if (this.settingsTab === "display") {
      body = `<div class="settings-grid"><div class="setting-group"><h3>主题</h3><div class="dialog-actions"><button type="button" data-theme="dark" class="${this.state.settings.theme === "dark" ? "active" : ""}">深色</button><button type="button" data-theme="light" class="${this.state.settings.theme === "light" ? "active" : ""}">浅色</button></div></div><div class="setting-group"><h3>地图大小 <output id="zoom-value">${zoomPercent(this.state.settings.zoom)}</output></h3><label class="range-field"><input id="zoom-range" type="range" min="0" max="${ZOOM_STEPS.length - 1}" step="1" value="${zoomIndex(this.state.settings.zoom)}" aria-label="地图大小" aria-valuetext="${zoomPercent(this.state.settings.zoom)}"><span>50%</span><span>300%</span></label><p class="dialog-intro">100% / 200% 最清晰，其他比例用于适配窗口。</p></div><div class="setting-group"><h3>字号</h3><div class="dialog-actions">${[12, 14, 16].map((value) => `<button type="button" data-fontsize="${value}" class="${this.state.settings.fontSize === value ? "active" : ""}">${value}px</button>`).join("")}</div></div><div class="setting-group"><h3>资源条</h3><div class="dialog-actions"><button type="button" data-gross class="${this.state.settings.showGross ? "active" : ""}">${this.state.settings.showGross ? "显示毛产出 / 毛消耗" : "只显示净值"}</button></div><p class="dialog-intro">开启后资源条拆开毛产出与毛消耗，便于判断「在产但被下游吃满」。</p></div></div>`;
    }
    if (this.settingsTab === "game") {
      body = `<div class="settings-grid"><div class="setting-group"><h3>流速</h3><div class="dialog-actions">${[1, 2, 4].map((value) => `<button type="button" data-speed="${value}" class="${this.state.settings.speed === value ? "active" : ""}">${value}×</button>`).join("")}</div></div><div class="setting-group"><h3>模拟</h3><div class="dialog-actions"><button type="button" id="settings-pause">${this.state.settings.paused ? "继续模拟" : "暂停模拟"}</button></div></div><div class="setting-group"><h3>音效</h3><div class="dialog-actions"><button type="button" id="settings-sound">${this.state.settings.sound ? "音效：开启" : "音效：关闭"}</button></div><p class="dialog-intro">当前版本暂不播放声音，此开关仅为后续音效预留。</p></div></div>`;
    }
    if (this.settingsTab === "save") body = this.getSaveMarkup();
    if (this.settingsTab === "about") {
      const achievements = ACHIEVEMENTS.map((item) => `<li class="achievement-row ${this.state.achievements.includes(item.id) ? "done" : ""}"><span>${this.state.achievements.includes(item.id) ? "✓" : "·"}</span><span><strong>${item.name}</strong><small>${item.description}</small></span></li>`).join("");
      body = `<div class="settings-grid"><div class="setting-group"><h3>版本</h3><p class="dialog-intro">Hundred-Day City v${APP_VERSION}<br>存档格式 v${this.state.version}</p></div><div class="setting-group"><h3>许可</h3><p class="dialog-intro">MIT License<br>Copyright (c) 2026 Bio-innovator</p></div><div class="setting-group"><h3>教程</h3><p class="dialog-intro">首次进入显示必看 4 步。</p><button type="button" id="tutorial-replay" class="primary">重看教程</button></div><div class="setting-group"><h3>成就</h3><button type="button" data-open="achievements" class="primary">查看成就 ${this.state.achievements.length} / ${ACHIEVEMENTS.length}</button></div></div>`;
    }
    this.elements.dialogContent.innerHTML = `<nav class="settings-tabs" aria-label="设置分类">${tabs}</nav><div class="settings-body">${body}</div>`;
  }

  summarizeState(state) {
    const buildingCount = Object.values(state.maps).reduce((total, map) => total + map.layers.flatMap((layer) => layer.buildings).filter((building) => building && !building.anchor).length, 0);
    return `周目 ${state.cycle} · DAY ${state.day} · 设施 ${buildingCount} 座 · 科技 ${state.techs.length} / ${TECHS.length}`;
  }

  getSaveMarkup() {
    const state = this.state;
    const latest = getLatestSaveBackup();
    const backupText = latest ? `最近备份：${new Date(latest.payload.savedAt).toLocaleString()} · ${this.summarizeState(latest.payload.state)}` : "暂无备份。导入或恢复时会先自动备份当前进度。";
    return `<div class="save-summary"><div><span>当前周目</span><strong>${state.cycle}</strong></div><div><span>游戏日</span><strong>${state.day}</strong></div><div><span>设施</span><strong>${Object.values(state.maps).reduce((total, map) => total + map.layers.flatMap((layer) => layer.buildings).filter((building) => building && !building.anchor).length, 0)}</strong></div><div><span>科研</span><strong>${state.techs.length} / ${TECHS.length}</strong></div></div><div class="form-grid"><label class="field full">Base64 存档（自动保存在本机 localStorage，每 10 秒写入）<textarea id="save-output" spellcheck="false" placeholder="点击导出以生成当前存档"></textarea></label><div class="field full"><div class="dialog-actions"><button type="button" id="save-export" class="primary">生成存档</button><button type="button" id="save-copy">复制到剪贴板</button><button type="button" id="save-download">下载存档文件</button></div></div><label class="field full">导入存档<textarea id="save-input" spellcheck="false" placeholder="粘贴 Base64 存档；确认前不会覆盖当前进度"></textarea></label><div id="save-drop" class="save-drop"><strong>把存档文件拖到这里</strong><span>或选择 .txt / .json 文件；只在浏览器内解析。</span><input type="file" id="save-file" accept=".txt,.json,text/plain"></div><div class="field full"><div class="dialog-actions"><button type="button" id="save-import">解析并预览存档</button><button type="button" id="save-confirm" class="danger" hidden>确认覆盖当前进度</button></div></div><div id="import-preview" class="import-preview empty-state">导入前会先展示目标存档摘要，不会直接覆盖。</div></div><div class="dialog-section backup-section"><h3>备份与恢复</h3><p class="dialog-intro">${backupText}</p><button type="button" id="backup-restore" ${latest ? "" : "disabled"}>恢复上一份备份</button></div><div class="dialog-section restart-section"><h3>重新开始</h3><p class="dialog-intro">清除当前周目、地图、科技与本地存档，不保留科技。</p><button type="button" id="restart-game" class="danger wide">重新开始</button></div>`;
  }

  renderSave() {
    this.elements.dialogContent.innerHTML = this.getSaveMarkup();
  }

  exportSave() {
    const output = document.querySelector("#save-output");
    if (!output) return null;
    output.value = encodeSave(this.state);
    output.focus();
    output.select();
    return output.value;
  }

  async copySave() {
    const output = document.querySelector("#save-output");
    const value = output?.value || this.exportSave();
    if (!value) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(value);
      this.showToast("存档已复制到剪贴板。", "normal");
    } catch {
      document.querySelector("#save-output")?.select();
      this.showToast("浏览器未授权剪贴板，存档已选中，可手动复制。", "error");
    }
  }

  downloadSave() {
    const value = this.exportSave();
    if (!value) return;
    const url = URL.createObjectURL(new Blob([value], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    const now = new Date();
    const pad = (value) => String(value).padStart(2, "0");
    link.download = `百日之城-存档-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    this.showToast("存档文件已开始下载。", "normal");
  }

  async readSaveFile(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const input = document.querySelector("#save-input");
      if (input) input.value = text;
      this.importSave();
    } catch {
      this.showToast("无法读取所选存档文件。", "error");
    }
  }

  importSave() {
    const input = document.querySelector("#save-input");
    if (!input?.value.trim()) {
      this.showToast("请先粘贴或选择存档。", "error");
      return;
    }
    try {
      const decoded = migrateAndValidate(decodeSave(input.value));
      this.pendingImport = decoded;
      const preview = document.querySelector("#import-preview");
      const confirmButton = document.querySelector("#save-confirm");
      if (preview) {
        preview.classList.remove("empty-state");
        preview.innerHTML = `<strong>将导入：</strong>${this.summarizeState(decoded)}<br><strong>保存时间：</strong>${new Date(decoded.savedAt).toLocaleString()}<br><span class="text-danger">确认后当前进度会先自动备份，再被覆盖。</span>`;
      }
      if (confirmButton) confirmButton.hidden = false;
      this.showToast("存档校验通过，请确认是否覆盖。", "normal");
    } catch (error) {
      this.pendingImport = null;
      this.showToast(error.message, "error");
    }
  }

  confirmImport() {
    if (!this.pendingImport) {
      this.showToast("请先解析并预览存档。", "error");
      return;
    }
    const backupKey = writeSaveBackup(this.state);
    if (!backupKey) {
      this.showToast("无法写入备份，导入已中止。", "error");
      return;
    }
    this.runAction({ type: "IMPORT_STATE", state: this.pendingImport });
    this.pendingImport = null;
    this.closeDialog();
    this.showToast("导入完成；当前进度已写入时间戳备份。", "normal");
  }

  restoreLatestBackup() {
    const latest = getLatestSaveBackup();
    if (!latest) {
      this.showToast("没有可恢复的备份。", "error");
      return;
    }
    const summary = this.summarizeState(latest.payload.state);
    if (!window.confirm(`恢复上一份备份？\n${summary}`)) return;
    if (!writeSaveBackup(this.state)) {
      this.showToast("无法写入当前进度的安全备份，恢复已中止。", "error");
      return;
    }
    const restored = readSaveBackup(latest.key);
    this.runAction({ type: "IMPORT_STATE", state: restored });
    this.closeDialog();
    this.showToast("已恢复上一份备份。", "normal");
  }

  renderEndgame() {
    const state = this.state;
    const status = getEndgameStatus(state);
    const stageLabels = { idle: "等待装配", assembling: "结构装配", awaitingFuel: "等待燃料", ready: "可以发射", launching: "地月转移", landed: "已经着陆" };
    const required = BUILDING_BY_ID.rocketFactory.ability.rocketCost;
    const tasks = [
      {
        id: "launchpad", name: "建造发射台", done: status.launchpad,
        progress: `${status.launchpad ? 1 : 0} / 1`,
        detail: status.launchpad ? "轨道发射台已上线" : "前往轨道残骸带建造发射台",
        map: "orbit", building: "launchpad",
      },
      {
        id: "factory", name: "建造火箭装配厂", done: status.factory,
        progress: `${status.factory ? 1 : 0} / 1`,
        detail: status.factory ? "装配厂房已就绪" : "发射台完成后继续建造装配厂",
        map: "orbit", building: "rocketFactory",
      },
      {
        id: "assembly", name: "装配火箭结构", done: status.assemblyDone,
        progress: `${Math.floor(status.assemblyProgress)}s / ${state.rocket.duration}s`,
        detail: status.assemblyDone ? "结构闭合" : status.assembly ? "装配正在进行" : `需要 ${costText(required)}`,
        map: "orbit", building: "rocketFactory",
      },
      {
        id: "fuel", name: "加注燃料", done: status.fueled,
        progress: `${formatNumber(status.fuelProgress)} / ${status.fuelTarget}`,
        detail: status.fueled ? "燃料舱已满" : "燃料由冰原工厂生产并经商路运抵轨道",
        map: "orbit", building: "rocketFactory",
      },
      {
        id: "launch", name: "点火发射", done: status.launched,
        progress: `${status.launched ? 1 : 0} / 1`,
        detail: status.launched ? "运载器已离开轨道" : status.fueled ? "燃料与结构已就绪" : "等待加注完成",
        map: "orbit", building: "launchpad",
      },
      {
        id: "moon", name: "月背建城", done: status.canBackup,
        progress: `${status.moonCount} / 3 · 核心${status.moonCore ? "在线" : "离线"}`,
        detail: status.landed ? "建成 3 座建筑并部署数据核心" : "完成发射后开放",
        map: "moon", building: "dataCore",
      },
    ];
    const firstOpen = tasks.findIndex((task) => !task.done);
    const doneCount = tasks.filter((task) => task.done).length;
    const completion = Math.round((doneCount / tasks.length) * 100);
    const taskHtml = tasks.map((task, index) => {
      const blocked = index > 0 && !tasks[index - 1].done;
      return `<button type="button" class="endgame-task ${task.done ? "done" : ""} ${blocked ? "blocked" : ""} ${index === firstOpen ? "current" : ""}" data-endgame-task="${task.id}" data-endgame-map="${task.map}" data-endgame-building="${task.building}"><span class="task-check">${task.done ? "✓" : blocked ? "·" : index + 1}</span><span class="task-main"><strong>${task.name}</strong><small>${blocked ? "需要先完成上一项" : task.detail}</small></span><span class="task-progress">${task.progress}</span></button>`;
    }).join("");
    let rocketAction = "";
    if (state.rocket.stage === "idle") rocketAction = `<button type="button" class="primary" data-rocket-action="start" ${status.launchpad && status.factory ? "" : "disabled"}>开始火箭装配 · ${costText(required)}</button>`;
    if (state.rocket.stage === "assembling") rocketAction = `<div class="route-preview">装配进度 ${Math.floor(state.rocket.progress / state.rocket.duration * 100)}% · 剩余 ${secondsText(state.rocket.duration - state.rocket.progress)}</div>`;
    if (state.rocket.stage === "awaitingFuel") rocketAction = `<button type="button" class="primary" data-rocket-action="fuel">加注 ${required.fuel} 燃料</button>`;
    if (state.rocket.stage === "ready") rocketAction = `<button type="button" class="primary" data-rocket-action="launch">确认发射</button>`;
    if (state.rocket.stage === "launching") rocketAction = `<div class="route-preview">运载器正在前往月背。预计 ${secondsText(8 - state.rocket.progress)} 后着陆。</div>`;
    if (state.rocket.stage === "landed") rocketAction = `<div class="route-preview">月背已开放。完成上方最后一项后即可写入文明备份。</div>`;
    const backupHint = status.canBackup ? "条件已满足" : "需先完成月背建城";
    const uploadHint = status.canUpload ? "条件已满足" : "需意识上传科技与就绪火箭";
    const stayHint = status.canStay ? "条件已满足" : `DAY ${state.day} / 100`;
    this.elements.dialogContent.innerHTML = `<div class="endgame-overview"><div><span>当前阶段</span><strong>${stageLabels[state.rocket.stage]}</strong></div><div><span>总进度</span><strong>${doneCount} / ${tasks.length}</strong></div><div class="endgame-progress" aria-label="终局总进度"><span style="width:${completion}%"></span></div></div><div class="endgame-task-list">${taskHtml}</div><div class="dialog-section">${rocketAction}<p class="dialog-intro">完整结构成本：${costText(required)}；装配时长 ${secondsText(state.rocket.duration)}。当前燃料：${formatNumber(status.fuelProgress)} / ${status.fuelTarget}。</p></div><div class="dialog-section"><h3>延续协议</h3><div class="dialog-actions"><button type="button" data-ending-choice="backup" ${status.canBackup ? "" : "disabled"}>备份文明</button><button type="button" data-ending-choice="stay" ${status.canStay ? "" : "disabled"}>留下</button><button type="button" class="research" data-ending-choice="upload" ${status.canUpload ? "" : "disabled"}>上传</button></div><p class="dialog-intro">备份文明：${backupHint}。留下：${stayHint}。上传：${uploadHint}。</p></div>`;
  }

  jumpToTask(mapId, buildingId) {
    this.closeDialog();
    if (this.state.unlockedMaps.includes(mapId) && this.state.currentMap !== mapId) this.dispatch({ type: "SWITCH_MAP", mapId });
    if (buildingId) {
      const definition = BUILDING_BY_ID[buildingId];
      const building = this.state.maps[this.state.currentMap].buildings.find((item) => item?.id === buildingId && !item.anchor);
      this.category = definition.category;
      this.selectedBuilding = buildingId;
      this.renderCategories(true);
      this.renderBuildList(true);
      if (building) {
        const index = this.state.maps[this.state.currentMap].buildings.indexOf(building);
        this.selectedIndex = index;
        if (this.grid) this.grid.selectedIndex = index;
        document.querySelector("#canvas-scroll")?.scrollTo({ top: Math.max(0, (Math.floor(index / 24) - 2) * 24), left: Math.max(0, ((index % 24) - 2) * 24), behavior: "smooth" });
      }
    }
    this.render(true);
    this.showToast(`已定位：${MAP_BY_ID[this.state.currentMap]?.name ?? mapId}${buildingId ? ` · ${BUILDING_BY_ID[buildingId].name}` : ""}`, "normal");
  }

  handleRocketAction(action) {
    const types = { start: "ROCKET_START", fuel: "ROCKET_FUEL", launch: "ROCKET_LAUNCH" };
    this.runAction({ type: types[action] });
  }

  chooseEnding(endingId) {
    const status = getEndgameStatus(this.state);
    const allowed = endingId === "backup" ? status.canBackup : endingId === "upload" ? status.canUpload : status.canStay;
    if (!allowed) {
      const reasons = { backup: "需要月背着陆、至少 3 座运行建筑及一座数据核心。", stay: `留下结局将在 DAY 100 开放，当前为 DAY ${this.state.day}。`, upload: "需要意识上传科技，并完成火箭装配与加注。" };
      this.showToast(reasons[endingId], "error");
      return;
    }
    const title = ENDINGS[endingId].title;
    if (window.confirm(`${title}：确定执行此延续协议？`)) this.runAction({ type: "ENDING", endingId });
  }

  showEnding() {
    const ending = ENDINGS[this.state.ending.id];
    this.closeDialog();
    this.elements.ending.innerHTML = `<article class="ending-card"><span class="eyebrow">${ending.eyebrow}</span><h1>${ending.title}</h1><p>${ending.text}</p><div class="ending-stats"><span>周目 ${this.state.cycle}</span><span>结束于 DAY ${this.state.day}</span><span>建造 ${this.state.stats.built}</span><span>损毁 ${this.state.stats.destroyed}</span><span>脉冲 ${this.state.stats.pulses}</span></div><button type="button" id="new-game-plus" class="primary wide">进入新周目+ · 保留科技</button></article>`;
    this.elements.ending.hidden = false;
  }

  showToast(message, tone = "normal") {
    clearTimeout(this.toastTimer);
    this.elements.toast.textContent = message;
    this.elements.toast.className = `toast visible ${tone === "error" ? "error" : ""}`;
    this.toastTimer = setTimeout(() => { this.elements.toast.className = "toast"; }, 2800);
  }
}
