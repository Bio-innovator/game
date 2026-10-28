import { SAVE_VERSION } from "../core/state.js";

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 8192;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function createSavePayload(state, savedAt = Date.now()) {
  return { version: SAVE_VERSION, savedAt, state };
}

export function encodeSave(state, savedAt = Date.now()) {
  const json = JSON.stringify(createSavePayload(state, savedAt));
  return bytesToBase64(new TextEncoder().encode(json));
}

export function decodeSave(encoded) {
  const normalized = String(encoded).replace(/\s/g, "");
  if (!normalized || !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized) || normalized.length % 4 !== 0) {
    throw new Error("存档编码格式无效。");
  }
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64ToBytes(normalized)));
  } catch {
    throw new Error("存档无法解码，可能已损坏。");
  }
  if (!payload || typeof payload !== "object" || !Number.isInteger(payload.version) || !payload.state) {
    throw new Error("存档缺少版本或状态字段。");
  }
  if (payload.version > SAVE_VERSION) throw new Error("该存档来自更新版本，当前游戏无法读取。");
  return payload;
}
