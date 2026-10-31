import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ZOOM_STEPS, migrateZoom, zoomIndex, zoomPercent } from "../src/data/zoom.js";
import { createInitialState } from "../src/core/state.js";
import { migrateAndValidate } from "../src/save/storage.js";

function payloadWithZoom(zoom) {
  const state = createInitialState({ seed: 12 });
  state.settings.zoom = zoom;
  return { version: 1, savedAt: Date.now(), state };
}

test("ZOOM_STEPS 至少八档且包含 50% 到 300% 与 100%", () => {
  assert.ok(ZOOM_STEPS.length >= 8);
  assert.equal(ZOOM_STEPS[0], 0.5);
  assert.equal(ZOOM_STEPS.at(-1), 3);
  assert.ok(ZOOM_STEPS.includes(1));
  assert.equal(zoomPercent(1), "100%");
});

test("旧存档 zoom 1/2/3 会迁移到合法新档位", () => {
  for (const oldZoom of [1, 2, 3]) {
    const restored = migrateAndValidate(payloadWithZoom(oldZoom));
    assert.ok(ZOOM_STEPS.includes(restored.settings.zoom));
    assert.equal(restored.settings.zoom, migrateZoom(oldZoom));
  }
  assert.equal(zoomIndex(1), ZOOM_STEPS.indexOf(1));
});

test("非法缩放值会吸附到最近合法档位", () => {
  assert.equal(migrateZoom(0.01), 0.5);
  assert.equal(migrateZoom(2.8), 3);
  assert.equal(migrateZoom("bad"), 1);
});

test("核心页面 data-* 入口仍可被 HUD 委托选择器命中", () => {
  const html = fs.readFileSync(path.resolve("index.html"), "utf8");
  const hud = fs.readFileSync(path.resolve("src/render/hud.js"), "utf8");
  const selectors = [
    "[data-open='research']", "[data-open='network']", "[data-open='endgame']", "[data-open='settings']", "[data-open='achievements']",
    "[data-mobile='build']", "[data-mobile='map']", "[data-mobile='log']", "[data-layer-step]", "[data-building]", "[data-cell-action]",
    "[data-map-select]", "[data-map-expand]", "[data-tech]", "[data-settings-tab]", "[data-theme]", "[data-fontsize]", "[data-speed]",
  ];
  for (const selector of selectors) {
    const token = selector.match(/data-[a-z-]+/)?.[0];
    assert.ok(token && (html.includes(token) || hud.includes(token)), selector);
  }
});
