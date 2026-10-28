export const DECIMAL_THRESHOLD = 1e15;
export const MAX_GAME_NUMBER = 1e300;

function normalize(mantissa, exponent) {
  if (mantissa === 0) return { mantissa: 0, exponent: 0 };
  let nextMantissa = mantissa;
  let nextExponent = exponent;
  while (Math.abs(nextMantissa) >= 10) {
    nextMantissa /= 10;
    nextExponent += 1;
  }
  while (Math.abs(nextMantissa) < 1) {
    nextMantissa *= 10;
    nextExponent -= 1;
  }
  return { mantissa: nextMantissa, exponent: nextExponent };
}

export class Decimal {
  constructor(mantissa = 0, exponent = 0) {
    const normalized = normalize(mantissa, exponent);
    this.mantissa = normalized.mantissa;
    this.exponent = normalized.exponent;
  }

  static from(value) {
    if (value instanceof Decimal) return new Decimal(value.mantissa, value.exponent);
    if (!Number.isFinite(value) || value === 0) return new Decimal();
    const exponent = Math.floor(Math.log10(Math.abs(value)));
    return new Decimal(value / (10 ** exponent), exponent);
  }

  add(value) {
    const other = Decimal.from(value);
    if (this.mantissa === 0) return other;
    if (other.mantissa === 0) return Decimal.from(this);
    const exponent = Math.max(this.exponent, other.exponent);
    const left = this.mantissa * (10 ** (this.exponent - exponent));
    const right = other.mantissa * (10 ** (other.exponent - exponent));
    return new Decimal(left + right, exponent);
  }

  multiply(value) {
    const other = Decimal.from(value);
    return new Decimal(this.mantissa * other.mantissa, this.exponent + other.exponent);
  }

  toNumber() {
    if (this.exponent > 300) return Math.sign(this.mantissa) * MAX_GAME_NUMBER;
    const value = this.mantissa * (10 ** this.exponent);
    if (!Number.isFinite(value)) return Math.sign(this.mantissa) * MAX_GAME_NUMBER;
    return Math.max(-MAX_GAME_NUMBER, Math.min(MAX_GAME_NUMBER, value));
  }
}

export function safeAdd(...values) {
  const finite = values.map((value) => Number.isFinite(value) ? value : 0);
  const needsDecimal = finite.some((value) => Math.abs(value) >= DECIMAL_THRESHOLD);
  if (!needsDecimal) {
    const result = finite.reduce((sum, value) => sum + value, 0);
    return Number.isFinite(result) ? result : Math.sign(result) * MAX_GAME_NUMBER;
  }
  return finite.reduce((sum, value) => sum.add(value), new Decimal()).toNumber();
}

export function safeMultiply(...values) {
  const finite = values.map((value) => Number.isFinite(value) ? value : 0);
  const needsDecimal = finite.some((value) => Math.abs(value) >= DECIMAL_THRESHOLD);
  if (!needsDecimal) {
    const result = finite.reduce((product, value) => product * value, 1);
    return Number.isFinite(result) ? result : Math.sign(result) * MAX_GAME_NUMBER;
  }
  return finite.reduce((product, value) => product.multiply(value), new Decimal(1, 0)).toNumber();
}

export function safeDivide(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return 0;
  const result = numerator / denominator;
  return Number.isFinite(result) ? result : 0;
}

export function clampResource(value, capacity = MAX_GAME_NUMBER) {
  const safeValue = Number.isFinite(value) ? value : 0;
  const safeCapacity = Number.isFinite(capacity) ? Math.max(0, capacity) : MAX_GAME_NUMBER;
  return Math.max(0, Math.min(safeCapacity, safeValue));
}

export function formatNumber(value, precision = 1) {
  const safeValue = Number.isFinite(value) ? value : 0;
  const absolute = Math.abs(safeValue);
  if (absolute >= DECIMAL_THRESHOLD) {
    const decimal = Decimal.from(safeValue);
    return `${decimal.mantissa.toFixed(2)}e${decimal.exponent}`;
  }
  const units = [
    [1e12, "T"],
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  for (const [threshold, suffix] of units) {
    if (absolute >= threshold) return `${(safeValue / threshold).toFixed(precision)}${suffix}`;
  }
  if (absolute >= 100) return safeValue.toFixed(0);
  if (absolute >= 10) return safeValue.toFixed(1);
  return safeValue.toFixed(absolute % 1 === 0 ? 0 : precision);
}
