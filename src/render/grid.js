import { MAP_SIZE, TILE_SIZE } from "../data/maps.js";
import { BUILDING_BY_ID } from "../data/buildings.js";
import { CORE_INDEX, isOperational } from "../core/state.js";
import { gameEvents } from "../core/events.js";
import { getPalette } from "../../assets/palette.js";
import {
  getBuildingSprite,
  getCoreSprite,
  getFloorSprite,
  getRubbleSprite,
  getSpriteTheme,
  getTerrainSprite,
  setSpriteTheme,
} from "./sprites.js";
import { drawAdjacencyNetwork, drawRoutes } from "./routes.js";
import { FrameEffects } from "./fx.js";

const GRID_SIZE = MAP_SIZE * TILE_SIZE;

export class GridRenderer {
  constructor(canvas, onCell, onZoom = null) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d", { alpha: false });
    this.context.imageSmoothingEnabled = false;
    this.frame = 0;
    this.currentZoom = 1;
    this.selectedIndex = null;
    this.terrainCache = new Map();
    this.theme = getSpriteTheme();
    this.palette = getPalette(this.theme);
    this.effects = new FrameEffects();
    this.onCell = onCell;
    this.onZoom = onZoom;
    this.pointers = new Map();
    this.pinch = null;
    this.pendingCell = null;
    canvas.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this.pointers.size === 2) {
        this.pendingCell = null;
        const [first, second] = [...this.pointers.values()];
        this.pinch = { distance: Math.hypot(first.x - second.x, first.y - second.y), zoom: this.currentZoom };
        return;
      }
      if (this.pointers.size > 2) return;
      if (event.pointerType === "touch") {
        this.pendingCell = { x: event.clientX, y: event.clientY };
        return;
      }
      this.emitCell(event.clientX, event.clientY);
    });
    canvas.addEventListener("pointermove", (event) => {
      if (!this.pointers.has(event.pointerId)) return;
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this.pointers.size !== 2 || !this.pinch) return;
      const [first, second] = [...this.pointers.values()];
      const distance = Math.hypot(first.x - second.x, first.y - second.y);
      if (distance < 4 || this.pinch.distance < 4) return;
      const ratio = distance / this.pinch.distance;
      if (ratio > 1.35) {
        event.preventDefault();
        this.applyZoom(this.pinch.zoom + 1, (first.x + second.x) / 2, (first.y + second.y) / 2);
        this.pinch = { distance, zoom: this.currentZoom };
      } else if (ratio < 0.74) {
        event.preventDefault();
        this.applyZoom(this.pinch.zoom - 1, (first.x + second.x) / 2, (first.y + second.y) / 2);
        this.pinch = { distance, zoom: this.currentZoom };
      }
    }, { passive: false });
    const endPointer = (event) => {
      this.pointers.delete(event.pointerId);
      if (this.pointers.size < 2) this.pinch = null;
      if (this.pointers.size > 0) return;
      const pending = this.pendingCell;
      this.pendingCell = null;
      if (!pending) return;
      if (Math.hypot(pending.x - event.clientX, pending.y - event.clientY) > 10) return;
      this.emitCell(event.clientX, event.clientY);
    };
    canvas.addEventListener("pointerup", endPointer);
    canvas.addEventListener("pointercancel", (event) => {
      this.pointers.delete(event.pointerId);
      if (this.pointers.size < 2) this.pinch = null;
      this.pendingCell = null;
    });
    canvas.addEventListener("wheel", (event) => {
      if (!event.ctrlKey || !this.onZoom) return;
      event.preventDefault();
      this.applyZoom(this.currentZoom + (event.deltaY < 0 ? 1 : -1), event.clientX, event.clientY);
    }, { passive: false });
    gameEvents.on("map", () => { this.selectedIndex = null; });
    gameEvents.on("newgame", () => this.terrainCache.clear());
  }

  emitCell(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const scale = rect.width / GRID_SIZE;
    const x = Math.floor((clientX - rect.left) / scale / TILE_SIZE);
    const y = Math.floor((clientY - rect.top) / scale / TILE_SIZE);
    if (x >= 0 && x < MAP_SIZE && y >= 0 && y < MAP_SIZE) this.onCell(y * MAP_SIZE + x);
  }

  applyZoom(target, clientX, clientY) {
    if (!this.onZoom) return;
    const next = Math.max(1, Math.min(3, target));
    if (next === this.currentZoom) return;
    const container = this.canvas.parentElement;
    const canvasRect = this.canvas.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const cellX = canvasRect.width ? (clientX - canvasRect.left) / canvasRect.width : 0.5;
    const cellY = canvasRect.height ? (clientY - canvasRect.top) / canvasRect.height : 0.5;
    this.onZoom(next);
    const width = GRID_SIZE * next;
    const targetLeft = Math.max(0, cellX * width - (clientX - containerRect.left));
    const targetTop = Math.max(0, cellY * width - (clientY - containerRect.top));
    // 浏览器可能尚未把新的画布尺寸应用为可滚动区域，强制读取一次布局后再写入滚动位置。
    void container.scrollHeight;
    container.scrollLeft = targetLeft;
    container.scrollTop = targetTop;
    requestAnimationFrame(() => {
      if (Math.abs(container.scrollLeft - targetLeft) > 1) container.scrollLeft = targetLeft;
      if (Math.abs(container.scrollTop - targetTop) > 1) container.scrollTop = targetTop;
    });
  }

  getTerrain(state) {
    const mapId = state.currentMap;
    const map = state.maps[mapId];
    const depth = map.currentDepth ?? 0;
    const layer = map.layers?.find((item) => item.depth === depth);
    const signature = `${mapId}:${depth}:${this.theme}:${map.terrain.join("")}:${(layer?.unlocked ?? []).map(Number).join("")}`;
    if (!this.terrainCache.has(signature)) {
      const canvas = document.createElement("canvas");
      canvas.width = GRID_SIZE;
      canvas.height = GRID_SIZE;
      const context = canvas.getContext("2d", { alpha: false });
      context.imageSmoothingEnabled = false;
      if (depth === 0) {
        for (let index = 0; index < map.terrain.length; index += 1) {
          const sprite = getTerrainSprite(mapId, map.terrain[index]);
          context.drawImage(sprite, (index % MAP_SIZE) * TILE_SIZE, Math.floor(index / MAP_SIZE) * TILE_SIZE);
        }
      } else {
        const palette = this.palette;
        context.fillStyle = palette["0"];
        context.fillRect(0, 0, GRID_SIZE, GRID_SIZE);
        for (let index = 0; index < MAP_SIZE * MAP_SIZE; index += 1) {
          const x = (index % MAP_SIZE) * TILE_SIZE;
          const y = Math.floor(index / MAP_SIZE) * TILE_SIZE;
          if (!layer?.unlocked[index]) {
            if ((index * 7) % 5 === 0) {
              context.fillStyle = palette["1"];
              context.fillRect(x + ((index * 3) % 18), y + ((index * 11) % 18), 4, 2);
            }
            continue;
          }
          context.fillStyle = palette["2"];
          context.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
          context.fillStyle = palette["1"];
          context.fillRect(x + 1, y + 1, TILE_SIZE - 2, 1);
          context.fillRect(x + 1, y + 1, 1, TILE_SIZE - 2);
          if ((index * 5) % 7 === 0) context.fillRect(x + 5, y + 17, 3, 2);
        }
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
    this.currentZoom = zoom;
    const size = GRID_SIZE * zoom;
    this.canvas.style.width = `${size}px`;
    this.canvas.style.height = `${size}px`;
  }

  drawBuilding(context, state, map, building, index) {
    if (building.anchor) return;
    const x = (index % MAP_SIZE) * TILE_SIZE;
    const y = Math.floor(index / MAP_SIZE) * TILE_SIZE;
    const size = building.size ?? BUILDING_BY_ID[building.id].size ?? { w: 1, h: 1 };
    const width = size.w * TILE_SIZE;
    const height = size.h * TILE_SIZE;
    const sprite = getBuildingSprite(building.id);
    const scale = Math.max(1, Math.floor((width - 8) / 16));
    const drawSize = 16 * scale;
    const drawX = x + Math.floor((width - drawSize) / 2);
    const drawY = y + Math.floor((height - drawSize) / 2);
    const palette = this.palette;
    const progress = building.buildTotal > 0 ? 1 - building.buildRemaining / building.buildTotal : 1;
    context.save();
    if (progress < 1) {
      context.globalAlpha = 0.28;
      context.drawImage(sprite, drawX, drawY, drawSize, drawSize);
      context.globalAlpha = 0.92;
      context.beginPath();
      context.rect(drawX, drawY + Math.floor(drawSize * (1 - progress)), drawSize, Math.ceil(drawSize * progress));
      context.clip();
      context.drawImage(sprite, drawX, drawY, drawSize, drawSize);
      context.restore();
      context.fillStyle = palette.g;
      context.fillRect(x + 2, y + height - 4 - Math.floor((height - 6) * progress), 2, Math.max(1, Math.floor((height - 6) * progress)));
    } else {
      context.drawImage(sprite, drawX, drawY, drawSize, drawSize);
      context.restore();
    }

    if (building.underground) {
      context.save();
      context.globalAlpha = 0.55;
      context.fillStyle = palette['0'];
      context.fillRect(x + 2, y + height - 9, width - 4, 7);
      context.restore();
      context.fillStyle = palette.g;
      context.fillRect(x + 4, y + height - 5, width - 8, 1);
    }
    if (map.energy.disabled.includes(`${map.currentDepth ?? 0}:${index}`) && this.frame % 40 < 20) {
      context.fillStyle = palette.j;
      context.fillRect(x + 3, y + 3, width - 6, 2);
      context.fillRect(x + 3, y + 3, 2, height - 6);
    }
    if (building.hp < building.maxHp) {
      context.fillStyle = palette['1'];
      context.fillRect(x + 3, y + height - 2, width - 6, 2);
      context.fillStyle = building.hp / building.maxHp > 0.35 ? palette.g : palette.j;
      context.fillRect(x + 3, y + height - 2, Math.ceil((width - 6) * building.hp / building.maxHp), 1);
    }
    if (building.count > 1) {
      context.fillStyle = palette['0'];
      context.fillRect(x + width - 9, y + 2, 7, 7);
      context.fillStyle = palette['7'];
      context.font = "7px monospace";
      context.textBaseline = "top";
      context.fillText(String(Math.min(9, building.count)), x + width - 7, y + 2);
    }
    if (isOperational(building) && BUILDING_BY_ID[building.id].category === "energy" && this.frame % 50 < 25) {
      context.fillStyle = palette.i;
      context.fillRect(x + Math.floor(width / 2) - 1, y + 1, 2, 2);
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
    const floor = getFloorSprite(state.currentMap);
    for (let index = 0; index < map.buildings.length; index += 1) {
      const building = map.buildings[index];
      if (!building || building.anchor || building.buildRemaining > 0) continue;
      const size = building.size ?? { w: 1, h: 1 };
      const x = (index % MAP_SIZE) * TILE_SIZE;
      const y = Math.floor(index / MAP_SIZE) * TILE_SIZE;
      for (let dy = 0; dy < size.h; dy += 1) {
        for (let dx = 0; dx < size.w; dx += 1) context.drawImage(floor, x + dx * TILE_SIZE, y + dy * TILE_SIZE);
      }
    }
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
      const selectedBuilding = map.buildings[this.selectedIndex];
      const size = selectedBuilding?.size ?? { w: 1, h: 1 };
      const x = (this.selectedIndex % MAP_SIZE) * TILE_SIZE;
      const y = Math.floor(this.selectedIndex / MAP_SIZE) * TILE_SIZE;
      const width = size.w * TILE_SIZE;
      const height = size.h * TILE_SIZE;
      context.fillStyle = this.theme === "light" ? palette['1'] : palette['7'];
      context.fillRect(x, y, 7, 1);
      context.fillRect(x, y, 1, 7);
      context.fillRect(x + width - 7, y, 7, 1);
      context.fillRect(x + width - 1, y, 1, 7);
      context.fillRect(x, y + height - 1, 7, 1);
      context.fillRect(x, y + height - 7, 1, 7);
      context.fillRect(x + width - 7, y + height - 1, 7, 1);
      context.fillRect(x + width - 1, y + height - 7, 1, 7);
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
