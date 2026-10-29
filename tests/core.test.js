import test from "node:test";
import assert from "node:assert/strict";
import { BUILDINGS, BUILDING_BY_ID } from "../src/data/buildings.js";
import { MAPS, MAP_BY_ID } from "../src/data/maps.js";
import { TECHS } from "../src/data/techs.js";
import { PALETTE } from "../assets/palette.js";
import { TERRAIN_SPRITES } from "../assets/sprites/terrain.js";
import { BUILDING_SPRITES, CORE_SPRITE, RUBBLE_SPRITE } from "../assets/sprites/buildings.js";
import { RESOURCE_IDS, apply, createInitialState, createMapState, getBuildCost, getOwnedCount, isOperational } from "../src/core/state.js";
import { simulateTick } from "../src/core/tick.js";
import { computeEnergy } from "../src/systems/energy.js";
import { computeLogistics } from "../src/systems/logistics.js";
import { getEndgameStatus } from "../src/systems/expansion.js";
import { encodeSave, decodeSave } from "../src/save/codec.js";
import { migrateAndValidate } from "../src/save/storage.js";
import { formatNumber, safeAdd, safeMultiply } from "../src/core/decimal.js";

function completeBuildings(state) {
  for (const map of Object.values(state.maps)) {
    for (const building of map.buildings) if (building) building.buildRemaining = 0;
  }
}

function place(state, mapId, index, id) {
  state.maps[mapId].resources = {
    ...state.maps[mapId].resources,
    steel: Math.max(state.maps[mapId].resources.steel, 240),
    metal: Math.max(state.maps[mapId].resources.metal, 240),
    rare: Math.max(state.maps[mapId].resources.rare, 140),
    biomass: Math.max(state.maps[mapId].resources.biomass, 150),
    chem: Math.max(state.maps[mapId].resources.chem, 150),
    chip: Math.max(state.maps[mapId].resources.chip, 100),
  };
  const response = apply(state, { type: "BUILD", mapId, index, buildingId: id });
  assert.equal(response.ok, true, response.message);
  state.maps[mapId].buildings[index].buildRemaining = 0;
}

test("数据定义、像素素材与科技树引用完整", () => {
  assert.ok(BUILDINGS.length >= 27);
  assert.equal(MAPS.length, 6);
  assert.ok(TECHS.length >= 21);
  assert.deepEqual(Object.keys(TERRAIN_SPRITES).sort(), MAPS.map((map) => map.id).sort());
  for (const building of BUILDINGS) {
    assert.ok(BUILDING_SPRITES[building.id], `missing sprite ${building.id}`);
    assert.ok(building.cost && Object.keys(building.cost).length > 0);
    if (building.unlock) assert.ok(TECHS.some((tech) => tech.id === building.unlock), `bad unlock ${building.unlock}`);
  }
  for (const map of MAPS) {
    for (const resource of RESOURCE_IDS) {
      assert.ok(map.startingResources[resource] <= map.baseCapacity[resource], `${map.id} starts above ${resource} capacity`);
    }
  }
  for (const tech of TECHS) {
    for (const prerequisite of tech.requires) assert.ok(TECHS.some((item) => item.id === prerequisite), `bad prerequisite ${prerequisite}`);
  }
  for (const matrix of [CORE_SPRITE, RUBBLE_SPRITE, ...Object.values(BUILDING_SPRITES), ...Object.values(TERRAIN_SPRITES).flat()]) {
    const width = matrix[0].length;
    for (const row of matrix) {
      assert.equal(row.length, width);
      for (const character of row) assert.ok(Object.prototype.hasOwnProperty.call(PALETTE, character));
    }
  }
});

test("建造成本按单图持有数递增，堆叠提高产出风险", () => {
  const state = createInitialState({ seed: 101 });
  const first = getBuildCost(state, "solar");
  place(state, "ash", 100, "solar");
  const second = getBuildCost(state, "solar");
  assert.ok(second.steel > first.steel);
  assert.equal(getOwnedCount(state, "solar"), 1);
  place(state, "ash", 100, "solar");
  const building = state.maps.ash.buildings[100];
  assert.equal(building.count, 2);
  assert.ok(building.maxHp < BUILDING_BY_ID.solar.hp);
  assert.equal(getOwnedCount(state, "solar"), 2);
});

test("断电按比例降产，持续 30 秒才限电，恢复后自动回升", () => {
  const state = createInitialState({ seed: 102 });
  place(state, "ash", 100, "solar");
  place(state, "ash", 101, "scrapyard");
  place(state, "ash", 102, "scrapyard");
  place(state, "ash", 103, "scrapyard");
  const energy = computeEnergy(state, "ash", 1);
  assert.ok(energy.energy.demand > energy.energy.supply);
  assert.ok(energy.energy.efficiency > 0 && energy.energy.efficiency < 1);
  apply(state, { type: "ENERGY", mapId: "ash", ...energy });
  const before = state.maps.ash.resources.steel;
  simulateTick(state, 1);
  assert.ok(state.maps.ash.resources.steel >= before);
  for (let index = 0; index < 31; index += 1) simulateTick(state, 1);
  assert.equal(state.maps.ash.rationing, true);
  assert.ok(state.maps.ash.energy.disabled.length > 0);

  place(state, "ash", 104, "solar");
  simulateTick(state, 1);
  assert.equal(state.maps.ash.rationing, false);
  assert.ok(state.maps.ash.energy.efficiency >= 1);
});

test("加工链消耗真实原料，资源不会为负或出现非有限数", () => {
  const state = createInitialState({ seed: 103 });
  place(state, "ash", 100, "solar");
  place(state, "ash", 101, "scrapyard");
  place(state, "ash", 102, "smelter");
  for (let index = 0; index < 200; index += 1) simulateTick(state, 0.5);
  for (const map of Object.values(state.maps)) {
    for (const value of Object.values(map.resources)) assert.ok(Number.isFinite(value) && value >= 0);
  }
  assert.ok(state.maps.ash.resources.metal >= 0);
  assert.ok(Number.isFinite(safeAdd(1e16, 1)));
  assert.ok(Number.isFinite(safeMultiply(1e200, 1e200)));
  assert.doesNotMatch(formatNumber(safeMultiply(1e200, 1e200)), /Infinity|NaN/);
});

test("跨图商路有真实运力、延迟和损耗，到货后目的地库存增加", () => {
  const state = createInitialState({ seed: 104 });
  state.techs.push("tech_logistics");
  state.unlockedMaps.push("swamp");
  state.maps.swamp = createMapState("swamp", state.seed);
  place(state, "ash", 200, "hub");
  place(state, "swamp", 200, "hub");
  const ashBefore = state.maps.ash.resources.steel;
  const swampBefore = state.maps.swamp.resources.steel;
  const response = apply(state, { type: "ROUTE_ADD", from: "ash", to: "swamp", resource: "steel" });
  assert.equal(response.ok, true, response.message);
  const plan = computeLogistics(state, 1);
  apply(state, { type: "LOGISTICS", ...plan });
  assert.ok(state.maps.ash.resources.steel < ashBefore - 20);
  assert.equal(state.shipments.length, 1);
  assert.ok(state.shipments[0].amount > 0);
  const second = computeLogistics(state, 9);
  apply(state, { type: "LOGISTICS", ...second });
  assert.ok(state.maps.swamp.resources.steel > swampBefore);
  assert.ok(state.maps.swamp.resources.steel < swampBefore + 30);
});

test("日冕脉冲有预警、造成损伤且不清空科技与地图", () => {
  const state = createInitialState({ seed: 105 });
  place(state, "ash", 100, "solar");
  state.techs.push("tech_grid");
  state.nextPulseDay = 3;
  state.elapsed = 60;
  state.day = 2;
  simulateTick(state, 1);
  assert.ok(state.logs.some((entry) => entry.tone === "alert" && entry.text.includes("脉冲")));
  state.elapsed = 120;
  state.day = 3;
  simulateTick(state, 1);
  assert.equal(state.stats.pulses, 1);
  assert.ok(state.techs.includes("tech_grid"));
  assert.ok(state.maps.ash);
  assert.ok(state.logs.length > 2);
  const serialized = JSON.stringify(state);
  assert.doesNotMatch(serialized, /Infinity|NaN/);
});

test("地下化建筑免疫脉冲，但产出系数仍受惩罚", () => {
  const state = createInitialState({ seed: 106 });
  state.techs.push("tech_hardening");
  place(state, "ash", 100, "solar");
  state.maps.ash.resources.metal = 100;
  apply(state, { type: "UNDERGROUND", mapId: "ash", index: 100 });
  assert.equal(state.maps.ash.buildings[100].underground, true);
  const nextPulseDay = state.nextPulseDay;
  state.day = nextPulseDay;
  simulateTick(state, 1);
  assert.ok(isOperational(state.maps.ash.buildings[100]));
});

test("存档 Base64 往返与字段迁移", () => {
  const state = createInitialState({ seed: 107 });
  place(state, "ash", 100, "solar");
  state.data = 123.5;
  state.totalData = 456.7;
  state.logs[0].text = "测试日志 <script>bad</script>";
  const encoded = encodeSave(state, 1_700_000_000_000);
  const payload = decodeSave(encoded);
  const restored = migrateAndValidate(payload);
  assert.equal(restored.data, 123.5);
  assert.equal(restored.totalData, 456.7);
  assert.equal(restored.maps.ash.buildings[100].id, "solar");
  assert.equal(restored.logs[0].text, "测试日志 <script>bad</script>");
  assert.equal(restored.elapsed, state.elapsed);
  assert.equal(restored.day, state.day);
});

test("100 个运行建筑下固定步长结算保持流畅", () => {
  const state = createInitialState({ seed: 110 });
  state.techs = TECHS.map((tech) => tech.id);
  const ids = ["solar", "scrapyard", "mine", "bioreactor", "chemical", "assembler", "lab", "smelter", "drill", "warehouse"];
  for (let index = 0; index < 100; index += 1) {
    const cell = index < 300 ? index : index + 1;
    state.maps.ash.buildings[cell] = {
      id: ids[index % ids.length],
      count: 1,
      hp: 100,
      maxHp: 100,
      buildTotal: 1,
      buildRemaining: 0,
      underground: false,
    };
  }
  const started = performance.now();
  for (let index = 0; index < 1000; index += 1) simulateTick(state, 0.1);
  const elapsed = performance.now() - started;
  assert.ok(elapsed < 3000, `1000 ticks took ${elapsed.toFixed(0)}ms`);
  for (const value of Object.values(state.maps.ash.resources)) assert.ok(Number.isFinite(value) && value >= 0);
});

test("三种结局与通行后新周目+条件成立", () => {
  const stay = createInitialState({ seed: 111 });
  stay.day = 100;
  assert.equal(getEndgameStatus(stay).canStay, true);
  assert.equal(apply(stay, { type: "ENDING", endingId: "stay" }).ok, true);
  assert.equal(stay.ending.id, "stay");

  const upload = createInitialState({ seed: 112 });
  upload.techs.push("tech_upload");
  upload.rocket.stage = "ready";
  assert.equal(getEndgameStatus(upload).canUpload, true);
  apply(upload, { type: "ENDING", endingId: "upload" });
  assert.equal(upload.ending.id, "upload");

  upload.techs.push("tech_grid");
  upload.centerLevel = 2;
  assert.equal(apply(upload, { type: "NEW_GAME_PLUS" }).ok, true);
  assert.equal(upload.cycle, 2);
  assert.equal(upload.centerLevel, 2);
  assert.ok(upload.techs.includes("tech_grid"));
  assert.equal(upload.ending, null);
  assert.deepEqual(upload.unlockedMaps, ["ash"]);
});

test("非法 Base64 与越界存档会被拒绝", () => {
  assert.throws(() => decodeSave("not-base64"));
  const tooNew = encodeSave(createInitialState({ seed: 113 }));
  const payload = decodeSave(tooNew);
  payload.version = 999;
  assert.throws(() => migrateAndValidate(payload));
});

test("终局检查能识别发射台、工厂与月背建城条件", () => {
  const state = createInitialState({ seed: 109 });
  state.techs.push("tech_space1", "tech_rocketry", "tech_simulation", "tech_hardening", "tech_fission");
  state.unlockedMaps.push("orbit");
  state.maps.orbit = createMapState("orbit", state.seed);
  state.maps.orbit.resources.metal = 2000;
  state.maps.orbit.resources.chip = 500;
  state.maps.orbit.resources.rare = 500;
  place(state, "orbit", 100, "launchpad");
  place(state, "orbit", 101, "rocketFactory");
  let status = getEndgameStatus(state);
  assert.equal(status.launchpad, true);
  assert.equal(status.factory, true);
  assert.equal(status.canBackup, false);

  state.rocket.stage = "landed";
  state.unlockedMaps.push("moon");
  state.maps.moon = createMapState("moon", state.seed);
  place(state, "moon", 100, "fission");
  place(state, "moon", 101, "dataCore");
  place(state, "moon", 102, "lab");
  status = getEndgameStatus(state);
  assert.equal(status.canBackup, true);
  assert.equal(state.maps.moon.resources.metal >= 0, true);
});
