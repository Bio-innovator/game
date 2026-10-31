export const ZOOM_STEPS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 2, 3];

export function migrateZoom(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1;
  return ZOOM_STEPS.reduce((best, step) => (
    Math.abs(step - numeric) < Math.abs(best - numeric) ? step : best
  ), ZOOM_STEPS[0]);
}

export function zoomIndex(value) {
  const zoom = migrateZoom(value);
  return ZOOM_STEPS.indexOf(zoom);
}

export function zoomPercent(value) {
  return `${Math.round(migrateZoom(value) * 100)}%`;
}
