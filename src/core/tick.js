import { apply } from "./state.js";
import { computeEnergy } from "../systems/energy.js";
import { computeProduction } from "../systems/production.js";
import { computeLogistics } from "../systems/logistics.js";
import { getDisasterActions } from "../systems/disaster.js";

export const FIXED_STEP = 0.1;
export const MAX_OFFLINE_SECONDS = 8 * 60 * 60;

export function simulateTick(state, dt = FIXED_STEP, options = {}) {
  apply(state, { type: "ADVANCE_TIME", dt });
  apply(state, { type: "BUILD_TICK", dt });
  apply(state, { type: "ROCKET_TICK", dt });

  for (const mapId of state.unlockedMaps) {
    const energy = computeEnergy(state, mapId, dt);
    apply(state, { type: "ENERGY", mapId, ...energy });
    const production = computeProduction(state, mapId, dt);
    apply(state, { type: "PRODUCTION", mapId, ...production });
  }

  apply(state, { type: "LOGISTICS", ...computeLogistics(state, dt) });

  if (!options.skipDisasters) {
    for (const action of getDisasterActions(state, dt)) apply(state, action);
  }
  return state;
}

export function settleOffline(state, elapsedSeconds) {
  const requested = Math.max(0, Math.floor(Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0));
  const seconds = Math.min(MAX_OFFLINE_SECONDS, requested);
  if (seconds < 10) return null;
  const before = {
    data: state.data,
    maps: Object.fromEntries(Object.entries(state.maps).map(([mapId, map]) => [mapId, { ...map.resources }])),
  };

  apply(state, { type: "OFFLINE_TIME", seconds });
  apply(state, { type: "BUILD_TICK", dt: seconds });
  apply(state, { type: "ROCKET_TICK", dt: seconds });
  for (const mapId of state.unlockedMaps) {
    const energy = computeEnergy(state, mapId, seconds);
    apply(state, { type: "ENERGY", mapId, ...energy });
    const production = computeProduction(state, mapId, seconds);
    apply(state, { type: "PRODUCTION", mapId, ...production });
  }
  apply(state, { type: "LOGISTICS", ...computeLogistics(state, seconds) });
  apply(state, { type: "LOG", key: "offline", values: { count: seconds }, tone: "good" });

  const gains = {};
  for (const [mapId, resources] of Object.entries(before.maps)) {
    gains[mapId] = {};
    for (const [resource, amount] of Object.entries(resources)) {
      const gain = Math.max(0, state.maps[mapId].resources[resource] - amount);
      if (gain > 0.01) gains[mapId][resource] = gain;
    }
  }
  return {
    seconds,
    capped: requested > MAX_OFFLINE_SECONDS,
    data: Math.max(0, state.data - before.data),
    gains,
  };
}

export function createGameLoop({ state, onChange, onRender, onSave }) {
  let running = false;
  let frameId = 0;
  let previous = 0;
  let accumulator = 0;
  let saveElapsed = 0;

  function frame(timestamp) {
    if (!running) return;
    if (!previous) previous = timestamp;
    const realDelta = Math.min(0.25, Math.max(0, (timestamp - previous) / 1000));
    previous = timestamp;
    if (!state.settings.paused && !state.ending) {
      accumulator += realDelta * state.settings.speed;
      let steps = 0;
      while (accumulator >= FIXED_STEP && steps < 40) {
        simulateTick(state, FIXED_STEP);
        accumulator -= FIXED_STEP;
        steps += 1;
      }
      if (steps > 0) onChange(state);
    }
    saveElapsed += realDelta;
    if (saveElapsed >= 10) {
      saveElapsed = 0;
      onSave(state);
    }
    onRender(state, realDelta);
    frameId = requestAnimationFrame(frame);
  }

  return {
    start() {
      if (running) return;
      running = true;
      previous = 0;
      frameId = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(frameId);
    },
  };
}
