import { BUILDING_BY_ID } from "../data/buildings.js";
import { MAP_BY_ID } from "../data/maps.js";
import { getTechMultiplier, isOperational } from "../core/state.js";
import { getBuildingOutputMultiplier } from "./production.js";

export function computeEnergy(state, mapId, dt = 0.1) {
  const map = state.maps[mapId];
  const definition = MAP_BY_ID[mapId];
  const consumers = [];
  let supply = 0;
  let demand = 0;

  for (let index = 0; index < map.buildings.length; index += 1) {
    const building = map.buildings[index];
    if (!isOperational(building)) continue;
    const buildingDefinition = BUILDING_BY_ID[building.id];
    if (buildingDefinition.produce.energy) {
      let mapMultiplier = 1;
      if (building.id === "solar") mapMultiplier = definition.solar ?? 1;
      if (building.id === "wind") mapMultiplier = definition.wind ?? 1;
      mapMultiplier *= definition.energyModifiers?.[building.id] ?? 1;
      const outputMultiplier = getBuildingOutputMultiplier(state, mapId, index);
      let inputFactor = 1;
      for (const [resource, rate] of Object.entries(buildingDefinition.consume)) {
        const required = rate * outputMultiplier * Math.max(dt, 0.001);
        if (required > 0) inputFactor = Math.min(inputFactor, (map.resources[resource] ?? 0) / required);
      }
      inputFactor = Math.max(0, Math.min(1, inputFactor));
      supply += buildingDefinition.produce.energy
        * outputMultiplier
        * mapMultiplier
        * inputFactor
        * getTechMultiplier(state, "energyMultiplier");
    }
    if (buildingDefinition.energy > 0) {
      const coldMultiplier = definition.hazard?.energyMultiplier ?? (mapId === "ice" ? 1.4 : 1);
      const usage = buildingDefinition.energy * building.count * coldMultiplier;
      demand += usage;
      consumers.push({ index, usage });
    }
  }

  let blackoutFor = demand > supply ? map.blackoutFor + dt : 0;
  let rationing = demand > supply && (map.rationing || blackoutFor >= 30);
  const disabled = [];
  let remainingDemand = demand;

  if (rationing) {
    consumers.sort((left, right) => right.usage - left.usage);
    for (const consumer of consumers) {
      if (remainingDemand <= supply) break;
      disabled.push(consumer.index);
      remainingDemand -= consumer.usage;
    }
  } else if (demand <= supply) {
    blackoutFor = 0;
    rationing = false;
  }

  const efficiency = remainingDemand > supply ? Math.max(0, supply / remainingDemand) : 1;
  return {
    energy: {
      supply,
      demand,
      efficiency: Math.max(0, Math.min(1, efficiency)),
      disabled,
      rationingDemand: remainingDemand,
    },
    blackoutFor,
    rationing,
  };
}
