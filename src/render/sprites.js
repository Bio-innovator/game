import { getPalette } from "../../assets/palette.js";
import { FLOOR_SPRITES, TERRAIN_SPRITES } from "../../assets/sprites/terrain.js";
import { BUILDING_SPRITES, CORE_SPRITE, RUBBLE_SPRITE } from "../../assets/sprites/buildings.js";
import { EFFECT_SPRITES } from "../../assets/sprites/effects.js";

const cache = new Map();
const urlCache = new Map();
let spriteTheme = "dark";

export function setSpriteTheme(theme) {
  if (theme !== "dark" && theme !== "light") {
    throw new RangeError(`Unknown sprite theme: ${theme}`);
  }
  if (spriteTheme === theme) return;
  spriteTheme = theme;
  cache.clear();
  urlCache.clear();
}

export function getSpriteTheme() {
  return spriteTheme;
}

export function matrixToCanvas(matrix) {
  const canvas = document.createElement("canvas");
  canvas.width = matrix[0].length;
  canvas.height = matrix.length;
  const context = canvas.getContext("2d", { alpha: true });
  context.imageSmoothingEnabled = false;
  const palette = getPalette(spriteTheme);
  for (let y = 0; y < matrix.length; y += 1) {
    for (let x = 0; x < matrix[y].length; x += 1) {
      const color = palette[matrix[y][x]];
      if (!color) continue;
      context.fillStyle = color;
      context.fillRect(x, y, 1, 1);
    }
  }
  return canvas;
}

function cached(key, matrix) {
  if (!cache.has(key)) cache.set(key, matrixToCanvas(matrix));
  return cache.get(key);
}

export function getBuildingSprite(id) {
  return cached(`building:${id}`, BUILDING_SPRITES[id]);
}

export function getCoreSprite() {
  return cached("core", CORE_SPRITE);
}

export function getRubbleSprite() {
  return cached("rubble", RUBBLE_SPRITE);
}

export function getTerrainSprite(mapId, variant) {
  const variants = TERRAIN_SPRITES[mapId];
  return cached(`terrain:${mapId}:${variant}`, variants[variant % variants.length]);
}

export function getFloorSprite(mapId) {
  return cached(`floor:${mapId}`, FLOOR_SPRITES[mapId]);
}

export function getEffectSprite(id) {
  return cached(`effect:${id}`, EFFECT_SPRITES[id]);
}

export function getBuildingIconUrl(id) {
  if (!urlCache.has(id)) urlCache.set(id, getBuildingSprite(id).toDataURL());
  return urlCache.get(id);
}
