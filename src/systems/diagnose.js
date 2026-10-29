import { RESOURCE_NAMES, isOperational } from "../core/state.js";
import { BUILDING_BY_ID } from "../data/buildings.js";

export function diagnose(state, mapId = state.currentMap) {
  const map = state.maps[mapId];
  const buildings = map.buildings.filter(Boolean);

  const hasExtraction = buildings.some((building) => BUILDING_BY_ID[building.id]?.category === "extraction");
  if (!hasExtraction) {
    return { code: "no-extraction", text: "没有采集节点，资源不会增长" };
  }

  if (map.energy.supply < map.energy.demand) {
    return { code: "low-power", text: `电力不足，全图产出降至 ${Math.round(map.energy.efficiency * 100)}%` };
  }

  for (const building of buildings) {
    if (!isOperational(building)) continue;
    const definition = BUILDING_BY_ID[building.id];
    for (const resource of Object.keys(definition?.consume ?? {})) {
      if ((map.resources[resource] ?? 0) === 0) {
        return { code: "no-input", text: `缺少原料（${definition.name}缺${RESOURCE_NAMES[resource] ?? resource}）` };
      }
    }
  }

  if (buildings.length > 0 && buildings.every((building) => building.buildRemaining > 0)) {
    return { code: "building", text: "等待建造完成" };
  }

  return { code: "normal", text: "网络运转中" };
}
