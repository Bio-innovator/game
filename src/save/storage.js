import { BUILDING_BY_ID } from "../data/buildings.js";
import { MAP_BY_ID, MAP_SIZE } from "../data/maps.js";
import { TECH_BY_ID } from "../data/techs.js";
import { RESOURCE_IDS, SAVE_VERSION, createInitialState, createMapState } from "../core/state.js";
import { createSavePayload } from "./codec.js";
import { migrateZoom, ZOOM_STEPS } from "../data/zoom.js";

export const SAVE_KEY = "hundred-day-city-save-v1";
const CELL_COUNT = MAP_SIZE * MAP_SIZE;
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;

function normalizeBuilding(building, legacy = false) {
  if (!building || typeof building !== "object") return null;
  if (Number.isInteger(building.anchor)) return { anchor: building.anchor };
  if (!BUILDING_BY_ID[building.id]) return null;
  const definition = BUILDING_BY_ID[building.id];
  const count = Math.max(1, Math.min(1000, Math.floor(finite(building.count, 1))));
  const maxHp = Math.max(1, finite(building.maxHp, definition.hp));
  const rawSize = legacy ? { w: 1, h: 1 } : building.size ?? definition.size ?? { w: 1, h: 1 };
  const size = {
    w: Math.max(1, Math.min(5, Math.floor(finite(rawSize.w, 1)))),
    h: Math.max(1, Math.min(5, Math.floor(finite(rawSize.h, 1)))),
  };
  return {
    id: building.id,
    count,
    hp: Math.max(0, Math.min(maxHp, finite(building.hp, maxHp))),
    maxHp,
    buildTotal: Math.max(0, finite(building.buildTotal, definition.buildTime)),
    buildRemaining: Math.max(0, finite(building.buildRemaining, 0)),
    underground: Boolean(building.underground),
    size,
    depth: Math.max(0, Math.floor(finite(building.depth, 0))),
  };
}

function normalizeLayer(layer, depth, legacy) {
  const fallbackDestroyed = Array(CELL_COUNT).fill(0);
  const buildings = Array(CELL_COUNT).fill(null);
  for (let index = 0; index < CELL_COUNT; index += 1) buildings[index] = normalizeBuilding(layer?.buildings?.[index], legacy);
  for (let index = 0; index < CELL_COUNT; index += 1) {
    const building = buildings[index];
    if (!building || !building.anchor) continue;
    const anchor = buildings[building.anchor];
    if (!anchor || anchor.anchor) buildings[index] = null;
  }
  return {
    depth,
    buildings,
    destroyed: Array.from({ length: CELL_COUNT }, (_, index) => Math.max(0, Math.floor(finite(layer?.destroyed?.[index], fallbackDestroyed[index])))),
    unlocked: depth === 0
      ? Array(CELL_COUNT).fill(true)
      : Array.from({ length: CELL_COUNT }, (_, index) => Boolean(layer?.unlocked?.[index])),
    nextCollapse: Math.max(0, finite(layer?.nextCollapse, 90)),
  };
}

function normalizeMap(mapId, source, seed) {
  const base = createMapState(mapId, seed);
  if (!source || typeof source !== "object") return base;
  const resources = { ...base.resources };
  for (const resource of RESOURCE_IDS) resources[resource] = Math.max(0, finite(source.resources?.[resource], resources[resource]));
  const legacy = !Array.isArray(source.layers);
  const sourceLayers = legacy ? [{ depth: 0, buildings: source.buildings, destroyed: source.destroyed, unlocked: Array(CELL_COUNT).fill(true) }] : source.layers;
  const layers = sourceLayers
    .filter((layer) => layer && Number.isInteger(layer.depth) && layer.depth >= 0 && layer.depth <= 3)
    .map((layer) => normalizeLayer(layer, layer.depth, legacy))
    .sort((left, right) => left.depth - right.depth);
  if (!layers.some((layer) => layer.depth === 0)) layers.unshift(normalizeLayer({ buildings: source.buildings, destroyed: source.destroyed }, 0, true));
  const maxDepth = Math.max(...layers.map((layer) => layer.depth));
  const requestedDepth = Math.max(0, Math.min(maxDepth, Math.floor(finite(source.currentDepth, 0))));
  const active = layers.find((layer) => layer.depth === requestedDepth) ?? layers[0];
  return {
    ...base,
    terrain: Array.from({ length: CELL_COUNT }, (_, index) => Math.max(0, Math.min(2, Math.floor(finite(source.terrain?.[index], base.terrain[index]))))),
    resources,
    layers,
    currentDepth: active.depth,
    buildings: active.buildings,
    destroyed: active.destroyed,
    energy: {
      supply: Math.max(0, finite(source.energy?.supply)),
      demand: Math.max(0, finite(source.energy?.demand)),
      efficiency: Math.max(0, Math.min(1, finite(source.energy?.efficiency, 1))),
      disabled: Array.isArray(source.energy?.disabled)
        ? source.energy.disabled.map((value) => {
          if (typeof value === "string" && /^\d+:\d+$/.test(value)) return value;
          if (Number.isInteger(value) && value >= 0 && value < CELL_COUNT) return `0:${value}`;
          return null;
        }).filter(Boolean)
        : [],
    },
    rates: source.rates && typeof source.rates === "object" ? { ...source.rates } : {},
    blackoutFor: Math.max(0, finite(source.blackoutFor)),
    rationing: Boolean(source.rationing),
    stormStarted: Math.max(0, finite(source.stormStarted)),
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
    achievements: Array.isArray(source.achievements) ? source.achievements.filter((id, index, list) => typeof id === "string" && list.indexOf(id) === index) : [],
    settings: {
      zoom: migrateZoom(source.settings?.zoom),
      speed: [1, 2, 4].includes(source.settings?.speed) ? source.settings.speed : 1,
      paused: Boolean(source.settings?.paused),
      theme: ["dark", "light"].includes(source.settings?.theme) ? source.settings.theme : base.settings.theme,
      fontSize: [12, 14, 16].includes(source.settings?.fontSize) ? source.settings.fontSize : 14,
      sound: Boolean(source.settings?.sound),
      showGross: Boolean(source.settings?.showGross),
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
    return { state: migrateAndValidate(payload) };
  } catch {
    return null;
  }
}

export function clearSave(storage = globalThis.localStorage) {
  storage?.removeItem(SAVE_KEY);
}

export const SAVE_BACKUP_PREFIX = "hdc-save-backup-";

export function writeSaveBackup(state, storage = globalThis.localStorage) {
  if (!storage) return null;
  let timestamp = Date.now();
  let key = `${SAVE_BACKUP_PREFIX}${timestamp}`;
  try {
    while (storage.getItem(key)) {
      timestamp += 1;
      key = `${SAVE_BACKUP_PREFIX}${timestamp}`;
    }
    storage.setItem(key, JSON.stringify(createSavePayload(state, timestamp)));
    return key;
  } catch {
    return null;
  }
}

export function getLatestSaveBackup(storage = globalThis.localStorage) {
  if (!storage) return null;
  const keys = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(SAVE_BACKUP_PREFIX) && Number.isFinite(Number(key.slice(SAVE_BACKUP_PREFIX.length)))) keys.push(key);
  }
  keys.sort((left, right) => Number(right.slice(SAVE_BACKUP_PREFIX.length)) - Number(left.slice(SAVE_BACKUP_PREFIX.length)));
  for (const key of keys) {
    try {
      const payload = JSON.parse(storage.getItem(key));
      migrateAndValidate(payload);
      return { key, payload };
    } catch {
      // Ignore malformed backups and continue to the next valid snapshot.
    }
  }
  return null;
}

export function readSaveBackup(key, storage = globalThis.localStorage) {
  if (!storage || !key?.startsWith(SAVE_BACKUP_PREFIX)) throw new Error("备份不存在。");
  const payload = JSON.parse(storage.getItem(key));
  return migrateAndValidate(payload);
}
