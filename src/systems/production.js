import { BUILDING_BY_ID } from "../data/buildings.js";
import { MAP_BY_ID, MAP_SIZE } from "../data/maps.js";
import { RESOURCE_IDS, getTechMultiplier, isOperational } from "../core/state.js";

export function getAdjacencyMultiplier(state, mapId, index, definition) {
  const buildings = state.maps[mapId].buildings;
  const x = index % MAP_SIZE;
  const y = Math.floor(index / MAP_SIZE);
  const neighbors = [];
  if (x > 0) neighbors.push(buildings[index - 1]);
  if (x < MAP_SIZE - 1) neighbors.push(buildings[index + 1]);
  if (y > 0) neighbors.push(buildings[index - MAP_SIZE]);
  if (y < MAP_SIZE - 1) neighbors.push(buildings[index + MAP_SIZE]);
  const occupied = neighbors.filter(Boolean);
  const same = occupied.filter((building) => building.id === definition.id).length;
  if (same > 0) return 1 + Math.max(0, (definition.adjacency?.same ?? 1.15) - 1) * same;
  if (occupied.length === 0) return definition.adjacency?.alone ?? 1.1;
  return 1;
}

export function getBuildingOutputMultiplier(state, mapId, index) {
  const building = state.maps[mapId].buildings[index];
  if (!building) return 0;
  const definition = BUILDING_BY_ID[building.id];
  let multiplier = (1.6 ** (building.count - 1)) * getAdjacencyMultiplier(state, mapId, index, definition);
  multiplier *= getTechMultiplier(state, "productionMultiplier");
  if (building.underground) multiplier *= 0.7;
  if (mapId === "ash") {
    if (state.elapsed < state.maps.ash.stormUntil) multiplier *= MAP_BY_ID.ash.hazard.productionMultiplier;
  } else {
    multiplier *= MAP_BY_ID[mapId].hazard?.productionMultiplier ?? 1;
  }
  return multiplier;
}

function addRate(target, resource, amount) {
  target[resource] = (target[resource] ?? 0) + amount;
}

export function computeProduction(state, mapId, dt = 0.1) {
  const map = state.maps[mapId];
  const disabled = new Set(map.energy.disabled);
  const entries = [];
  const repairs = [];
  const dataCores = map.buildings.filter((building) => isOperational(building) && BUILDING_BY_ID[building.id].ability?.dataMultiplier);
  const coreMultiplier = dataCores.reduce((value, building) => value * (BUILDING_BY_ID[building.id].ability.dataMultiplier ** building.count), 1);
  const dataMultiplier = coreMultiplier * getTechMultiplier(state, "dataMultiplier");

  for (let index = 0; index < map.buildings.length; index += 1) {
    const building = map.buildings[index];
    if (!isOperational(building) || disabled.has(index)) continue;
    const definition = BUILDING_BY_ID[building.id];
    const multiplier = getBuildingOutputMultiplier(state, mapId, index) * map.energy.efficiency;
    if (multiplier <= 0) continue;

    const produce = {};
    const consume = {};
    for (const [resource, rate] of Object.entries(definition.produce)) {
      if (resource === "energy" || resource === "capacity") continue;
      produce[resource] = rate * multiplier * (resource === "data" ? dataMultiplier : 1);
    }
    for (const [resource, rate] of Object.entries(definition.consume)) consume[resource] = rate * multiplier;
    entries.push({ index, produce, consume });

    const repair = definition.ability?.repair;
    if (repair) {
      const x = index % MAP_SIZE;
      const y = Math.floor(index / MAP_SIZE);
      for (let targetIndex = 0; targetIndex < map.buildings.length; targetIndex += 1) {
        const target = map.buildings[targetIndex];
        if (!target || target.hp >= target.maxHp) continue;
        const targetX = targetIndex % MAP_SIZE;
        const targetY = Math.floor(targetIndex / MAP_SIZE);
        const distance = Math.abs(targetX - x) + Math.abs(targetY - y);
        if (distance <= (definition.ability.radius ?? 3)) {
          repairs.push({ index: targetIndex, amount: repair * multiplier * dt });
        }
      }
    }
  }

  for (const resource of RESOURCE_IDS) {
    let consumption = 0;
    let grossProduction = 0;
    for (const entry of entries) {
      consumption += entry.consume[resource] ?? 0;
      grossProduction += entry.produce[resource] ?? 0;
    }
    if (consumption <= 0) continue;
    const available = (map.resources[resource] ?? 0) + grossProduction * dt;
    const required = consumption * dt;
    if (required <= available) continue;
    const factor = Math.max(0, available / required);
    for (const entry of entries) {
      if (!entry.consume[resource]) continue;
      entry.consume[resource] *= factor;
      for (const output of Object.keys(entry.produce)) entry.produce[output] *= factor;
    }
  }

  const rates = {};
  for (const entry of entries) {
    for (const [resource, rate] of Object.entries(entry.produce)) addRate(rates, resource, rate);
    for (const [resource, rate] of Object.entries(entry.consume)) addRate(rates, resource, -rate);
  }
  const deltas = {};
  let dataDelta = 0;
  for (const [resource, rate] of Object.entries(rates)) {
    if (resource === "data") dataDelta += rate * dt;
    else if (RESOURCE_IDS.includes(resource)) deltas[resource] = rate * dt;
  }
  return { deltas, rates, dataDelta, repairs };
}
