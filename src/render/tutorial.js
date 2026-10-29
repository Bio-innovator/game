const TUTORIAL_KEY = "hdc-tutorial-done";

const STEPS = [
  {
    selector: "#build-panel",
    title: "先选一个蓝图",
    text: "左侧每张卡片都会常显产出与能耗。先选太阳能板，再补采集节点。",
    mobile: "build",
  },
  {
    selector: "#canvas-scroll",
    title: "点击空格建造",
    text: "地图空格用于建造，同类已完成节点可继续堆叠。选错后可用拆除模式回收 35% 材料。",
    mobile: "map",
  },
  {
    selector: "#energy-stat",
    title: "关注能量缺口",
    text: "顶栏显示供给 / 需求。供给低于需求时，全图会按比例降产。",
    mobile: "map",
  },
];

export class Tutorial {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    this.step = 0;
    this.overlay = null;
    this.spotlight = null;
    this.updatePosition = () => this.positionStep();
    window.addEventListener("resize", this.updatePosition);
  }

  start(force = false) {
    let completed = false;
    try { completed = this.storage.getItem(TUTORIAL_KEY) === "1"; } catch { completed = false; }
    if (!force && completed) return false;
    if (this.overlay) return true;
    this.step = 0;
    this.overlay = document.createElement("section");
    this.overlay.id = "tutorial-overlay";
    this.overlay.setAttribute("role", "dialog");
    this.overlay.setAttribute("aria-modal", "true");
    this.overlay.innerHTML = `<div id="tutorial-spotlight" class="tutorial-spotlight"></div><div class="tutorial-card" id="tutorial-card"><span class="eyebrow" id="tutorial-step">第 1 步 / 共 3 步</span><h2 id="tutorial-title"></h2><p id="tutorial-text"></p><div class="dialog-actions"><button type="button" id="tutorial-skip">跳过</button><button type="button" id="tutorial-next" class="primary">下一步</button></div></div>`;
    document.body.append(this.overlay);
    this.spotlight = this.overlay.querySelector("#tutorial-spotlight");
    this.overlay.querySelector("#tutorial-next").addEventListener("click", () => this.next());
    this.overlay.querySelector("#tutorial-skip").addEventListener("click", () => this.finish());
    this.positionStep();
    return true;
  }

  next() {
    this.step += 1;
    if (this.step >= STEPS.length) this.finish();
    else this.positionStep();
  }

  finish() {
    try { this.storage.setItem(TUTORIAL_KEY, "1"); } catch { /* localStorage may be unavailable in private contexts. */ }
    this.overlay?.remove();
    this.overlay = null;
    this.spotlight = null;
  }

  positionStep() {
    if (!this.overlay) return;
    const definition = STEPS[this.step];
    if (window.innerWidth <= 820 && definition.mobile) document.querySelector(`[data-mobile="${definition.mobile}"]`)?.click();
    const target = document.querySelector(definition.selector);
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const padding = 6;
    Object.assign(this.spotlight.style, {
      left: `${Math.max(0, rect.left - padding)}px`,
      top: `${Math.max(0, rect.top - padding)}px`,
      width: `${Math.min(innerWidth, rect.width + padding * 2)}px`,
      height: `${Math.min(innerHeight, rect.height + padding * 2)}px`,
    });
    this.overlay.querySelector("#tutorial-step").textContent = `第 ${this.step + 1} 步 / 共 ${STEPS.length} 步`;
    this.overlay.querySelector("#tutorial-title").textContent = definition.title;
    this.overlay.querySelector("#tutorial-text").textContent = definition.text;
    this.overlay.querySelector("#tutorial-next").textContent = this.step === STEPS.length - 1 ? "完成" : "下一步";
  }
}
