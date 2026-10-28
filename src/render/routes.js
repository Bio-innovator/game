import { MAPS, MAP_SIZE, TILE_SIZE } from "../data/maps.js";
import { isOperational } from "../core/state.js";

function drawPixelLine(context, x0, y0, x1, y1, color, frame) {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const steps = Math.max(dx, dy, 1);
  context.fillStyle = color;
  for (let step = 0; step <= steps; step += 4) {
    if ((Math.floor(step / 4) + Math.floor(frame / 8)) % 3 === 0) continue;
    const x = Math.round(x0 + ((x1 - x0) * step) / steps);
    const y = Math.round(y0 + ((y1 - y0) * step) / steps);
    context.fillRect(x, y, 2, 2);
  }
}

export function drawRoutes(context, state, frame) {
  const mapId = state.currentMap;
  const map = state.maps[mapId];
  const hubIndex = map.buildings.findIndex((building) => building?.id === "hub" && isOperational(building));
  if (hubIndex < 0) return;
  const hubX = (hubIndex % MAP_SIZE) * TILE_SIZE + TILE_SIZE / 2;
  const hubY = Math.floor(hubIndex / MAP_SIZE) * TILE_SIZE + TILE_SIZE / 2;
  const currentOrder = MAPS.findIndex((item) => item.id === mapId);

  for (const route of state.routes) {
    if (route.a !== mapId && route.b !== mapId) continue;
    const targetMap = route.a === mapId ? route.b : route.a;
    const targetOrder = MAPS.findIndex((item) => item.id === targetMap);
    const targetX = targetOrder > currentOrder ? 568 : 8;
    const targetY = 52 + targetOrder * 82;
    const color = route.connected ? "#3FD0C9" : "#E0533D";
    drawPixelLine(context, hubX, hubY, targetX, targetY, color, frame);
    context.fillStyle = color;
    context.fillRect(targetX - 5, targetY - 5, 10, 10);
    context.fillStyle = "#101216";
    context.fillRect(targetX - 2, targetY - 2, 4, 4);

    const progress = ((frame % 90) / 90 + (route.from === mapId ? 0 : 0.5)) % 1;
    const dotX = Math.round(hubX + (targetX - hubX) * progress);
    const dotY = Math.round(hubY + (targetY - hubY) * progress);
    context.fillStyle = route.connected ? "#A0EEE5" : "#91382F";
    context.fillRect(dotX - 1, dotY - 1, 3, 3);
  }
}

export function drawAdjacencyNetwork(context, state) {
  const map = state.maps[state.currentMap];
  context.fillStyle = "rgba(63, 208, 201, 0.28)";
  for (let index = 0; index < map.buildings.length; index += 1) {
    if (!isOperational(map.buildings[index])) continue;
    const x = index % MAP_SIZE;
    const y = Math.floor(index / MAP_SIZE);
    const right = x < MAP_SIZE - 1 ? map.buildings[index + 1] : null;
    const down = y < MAP_SIZE - 1 ? map.buildings[index + MAP_SIZE] : null;
    const centerX = x * TILE_SIZE + 12;
    const centerY = y * TILE_SIZE + 12;
    if (isOperational(right)) {
      for (let offset = 12; offset < 36; offset += 4) context.fillRect(centerX + offset, centerY, 2, 1);
    }
    if (isOperational(down)) {
      for (let offset = 12; offset < 36; offset += 4) context.fillRect(centerX, centerY + offset, 1, 2);
    }
  }
}
