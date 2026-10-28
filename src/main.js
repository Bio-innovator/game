import { apply, createInitialState, RESOURCE_NAMES } from "./core/state.js";
import { createGameLoop, settleOffline } from "./core/tick.js";
import { formatNumber } from "./core/decimal.js";
import { GridRenderer } from "./render/grid.js";
import { HUD } from "./render/hud.js";
import { loadGame, saveGame } from "./save/storage.js";

const canvas = document.querySelector("#game-canvas");
const loaded = loadGame();
const state = loaded?.state ?? createInitialState();
const offlineResult = loaded ? settleOffline(state, loaded.offlineSeconds) : null;

function replaceState(nextState) {
  for (const key of Object.keys(state)) delete state[key];
  Object.assign(state, nextState);
  saveGame(state);
}

function dispatch(action) {
  if (action.type === "IMPORT_STATE") {
    replaceState(action.state);
    return { ok: true, message: "存档已导入，网络状态恢复。" };
  }
  const response = apply(state, action);
  if (response.ok && ["BUILD", "RESEARCH", "EXPAND", "ROUTE_ADD", "ROUTE_UPGRADE", "ROCKET_START", "ROCKET_FUEL", "ROCKET_LAUNCH", "ENDING", "NEW_GAME_PLUS"].includes(action.type)) {
    saveGame(state);
  }
  return response;
}

const grid = new GridRenderer(canvas, (index) => hud.selectCell(index));
const hud = new HUD(state, dispatch);
hud.attachGrid(grid);

if (state.ending) hud.showEnding();

if (offlineResult) {
  const mapRows = Object.entries(offlineResult.gains).flatMap(([mapId, resources]) => Object.entries(resources).map(([resource, amount]) => `<div><span>${mapId.toUpperCase()} · ${RESOURCE_NAMES[resource] ?? resource}</span><strong>+${formatNumber(amount)}</strong></div>`)).join("");
  document.querySelector("#offline-content").innerHTML = `<p class="dialog-intro">运算中心在低功耗状态下运行了 <strong class="text-energy">${Math.floor(offlineResult.seconds / 60)} 分钟</strong>${offlineResult.capped ? "（按 8 小时上限结算）" : ""}。环境压力计时已重置，离线期间不追溯灾变损伤。</p><div class="offline-gains">${mapRows || `<div><span>资源变化</span><strong>无净产出</strong></div>`}<div><span>全局数据</span><strong>+${formatNumber(offlineResult.data)}</strong></div></div>`;
  const offlineDialog = document.querySelector("#offline-dialog");
  document.querySelector("#offline-close").addEventListener("click", () => offlineDialog.close());
  offlineDialog.showModal();
}

const loop = createGameLoop({
  state,
  onChange: () => hud.render(false),
  onRender: (currentState) => grid.render(currentState),
  onSave: (currentState) => saveGame(currentState),
});
loop.start();

window.addEventListener("beforeunload", () => saveGame(state));
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") saveGame(state);
});

window.addEventListener("pagehide", () => saveGame(state));
