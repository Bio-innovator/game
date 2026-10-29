import test from "node:test";
import assert from "node:assert/strict";
import { createInitialState, createMapState } from "../src/core/state.js";
import { diagnose } from "../src/systems/diagnose.js";

function addBuilding(state, mapId, id, buildRemaining = 0) {
  const map = state.maps[mapId];
  map.buildings.push({
    id,
    count: 1,
    hp: 100,
    maxHp: 100,
    buildTotal: Math.max(buildRemaining, 1),
    buildRemaining,
    underground: false,
  });
}

function setEnergy(state, mapId, supply, demand, efficiency = 1) {
  state.maps[mapId].energy = { supply, demand, efficiency, disabled: [] };
}

test("无采集建筑时优先返回 no-extraction", () => {
  const state = createInitialState({ seed: 1 });
  addBuilding(state, "ash", "smelter");
  state.maps.ash.resources.steel = 0;
  setEnergy(state, "ash", 1, 2, 0.5);

  assert.deepEqual(diagnose(state), {
    code: "no-extraction",
    text: "没有采集节点，资源不会增长",
  });
});

test("电力不足时优先于缺少原料返回 low-power，并显示取整效率", () => {
  const state = createInitialState({ seed: 1 });
  addBuilding(state, "ash", "scrapyard");
  addBuilding(state, "ash", "smelter");
  state.maps.ash.resources.steel = 0;
  setEnergy(state, "ash", 2, 5, 0.456);

  assert.deepEqual(diagnose(state), {
    code: "low-power",
    text: "电力不足，全图产出降至 46%",
  });
});

test("已完成在产建筑原料库存为零时返回 no-input 和中文名称", () => {
  const state = createInitialState({ seed: 1 });
  addBuilding(state, "ash", "scrapyard");
  addBuilding(state, "ash", "smelter");
  state.maps.ash.resources.steel = 0;

  assert.deepEqual(diagnose(state), {
    code: "no-input",
    text: "缺少原料（冶炼厂缺废钢）",
  });
});

test("有采集节点且所有建筑未完成时返回 building", () => {
  const state = createInitialState({ seed: 1 });
  addBuilding(state, "ash", "solar", 10);
  addBuilding(state, "ash", "scrapyard", 15);

  assert.deepEqual(diagnose(state), {
    code: "building",
    text: "等待建造完成",
  });
});

test("仅废料场仍在施工时返回 building，不误报 no-extraction", () => {
  const state = createInitialState({ seed: 1 });
  addBuilding(state, "ash", "scrapyard", 15);

  assert.deepEqual(diagnose(state), {
    code: "building",
    text: "等待建造完成",
  });
});

test("已建成采集建筑且没有异常时返回 normal，且不修改状态", () => {
  const state = createInitialState({ seed: 1 });
  addBuilding(state, "ash", "scrapyard");
  const before = structuredClone(state);

  assert.deepEqual(diagnose(state), {
    code: "normal",
    text: "网络运转中",
  });
  assert.deepEqual(state, before);
});

test("未完成建筑的消耗品为零不会误报 no-input", () => {
  const state = createInitialState({ seed: 1 });
  addBuilding(state, "ash", "scrapyard");
  addBuilding(state, "ash", "smelter", 20);
  state.maps.ash.resources.steel = 0;

  assert.equal(diagnose(state).code, "normal");
});

test("mapId 参数诊断指定地图而不是 currentMap", () => {
  const state = createInitialState({ seed: 1 });
  state.maps.swamp = createMapState("swamp", state.seed);
  addBuilding(state, "swamp", "bioreactor");

  assert.equal(diagnose(state).code, "no-extraction");
  assert.equal(diagnose(state, "swamp").code, "normal");
});
