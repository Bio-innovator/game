import { MAP_SIZE, TILE_SIZE } from "../data/maps.js";
import { BUILDING_BY_ID } from "../data/buildings.js";
import { CORE_INDEX, isOperational } from "../core/state.js";
import { gameEvents } from "../core/events.js";
import { getPalette } from "../../assets/palette.js";
import {
  getBuildingSprite,
  getCoreSprite,
  getRubbleSprite,
  getSpriteTheme,
  getTerrainSprite,
  setSpriteTheme,
} from "./sprites.js";
import { drawAdjacencyNetwork, drawRoutes } from "./routes.js";
import { FrameEffects } from "./fx.js";

const GRID_SIZE = MAP_SIZE * TILE_SIZE;

export class GridRenderer {
  constructor(canvas, onCell) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d", { alpha: false });
    this.context.imageSmoothingEnabled = false;
    this.frame = 0;
    this.selectedIndex = null;
    this.terrainCache = new Map();
    this.theme = getSpriteTheme();
    this.palette = getPalette(this.theme);
    this.effects = new FrameEffects();
    this.onCell = onCell;
    canvas.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const scale = rect.width / GRID_SIZE;
      const x = Math.floor((event.clientX - rect.left) / scale / TILE_SIZE);
      const y = Math.floor((event.clientY - rect.top) / scale / TILE_SIZE);
      if (x >= 0 && x < MAP_SIZE && y >= 0 && y < MAP_SIZE) this.onCell(y * MAP_SIZE + x);
    });
    gameEvents.on("map", () => { this.selectedIndex = null; });
    gameEvents.on("newgame", () => this.terrainCache.clear());
  }

  getTerrain(state) {
    const mapId = state.currentMap;
    const map = state.maps[mapId];
    const signature = `${mapId}:${map.terrain.join("")}`;
    if (!this.terrainCache.has(signature)) {
      const canvas = document.createElement("canvas");
      canvas.width = GRID_SIZE;
      canvas.height = GRID_SIZE;
      const context = canvas.getContext("2d", { alpha: false });
      context.imageSmoothingEnabled = false;
      for (let index = 0; index < map.terrain.length; index += 1) {
        const sprite = getTerrainSprite(mapId, map.terrain[index]);
        context.drawImage(sprite, (index % MAP_SIZE) * TILE_SIZE, Math.floor(index / MAP_SIZE) * TILE_SIZE);
      }
      this.terrainCache.set(signature, canvas);
    }
    return this.terrainCache.get(signature);
  }

  setTheme(theme) {
    if (theme !== "dark" && theme !== "light") {
      throw new RangeError(`Unknown grid theme: ${theme}`);
    }
    this.theme = theme;
    this.palette = getPalette(theme);
    setSpriteTheme(theme);
    this.terrainCache.clear();
  }

  setZoom(zoom) {
    const size = GRID_SIZE * zoom;
    this.canvas.style.width = `${size}px`;
    this.canvas.style.height = `${size}px`;
  }

  drawBuilding(context, state, map, building, index) {
    const x = (index % MAP_SIZE) * TILE_SIZE;
    const y = Math.floor(index / MAP_SIZE) * TILE_SIZE;
    const sprite = getBuildingSprite(building.id);
    const palette = this.palette;
    const progress = building.buildTotal > 0 ? 1 - building.buildRemaining / building.buildTotal : 1;
    context.save();
    if (progress < 1) {
      context.globalAlpha = 0.28;
      context.drawImage(sprite, x + 4, y + 4);
      context.globalAlpha = 0.92;
      context.beginPath();
      context.rect(x + 4, y + 4 + Math.floor(16 * (1 - progress)), 16, Math.ceil(16 * progress));
      context.clip();
      context.drawImage(sprite, x + 4, y + 4);
      context.restore();
      context.fillStyle = palette.g;
      context.fillRect(x + 2, y + 20 - Math.floor(16 * progress), 2, Math.max(1, Math.floor(16 * progress)));
    } else {
      context.drawImage(sprite, x + 4, y + 4);
      context.restore();
    }

    if (building.underground) {
      context.save();
      context.globalAlpha = 0.55;
      context.fillStyle = palette['0'];
      context.fillRect(x + 2, y + 15, 20, 7);
      context.restore();
      context.fillStyle = palette.g;
      context.fillRect(x + 4, y + 19, 16, 1);
    }
    if (map.energy.disabled.includes(index) && this.frame % 40 < 20) {
      context.fillStyle = palette.j;
      context.fillRect(x + 3, y + 3, 18, 2);
      context.fillRect(x + 3, y + 3, 2, 18);
    }
    if (building.hp < building.maxHp) {
      context.fillStyle = palette['1'];
      context.fillRect(x + 3, y + 22, 18, 2);
      context.fillStyle = building.hp / building.maxHp > 0.35 ? palette.g : palette.j;
      context.fillRect(x + 3, y + 22, Math.ceil(18 * building.hp / building.maxHp), 1);
    }
    if (building.count > 1) {
      context.fillStyle = palette['0'];
      context.fillRect(x + 16, y + 2, 7, 7);
      context.fillStyle = palette['7'];
      context.font = "7px monospace";
      context.textBaseline = "top";
      context.fillText(String(Math.min(9, building.count)), x + 18, y + 2);
    }
    if (isOperational(building) && BUILDING_BY_ID[building.id].category === "energy" && this.frame % 50 < 25) {
      context.fillStyle = palette.i;
      context.fillRect(x + 11, y + 1, 2, 2);
    }
  }

  render(state) {
    const theme = state.settings?.theme ?? "dark";
    if (theme !== this.theme) this.setTheme(theme);
    const palette = this.palette;
    this.frame += 1;
    this.effects.update(state, this.frame);
    const context = this.context;
    const map = state.maps[state.currentMap];
    const shake = this.effects.getShake();
    context.save();
    context.imageSmoothingEnabled = false;
    context.fillStyle = palette['0'];
    context.fillRect(0, 0, GRID_SIZE, GRID_SIZE);
    context.translate(shake.x, shake.y);
    context.drawImage(this.getTerrain(state), 0, 0);
    drawAdjacencyNetwork(context, state);

    if (state.currentMap === "ash") {
      const coreX = (CORE_INDEX % MAP_SIZE) * TILE_SIZE;
      const coreY = Math.floor(CORE_INDEX / MAP_SIZE) * TILE_SIZE;
      context.drawImage(getCoreSprite(), coreX + 4, coreY + 4);
      if (this.frame % 60 < 30) {
        context.fillStyle = palette.g;
        context.fillRect(coreX + 11, coreY + 1, 2, 2);
      }
    }
    for (let index = 0; index < map.buildings.length; index += 1) {
      const building = map.buildings[index];
      if (building) this.drawBuilding(context, state, map, building, index);
      else if (map.destroyed[index] > 0) context.drawImage(getRubbleSprite(), (index % MAP_SIZE) * TILE_SIZE + 4, Math.floor(index / MAP_SIZE) * TILE_SIZE + 4);
    }
    drawRoutes(context, state, this.frame);

    if (this.selectedIndex !== null) {
      const x = (this.selectedIndex % MAP_SIZE) * TILE_SIZE;
      const y = Math.floor(this.selectedIndex / MAP_SIZE) * TILE_SIZE;
      context.fillStyle = this.theme === "light" ? palette['1'] : palette['7'];
      context.fillRect(x, y, 7, 1);
      context.fillRect(x, y, 1, 7);
      context.fillRect(x + 17, y, 7, 1);
      context.fillRect(x + 23, y, 1, 7);
      context.fillRect(x, y + 23, 7, 1);
      context.fillRect(x, y + 17, 1, 7);
      context.fillRect(x + 17, y + 23, 7, 1);
      context.fillRect(x + 23, y + 17, 1, 7);
    }
    if (map.energy.demand > map.energy.supply) {
      context.save();
      context.globalAlpha = 0.18;
      context.fillStyle = palette['0'];
      context.fillRect(0, 0, GRID_SIZE, GRID_SIZE);
      context.restore();
    }
    this.effects.draw(context, state, this.frame);
    context.restore();
  }
}
