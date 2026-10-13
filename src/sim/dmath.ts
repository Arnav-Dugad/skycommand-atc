/**
 * Deterministic math helpers.
 *
 * Math.sin / Math.cos / Math.atan2 are not guaranteed to be bit-identical
 * across JavaScript engines. The simulation must produce identical results in
 * every browser and in the Cloudflare Worker that verifies replays, so it only
 * uses + - * / and Math.sqrt (which IEEE-754 requires to be correctly rounded).
 */

export const PI = 3.141592653589793;
export const TAU = 6.283185307179586;
export const HALF_PI = 1.5707963267948966;

/** Wrap an angle into (-PI, PI]. */
export function wrapAngle(a: number): number {
  if (a > -PI && a <= PI) return a;
  let r = a - TAU * Math.floor((a + PI) / TAU);
  if (r <= -PI) r += TAU;
  if (r > PI) r -= TAU;
  return r;
}

/** Signed smallest difference b - a in (-PI, PI]. */
export function angleDiff(a: number, b: number): number {
  return wrapAngle(b - a);
}

// Taylor polynomials on [-PI/4, PI/4]; error < 1e-12.
function sinPoly(x: number): number {
  const x2 = x * x;
  let p = 1 / 6227020800;
  p = p * -x2 + 1 / 39916800;
  p = p * -x2 + 1 / 362880;
  p = p * -x2 + 1 / 5040;
  p = p * -x2 + 1 / 120;
  p = p * -x2 + 1 / 6;
  p = p * -x2 + 1;
  return x * p;
}

function cosPoly(x: number): number {
  const x2 = x * x;
  let p = 1 / 479001600;
  p = p * -x2 + 1 / 3628800;
  p = p * -x2 + 1 / 40320;
  p = p * -x2 + 1 / 720;
  p = p * -x2 + 1 / 24;
  p = p * -x2 + 1 / 2;
  p = p * -x2 + 1;
  return p;
}

export function dsin(a: number): number {
  const x = wrapAngle(a);
  const q = Math.round(x / HALF_PI); // -2..2
  const r = x - q * HALF_PI;
  switch (((q % 4) + 4) % 4) {
    case 0:
      return sinPoly(r);
    case 1:
      return cosPoly(r);
    case 2:
      return -sinPoly(r);
    default:
      return -cosPoly(r);
  }
}

export function dcos(a: number): number {
  return dsin(a + HALF_PI);
}

// atan on [0, 1] via range reduction to [0, tan(pi/12)] and a series.
function atanUnit(x: number): number {
  // x in [0,1]
  const TAN_PI_12 = 0.2679491924311227;
  let offset = 0;
  if (x > TAN_PI_12) {
    // atan(x) = pi/6 + atan((x*sqrt3 - 1)/(sqrt3 + x))
    const SQRT3 = 1.7320508075688772;
    x = (x * SQRT3 - 1) / (SQRT3 + x);
    offset = PI / 6;
  }
  const x2 = x * x;
  // Series converges fast for |x| <= 0.268
  let term = x;
  let sum = x;
  for (let n = 1; n < 12; n++) {
    term *= -x2;
    sum += term / (2 * n + 1);
  }
  return offset + sum;
}

export function datan(x: number): number {
  if (x < 0) return -datan(-x);
  if (x > 1) return HALF_PI - atanUnit(1 / x);
  return atanUnit(x);
}

export function datan2(y: number, x: number): number {
  if (x === 0 && y === 0) return 0;
  if (x > 0) return datan(y / x);
  if (x < 0) return y >= 0 ? datan(y / x) + PI : datan(y / x) - PI;
  return y > 0 ? HALF_PI : -HALF_PI;
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Round to a fixed grid so tiny drift never accumulates differently. */
export function q(v: number): number {
  return Math.round(v * 1e6) / 1e6;
}
