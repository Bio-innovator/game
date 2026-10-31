import test from "node:test";
import assert from "node:assert/strict";
import { BUILDING_BY_ID } from "../src/data/buildings.js";
import { MAP_SIZE } from "../src/data/maps.js";
import {
  CELL_COUNT,
  apply,
  canBuildAt,
  createInitialState,
  createMapState,
  getFootprint,
  getLayer,
  isOperational,
} from "../src/core/state.js";
import { computeEnergy } from "../src/systems/energy.js";
import { computeProduction } from "../src/systems/production.js";
import { ACHIEVEMENTS } from "../src/systems/achievements.js";
import { createSavePayload } from "../src/save/codec.js";
import { migrateAndValidate } from "../src/save/storage.js";

function fundedState(mapId = "orbit") {
  const state = createInitialState({ seed: 424242 });
  state.techs = ["tech_space1", "tech_rocketry", "tech_hardening", "tech_logistics", "tech_refining"];
  state.maps[mapId] = createMapState(mapId, state.seed);
  state.maps[mapId].resources = { steel: 5000, metal: 5000, rare: 5000, biomass: 2000, chem: 2000, chip: 2000, helium3: 500, fuel: 500 };
  if (!state.unlockedMaps.includes(mapId)) state.unlockedMaps.push(mapId);
  state.currentMap = mapId;
  return state;
}

function buildInstant(state, mapId, index, buildingId, depth = 0) {
  const response = apply(state, { type: "BUILD", mapId, index, buildingId, depth });
  assert.equal(response.ok, true, response.message);
  const layer = getLayer(state.maps[mapId], depth);
  layer.buildings[index].buildRemaining = 0;
  return layer;
}

function occupied(layer) {
  return layer.buildings.filter(Boolean).length;
}

test("5×5 设施占满 25 格，锚点唯一，拆除后全部清空", () => {
  const state = fundedState("orbit");
  const anchor = 2 * MAP_SIZE + 2;
  const layer = buildInstant(state, "orbit", anchor, "launchpad");

  assert.equal(occupied(layer), 25);
  assert.equal(layer.buildings[anchor].id, "launchpad");
  assert.equal(layer.buildings[anchor].anchor, undefined);
  const footprint = getFootprint(anchor, { w: 5, h: 5 });
  assert.equal(footprint.length, 25);
  for (const cell of footprint) {
    if (cell === anchor) continue;
    assert.equal(layer.buildings[cell].anchor, anchor, `cell ${cell} 应为占位`);
  }

  const removed = apply(state, { type: "DISMANTLE", mapId: "orbit", index: anchor });
  assert.equal(removed.ok, true, removed.message);
  assert.equal(occupied(layer), 0);
});

test("越界与重叠的大型设施会被拒绝，且不消耗资源", () => {
  const state = fundedState("orbit");
  const before = { ...state.maps.orbit.resources };

  const outOfBounds = canBuildAt(state, "orbit", CELL_COUNT - 1, "launchpad");
  assert.equal(outOfBounds.ok, false);
  assert.match(outOfBounds.message, /边界/);

  buildInstant(state, "orbit", 0, "solar");
  const overlap = canBuildAt(state, "orbit", 0, "launchpad");
  assert.equal(overlap.ok, false);
  assert.match(overlap.message, /其他设施/);

  const afterSolar = { ...state.maps.orbit.resources };
  const blocked = apply(state, { type: "BUILD", mapId: "orbit", index: 0, buildingId: "launchpad" });
  assert.equal(blocked.ok, false);
  assert.deepEqual(state.maps.orbit.resources, afterSolar);
  assert.ok(before.steel > afterSolar.steel);
});

test("一次脉冲对同一锚点只结算一次伤害", () => {
  const state = fundedState("orbit");
  const anchor = 3 * MAP_SIZE + 3;
  const layer = buildInstant(state, "orbit", anchor, "launchpad");
  const maxHp = layer.buildings[anchor].maxHp;

  const response = apply(state, {
    type: "PULSE",
    damages: [
      { mapId: "orbit", depth: 0, index: anchor, amount: maxHp },
      { mapId: "orbit", depth: 0, index: anchor + 1, amount: maxHp },
      { mapId: "orbit", depth: 0, index: anchor + MAP_SIZE, amount: maxHp },
    ],
    cutRoutes: [],
    nextPulseDay: 12,
    rngState: state.rngState,
  });

  assert.equal(response.ok, true);
  assert.equal(state.stats.destroyed, 1);
  assert.equal(occupied(layer), 0);
  assert.match(response.message, /1 座摧毁/);
});

test("爆破打通地下层并与地表建筑相互隔离", () => {
  const state = createInitialState({ seed: 777 });
  state.maps.ash.resources = { steel: 900, metal: 400, rare: 200, biomass: 200, chem: 200, chip: 120, helium3: 0, fuel: 0 };
  const surfaceAnchor = 5 * MAP_SIZE + 5;
  const surface = buildInstant(state, "ash", surfaceAnchor, "solar");
  const chargeAnchor = 8 * MAP_SIZE + 8;
  const charge = apply(state, { type: "BUILD", mapId: "ash", index: chargeAnchor, buildingId: "blastCharge" });
  assert.equal(charge.ok, true, charge.message);
  surface.buildings[chargeAnchor].buildRemaining = 0.01;

  apply(state, { type: "BUILD_TICK", dt: 0.5 });

  const underground = getLayer(state.maps.ash, 1);
  assert.ok(underground, "爆破完成后应生成地下 1 层");
  assert.equal(underground.unlocked[chargeAnchor], true);
  assert.equal(underground.unlocked[chargeAnchor + 1], true);
  assert.equal(state.stats.excavations, 1);

  const switched = apply(state, { type: "SWITCH_LAYER", mapId: "ash", depth: 1 });
  assert.equal(switched.ok, true, switched.message);
  assert.equal(state.maps.ash.currentDepth, 1);
  assert.equal(state.maps.ash.buildings, underground.buildings);
  assert.equal(state.maps.ash.buildings[surfaceAnchor], null, "地表建筑不应出现在地下层");

  const buildSurfaceOnly = canBuildAt(state, "ash", chargeAnchor, "warehouse", 1);
  assert.equal(buildSurfaceOnly.ok, false, "地下层不允许建造物流设施");

  buildInstant(state, "ash", chargeAnchor, "mine", 1);
  const surfaceSupply = computeEnergy(state, "ash", 0.1).energy.supply;
  assert.ok(surfaceSupply > 0, "地表太阳能板应供电");
  const solarUnderground = canBuildAt(state, "ash", chargeAnchor + 1, "solar", 1);
  assert.equal(solarUnderground.ok, true, solarUnderground.message);
  buildInstant(state, "ash", chargeAnchor + 1, "solar", 1);

  const energy = computeEnergy(state, "ash", 0.1);
  assert.equal(energy.energy.supply, surfaceSupply, "地下无日照，太阳能板不发电");

  const production = computeProduction(state, "ash", 0.1);
  assert.ok(production.deltas.metal > 0, "地下矿井应参与结算");
  assert.equal(production.deltas.energy, undefined);

  apply(state, { type: "SWITCH_LAYER", mapId: "ash", depth: 0 });
  assert.equal(state.maps.ash.buildings[surfaceAnchor].id, "solar");
  assert.equal(state.maps.ash.buildings[chargeAnchor], null);
});

test("成就只触发一次并写入档案日志", () => {
  const state = fundedState("orbit");
  buildInstant(state, "orbit", 0, "solar");
  const achievement = ACHIEVEMENTS.find((item) => item.id === "first-ignition");
  assert.ok(achievement.test(state), "建成能源设施后应满足点火成就");

  const first = apply(state, { type: "ACHIEVEMENT", achievement });
  assert.equal(first.ok, true);
  assert.ok(state.achievements.includes("first-ignition"));
  const entry = state.logs[0];
  assert.match(entry.text, /第一次点火/);
  assert.ok(state.logs.some((log) => log.text.includes("第一次点火") && log.text.includes("——")));

  const second = apply(state, { type: "ACHIEVEMENT", achievement });
  assert.equal(second.ok, false);
  assert.equal(state.achievements.filter((id) => id === "first-ignition").length, 1);
});

test("旧版 1×1 存档迁移后保留建筑并补齐层与尺寸字段", () => {
  const state = fundedState("orbit");
  buildInstant(state, "orbit", 40, "solar");
  const payload = createSavePayload(state);
  payload.version = 1;
  delete payload.state.achievements;
  delete payload.state.maps.orbit.layers;
  delete payload.state.maps.orbit.currentDepth;
  payload.state.maps.orbit.buildings[40].size = undefined;
  payload.state.maps.orbit.buildings[40].anchor = undefined;
  payload.state.maps.orbit.buildings[41] = { id: "warehouse", count: 1, hp: 160, maxHp: 160, buildTotal: 20, buildRemaining: 0, underground: false };

  const restored = migrateAndValidate(payload);
  assert.equal(restored.version, 2);
  assert.equal(restored.maps.orbit.buildings[40].id, "solar");
  assert.equal(restored.maps.orbit.buildings[41].id, "warehouse");
  assert.equal(isOperational(restored.maps.orbit.buildings[40]), true);
  assert.equal(restored.maps.orbit.currentDepth, 0);
  assert.ok(Array.isArray(restored.maps.orbit.layers));
  assert.equal(restored.maps.orbit.layers[0].buildings[40].id, "solar");
  assert.deepEqual(restored.maps.orbit.layers[0].unlocked.length, CELL_COUNT);
  assert.deepEqual(restored.achievements, []);
});

test("多尺寸与多层存档往返后布局一致", () => {
  const state = fundedState("orbit");
  const anchor = 6 * MAP_SIZE + 6;
  buildInstant(state, "orbit", anchor, "launchpad");
  const payload = createSavePayload(state);
  const restored = migrateAndValidate(JSON.parse(JSON.stringify(payload)));
  const layer = getLayer(restored.maps.orbit, 0);
  assert.equal(layer.buildings[anchor].id, "launchpad");
  assert.equal(layer.buildings[anchor + 1].anchor, anchor);
  assert.equal(occupied(layer), 25);
  assert.equal(BUILDING_BY_ID.launchpad.size.w, 5);
});
