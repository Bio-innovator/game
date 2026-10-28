export function normalizeSeed(value) {
  const numeric = Number(value) >>> 0;
  return numeric === 0 ? 0x6d2b79f5 : numeric;
}

export function nextRandom(rngState) {
  let next = normalizeSeed(rngState);
  next ^= next << 13;
  next ^= next >>> 17;
  next ^= next << 5;
  next = normalizeSeed(next);
  return { state: next, value: next / 4294967296 };
}

export function randomRange(rngState, minimum, maximum) {
  const random = nextRandom(rngState);
  return { state: random.state, value: minimum + random.value * (maximum - minimum) };
}

export function randomIndex(rngState, length) {
  const random = nextRandom(rngState);
  return { state: random.state, value: Math.min(Math.max(0, length - 1), Math.floor(random.value * length)) };
}

export function deriveSeed(seed, salt) {
  let hash = normalizeSeed(seed);
  const text = String(salt);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return normalizeSeed(hash);
}

export function createGameSeed() {
  if (globalThis.crypto?.getRandomValues) {
    const values = new Uint32Array(1);
    globalThis.crypto.getRandomValues(values);
    return normalizeSeed(values[0]);
  }
  return normalizeSeed(Date.now());
}
