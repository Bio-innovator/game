import { apply, createInitialState } from "./core/state.js";
import { createGameLoop } from "./core/tick.js";
import { gameEvents } from "./core/events.js";
import { GridRenderer } from "./render/grid.js";
import { HUD } from "./render/hud.js";
import { Tutorial } from "./render/tutorial.js";
import { clearSave, loadGame, saveGame } from "./save/storage.js";

const canvas = document.querySelector("#game-canvas");
const loaded = loadGame();
const state = loaded?.state ?? createInitialState();
let suppressExitSave = false;

function reloadFresh() {
  suppressExitSave = true;
  clearSave();
  location.reload();
}

gameEvents.on("restart", reloadFresh);

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
  if (response.ok && ["BUILD", "DISMANTLE", "UNDERGROUND", "SET_SETTING", "RESEARCH", "EXPAND", "ROUTE_ADD", "ROUTE_UPGRADE", "ROUTE_RECONNECT", "ROCKET_START", "ROCKET_FUEL", "ROCKET_LAUNCH", "ENDING", "NEW_GAME_PLUS"].includes(action.type)) {
    saveGame(state);
  }
  return response;
}

const grid = new GridRenderer(canvas, (index) => hud.selectCell(index), (zoom) => hud.changeSetting("zoom", zoom));
const hud = new HUD(state, dispatch);
const tutorial = new Tutorial(state);
hud.attachGrid(grid);
hud.setTutorial(tutorial);
grid.render(state);

if (state.ending) hud.showEnding();

const loop = createGameLoop({
  state,
  onChange: () => hud.render(false),
  onRender: (currentState) => grid.render(currentState),
  onSave: (currentState) => saveGame(currentState),
});
let loopStarted = false;
function startGame() {
  if (!loopStarted) {
    loopStarted = true;
    loop.start();
  }
  tutorial.start();
}

if (loaded) {
  const buildingCount = Object.values(state.maps).reduce((total, map) => total + map.buildings.filter(Boolean).length, 0);
  document.querySelector("#offline-content").innerHTML = `<p class="dialog-intro">上次记录：周目 ${state.cycle} · DAY ${state.day} · 建筑 ${buildingCount} 座。离线期间游戏不会运转。</p>`;
  const offlineDialog = document.querySelector("#offline-dialog");
  offlineDialog.addEventListener("cancel", (event) => event.preventDefault());
  document.querySelector("#offline-continue").addEventListener("click", () => {
    offlineDialog.close();
    startGame();
  });
  document.querySelector("#offline-new").addEventListener("click", () => {
    if (!window.confirm("这会清除当前进度（周目、地图、科技、存档）。确定吗？")) return;
    reloadFresh();
  });
  offlineDialog.showModal();
} else {
  startGame();
}

// 调试与自动化验收钩子：只读引用，不改变游戏逻辑。
window.__HDC__ = { state, grid, hud, tutorial, dispatch };

window.addEventListener("beforeunload", () => {
  if (!suppressExitSave) saveGame(state);
});
document.addEventListener("visibilitychange", () => {
  if (!suppressExitSave && document.visibilityState === "hidden") saveGame(state);
});
window.addEventListener("pagehide", () => {
  if (!suppressExitSave) saveGame(state);
});
