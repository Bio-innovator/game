import test from "node:test";
import assert from "node:assert/strict";
import * as tick from "../src/core/tick.js";
import { LOG_LIBRARY } from "../src/data/logs.js";
import { apply, createInitialState } from "../src/core/state.js";
import { encodeSave, decodeSave } from "../src/save/codec.js";
import {
  SAVE_KEY,
  clearSave,
  getLatestSaveBackup,
  loadGame,
  migrateAndValidate,
  readSaveBackup,
  saveGame,
  writeSaveBackup,
} from "../src/save/storage.js";

class MemoryStorage {
  constructor() { this.values = new Map(); }
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

test("离线结算接口与离线事件已移除", () => {
  assert.equal("settleOffline" in tick, false);
  assert.equal("MAX_OFFLINE_SECONDS" in tick, false);
  assert.equal(Object.prototype.hasOwnProperty.call(LOG_LIBRARY, "offline"), false);
  assert.equal(apply(createInitialState({ seed: 1 }), { type: "OFFLINE_TIME", seconds: 3600 }).ok, false);
});

test("设置默认值、校验和存档持久化", () => {
  const state = createInitialState({ seed: 2 });
  assert.ok(["dark", "light"].includes(state.settings.theme));
  assert.equal(state.settings.fontSize, 13);
  assert.equal(state.settings.sound, false);
  assert.equal(apply(state, { type: "SET_SETTING", key: "theme", value: "light" }).ok, true);
  assert.equal(apply(state, { type: "SET_SETTING", key: "fontSize", value: 15 }).ok, true);
  assert.equal(apply(state, { type: "SET_SETTING", key: "theme", value: "sepia" }).ok, false);
  assert.equal(apply(state, { type: "SET_SETTING", key: "fontSize", value: 99 }).ok, false);
  assert.equal(apply(state, { type: "SET_SETTING", key: "unknown", value: 1 }).ok, false);

  const restored = migrateAndValidate(decodeSave(encodeSave(state)));
  assert.equal(restored.settings.theme, "light");
  assert.equal(restored.settings.fontSize, 15);
});

test("载入旧存档不会推进天数或资源", () => {
  const storage = new MemoryStorage();
  const state = createInitialState({ seed: 3 });
  state.elapsed = 300;
  state.day = 6;
  state.maps.ash.resources.steel = 77;
  saveGame(state, storage);
  const raw = JSON.parse(storage.getItem(SAVE_KEY));
  raw.savedAt = Date.now() - 60 * 60 * 1000;
  storage.setItem(SAVE_KEY, JSON.stringify(raw));

  const loaded = loadGame(storage);
  assert.equal(loaded.state.elapsed, 300);
  assert.equal(loaded.state.day, 6);
  assert.equal(loaded.state.maps.ash.resources.steel, 77);
});

test("导入前备份可按时间戳恢复，主存档可独立清空", () => {
  const storage = new MemoryStorage();
  const state = createInitialState({ seed: 4 });
  state.data = 10;
  const firstKey = writeSaveBackup(state, storage);
  assert.ok(firstKey?.startsWith("hdc-save-backup-"));

  state.data = 25;
  const secondKey = writeSaveBackup(state, storage);
  assert.ok(secondKey);
  assert.notEqual(secondKey, firstKey);

  const latest = getLatestSaveBackup(storage);
  assert.equal(latest.key, secondKey);
  assert.equal(latest.payload.state.data, 25);
  assert.equal(readSaveBackup(firstKey, storage).data, 10);

  saveGame(state, storage);
  clearSave(storage);
  assert.equal(storage.getItem(SAVE_KEY), null);
  assert.ok(getLatestSaveBackup(storage));
});
