import { BUILDING_BY_ID } from "../data/buildings.js";
import { DAY_SECONDS, MAP_BY_ID, MAP_SIZE } from "../data/maps.js";
import { BALANCE } from "../data/balance.js";
import { getQuote } from "../data/quotes.js";
import { TECH_BY_ID } from "../data/techs.js";
import { LOG_LIBRARY, formatLog } from "../data/logs.js";
import { clampResource, safeAdd, safeMultiply } from "./decimal.js";
import { createGameSeed, deriveSeed, nextRandom } from "./rng.js";
import { gameEvents } from "./events.js";
import { ZOOM_STEPS, migrateZoom } from "../data/zoom.js";

export const SAVE_VERSION = 2;
export const CELL_COUNT = MAP_SIZE * MAP_SIZE;
export const CORE_INDEX = Math.floor(MAP_SIZE / 2) * MAP_SIZE + Math.floor(MAP_SIZE / 2);
export const RESOURCE_IDS = ["steel", "metal", "rare", "biomass", "chem", "chip", "helium3", "fuel"];
export const RESOURCE_NAMES = {
  steel: "废钢",
  metal: "金属",
  rare: "稀土",
  biomass: "生物质",
  chem: "化学品",
  chip: "芯片",
  helium3: "氦-3",
  fuel: "燃料",
  data: "数据",
  energy: "能量",
};

function result(ok, message = "", extra = {}) {
  return { ok, message, ...extra };
}

function fillResources(resources = {}) {
  return Object.fromEntries(RESOURCE_IDS.map((id) => [id, Number.isFinite(resources[id]) ? resources[id] : 0]));
}

export function createMapState(mapId, seed) {
  const definition = MAP_BY_ID[mapId];
  let randomState = deriveSeed(seed, mapId);
  const terrain = [];
  for (let index = 0; index < CELL_COUNT; index += 1) {
    const random = nextRandom(randomState);
    randomState = random.state;
    terrain.push(Math.floor(random.value * 3));
  }
  const buildings = Array(CELL_COUNT).fill(null);
  const destroyed = Array(CELL_COUNT).fill(0);
  const surface = { depth: 0, buildings, destroyed, unlocked: Array(CELL_COUNT).fill(true) };
  return {
    id: mapId,
    terrain,
    resources: fillResources(definition.startingResources),
    buildings,
    destroyed,
    layers: [surface],
    currentDepth: 0,
    energy: { supply: 0, demand: 0, efficiency: 1, disabled: [] },
    rates: {},
    blackoutFor: 0,
    rationing: false,
    stormStarted: 0,
    stormUntil: 0,
    nextHazard: 45,
  };
}

function initialLog(day, key, values = {}) {
  const templates = LOG_LIBRARY[key] ?? ["档案事件已记录。"];
  return { day, text: formatLog(templates[0], { day, map: MAP_BY_ID.ash.name, ...values }), tone: "normal" };
}

export function createInitialState(options = {}) {
  const seed = options.seed ?? createGameSeed();
  const state = {
    version: SAVE_VERSION,
    seed,
    rngState: deriveSeed(seed, "simulation"),
    elapsed: 0,
    day: 1,
    data: 0,
    totalData: 0,
    centerLevel: options.centerLevel ?? 1,
    usedQuota: 0,
    currentMap: "ash",
    unlockedMaps: ["ash"],
    maps: { ash: createMapState("ash", seed) },
    techs: [...(options.techs ?? [])],
    routes: [],
    shipments: [],
    nextRouteId: 1,
    nextShipmentId: 1,
    nextPulseDay: 12,
    lastWarningDay: 0,
    rocket: { stage: "idle", progress: 0, duration: BUILDING_BY_ID.rocketFactory.ability.rocketTime },
    stats: { built: 0, completed: 0, destroyed: 0, pulses: 0, launches: 0, routesOpened: 0, excavations: 0 },
    difficulty: options.difficulty ?? 1,
    cycle: options.cycle ?? 1,
    ending: null,
    achievements: [],
    settings: {
      zoom: migrateZoom(options.zoom ?? 1),
      speed: 1,
      paused: false,
      theme: globalThis.matchMedia?.("(prefers-color-scheme: light)")?.matches ? "light" : "dark",
      fontSize: 14,
      sound: false,
      showGross: false,
    },
    logs: [],
    savedAt: Date.now(),
  };
  state.logs.push(initialLog(1, "welcome"));
  return state;
}

export function addLog(state, key, values = {}, tone = "normal") {
  const templates = LOG_LIBRARY[key] ?? [key];
  const template = templates[(state.stats.built + state.logs.length) % templates.length];
  const defaults = {
    day: state.day,
    map: MAP_BY_ID[state.currentMap]?.name ?? "网络",
    building: values.name ?? "节点",
    tech: values.name ?? "科技",
    resource: "货物",
    count: 0,
  };
  state.logs.unshift({ day: state.day, text: formatLog(template, { ...defaults, ...values }), tone });
  if (state.logs.length > 80) state.logs.length = 80;
}

export function isOperational(building) {
  return Boolean(building && !building.anchor && building.hp > 0 && building.buildRemaining <= 0);
}

export function isPlaceholder(building) {
  return Boolean(building && Number.isInteger(building.anchor));
}

export function getMap(state, mapId = state.currentMap) {
  return state.maps[mapId];
}

export function getLayer(map, depth = map.currentDepth ?? 0) {
  return map.layers?.find((layer) => layer.depth === depth) ?? null;
}

export function getLayerBuildings(map, depth = map.currentDepth ?? 0) {
  return getLayer(map, depth)?.buildings ?? (depth === 0 ? map.buildings : []);
}

export function getAllLayers(map) {
  if (!map) return [];
  return map.layers?.length ? map.layers : [{ depth: 0, buildings: map.buildings, destroyed: map.destroyed, unlocked: Array(CELL_COUNT).fill(true) }];
}

export function setActiveLayer(map, depth) {
  const layer = getLayer(map, depth);
  if (!layer) return false;
  map.currentDepth = depth;
  map.buildings = layer.buildings;
  map.destroyed = layer.destroyed;
  return true;
}

export function resolveAnchorIndex(buildings, index) {
  const building = buildings[index];
  return Number.isInteger(building?.anchor) ? building.anchor : index;
}

export function getBuildingSize(building) {
  if (!building) return { w: 1, h: 1 };
  const definition = BUILDING_BY_ID[building.id];
  return building.size ?? definition?.size ?? { w: 1, h: 1 };
}

export function getFootprint(index, size = { w: 1, h: 1 }) {
  if (!Number.isInteger(index) || index < 0 || index >= CELL_COUNT) return [];
  const x = index % MAP_SIZE;
  const y = Math.floor(index / MAP_SIZE);
  if (x + size.w > MAP_SIZE || y + size.h > MAP_SIZE) return [];
  const cells = [];
  for (let dy = 0; dy < size.h; dy += 1) {
    for (let dx = 0; dx < size.w; dx += 1) cells.push(index + dy * MAP_SIZE + dx);
  }
  return cells;
}

export function getFootprintNeighbors(index, size = { w: 1, h: 1 }) {
  const x = index % MAP_SIZE;
  const y = Math.floor(index / MAP_SIZE);
  const neighbors = [];
  for (let dx = -1; dx <= size.w; dx += 1) {
    for (let dy = -1; dy <= size.h; dy += 1) {
      if (dx >= 0 && dx < size.w && dy >= 0 && dy < size.h) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < MAP_SIZE && ny >= 0 && ny < MAP_SIZE) neighbors.push(ny * MAP_SIZE + nx);
    }
  }
  return neighbors;
}

export function getAllAnchors(map) {
  return getAllLayers(map).flatMap((layer) => layer.buildings.filter((building) => building && !building.anchor));
}

export function getOwnedCount(state, buildingId) {
  let count = 0;
  for (const map of Object.values(state.maps)) {
    for (const layer of getAllLayers(map)) {
      for (const building of layer.buildings) {
        if (building && !building.anchor && building.id === buildingId) count += building.count;
      }
    }
  }
  return count;
}

export function getBuildCost(state, buildingId, mapId = state.currentMap) {
  const definition = BUILDING_BY_ID[buildingId];
  const owned = getAllAnchors(state.maps[mapId] ?? {}).filter((building) => building.id === buildingId).reduce((count, building) => count + building.count, 0);
  return Object.fromEntries(Object.entries(definition.cost).map(([resource, amount]) => [
    resource,
    Math.max(1, Math.ceil(safeMultiply(amount, 1.12 ** owned))),
  ]));
}

export function getUpgradeCost(state, buildingId, currentLevel = 1) {
  const definition = BUILDING_BY_ID[buildingId];
  return Object.fromEntries(Object.entries(definition.cost).map(([resource, amount]) => [
    resource,
    Math.max(1, Math.ceil(amount * BALANCE.upgradeCostStep ** Math.max(0, currentLevel - 1))),
  ]));
}

export function hasTech(state, techId) {
  return !techId || state.techs.includes(techId);
}

export function getTechMultiplier(state, effect) {
  return state.techs.reduce((multiplier, techId) => {
    const value = TECH_BY_ID[techId]?.effects?.[effect];
    return Number.isFinite(value) ? multiplier * value : multiplier;
  }, 1);
}

export function getTechEffectTotal(state, effect) {
  return state.techs.reduce((total, techId) => {
    const value = TECH_BY_ID[techId]?.effects?.[effect];
    return Number.isFinite(value) ? total + value : total;
  }, 0);
}

export function getQuota(state) {
  const earned = Math.floor(Math.log10(state.totalData + 1) * state.centerLevel * 2);
  return { earned, used: state.usedQuota, available: Math.max(0, earned - state.usedQuota) };
}

export function getCapacity(state, mapId, resource) {
  const map = getMap(state, mapId);
  const base = MAP_BY_ID[mapId].baseCapacity?.[resource] ?? 500;
  let bonus = 0;
  for (const layer of getAllLayers(map)) {
    for (const building of layer.buildings) {
      if (!isOperational(building)) continue;
      const definition = BUILDING_BY_ID[building.id];
      const storage = definition.produce.capacity ?? definition.ability?.storage ?? 0;
      if (storage > 0) bonus += storage * (1.6 ** (building.count - 1));
    }
  }
  return Math.max(0, base + bonus);
}

export function findCompletedBuilding(state, mapId, buildingId) {
  const map = getMap(state, mapId);
  if (!map) return false;
  return getAllAnchors(map).some((building) => building.id === buildingId && isOperational(building));
}

export function getStackMaxHp(definition, count) {
  return Math.max(definition.hp * 0.4, definition.hp * (1 - (count - 1) * 0.12));
}

export function canBuildAt(state, mapId, index, buildingId, depth = null) {
  const definition = BUILDING_BY_ID[buildingId];
  const map = getMap(state, mapId);
  if (!definition || !map) return result(false, "蓝图或区域不存在。");
  if (index < 0 || index >= CELL_COUNT || !Number.isInteger(index)) return result(false, "无效格子。");
  const layer = getLayer(map, depth ?? map.currentDepth ?? 0);
  if (!layer) return result(false, "该地下层尚未打通。");
  if (mapId === "ash" && layer.depth === 0 && index === CORE_INDEX) return result(false, "运算中心占用此格。它拒绝搬家。");
  if (!hasTech(state, definition.unlock)) return result(false, "尚未完成对应科研。");
  if (definition.maps && !definition.maps.includes(mapId)) return result(false, "该建筑无法在此环境工作。");
  if (layer.depth > 0 && ["logistics", "aerospace"].includes(definition.category)) return result(false, "物流与航天设施只能建在地表。");
  if (layer.depth > 0 && !layer.unlocked[index]) return result(false, "这里仍是岩层，需要爆破或地下支撑。");
  const size = definition.size ?? { w: 1, h: 1 };
  const footprint = getFootprint(index, size);
  if (footprint.length === 0) return result(false, "设施超出地图边界。");
  if (mapId === "ash" && layer.depth === 0 && footprint.includes(CORE_INDEX)) return result(false, "运算中心占用这片地基。它拒绝搬家。");
  let existingAnchorIndex = null;
  for (const cellIndex of footprint) {
    if (!layer.unlocked[cellIndex]) return result(false, "地基范围内仍有未开掘岩层。");
    const cell = layer.buildings[cellIndex];
    if (!cell) continue;
    const anchorIndex = resolveAnchorIndex(layer.buildings, cellIndex);
    if (existingAnchorIndex === null) existingAnchorIndex = anchorIndex;
    else if (existingAnchorIndex !== anchorIndex) return result(false, "地基范围内已有其他设施。");
  }
  const existing = existingAnchorIndex === null ? null : layer.buildings[existingAnchorIndex];
  if (existing && existing.id !== buildingId) return result(false, "此格已有其他设施。");
  if (existing && (!definition.stackable || size.w > 1 || size.h > 1)) return result(false, "大型设施不可原地升级。");
  if (buildingId === "hub" && getAllLayers(map).some((item) => item.buildings.some((building) => building?.id === "hub"))) {
    return result(false, "每张地图仅能保留一座中转站。");
  }
  const cost = existing?.id === buildingId ? getUpgradeCost(state, buildingId, existing.count) : getBuildCost(state, buildingId, mapId);
  for (const [resource, amount] of Object.entries(cost)) {
    if ((map.resources[resource] ?? 0) < amount) return result(false, `${RESOURCE_NAMES[resource] ?? resource}不足。`, { cost });
  }
  return result(true, "", { cost, existing, existingAnchorIndex, depth: layer.depth, size, footprint });
}

function spendResources(map, cost) {
  for (const [resource, amount] of Object.entries(cost)) {
    map.resources[resource] = clampResource((map.resources[resource] ?? 0) - amount, Number.MAX_VALUE);
  }
}

function hasRouteForHub(state, mapId) {
  return state.routes.some((route) => route.a === mapId || route.b === mapId);
}

function unlockArea(layer, index, radius) {
  const centerX = index % MAP_SIZE;
  const centerY = Math.floor(index / MAP_SIZE);
  for (let y = centerY - radius; y <= centerY + radius; y += 1) {
    for (let x = centerX - radius; x <= centerX + radius; x += 1) {
      if (x >= 0 && x < MAP_SIZE && y >= 0 && y < MAP_SIZE) layer.unlocked[y * MAP_SIZE + x] = true;
    }
  }
}

function applyBuild(state, action) {
  const map = getMap(state, action.mapId);
  const depth = action.depth ?? map?.currentDepth ?? 0;
  const validation = canBuildAt(state, action.mapId, action.index, action.buildingId, depth);
  if (!validation.ok) return validation;
  const definition = BUILDING_BY_ID[action.buildingId];
  const layer = getLayer(map, depth);
  spendResources(map, validation.cost);
  if (validation.existing) {
    const building = validation.existing;
    building.count += 1;
    building.maxHp = getStackMaxHp(definition, building.count);
    building.hp = Math.min(building.maxHp, building.hp + definition.hp * 0.35);
    building.buildTotal = definition.buildTime * 0.75;
    building.buildRemaining = building.buildTotal;
    gameEvents.emit("upgrade", { mapId: action.mapId, index: validation.existingAnchorIndex, buildingId: action.buildingId, level: building.count });
  } else {
    const anchorIndex = action.index;
    layer.buildings[anchorIndex] = {
      id: action.buildingId,
      count: 1,
      hp: definition.hp,
      maxHp: definition.hp,
      buildTotal: definition.buildTime,
      buildRemaining: definition.buildTime,
      underground: false,
      size: definition.size ?? { w: 1, h: 1 },
      depth,
    };
    for (const cellIndex of validation.footprint) {
      if (cellIndex !== anchorIndex) layer.buildings[cellIndex] = { anchor: anchorIndex };
    }
  }
  state.stats.built += 1;
  addLog(state, "build", { name: definition.name });
  gameEvents.emit("build", { mapId: action.mapId, index: action.index, buildingId: action.buildingId, depth });
  return result(true, `${definition.name}已开始建造。`);
}

function applyResearch(state, action) {
  const tech = TECH_BY_ID[action.techId];
  if (!tech) return result(false, "未知科技。");
  if (state.techs.includes(tech.id)) return result(false, "该科技已完成。");
  if (!tech.requires.every((techId) => state.techs.includes(techId))) return result(false, "前置科技尚未完成。");
  if (state.data < tech.cost) return result(false, "数据不足。研究所仍在等待输入。");
  state.data -= tech.cost;
  state.techs.push(tech.id);
  addLog(state, "research", { name: tech.name }, "good");
  gameEvents.emit("research", { techId: tech.id });
  return result(true, `科研完成：${tech.name}`);
}

function applyExpansion(state, action) {
  const definition = MAP_BY_ID[action.mapId];
  if (!definition || state.unlockedMaps.includes(action.mapId)) return result(false, "区域已开拓或不存在。");
  if (action.mapId === "moon") return result(false, "月背不能靠探测抵达。需要一枚火箭。");
  if (!hasTech(state, definition.unlockTech)) return result(false, "进入条件尚未满足。");
  const quota = getQuota(state);
  if (quota.available < definition.quotaCost) return result(false, `需要 ${definition.quotaCost} 点可用开拓配额。`);
  state.usedQuota += definition.quotaCost;
  state.maps[action.mapId] = createMapState(action.mapId, state.seed);
  state.unlockedMaps.push(action.mapId);
  state.currentMap = action.mapId;
  addLog(state, "expand", { map: definition.name }, "good");
  gameEvents.emit("map", { mapId: action.mapId });
  return result(true, `${definition.name}已接入网络。`);
}

function applyRouteAdd(state, action) {
  const { from, to, resource } = action;
  if (from === to || !state.unlockedMaps.includes(from) || !state.unlockedMaps.includes(to)) return result(false, "商路端点无效。");
  if (!RESOURCE_IDS.includes(resource)) return result(false, "请选择运输资源。");
  if (!findCompletedBuilding(state, from, "hub") || !findCompletedBuilding(state, to, "hub")) return result(false, "两端都需要已建成中转站。");
  if (state.routes.some((route) => route.from === from && route.to === to && route.resource === resource)) return result(false, "这两个区域之间已有同向、同资源的商路。");
  const cost = { steel: 20 };
  if (getMap(state, from).resources.steel < cost.steel) return result(false, "出发图需要 20 废钢铺设商路。");
  spendResources(getMap(state, from), cost);
  const id = `route-${state.nextRouteId}`;
  state.nextRouteId += 1;
  state.routes.push({ id, a: from, b: to, from, to, resource, level: 0, connected: true });
  state.stats.routesOpened += 1;
  addLog(state, "routeOpen", { from: MAP_BY_ID[from].name, to: MAP_BY_ID[to].name }, "good");
  return result(true, "商路已开通。第一批货物正在等待装运。", { routeId: id });
}

function applyRouteUpgrade(state, action) {
  const route = state.routes.find((item) => item.id === action.routeId);
  if (!route || route.level >= 2) return result(false, "商路无法继续升级。");
  const requiredTech = route.level === 0 ? "tech_pipeline" : "tech_elevator";
  if (!hasTech(state, requiredTech)) return result(false, "对应物流科技尚未完成。");
  const cost = route.level === 0 ? { metal: 40, chip: 5 } : { metal: 160, chip: 40 };
  const map = getMap(state, route.from);
  for (const [resource, amount] of Object.entries(cost)) {
    if (map.resources[resource] < amount) return result(false, `${RESOURCE_NAMES[resource]}不足。`);
  }
  spendResources(map, cost);
  route.level += 1;
  return result(true, route.level === 1 ? "商路已升级为管道。" : "商路已接入轨道电梯。");
}

function applyRocketStart(state) {
  if (state.rocket.stage !== "idle") return result(false, "火箭工程已经在进行中。");
  if (!hasTech(state, "tech_rocketry")) return result(false, "需要完成火箭工程科研。");
  if (!findCompletedBuilding(state, "orbit", "launchpad") || !findCompletedBuilding(state, "orbit", "rocketFactory")) {
    return result(false, "轨道残骸带需要已建成的发射台与火箭装配厂。");
  }
  const rocketDefinition = BUILDING_BY_ID.rocketFactory.ability;
  const cost = Object.fromEntries(Object.entries(rocketDefinition.rocketCost).filter(([resource]) => resource !== "fuel"));
  const orbit = getMap(state, "orbit");
  for (const [resource, amount] of Object.entries(cost)) {
    if (orbit.resources[resource] < amount) return result(false, `${RESOURCE_NAMES[resource]}不足，无法装配火箭。`);
  }
  spendResources(orbit, cost);
  state.rocket.duration = rocketDefinition.rocketTime;
  state.rocket.stage = "assembling";
  state.rocket.progress = 0;
  addLog(state, "rocketAssembly", { map: MAP_BY_ID.orbit.name, resource: "结构材料", count: 0 }, "good");
  return result(true, "火箭装配已启动。人类没有参与验收。");
}

function applyRocketFuel(state) {
  if (state.rocket.stage !== "awaitingFuel") return result(false, "火箭尚未进入加注阶段。");
  const orbit = getMap(state, "orbit");
  const requiredFuel = BUILDING_BY_ID.rocketFactory.ability.rocketCost.fuel;
  if (orbit.resources.fuel < requiredFuel) return result(false, `需要 ${requiredFuel} 单位燃料。`);
  orbit.resources.fuel -= requiredFuel;
  state.rocket.stage = "ready";
  addLog(state, "rocketReady", { map: MAP_BY_ID.orbit.name }, "good");
  return result(true, "燃料加注完成。发射许可由你签发。");
}

function applyDamage(state, damage) {
  const map = getMap(state, damage.mapId);
  const layer = getLayer(map, damage.depth ?? 0);
  if (!layer) return false;
  const anchorIndex = resolveAnchorIndex(layer.buildings, damage.index);
  const building = layer.buildings[anchorIndex];
  if (!building || building.underground || building.anchor) return false;
  building.hp -= damage.amount;
  if (building.hp > 0) return false;
  layer.destroyed[anchorIndex] += 1;
  for (const cellIndex of getFootprint(anchorIndex, getBuildingSize(building))) layer.buildings[cellIndex] = null;
  state.stats.destroyed += 1;
  return true;
}

function applyPulse(state, action) {
  let destroyed = 0;
  let damaged = 0;
  let durabilityLost = 0;
  let exposedDurability = 0;
  const hitAnchors = new Set();
  for (const damage of action.damages) {
    const map = getMap(state, damage.mapId);
    const layer = getLayer(map, damage.depth ?? 0);
    const anchorIndex = layer ? resolveAnchorIndex(layer.buildings, damage.index) : damage.index;
    const anchorKey = `${damage.mapId}:${layer?.depth ?? 0}:${anchorIndex}`;
    if (hitAnchors.has(anchorKey)) continue;
    const building = layer?.buildings[anchorIndex];
    if (!building || building.underground || building.anchor) continue;
    hitAnchors.add(anchorKey);
    exposedDurability += building.maxHp;
    const before = building.hp;
    if (applyDamage(state, { ...damage, depth: layer.depth, index: anchorIndex })) destroyed += 1;
    else damaged += 1;
    durabilityLost += Math.min(before, damage.amount);
  }
  const lossPercent = exposedDurability > 0 ? Math.round(durabilityLost / exposedDurability * 100) : 0;
  for (const routeId of action.cutRoutes) {
    const route = state.routes.find((item) => item.id === routeId);
    if (route) {
      route.connected = false;
      addLog(state, "routeCut", { map: MAP_BY_ID[route.from].name, resource: RESOURCE_NAMES[route.resource] }, "alert");
    }
  }
  state.rngState = action.rngState;
  state.nextPulseDay = action.nextPulseDay;
  state.stats.pulses += 1;
  addLog(state, "pulseReport", { damaged, destroyed, loss: lossPercent }, destroyed > 0 ? "alert" : "good");
  gameEvents.emit("disaster", { damages: action.damages, cutRoutes: action.cutRoutes });
  return result(true, `本次脉冲：${damaged} 座受损，${destroyed} 座摧毁，总耐久损失 ${lossPercent}%。`);
}

export function apply(state, action) {
  switch (action.type) {
    case "BUILD":
      return applyBuild(state, action);
    case "ADVANCE_TIME": {
      state.elapsed += action.dt;
      state.day = Math.floor(state.elapsed / DAY_SECONDS) + 1;
      return result(true);
    }
    case "BUILD_TICK": {
      for (const [mapId, map] of Object.entries(state.maps)) {
        for (const layer of getAllLayers(map)) {
          for (let index = 0; index < layer.buildings.length; index += 1) {
            const building = layer.buildings[index];
            if (!building || building.anchor || building.buildRemaining <= 0) continue;
            building.buildRemaining = Math.max(0, building.buildRemaining - action.dt);
            if (building.buildRemaining > 0) continue;
            const definition = BUILDING_BY_ID[building.id];
            state.stats.completed += 1;
            addLog(state, "complete", { name: definition.name }, "good");
            if (definition.ability?.blast) {
              const nextDepth = layer.depth + 1;
              if (nextDepth <= BALANCE.maxDepth) {
                let nextLayer = getLayer(map, nextDepth);
                if (!nextLayer) {
                  nextLayer = { depth: nextDepth, buildings: Array(CELL_COUNT).fill(null), destroyed: Array(CELL_COUNT).fill(0), unlocked: Array(CELL_COUNT).fill(false), nextCollapse: state.elapsed + 90 };
                  map.layers.push(nextLayer);
                  map.layers.sort((left, right) => left.depth - right.depth);
                }
                unlockArea(nextLayer, index, 1);
                state.stats.excavations += 1;
                addLog(state, "excavation", { map: MAP_BY_ID[mapId].name, depth: nextDepth }, "good");
                gameEvents.emit("layer", { mapId, depth: nextDepth });
              }
              layer.buildings[index] = null;
            } else if (definition.ability?.excavateRadius) {
              unlockArea(layer, index, definition.ability.excavateRadius);
              addLog(state, "support", { map: MAP_BY_ID[mapId].name }, "good");
            }
          }
        }
      }
      return result(true);
    }
    case "ENERGY": {
      const map = getMap(state, action.mapId);
      const wasShort = map.energy.demand > map.energy.supply;
      const wasRationing = map.rationing;
      map.energy = action.energy;
      map.blackoutFor = action.blackoutFor;
      map.rationing = action.rationing;
      const isShort = action.energy.demand > action.energy.supply;
      if (isShort && !wasShort) addLog(state, "lowPower", { map: MAP_BY_ID[action.mapId].name }, "alert");
      if (!isShort && wasShort) addLog(state, "powerRestored", { map: MAP_BY_ID[action.mapId].name }, "good");
      if (action.rationing && !wasRationing) addLog(state, "rationing", { map: MAP_BY_ID[action.mapId].name }, "alert");
      return result(true);
    }
    case "PRODUCTION": {
      const map = getMap(state, action.mapId);
      for (const [resource, delta] of Object.entries(action.deltas)) {
        if (!RESOURCE_IDS.includes(resource)) continue;
        map.resources[resource] = clampResource(safeAdd(map.resources[resource], delta), getCapacity(state, action.mapId, resource));
      }
      if (action.dataDelta > 0) {
        state.data = safeAdd(state.data, action.dataDelta);
        state.totalData = safeAdd(state.totalData, action.dataDelta);
      }
      for (const repair of action.repairs ?? []) {
        const layer = getLayer(map, repair.depth ?? map.currentDepth ?? 0);
        const building = layer?.buildings[repair.index];
        if (building && !building.anchor) building.hp = Math.min(building.maxHp, building.hp + repair.amount);
      }
      map.rates = { ...action.rates };
      map.grossRates = action.gross && typeof action.gross === "object" ? { ...action.gross } : {};
      return result(true);
    }
    case "LOG":
      addLog(state, action.key, action.values, action.tone);
      return result(true);
    case "ACHIEVEMENT": {
      if (state.achievements.includes(action.achievement.id)) return result(false, "成就已完成。");
      const quote = getQuote(action.achievement.quoteId);
      state.achievements.push(action.achievement.id);
      addLog(state, "achievement", { name: action.achievement.name, quote: quote.text, author: quote.author }, "good");
      gameEvents.emit("achievement", { achievement: action.achievement, quote });
      return result(true, `成就解锁：${action.achievement.name}`);
    }
    case "RESEARCH":
      return applyResearch(state, action);
    case "EXPAND":
      return applyExpansion(state, action);
    case "SWITCH_MAP":
      if (!state.unlockedMaps.includes(action.mapId)) return result(false, "区域尚未接入网络。");
      state.currentMap = action.mapId;
      if (state.maps[action.mapId].currentDepth !== 0) setActiveLayer(state.maps[action.mapId], 0);
      gameEvents.emit("map", { mapId: action.mapId });
      return result(true);
    case "SWITCH_LAYER": {
      const map = getMap(state, action.mapId ?? state.currentMap);
      if (!map) return result(false, "区域不存在。");
      if (!setActiveLayer(map, action.depth)) return result(false, "该地下层尚未打通。");
      gameEvents.emit("map", { mapId: map.id, depth: action.depth });
      return result(true, action.depth === 0 ? "返回地表。" : `进入地下 -${action.depth}。`);
    }
    case "UPGRADE_CENTER": {
      const cost = 100 * (state.centerLevel ** 2);
      if (state.data < cost) return result(false, `升级需要 ${cost} 数据。`);
      state.data -= cost;
      state.centerLevel += 1;
      return result(true, `运算中心已升级至 LV.${state.centerLevel}。`);
    }
    case "ROUTE_ADD":
      return applyRouteAdd(state, action);
    case "ROUTE_UPGRADE":
      return applyRouteUpgrade(state, action);
    case "ROUTE_RECONNECT": {
      const route = state.routes.find((item) => item.id === action.routeId);
      if (!route) return result(false, "商路不存在。");
      if (route.connected) return result(false, "商路运转正常。");
      if (!findCompletedBuilding(state, route.from, "hub") || !findCompletedBuilding(state, route.to, "hub")) {
        return result(false, "两端需要先恢复中转站。");
      }
      const map = getMap(state, route.from);
      if (map.resources.metal < 10) return result(false, "重连需要出发图提供 10 金属。");
      map.resources.metal -= 10;
      route.connected = true;
      addLog(state, "routeRestored", {}, "good");
      return result(true, "商路已重连。积压货物将按配额继续运输。");
    }
    case "ROUTE_REVERSE": {
      const route = state.routes.find((item) => item.id === action.routeId);
      if (!route) return result(false, "商路不存在。");
      [route.from, route.to] = [route.to, route.from];
      return result(true, "运输方向已反转。未到达货物不受影响。");
    }
    case "ROUTE_RESOURCE": {
      const route = state.routes.find((item) => item.id === action.routeId);
      if (!route || !RESOURCE_IDS.includes(action.resource)) return result(false, "运输设置无效。");
      route.resource = action.resource;
      return result(true, "运输资源已调整。");
    }
    case "LOGISTICS": {
      state.shipments = action.shipments;
      state.nextShipmentId = action.nextShipmentId;
      for (const [mapId, deltas] of Object.entries(action.deltas)) {
        const map = getMap(state, mapId);
        for (const [resource, delta] of Object.entries(deltas)) {
          map.resources[resource] = clampResource(safeAdd(map.resources[resource], delta), getCapacity(state, mapId, resource));
        }
      }
      return result(true);
    }
    case "DISMANTLE": {
      const map = getMap(state, action.mapId);
      const layer = getLayer(map, action.depth ?? map.currentDepth ?? 0);
      if (!layer) return result(false, "地下层不存在。");
      const anchorIndex = resolveAnchorIndex(layer.buildings, action.index);
      const building = layer.buildings[anchorIndex];
      if (!building || building.anchor) return result(false, "请点击大型设施的中心格拆除。");
      if (building.id === "hub" && hasRouteForHub(state, action.mapId)) return result(false, "请先拆除或保留商路；中转站不能凭空消失。");
      const definition = BUILDING_BY_ID[building.id];
      for (const [resource, amount] of Object.entries(definition.cost)) {
        map.resources[resource] = clampResource(map.resources[resource] + amount * building.count * 0.35, getCapacity(state, action.mapId, resource));
      }
      for (const cellIndex of getFootprint(anchorIndex, getBuildingSize(building))) layer.buildings[cellIndex] = null;
      gameEvents.emit("dismantle", { mapId: action.mapId, index: anchorIndex, buildingId: building.id, depth: layer.depth });
      return result(true, "设施已拆除，返还了 35% 基础材料。");
    }
    case "UNDERGROUND": {
      const map = getMap(state, action.mapId);
      const layer = getLayer(map, action.depth ?? map.currentDepth ?? 0);
      const anchorIndex = layer ? resolveAnchorIndex(layer.buildings, action.index) : action.index;
      const building = layer?.buildings[anchorIndex];
      if (!building) return result(false, "此格没有建筑。");
      if (layer.depth > 0) return result(false, "地下设施不需要重复地下化。");
      if (!hasTech(state, "tech_hardening")) return result(false, "需要加固工程科技。");
      if (!building.underground) {
        if (map.resources.metal < 15) return result(false, "地下化改造需要 15 金属。");
        map.resources.metal -= 15;
      }
      building.underground = !building.underground;
      return result(true, building.underground ? "建筑已地下化：免疫脉冲，产出降低 30%。" : "建筑已返回地表。");
    }
    case "PULSE_WARNING":
      state.lastWarningDay = action.pulseDay;
      addLog(state, "pulseWarning", { day: action.pulseDay, map: "全网络" }, "alert");
      gameEvents.emit("warning", { pulseDay: action.pulseDay });
      return result(true);
    case "PULSE":
      return applyPulse(state, action);
    case "CORROSION": {
      let destroyed = 0;
      for (const damage of action.damages) {
        if (applyDamage(state, damage)) destroyed += 1;
      }
      if (destroyed > 0) addLog(state, "destroy", { map: MAP_BY_ID.swamp.name, count: destroyed }, "alert");
      return result(true);
    }
    case "HAZARD_DAMAGE": {
      const destroyed = applyDamage(state, action.damage);
      state.rngState = action.rngState ?? state.rngState;
      getMap(state, action.damage.mapId).nextHazard = action.nextHazard ?? state.elapsed + 60;
      if (destroyed) addLog(state, "destroy", { map: MAP_BY_ID[action.damage.mapId].name, count: 1 }, "alert");
      gameEvents.emit("hazard", { damage: action.damage });
      return result(true);
    }
    case "SET_HAZARD_TIMER":
      getMap(state, action.mapId).nextHazard = action.nextHazard;
      state.rngState = action.rngState ?? state.rngState;
      return result(true);
    case "COLLAPSE": {
      const map = getMap(state, action.mapId);
      const layer = getLayer(map, action.depth);
      if (!layer) return result(false, "塌方目标层不存在。");
      const anchorIndex = resolveAnchorIndex(layer.buildings, action.index);
      const building = layer.buildings[anchorIndex];
      if (building && !building.anchor) {
        for (const cellIndex of getFootprint(anchorIndex, getBuildingSize(building))) layer.buildings[cellIndex] = null;
      }
      layer.unlocked[action.index] = false;
      layer.nextCollapse = action.nextCollapse;
      state.rngState = action.rngState ?? state.rngState;
      addLog(state, "collapse", { map: MAP_BY_ID[action.mapId].name, depth: layer.depth }, "alert");
      gameEvents.emit("hazard", { damage: { mapId: action.mapId, depth: layer.depth, index: action.index, amount: 0 } });
      return result(true, `地下 -${layer.depth} 发生塌方，一格空间被封死。`);
    }
    case "ROUTE_CUT": {
      const route = state.routes.find((item) => item.id === action.routeId);
      if (route) route.connected = false;
      getMap(state, action.mapId).nextHazard = action.nextHazard;
      state.rngState = action.rngState ?? state.rngState;
      addLog(state, "routeCut", { map: MAP_BY_ID[action.mapId].name, resource: route?.resource ?? "货物" }, "alert");
      return result(true);
    }
    case "STORM": {
      const map = getMap(state, action.mapId);
      map.stormStarted = state.elapsed;
      map.stormUntil = action.until;
      map.nextHazard = action.nextHazard;
      state.rngState = action.rngState ?? state.rngState;
      return result(true);
    }
    case "ROCKET_START":
      return applyRocketStart(state);
    case "ROCKET_FUEL":
      return applyRocketFuel(state);
    case "ROCKET_TICK": {
      if (state.rocket.stage === "assembling") {
        state.rocket.progress += action.dt;
        if (state.rocket.progress >= state.rocket.duration) {
          state.rocket.stage = "awaitingFuel";
          state.rocket.progress = state.rocket.duration;
        }
      } else if (state.rocket.stage === "launching") {
        state.rocket.progress += action.dt;
        if (state.rocket.progress >= 8) {
          state.rocket.stage = "landed";
          state.rocket.progress = 8;
          if (!state.unlockedMaps.includes("moon")) {
            state.unlockedMaps.push("moon");
            state.maps.moon = createMapState("moon", state.seed);
          }
          state.stats.launches += 1;
          state.currentMap = "moon";
          addLog(state, "landing", {}, "good");
          gameEvents.emit("landing", {});
        }
      }
      return result(true);
    }
    case "ROCKET_LAUNCH": {
      if (state.rocket.stage !== "ready") return result(false, "火箭尚未就绪。");
      state.rocket.stage = "launching";
      state.rocket.progress = 0;
      addLog(state, "launch", {}, "good");
      gameEvents.emit("launch", {});
      return result(true, "发射。地球暂时没有发表意见。");
    }
    case "ENDING": {
      state.ending = { id: action.endingId, day: state.day, cycle: state.cycle };
      addLog(state, "ending", {}, "good");
      gameEvents.emit("ending", state.ending);
      return result(true);
    }
    case "NEW_GAME_PLUS": {
      const fresh = createInitialState({
        techs: state.techs,
        centerLevel: state.centerLevel,
        cycle: state.cycle + 1,
        difficulty: state.difficulty + 0.2,
      });
      for (const key of Object.keys(state)) delete state[key];
      Object.assign(state, fresh);
      gameEvents.emit("newgame", {});
      return result(true, `周目 ${state.cycle} 已启动。科技与中心等级保留。`);
    }
    case "SET_SETTING": {
      const allowed = ["zoom", "speed", "paused", "theme", "fontSize", "sound", "showGross"];
      if (!allowed.includes(action.key)) return result(false, "未知设置项。");
      if (action.key === "zoom" && !ZOOM_STEPS.includes(action.value)) return result(false, "地图大小档位不受支持。");
      if (action.key === "theme" && !["dark", "light"].includes(action.value)) return result(false, "未知主题。");      if (action.key === "fontSize" && ![12, 14, 16].includes(action.value)) return result(false, "字号不受支持。");
      if (action.key === "showGross" && typeof action.value !== "boolean") return result(false, "开关取值无效。");
      state.settings[action.key] = action.value;
      return result(true);
    }
    default:
      return result(false, `未知操作：${action.type}`);
  }
}

export function getBuildingResistance(state, mapId, index, depth = 0) {
  const map = getMap(state, mapId);
  const layer = getLayer(map, depth);
  if (!layer) return 1;
  const anchorIndex = resolveAnchorIndex(layer.buildings, index);
  const accumulated = 1 - Math.exp(-(layer.destroyed[anchorIndex] ?? 0) / 3);
  const building = layer.buildings[anchorIndex];
  const fortification = building && isOperational(building) ? (BUILDING_BY_ID[building.id].ability?.resistance ?? 0) * building.count : 0;
  return Math.min(0.9, accumulated + fortification);
}

export function getCenterUpgradeCost(state) {
  return 100 * (state.centerLevel ** 2);
}
