import { MAP_BY_ID } from "../data/maps.js";
import { findCompletedBuilding, getQuota, hasTech, isOperational } from "../core/state.js";

export function getExpansionStatus(state, mapId) {
  const definition = MAP_BY_ID[mapId];
  if (state.unlockedMaps.includes(mapId)) return { unlocked: true, canExpand: false };
  if (mapId === "moon") {
    return { unlocked: false, canExpand: false, reason: state.rocket.stage === "landed" ? "已着陆" : "完成火箭发射后开放" };
  }
  if (!hasTech(state, definition.unlockTech)) return { unlocked: false, canExpand: false, reason: "进入科技未完成" };
  const quota = getQuota(state);
  if (quota.available < definition.quotaCost) return { unlocked: false, canExpand: false, reason: `需要 ${definition.quotaCost} 配额` };
  return { unlocked: false, canExpand: true };
}

export function getEndgameStatus(state) {
  const launchpad = state.unlockedMaps.includes("orbit") && findCompletedBuilding(state, "orbit", "launchpad");
  const factory = state.unlockedMaps.includes("orbit") && findCompletedBuilding(state, "orbit", "rocketFactory");
  const moonBuildings = state.maps.moon?.buildings.filter((building) => isOperational(building) && !building.anchor) ?? [];
  const moonCore = findCompletedBuilding(state, "moon", "dataCore");
  const assemblyDone = ["awaitingFuel", "ready", "launching", "landed"].includes(state.rocket.stage);
  const assemblyProgress = assemblyDone ? state.rocket.duration : state.rocket.stage === "assembling" ? state.rocket.progress : 0;
  const fueled = ["ready", "launching", "landed"].includes(state.rocket.stage);
  const fuelTarget = 600;
  const orbitFuel = fueled ? fuelTarget : Math.min(fuelTarget, state.maps.orbit?.resources.fuel ?? 0);
  const landed = state.rocket.stage === "landed";
  const canBackup = landed && moonBuildings.length >= 3 && moonCore;
  return {
    launchpad,
    factory,
    assembly: state.rocket.stage !== "idle",
    assemblyDone,
    assemblyProgress,
    fuelProgress: orbitFuel,
    fuelTarget,
    fueled,
    landed,
    launched: ["launching", "landed"].includes(state.rocket.stage),
    moonCount: moonBuildings.length,
    moonCore,
    canBackup,
    canUpload: hasTech(state, "tech_upload") && ["ready", "launching", "landed"].includes(state.rocket.stage),
    canStay: state.day >= 100,
  };
}
