import { gameEvents } from "../core/events.js";

export const TUTORIAL_KEY = "hdc-tutorial-v4";
export const LEGACY_TUTORIAL_KEY = "hdc-tutorial-done";

const REQUIRED_STEPS = [
  {
    id: "intro",
    selector: ".map-heading",
    target: "地图",
    title: "你是一台运算中心",
    text: "目标只有一个：撑过百日，把文明备份送上月背。先建立能源与采集的最小闭环。",
    action: "开始",
    ready: () => true,
  },
  {
    id: "solar",
    selector: '[data-building="solar"]',
    mobileSelector: '[data-building="solar"]',
    target: "太阳能板蓝图",
    title: "先供电",
    text: "能量不足，所有生产都会按比例降速。点选太阳能板，再点地图空格放下第一座。",
    action: "请先放下太阳能板",
    ready: (progress) => progress.requiredDone.includes("solar"),
  },
  {
    id: "scrapyard",
    selector: '[data-building="scrapyard"]',
    mobileSelector: '[data-building="scrapyard"]',
    target: "废料场蓝图",
    title: "能源不产资源，采集才产",
    text: "这是最容易踩的坑。切到「采集」，放下废料场，废钢才会真正开始增长。",
    action: "请先放下废料场",
    ready: (progress) => progress.requiredDone.includes("scrapyard"),
  },
  {
    id: "steel",
    selector: '[data-resource="steel"]',
    target: "废钢资源条",
    title: "看懂资源条",
    text: "左边是库存，右边是每秒净变化。废钢达到 20 后，你就完成了生存最小闭环。",
    action: "等待废钢 ≥ 20",
    ready: (_progress, state) => (state.maps[state.currentMap]?.resources.steel ?? 0) >= 20,
  },
];

function freshProgress() {
  return {
    stage: "required",
    requiredIndex: 0,
    requiredDone: [],
    advancedRevealed: [],
    advancedDone: [],
    skipped: false,
    panelOpen: true,
  };
}

export class Tutorial {
  constructor(state, storage = globalThis.localStorage) {
    this.state = state;
    this.storage = storage;
    this.progress = this.loadProgress();
    this.overlay = null;
    this.spotlight = null;
    this.card = null;
    this.positionFrame = 0;
    this.updatePosition = () => this.schedulePosition();
    window.addEventListener("resize", this.updatePosition);
    window.addEventListener("scroll", this.updatePosition, true);
  }

  loadProgress() {
    try {
      const parsed = JSON.parse(this.storage.getItem(TUTORIAL_KEY));
      if (!parsed || !Array.isArray(parsed.requiredDone)) return freshProgress();
      return { ...freshProgress(), ...parsed };
    } catch {
      return freshProgress();
    }
  }

  saveProgress() {
    try { this.storage.setItem(TUTORIAL_KEY, JSON.stringify(this.progress)); } catch { /* Storage can be disabled by browser privacy settings. */ }
  }

  get requiredStep() {
    return REQUIRED_STEPS[Math.min(this.progress.requiredIndex, REQUIRED_STEPS.length - 1)];
  }

  start(force = false) {
    if (force) {
      this.progress.stage = "required";
      this.progress.requiredIndex = 0;
      this.progress.requiredDone = [];
      this.progress.skipped = false;
      this.progress.panelOpen = false;
      this.saveProgress();
    }
    if (!force && (this.progress.stage !== "required" || this.progress.skipped)) {
      return false;
    }
    if (this.overlay) return true;
    this.createOverlay();
    this.renderRequiredStep();
    return true;
  }

  createOverlay() {
    this.overlay = document.createElement("section");
    this.overlay.id = "tutorial-overlay";
    this.overlay.setAttribute("role", "dialog");
    this.overlay.setAttribute("aria-modal", "true");
    this.overlay.innerHTML = `<div id="tutorial-spotlight" class="tutorial-spotlight"></div><div class="tutorial-card" id="tutorial-card"><span class="eyebrow" id="tutorial-step"></span><h2 id="tutorial-title"></h2><p id="tutorial-text"></p><p class="tutorial-target" id="tutorial-target"></p><div class="dialog-actions"><button type="button" id="tutorial-skip">跳过必看</button><button type="button" id="tutorial-next" class="primary"></button></div></div>`;
    document.body.append(this.overlay);
    this.spotlight = this.overlay.querySelector("#tutorial-spotlight");
    this.card = this.overlay.querySelector("#tutorial-card");
    this.overlay.querySelector("#tutorial-next").addEventListener("click", () => this.next());
    this.overlay.querySelector("#tutorial-skip").addEventListener("click", () => this.skip());
  }

  renderRequiredStep() {
    if (!this.overlay) return;
    const step = this.requiredStep;
    this.progress.requiredIndex = REQUIRED_STEPS.indexOf(step);
    this.saveProgress();
    this.prepareTarget(step);
    this.overlay.querySelector("#tutorial-step").textContent = `必看 ${this.progress.requiredIndex + 1} / ${REQUIRED_STEPS.length}`;
    this.overlay.querySelector("#tutorial-title").textContent = step.title;
    this.overlay.querySelector("#tutorial-text").textContent = step.text;
    this.overlay.querySelector("#tutorial-target").textContent = `目标：${step.target}`;
    this.updateNextButton();
    this.schedulePosition();
  }

  prepareTarget(step) {
    if (step.id === "scrapyard") {
      document.querySelector('[data-category="extraction"]')?.click();
      if (window.innerWidth <= 820) document.querySelector('[data-mobile="build"]')?.click();
    }
    if (step.id === "solar" && window.innerWidth <= 820) document.querySelector('[data-mobile="build"]')?.click();
  }

  updateNextButton() {
    if (!this.overlay) return;
    const step = this.requiredStep;
    const ready = step.ready(this.progress, this.state);
    const button = this.overlay.querySelector("#tutorial-next");
    button.disabled = !ready;
    button.textContent = ready ? (this.progress.requiredIndex === REQUIRED_STEPS.length - 1 ? "完成必看" : step.action === "开始" ? "开始" : "下一步") : step.action;
  }

  next() {
    if (!this.overlay) return;
    if (!this.requiredStep.ready(this.progress, this.state)) return;
    if (this.progress.requiredIndex >= REQUIRED_STEPS.length - 1) {
      this.finishRequired();
      return;
    }
    this.progress.requiredIndex += 1;
    this.saveProgress();
    this.renderRequiredStep();
  }

  finishRequired() {
    this.progress.stage = "advanced";
    this.progress.requiredIndex = REQUIRED_STEPS.length;
    this.saveProgress();
    try { this.storage.setItem(LEGACY_TUTORIAL_KEY, "1"); } catch { /* Keep legacy flag best-effort. */ }
    this.destroyOverlay();
  }

  skip() {
    this.progress.skipped = true;
    this.progress.stage = "advanced";
    this.saveProgress();
    this.destroyOverlay();
  }

  destroyOverlay() {
    this.overlay?.remove();
    this.overlay = null;
    this.spotlight = null;
    this.card = null;
  }

  schedulePosition() {
    if (this.positionFrame) return;
    this.positionFrame = requestAnimationFrame(() => {
      this.positionFrame = 0;
      this.positionStep();
    });
  }

  positionStep() {
    if (!this.overlay) return;
    const step = this.requiredStep;
    const selector = window.innerWidth <= 820 ? step.mobileSelector ?? step.selector : step.selector;
    const target = document.querySelector(selector);
    if (!target) {
      this.spotlight.hidden = true;
      this.card.classList.add("missing");
      this.card.style.left = "50%";
      this.card.style.top = "50%";
      this.card.style.transform = "translate(-50%, -50%)";
      this.overlay.querySelector("#tutorial-target").textContent = "未找到目标元素，请先打开对应面板；可跳过或稍后重看。";
      return;
    }
    target.scrollIntoView({ block: "center", inline: "nearest" });
    const rect = target.getBoundingClientRect();
    const padding = 6;
    const left = Math.max(0, rect.left - padding);
    const top = Math.max(0, rect.top - padding);
    const width = Math.min(innerWidth - left, rect.width + padding * 2);
    const height = Math.min(innerHeight - top, rect.height + padding * 2);
    this.spotlight.hidden = false;
    this.card.classList.remove("missing");
    Object.assign(this.spotlight.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` });
    const cardBox = this.card.getBoundingClientRect();
    const cardWidth = cardBox.width || Math.min(480, innerWidth - 28);
    const cardHeight = cardBox.height || 200;
    const gap = 12;
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const obstacles = [
      { rect: document.querySelector("#game-canvas")?.getBoundingClientRect(), weight: 3 },
      { rect: document.querySelector(".build-panel")?.getBoundingClientRect(), weight: 2 },
      { rect: document.querySelector(".log-panel")?.getBoundingClientRect(), weight: 1 },
    ].filter((item) => item.rect);
    const overlapArea = (cardLeft, cardTop, rect) => {
      if (!rect) return 0;
      const overlapX = Math.max(0, Math.min(cardLeft + cardWidth, rect.right) - Math.max(cardLeft, rect.left));
      const overlapY = Math.max(0, Math.min(cardTop + cardHeight, rect.bottom) - Math.max(cardTop, rect.top));
      return overlapX * overlapY;
    };
    const placeAt = (candidateLeft, candidateTop) => {
      const cardLeft = clamp(candidateLeft, gap, innerWidth - cardWidth - gap);
      const cardTop = clamp(candidateTop, gap, innerHeight - cardHeight - gap);
      const targetOverlap = overlapArea(cardLeft, cardTop, { left, top, right: left + width, bottom: top + height });
      let score = targetOverlap * 6;
      for (const obstacle of obstacles) score += overlapArea(cardLeft, cardTop, obstacle.rect) * obstacle.weight;
      return { cardLeft, cardTop, overlap: score };
    };
    const candidates = [
      placeAt(left + width + gap, rect.top),
      placeAt(left, top + height + gap),
      placeAt(left, top - cardHeight - gap),
      placeAt(left - cardWidth - gap, rect.top),
      placeAt(gap, innerHeight - cardHeight - gap),
      placeAt(gap, gap),
      placeAt(innerWidth - cardWidth - gap, gap),
      placeAt(innerWidth - cardWidth - gap, innerHeight - cardHeight - gap),
    ];
    const best = candidates.reduce((current, candidate) => (candidate.overlap < current.overlap ? candidate : current), candidates[0]);
    Object.assign(this.card.style, { left: `${best.cardLeft}px`, top: `${best.cardTop}px`, bottom: "auto", transform: "none" });
  }

  refresh(state = this.state) {
    this.state = state;
    for (const id of ["solar", "scrapyard"]) {
      if (state.maps[state.currentMap]?.buildings.some((building) => building?.id === id)) this.markRequired(id);
    }
    if (this.overlay) this.updateNextButton();
  }

  markRequired(id) {
    if (this.progress.requiredDone.includes(id)) return;
    this.progress.requiredDone.push(id);
    this.saveProgress();
  }

}
