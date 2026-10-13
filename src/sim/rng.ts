/** Small, fast, deterministic PRNG (mulberry32). State is a plain number so it serialises. */
export interface RngState {
  s: number;
}

export function makeRng(seed: number): RngState {
  return { s: seed >>> 0 || 0x9e3779b9 };
}

export function next(r: RngState): number {
  r.s = (r.s + 0x6d2b79f5) >>> 0;
  let t = r.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function range(r: RngState, lo: number, hi: number): number {
  return lo + (hi - lo) * next(r);
}

export function int(r: RngState, lo: number, hiInclusive: number): number {
  return lo + Math.floor(next(r) * (hiInclusive - lo + 1));
}

export function pick<T>(r: RngState, arr: readonly T[]): T {
  return arr[Math.floor(next(r) * arr.length)]!;
}

export function weighted<T>(r: RngState, items: readonly { item: T; w: number }[]): T {
  let total = 0;
  for (const it of items) total += it.w;
  let x = next(r) * total;
  for (const it of items) {
    x -= it.w;
    if (x < 0) return it.item;
  }
  return items[items.length - 1]!.item;
}

/** Stable 32-bit string hash (FNV-1a). */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
