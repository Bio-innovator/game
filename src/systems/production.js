import { BUILDING_BY_ID } from "../data/buildings.js";
import { MAP_BY_ID, MAP_SIZE } from "../data/maps.js";
import { RESOURCE_IDS, getBuildingSize, getFootprintNeighbors, getLayer, getLayerBuildings, getAllLayers, getTechMultiplier, isOperational, resolveAnchorIndex } from "../core/state.js";

export function getAdjacencyMultiplier(state, mapId, index, definition, depth = 0) {
  const buildings = getLayerBuildings(state.maps[mapId], depth);
  const size = getBuildingSize(buildings[index]);
  const occupied = getFootprintNeighbors(index, size)
    .map((cellIndex) => {
      const cell = buildings[cellIndex];
      if (!cell) return null;
      return buildings[resolveAnchorIndex(buildings, cellIndex)];
    })
    .filter((building) => building && !building.anchor);
  const same = occupied.filter((building) => building.id === definition.id).length;
  if (same > 0) return 1 + Math.max(0, (definition.adjacency?.same ?? 1.15) - 1) * same;
  if (occupied.length === 0) return definition.adjacency?.alone ?? 1.1;
  return 1;
}

export function getBuildingOutputMultiplier(state, mapId, index, depth = 0) {
  const buildings = getLayerBuildings(state.maps[mapId], depth);
  const anchorIndex = resolveAnchorIndex(buildings, index);
  const building = buildings[anchorIndex];
  if (!building) return 0;
  const definition = BUILDING_BY_ID[building.id];
  let multiplier = (1.6 ** (building.count - 1)) * getAdjacencyMultiplier(state, mapId, anchorIndex, definition, depth);
  multiplier *= getTechMultiplier(state, "productionMultiplier");
  if (building.underground) multiplier *= 0.7;
  if (depth === 0) {
    if (mapId === "ash") {
      if (state.elapsed < state.maps.ash.stormUntil) multiplier *= MAP_BY_ID.ash.hazard.productionMultiplier;
    } else {
      multiplier *= MAP_BY_ID[mapId].hazard?.productionMultiplier ?? 1;
    }
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
  const dataCores = getAllLayers(map).flatMap((layer) => layer.buildings.filter((building) => isOperational(building) && BUILDING_BY_ID[building.id].ability?.dataMultiplier));
  const coreMultiplier = dataCores.reduce((value, building) => value * (BUILDING_BY_ID[building.id].ability.dataMultiplier ** building.count), 1);
  const dataMultiplier = coreMultiplier * getTechMultiplier(state, "dataMultiplier");

  for (const layer of getAllLayers(map)) {
    for (let index = 0; index < layer.buildings.length; index += 1) {
      const building = layer.buildings[index];
      if (!isOperational(building) || disabled.has(`${layer.depth}:${index}`)) continue;
      const definition = BUILDING_BY_ID[building.id];
      let multiplier = getBuildingOutputMultiplier(state, mapId, index, layer.depth) * map.energy.efficiency;
      if (layer.depth > 0 && definition.category === "extraction") multiplier *= 1.5;
      if (multiplier <= 0) continue;

      const produce = {};
      const consume = {};
      for (const [resource, rate] of Object.entries(definition.produce)) {
        if (resource === "energy" || resource === "capacity") continue;
        produce[resource] = rate * multiplier * (resource === "data" ? dataMultiplier : 1);
      }
      for (const [resource, rate] of Object.entries(definition.consume)) consume[resource] = rate * multiplier;
      entries.push({ index, depth: layer.depth, produce, consume });

      const repair = definition.ability?.repair;
      if (repair) {
        const x = index % MAP_SIZE;
        const y = Math.floor(index / MAP_SIZE);
        for (let targetIndex = 0; targetIndex < layer.buildings.length; targetIndex += 1) {
          const target = layer.buildings[targetIndex];
          if (!isOperational(target) || target.hp >= target.maxHp || targetIndex === index) continue;
          const targetX = targetIndex % MAP_SIZE;
          const targetY = Math.floor(targetIndex / MAP_SIZE);
          const distance = Math.abs(targetX - x) + Math.abs(targetY - y);
          if (distance <= (definition.ability.radius ?? 3)) {
            repairs.push({ depth: layer.depth, index: targetIndex, amount: repair * multiplier * dt });
          }
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
  const gross = {};
  for (const entry of entries) {
    for (const [resource, rate] of Object.entries(entry.produce)) {
      gross[resource] = gross[resource] ?? { produce: 0, consume: 0 };
      gross[resource].produce += rate;
    }
    for (const [resource, rate] of Object.entries(entry.consume)) {
      gross[resource] = gross[resource] ?? { produce: 0, consume: 0 };
      gross[resource].consume += rate;
    }
  }
  const deltas = {};
  let dataDelta = 0;
  for (const [resource, rate] of Object.entries(rates)) {
    if (resource === "data") dataDelta += rate * dt;
    else if (RESOURCE_IDS.includes(resource)) deltas[resource] = rate * dt;
  }
  return { deltas, rates, gross, dataDelta, repairs };
}
