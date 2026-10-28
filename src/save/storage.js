import { BUILDING_BY_ID } from "../data/buildings.js";
import { MAP_BY_ID, MAP_SIZE } from "../data/maps.js";
import { TECH_BY_ID } from "../data/techs.js";
import { RESOURCE_IDS, SAVE_VERSION, createInitialState, createMapState } from "../core/state.js";
import { createSavePayload } from "./codec.js";

export const SAVE_KEY = "hundred-day-city-save-v1";
const CELL_COUNT = MAP_SIZE * MAP_SIZE;
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;

function normalizeBuilding(building) {
  if (!building || !BUILDING_BY_ID[building.id]) return null;
  const definition = BUILDING_BY_ID[building.id];
  const count = Math.max(1, Math.min(1000, Math.floor(finite(building.count, 1))));
  const maxHp = Math.max(1, finite(building.maxHp, definition.hp));
  return {
    id: building.id,
    count,
    hp: Math.max(0, Math.min(maxHp, finite(building.hp, maxHp))),
    maxHp,
    buildTotal: Math.max(0, finite(building.buildTotal, definition.buildTime)),
    buildRemaining: Math.max(0, finite(building.buildRemaining, 0)),
    underground: Boolean(building.underground),
  };
}

function normalizeMap(mapId, source, seed) {
  const base = createMapState(mapId, seed);
  if (!source || typeof source !== "object") return base;
  const resources = { ...base.resources };
  for (const resource of RESOURCE_IDS) resources[resource] = Math.max(0, finite(source.resources?.[resource], resources[resource]));
  const buildings = Array(CELL_COUNT).fill(null);
  for (let index = 0; index < CELL_COUNT; index += 1) buildings[index] = normalizeBuilding(source.buildings?.[index]);
  return {
    ...base,
    terrain: Array.from({ length: CELL_COUNT }, (_, index) => Math.max(0, Math.min(2, Math.floor(finite(source.terrain?.[index], base.terrain[index]))))),
    resources,
    buildings,
    destroyed: Array.from({ length: CELL_COUNT }, (_, index) => Math.max(0, Math.floor(finite(source.destroyed?.[index], 0)))),
    energy: {
      supply: Math.max(0, finite(source.energy?.supply)),
      demand: Math.max(0, finite(source.energy?.demand)),
      efficiency: Math.max(0, Math.min(1, finite(source.energy?.efficiency, 1))),
      disabled: Array.isArray(source.energy?.disabled) ? source.energy.disabled.filter((index) => Number.isInteger(index) && index >= 0 && index < CELL_COUNT) : [],
    },
    rates: source.rates && typeof source.rates === "object" ? { ...source.rates } : {},
    blackoutFor: Math.max(0, finite(source.blackoutFor)),
    rationing: Boolean(source.rationing),
    stormUntil: Math.max(0, finite(source.stormUntil)),
    nextHazard: Math.max(0, finite(source.nextHazard, 45)),
  };
}

export function migrateAndValidate(payload) {
  if (!payload || typeof payload !== "object" || !payload.state) throw new Error("存档内容为空。");
  if (!Number.isInteger(payload.version) || payload.version > SAVE_VERSION) throw new Error("存档版本不受支持。");
  const source = payload.state;
  const seed = Math.max(1, Math.floor(finite(source.seed, Date.now())));
  const base = createInitialState({
    seed,
    techs: Array.isArray(source.techs) ? source.techs.filter((id) => TECH_BY_ID[id]) : [],
    centerLevel: Math.max(1, Math.floor(finite(source.centerLevel, 1))),
    cycle: Math.max(1, Math.floor(finite(source.cycle, 1))),
    difficulty: Math.max(0.2, finite(source.difficulty, 1)),
  });
  const unlockedMaps = Array.isArray(source.unlockedMaps)
    ? source.unlockedMaps.filter((id, index, list) => MAP_BY_ID[id] && list.indexOf(id) === index)
    : ["ash"];
  if (!unlockedMaps.includes("ash")) unlockedMaps.unshift("ash");
  const maps = {};
  for (const mapId of unlockedMaps) maps[mapId] = normalizeMap(mapId, source.maps?.[mapId], seed);
  const routes = Array.isArray(source.routes) ? source.routes.filter((route) => route && unlockedMaps.includes(route.a) && unlockedMaps.includes(route.b)).map((route) => ({
    id: String(route.id),
    a: route.a,
    b: route.b,
    from: unlockedMaps.includes(route.from) ? route.from : route.a,
    to: unlockedMaps.includes(route.to) ? route.to : route.b,
    resource: RESOURCE_IDS.includes(route.resource) ? route.resource : "steel",
    level: Math.max(0, Math.min(2, Math.floor(finite(route.level)))),
    connected: Boolean(route.connected),
  })) : [];
  const shipments = Array.isArray(source.shipments) ? source.shipments.filter((shipment) => shipment && unlockedMaps.includes(shipment.to) && RESOURCE_IDS.includes(shipment.resource)).map((shipment) => ({
    id: String(shipment.id),
    routeId: String(shipment.routeId),
    from: shipment.from,
    to: shipment.to,
    resource: shipment.resource,
    amount: Math.max(0, finite(shipment.amount)),
    remaining: Math.max(0, finite(shipment.remaining)),
    totalDelay: Math.max(0.1, finite(shipment.totalDelay, 1)),
  })) : [];
  const validStages = ["idle", "assembling", "awaitingFuel", "ready", "launching", "landed"];
  return {
    ...base,
    version: SAVE_VERSION,
    rngState: Math.max(1, Math.floor(finite(source.rngState, base.rngState))),
    elapsed: Math.max(0, finite(source.elapsed)),
    day: Math.max(1, Math.floor(finite(source.day, 1))),
    data: Math.max(0, finite(source.data)),
    totalData: Math.max(0, finite(source.totalData)),
    usedQuota: Math.max(0, Math.floor(finite(source.usedQuota))),
    currentMap: unlockedMaps.includes(source.currentMap) ? source.currentMap : "ash",
    unlockedMaps,
    maps,
    routes,
    shipments,
    nextRouteId: Math.max(1, Math.floor(finite(source.nextRouteId, routes.length + 1))),
    nextShipmentId: Math.max(1, Math.floor(finite(source.nextShipmentId, shipments.length + 1))),
    nextPulseDay: Math.max(2, Math.floor(finite(source.nextPulseDay, 12))),
    lastWarningDay: Math.max(0, Math.floor(finite(source.lastWarningDay))),
    rocket: {
      stage: validStages.includes(source.rocket?.stage) ? source.rocket.stage : "idle",
      progress: Math.max(0, finite(source.rocket?.progress)),
      duration: Math.max(1, finite(source.rocket?.duration, base.rocket.duration)),
    },
    stats: Object.fromEntries(Object.entries(base.stats).map(([key, value]) => [key, Math.max(0, Math.floor(finite(source.stats?.[key], value)))])),
    ending: source.ending && ["backup", "stay", "upload"].includes(source.ending.id) ? { ...source.ending } : null,
    settings: {
      zoom: [1, 2, 3].includes(source.settings?.zoom) ? source.settings.zoom : 1,
      speed: [1, 2, 4].includes(source.settings?.speed) ? source.settings.speed : 1,
      paused: Boolean(source.settings?.paused),
    },
    logs: Array.isArray(source.logs) ? source.logs.slice(0, 80).map((entry) => ({ day: Math.max(1, Math.floor(finite(entry.day, 1))), text: String(entry.text), tone: ["normal", "alert", "good"].includes(entry.tone) ? entry.tone : "normal" })) : base.logs,
    savedAt: finite(payload.savedAt, Date.now()),
  };
}

export function saveGame(state, storage = globalThis.localStorage) {
  if (!storage) return false;
  try {
    const savedAt = Date.now();
    state.savedAt = savedAt;
    storage.setItem(SAVE_KEY, JSON.stringify(createSavePayload(state, savedAt)));
    return true;
  } catch {
    return false;
  }
}

export function loadGame(storage = globalThis.localStorage) {
  if (!storage) return null;
  const raw = storage.getItem(SAVE_KEY);
  if (!raw) return null;
  try {
    const payload = JSON.parse(raw);
    const state = migrateAndValidate(payload);
    return { state, offlineSeconds: Math.max(0, (Date.now() - finite(payload.savedAt, Date.now())) / 1000) };
  } catch {
    return null;
  }
}

export function clearSave(storage = globalThis.localStorage) {
  storage?.removeItem(SAVE_KEY);
}
