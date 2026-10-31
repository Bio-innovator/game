import { getBuildingResistance, getLayer, isOperational } from "../core/state.js";
import { nextRandom, randomIndex, randomRange } from "../core/rng.js";
import { BALANCE } from "../data/balance.js";

function randomOperationalBuilding(state, mapId, rngState) {
  const buildings = getLayer(state.maps[mapId], 0)?.buildings ?? [];
  const candidates = buildings.map((building, index) => isOperational(building) ? index : -1).filter((index) => index >= 0);
  if (candidates.length === 0) return { index: -1, rngState };
  const random = randomIndex(rngState, candidates.length);
  return { index: candidates[random.value], rngState: random.state };
}

export function getDisasterActions(state, dt = 0.1) {
  const actions = [];
  let rngState = state.rngState;

  if (state.day >= state.nextPulseDay - 1 && state.lastWarningDay !== state.nextPulseDay) {
    actions.push({ type: "PULSE_WARNING", pulseDay: state.nextPulseDay });
  }

  if (state.day >= state.nextPulseDay) {
    const damages = [];
    for (const [mapId, map] of Object.entries(state.maps)) {
      if (mapId === "moon") continue;
      const surface = getLayer(map, 0);
      if (!surface) continue;
      for (let index = 0; index < surface.buildings.length; index += 1) {
        const building = surface.buildings[index];
        if (!building || building.underground || building.anchor) continue;
        const random = randomRange(rngState, BALANCE.pulseDamage[0], BALANCE.pulseDamage[1]);
        rngState = random.state;
        const resistance = getBuildingResistance(state, mapId, index, 0);
        const stackRisk = 2 ** (building.count - 1);
        damages.push({
          mapId,
          depth: 0,
          index,
          amount: building.maxHp * (1 - resistance) * random.value * stackRisk * state.difficulty,
        });
      }
    }
    const cutRoutes = [];
    for (const route of state.routes) {
      if (!route.connected) continue;
      const random = nextRandom(rngState);
      rngState = random.state;
      if (random.value < Math.min(0.65, 0.22 * state.difficulty)) cutRoutes.push(route.id);
    }
    const interval = randomRange(rngState, 10, 20);
    rngState = interval.state;
    actions.push({
      type: "PULSE",
      damages,
      cutRoutes,
      rngState,
      nextPulseDay: state.nextPulseDay + Math.max(6, Math.round(interval.value / state.difficulty)),
    });
  }

  for (const [mapId, map] of Object.entries(state.maps)) {
    for (const layer of (map.layers ?? []).filter((item) => item.depth > 0)) {
      if (state.elapsed < (layer.nextCollapse ?? 90)) continue;
      const candidates = layer.unlocked.map((unlocked, index) => unlocked ? index : -1).filter((index) => index >= 0);
      if (candidates.length <= 9) continue;
      const random = randomIndex(rngState, candidates.length);
      rngState = random.state;
      const interval = randomRange(rngState, 75, 150);
      rngState = interval.state;
      actions.push({ type: "COLLAPSE", mapId, depth: layer.depth, index: candidates[random.value], nextCollapse: state.elapsed + interval.value, rngState });
    }
    if (mapId === "swamp") {
      const damages = [];
      const surface = getLayer(map, 0);
      for (let index = 0; index < (surface?.buildings.length ?? 0); index += 1) {
        const building = surface.buildings[index];
        if (building && !building.underground && !building.anchor) damages.push({ mapId, depth: 0, index, amount: 0.04 * dt * state.difficulty });
      }
      if (damages.length > 0) actions.push({ type: "CORROSION", damages });
    }
    if (state.elapsed < map.nextHazard) continue;
    if (mapId === "ash") {
      const duration = randomRange(rngState, BALANCE.stormDuration[0], BALANCE.stormDuration[1]);
      rngState = duration.state;
      const interval = randomRange(rngState, BALANCE.stormInterval[0], BALANCE.stormInterval[1]);
      rngState = interval.state;
      actions.push({
        type: "STORM",
        mapId,
        until: state.elapsed + duration.value,
        nextHazard: state.elapsed + interval.value,
        rngState,
      });
      continue;
    }
    if (mapId === "rift" || mapId === "moon") {
      const target = randomOperationalBuilding(state, mapId, rngState);
      rngState = target.rngState;
      if (target.index >= 0) {
        const building = getLayer(map, 0).buildings[target.index];
        actions.push({
          type: "HAZARD_DAMAGE",
          damage: { mapId, depth: 0, index: target.index, amount: building.maxHp * (mapId === "rift" ? 2 : 1.2) * state.difficulty },
          rngState,
          nextHazard: state.elapsed + (mapId === "rift" ? 90 : 45),
        });
      } else {
        actions.push({ type: "SET_HAZARD_TIMER", mapId, nextHazard: state.elapsed + 30 });
      }
    }
    if (mapId === "orbit") {
      const connected = state.routes.filter((route) => route.connected && (route.a === "orbit" || route.b === "orbit"));
      if (connected.length > 0) {
        const random = randomIndex(rngState, connected.length);
        rngState = random.state;
        actions.push({ type: "ROUTE_CUT", routeId: connected[random.value].id, mapId, rngState, nextHazard: state.elapsed + 75 });
      } else {
        actions.push({ type: "SET_HAZARD_TIMER", mapId, nextHazard: state.elapsed + 75, rngState });
      }
    }
  }
  return actions;
}
