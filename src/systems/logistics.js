import { BUILDING_BY_ID } from "../data/buildings.js";
import { MAP_BY_ID } from "../data/maps.js";
import { getAllAnchors, getTechEffectTotal, getTechMultiplier, isOperational } from "../core/state.js";

export const ROUTE_LEVELS = [
  { id: "convoy", name: "车队", capacity: 8, delay: 8, loss: 0.08 },
  { id: "pipeline", name: "管道", capacity: 25, delay: 4, loss: 0.03 },
  { id: "elevator", name: "轨道电梯", capacity: 125, delay: 2, loss: 0.01 },
];

export function getRouteParameters(state, route) {
  const base = ROUTE_LEVELS[route.level];
  let elevatorMultiplier = 1;
  for (const mapId of [route.a, route.b]) {
    const hasElevator = getAllAnchors(state.maps[mapId]).some((building) => isOperational(building) && BUILDING_BY_ID[building.id].ability?.capacityMultiplier);
    if (hasElevator) elevatorMultiplier *= BUILDING_BY_ID.elevator.ability.capacityMultiplier;
  }
  const radiationLoss = [route.a, route.b].reduce((loss, mapId) => loss + (MAP_BY_ID[mapId].hazard?.logisticsLoss ?? (mapId === "orbit" ? 0.08 : 0)), 0);
  return {
    capacity: (base.capacity + getTechEffectTotal(state, "logisticsCapacity")) * elevatorMultiplier,
    delay: Math.max(0.5, base.delay * getTechMultiplier(state, "routeDelay")),
    loss: Math.max(0, Math.min(0.75, base.loss + radiationLoss - getTechEffectTotal(state, "routeLossReduction"))),
  };
}

export function computeLogistics(state, dt = 0.1) {
  const shipments = state.shipments.map((shipment) => ({ ...shipment }));
  const deltas = {};
  const addDelta = (mapId, resource, amount) => {
    if (!deltas[mapId]) deltas[mapId] = {};
    deltas[mapId][resource] = (deltas[mapId][resource] ?? 0) + amount;
  };
  const available = Object.fromEntries(Object.entries(state.maps).map(([mapId, map]) => [mapId, { ...map.resources }]));

  for (let index = shipments.length - 1; index >= 0; index -= 1) {
    const shipment = shipments[index];
    shipment.remaining -= dt;
    if (shipment.remaining > 0) continue;
    addDelta(shipment.to, shipment.resource, shipment.amount);
    available[shipment.to][shipment.resource] += shipment.amount;
    shipments.splice(index, 1);
  }

  let nextShipmentId = state.nextShipmentId;
  for (const route of state.routes) {
    if (!route.connected) continue;
    const parameters = getRouteParameters(state, route);
    const resource = route.resource;
    const quota = parameters.capacity * dt;
    const amount = Math.min(quota, Math.max(0, available[route.from][resource] ?? 0));
    if (amount <= 0.000001) continue;
    const delivered = amount * (1 - parameters.loss);
    available[route.from][resource] -= amount;
    addDelta(route.from, resource, -amount);
    shipments.push({
      id: `shipment-${nextShipmentId}`,
      routeId: route.id,
      from: route.from,
      to: route.to,
      resource,
      amount: delivered,
      remaining: parameters.delay,
      totalDelay: parameters.delay,
    });
    nextShipmentId += 1;
  }
  return { shipments, deltas, nextShipmentId };
}
