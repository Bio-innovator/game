import test from "node:test";
import assert from "node:assert/strict";
import { MAPS } from "../src/data/maps.js";
import { TECH_BY_ID } from "../src/data/techs.js";
import { formatNumber } from "../src/core/decimal.js";
import {
  apply,
  canBuildAt,
  createInitialState,
  findCompletedBuilding,
  getBuildCost,
  getQuota,
  hasTech,
  isOperational,
} from "../src/core/state.js";
import { FIXED_STEP, simulateTick } from "../src/core/tick.js";
import { getExpansionStatus, getEndgameStatus } from "../src/systems/expansion.js";
import { encodeSave, decodeSave } from "../src/save/codec.js";
import { migrateAndValidate } from "../src/save/storage.js";

const MAX_STEPS = 22_000;

function tryBuild(state, mapId, buildingId, empties = emptyCells(state, mapId)) {
  if (!canAfford(state, mapId, buildingId)) return false;
  for (const index of empties) {
    if (!canBuildAt(state, mapId, index, buildingId).ok) continue;
    const response = apply(state, { type: "BUILD", mapId, index, buildingId });
    if (response.ok) return true;
  }
  return false;
}

function emptyCells(state, mapId) {
  const map = state.maps[mapId];
  const cells = [];
  for (let index = 0; index < map.buildings.length; index += 1) {
    if (map.buildings[index]) continue;
    if (mapId === "ash" && index === 300) continue;
    cells.push(index);
  }
  return cells;
}

function canAfford(state, mapId, buildingId) {
  const map = state.maps[mapId];
  const cost = getBuildCost(state, buildingId, mapId);
  return Object.entries(cost).every(([resource, amount]) => (map.resources[resource] ?? 0) >= amount);
}

function countOperational(state, mapId, buildingId) {
  return state.maps[mapId].buildings.filter((building) => building?.id === buildingId && isOperational(building)).length;
}

function mapHas(state, mapId, buildingId) {
  return state.maps[mapId].buildings.some((building) => building?.id === buildingId);
}

function generatorFor(mapId) {
  if (mapId === "moon") return "fission";
  if (mapId === "ice") return "wind";
  return "solar";
}

function nextEmpty(state, mapId) {
  return emptyIndex(state, mapId);
}
function automateMap(state, mapId) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const map = state.maps[mapId];
    const empties = emptyCells(state, mapId);
    let built = false;
    const build = (buildingId) => {
      if (built) return;
      built = tryBuild(state, mapId, buildingId, empties);
    };
    const prioritizeFuel = mapId === "ice" && hasTech(state, "tech_fuel") && map.resources.fuel < 650;
    if (prioritizeFuel && countOperational(state, mapId, "assembler") > 2 && map.resources.chem < 120) {
      const index = map.buildings.findIndex((building) => building?.id === "assembler" && isOperational(building));
      if (index >= 0) {
        apply(state, { type: "DISMANTLE", mapId, index });
        continue;
      }
    }
    const generator = generatorFor(mapId);
    const pendingGenerators = map.buildings.filter((building) => building?.id === generator && building.buildRemaining > 0).length;
    if ((map.energy.supply === 0 || map.energy.demand > map.energy.supply) && pendingGenerators === 0) build(generator);
    if (built) continue;

    if (empties.length === 0) return;
    if (countOperational(state, mapId, "scrapyard") < 4) build("scrapyard");
    if (!built && countOperational(state, mapId, "mine") < 3) build("mine");
    if (!built && !mapHas(state, mapId, "hub") && hasTech(state, "tech_logistics") && mapId !== "moon") build("hub");
    if (!built && countOperational(state, mapId, "bioreactor") < 2) build("bioreactor");
    if (!built && countOperational(state, mapId, "chemical") < 2 && map.resources.metal >= 50) build("chemical");
    if (!built && !prioritizeFuel && countOperational(state, mapId, "assembler") < 3 && map.resources.metal >= 100) build("assembler");
    if (!built && prioritizeFuel && map.resources.chip < 80 && countOperational(state, mapId, "assembler") < 2 && map.resources.metal >= 120) build("assembler");
    if (!built && !prioritizeFuel && countOperational(state, mapId, "lab") < 4) build("lab");
    if (!built && hasTech(state, "tech_refining") && countOperational(state, mapId, "smelter") < 2) build("smelter");
    if (!built && hasTech(state, "tech_deep_drill1") && countOperational(state, mapId, "drill") < 3) build("drill");
    if (!built && countOperational(state, mapId, "repair") < 1) build("repair");
    if (!built && Object.entries(map.resources).some(([resource, amount]) => amount > getStorageGuard(state, mapId, resource)) && countOperational(state, mapId, "warehouse") < (mapId === "orbit" ? 16 : 8)) build("warehouse");

    if (!built && prioritizeFuel) {
      if (countOperational(state, mapId, "chemical") < 4) build("chemical");
      if (!built && countOperational(state, mapId, "heliumExtractor") < 6) build("heliumExtractor");
      if (!built && countOperational(state, mapId, "fuelPlant") < 4) build("fuelPlant");
    }
    if (!built && mapId === "orbit" && hasTech(state, "tech_space1") && countOperational(state, mapId, "warehouse") < 13) build("warehouse");
    if (!built && mapId === "orbit" && hasTech(state, "tech_space1") && !mapHas(state, mapId, "launchpad")) build("launchpad");
    if (!built && mapId === "orbit" && hasTech(state, "tech_rocketry") && !mapHas(state, mapId, "rocketFactory")) build("rocketFactory");
    if (!built) return;
  }
}

function getStorageGuard(state, mapId, resource) {
  const map = state.maps[mapId];
  const base = { steel: 250, metal: 500, rare: 400, biomass: 200, chem: 350, chip: 400, helium3: 500, fuel: 300 }[resource] ?? 200;
  return base * 0.9;
}

function researchOne(state) {
  const priorities = [
    "tech_logistics", "tech_refining", "tech_purification1", "tech_purification2",
    "tech_deep_drill1", "tech_grid", "tech_assembly", "tech_insulation1", "tech_insulation2",
    "tech_insulation3", "tech_pipeline", "tech_simulation", "tech_fuel", "tech_space1",
    "tech_geothermal", "tech_fission", "tech_rocketry", "tech_elevator", "tech_hardening",
    "tech_fusion", "tech_upload",
  ];
  for (const techId of priorities) {
    const tech = TECH_BY_ID[techId];
    if (!tech || state.techs.includes(techId)) continue;
    if (!tech.requires.every((required) => state.techs.includes(required))) continue;
    if (state.data < tech.cost) continue;
    return apply(state, { type: "RESEARCH", techId });
  }
  return null;
}

function expandOrUpgrade(state) {
  for (const definition of MAPS) {
    if (["ash", "moon"].includes(definition.id)) continue;
    const status = getExpansionStatus(state, definition.id);
    if (status.canExpand) {
      const response = apply(state, { type: "EXPAND", mapId: definition.id });
      if (response.ok) return true;
    }
    if (!state.unlockedMaps.includes(definition.id) && hasTech(state, definition.unlockTech) && getQuota(state).available < definition.quotaCost) {
      const upgradeCost = 100 * state.centerLevel ** 2;
      if (state.data >= upgradeCost + 50) return apply(state, { type: "UPGRADE_CENTER" }).ok;
    }
  }
  return false;
}

function ensureRoutes(state) {
  const desired = [
    ["ice", "orbit", "fuel"],
    ["rift", "orbit", "rare"],
    ["ash", "orbit", "steel"],
    ["swamp", "orbit", "chem"],
  ];
  for (const [from, to, resource] of desired) {
    if (!state.unlockedMaps.includes(from) || !state.unlockedMaps.includes(to)) continue;
    const existing = state.routes.find((route) => route.from === from && route.to === to && route.resource === resource);
    if (existing && !existing.connected) apply(state, { type: "ROUTE_RECONNECT", routeId: existing.id });
    if (existing) continue;
    if (!findCompletedBuilding(state, from, "hub") || !findCompletedBuilding(state, to, "hub")) continue;
    apply(state, { type: "ROUTE_ADD", from, to, resource });
  }
  return false;
}

function protectCriticals(state) {
  if (!hasTech(state, "tech_hardening")) return;
  for (const [mapId, map] of Object.entries(state.maps)) {
    if (map.resources.metal < 15) continue;
    for (let index = 0; index < map.buildings.length; index += 1) {
      const building = map.buildings[index];
      if (!building || building.underground) continue;
      if (["hub", "launchpad", "rocketFactory", "dataCore", "fuelPlant"].includes(building.id)) {
        apply(state, { type: "UNDERGROUND", mapId, index });
      }
    }
  }
}

function operateEndgame(state) {
  if (!state.unlockedMaps.includes("orbit")) return;
  const status = getEndgameStatus(state);
  if (status.launchpad && status.factory) {
    if (state.rocket.stage === "idle") apply(state, { type: "ROCKET_START" });
    if (state.rocket.stage === "awaitingFuel") apply(state, { type: "ROCKET_FUEL" });
    if (state.rocket.stage === "ready") apply(state, { type: "ROCKET_LAUNCH" });
  }
  if (state.rocket.stage === "landed" && !state.ending) {
    if (!mapHas(state, "moon", "fission")) tryBuild(state, "moon", "fission");
    else if (!mapHas(state, "moon", "dataCore")) tryBuild(state, "moon", "dataCore");
    else if (!mapHas(state, "moon", "lab")) tryBuild(state, "moon", "lab");
    const endgame = getEndgameStatus(state);
    if (endgame.canBackup) apply(state, { type: "ENDING", endingId: "backup" });
  }
}

test("从空状态自动化经营并完整通关到备份文明结局", () => {
  const state = createInitialState({ seed: 20261028 });
  let actionCount = 0;
  for (let step = 0; step < MAX_STEPS && !state.ending; step += 1) {
    simulateTick(state, FIXED_STEP * 10);
    researchOne(state);
    expandOrUpgrade(state);
    ensureRoutes(state);
    protectCriticals(state);
    for (const mapId of [...state.unlockedMaps]) automateMap(state, mapId);
    operateEndgame(state);
    actionCount += 1;
    if (step % 250 === 0) {
      for (const [mapId, map] of Object.entries(state.maps)) {
        for (const value of Object.values(map.resources)) assert.ok(Number.isFinite(value) && value >= 0, `${mapId} invalid resource`);
      }
      assert.ok(Number.isFinite(state.data) && state.data >= 0);
    }
  }

  const orbitStatus = state.maps.orbit ? {
    buildings: state.maps.orbit.buildings.filter(Boolean).map((building) => `${building.id}${building.buildRemaining > 0 ? "(building)" : ""}`),
    resources: state.maps.orbit.resources,
    energy: state.maps.orbit.energy,
    storage: state.maps.orbit.buildings.filter((building) => building?.id === "warehouse").length,
  } : null;
  const iceStatus = state.maps.ice ? {
    resources: state.maps.ice.resources,
    energy: state.maps.ice.energy,
    buildings: state.maps.ice.buildings.filter(Boolean).map((building) => `${building.id}${building.buildRemaining > 0 ? "(building)" : ""}${building.underground ? "(underground)" : ""}`),
    hub: state.maps.ice.buildings.some((building) => building?.id === "hub"),
  } : null;
  const endgameStatus = getEndgameStatus(state);
  assert.ok(state.ending, `未能在 ${MAX_STEPS} 步内通关；科技 ${state.techs.length}，数据 ${formatNumber(state.data)}，地图 ${state.unlockedMaps.join(",")}，火箭 ${state.rocket.stage}，发射台 ${endgameStatus.launchpad}，工厂 ${endgameStatus.factory}，冰原 ${JSON.stringify(iceStatus)}，商路 ${JSON.stringify(state.routes)}，轨道 ${JSON.stringify(orbitStatus)}`);
  assert.equal(state.ending.id, "backup");
  assert.ok(state.techs.length >= 15);
  assert.ok(state.unlockedMaps.includes("moon"));
  assert.ok(state.stats.launches >= 1);
  assert.ok(actionCount > 0);
  assert.ok(state.day > 1);

  const encoded = encodeSave(state);
  const restored = migrateAndValidate(decodeSave(encoded));
  assert.equal(restored.ending.id, "backup");
  assert.equal(restored.rocket.stage, "landed");
  assert.ok(restored.techs.length >= 15);
});
