import { getPalette, getResourceColors } from "../../assets/palette.js";
import { BUILDING_BY_ID } from "../data/buildings.js";
import { MAP_SIZE, TILE_SIZE } from "../data/maps.js";
import { isOperational } from "../core/state.js";
import { gameEvents } from "../core/events.js";
import { getEffectSprite } from "./sprites.js";

export class FrameEffects {
  constructor() {
    this.particles = [];
    this.flashFrames = 0;
    this.shakeFrames = 0;
    this.affected = new Map();
    gameEvents.on("disaster", ({ damages }) => {
      this.flashFrames = 2;
      this.shakeFrames = 24;
      for (const damage of damages) this.affected.set(`${damage.mapId}:${damage.index}`, 40);
    });
    gameEvents.on("hazard", ({ damage }) => {
      this.shakeFrames = 16;
      this.affected.set(`${damage.mapId}:${damage.index}`, 40);
    });
    gameEvents.on("build", ({ mapId, index }) => {
      this.affected.set(`${mapId}:${index}`, 20);
    });
  }

  getShake() {
    if (this.shakeFrames <= 0) return { x: 0, y: 0 };
    return { x: (this.shakeFrames % 3) - 1, y: ((this.shakeFrames * 2) % 3) - 1 };
  }

  update(state, frame) {
    if (this.flashFrames > 0) this.flashFrames -= 1;
    if (this.shakeFrames > 0) this.shakeFrames -= 1;
    for (const [key, life] of this.affected) {
      if (life <= 1) this.affected.delete(key);
      else this.affected.set(key, life - 1);
    }
    const map = state.maps[state.currentMap];
    const resourceColors = getResourceColors(state.settings?.theme);
    for (let index = 0; index < map.buildings.length; index += 1) {
      const building = map.buildings[index];
      if (!isOperational(building) || (frame + index * 7) % 48 !== 0) continue;
      const definition = BUILDING_BY_ID[building.id];
      const resource = Object.keys(definition.produce).find((id) => id !== "energy" && id !== "capacity") ?? "energy";
      if (this.particles.length < 220) {
        this.particles.push({
          x: (index % MAP_SIZE) * TILE_SIZE + 8 + (index % 3) * 3,
          y: Math.floor(index / MAP_SIZE) * TILE_SIZE + 5,
          life: 24,
          color: resourceColors[resource] ?? resourceColors.energy,
        });
      }
    }
    for (let index = this.particles.length - 1; index >= 0; index -= 1) {
      this.particles[index].life -= 1;
      if (this.particles[index].life <= 0) this.particles.splice(index, 1);
    }
  }

  draw(context, state, frame) {
    const palette = getPalette(state.settings?.theme);
    for (const [key, life] of this.affected) {
      const [mapId, rawIndex] = key.split(":");
      if (mapId !== state.currentMap || life % 4 > 1) continue;
      const index = Number(rawIndex);
      context.save();
      context.globalAlpha = 0.5;
      context.fillStyle = palette.j;
      context.fillRect((index % MAP_SIZE) * TILE_SIZE, Math.floor(index / MAP_SIZE) * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      context.restore();
    }
    for (const particle of this.particles) {
      context.fillStyle = particle.color;
      context.fillRect(particle.x, particle.y - Math.floor((24 - particle.life) / 3), 2, 2);
    }
    if (state.rocket.stage === "launching") {
      const rocket = getEffectSprite("rocket");
      const progress = Math.min(1, state.rocket.progress / 8);
      context.drawImage(rocket, 264, Math.round(420 - progress * 500), 48, 48);
      context.fillStyle = progress % 0.2 < 0.1 ? palette.l : palette.j;
      context.fillRect(286, Math.round(470 - progress * 500), 4, 18);
    }
    if (state.day >= state.nextPulseDay - 1 && state.rocket.stage !== "launching" && frame % 60 < 30) {
      context.save();
      context.globalAlpha = 0.09;
      context.fillStyle = palette.j;
      context.fillRect(0, 0, 576, 576);
      context.restore();
    }
    if (this.flashFrames > 0) {
      context.save();
      context.globalAlpha = 0.72;
      context.fillStyle = palette.j;
      context.fillRect(0, 0, 576, 576);
      context.restore();
    }
  }
}
