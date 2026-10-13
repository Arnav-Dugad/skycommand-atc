/**
 * Smooth ground paths. A path is built from control points (graph nodes) and every
 * interior corner is replaced by a circular fillet, so aircraft turn smoothly and
 * never cut across grass. Each path also records the distance at which it passes
 * each graph node, used for junction locks.
 */

import { datan2, dcos, dsin, angleDiff, PI } from './dmath';

export interface PathCtrl {
  x: number;
  y: number;
  r: number;
  node?: string;
}

export interface Path {
  /** flat [x0,y0,x1,y1,...] */
  pts: number[];
  /** cumulative distance at each point */
  cum: number[];
  /** max speed at each point (curvature limit) */
  vmax: number[];
  nodes: { id: string; d: number; ci: number }[];
  total: number;
  reverse: boolean;
}

const LAT_ACCEL = 5.5;
const STRAIGHT_VMAX = 999;

export function buildPath(ctrl: PathCtrl[], reverse = false): Path {
  const pts: number[] = [];
  const vmax: number[] = [];
  const nodeMarks: { id: string; ptIndex: number; ci: number }[] = [];
  const push = (x: number, y: number, v: number) => {
    const n = pts.length;
    if (n >= 2) {
      const dx = x - pts[n - 2]!;
      const dy = y - pts[n - 1]!;
      if (dx * dx + dy * dy < 1e-6) {
        vmax[vmax.length - 1] = Math.min(vmax[vmax.length - 1]!, v);
        return;
      }
    }
    pts.push(x, y);
    vmax.push(v);
  };

  if (ctrl.length === 0) {
    return { pts: [], cum: [], vmax: [], nodes: [], total: 0, reverse };
  }
  const first = ctrl[0]!;
  push(first.x, first.y, STRAIGHT_VMAX);
  if (first.node) nodeMarks.push({ id: first.node, ptIndex: 0, ci: 0 });

  for (let i = 1; i < ctrl.length; i++) {
    const c = ctrl[i]!;
    const isLast = i === ctrl.length - 1;
    if (isLast) {
      push(c.x, c.y, STRAIGHT_VMAX);
      if (c.node) nodeMarks.push({ id: c.node, ptIndex: pts.length / 2 - 1, ci: i });
      break;
    }
    const p = ctrl[i - 1]!;
    const n = ctrl[i + 1]!;
    const inX = c.x - p.x;
    const inY = c.y - p.y;
    const outX = n.x - c.x;
    const outY = n.y - c.y;
    const inLen = Math.sqrt(inX * inX + inY * inY);
    const outLen = Math.sqrt(outX * outX + outY * outY);
    if (inLen < 1e-6 || outLen < 1e-6) continue;
    const hIn = datan2(inY, inX);
    const hOut = datan2(outY, outX);
    const turn = angleDiff(hIn, hOut);
    const absTurn = turn < 0 ? -turn : turn;
    if (absTurn < 0.02 || c.r <= 1) {
      push(c.x, c.y, STRAIGHT_VMAX);
      if (c.node) nodeMarks.push({ id: c.node, ptIndex: pts.length / 2 - 1, ci: i });
      continue;
    }
    const half = absTurn / 2;
    const tanHalf = dsin(half) / dcos(half);
    // previous fillet may have consumed part of the incoming segment; keep it simple:
    // limit tangent length to half of each adjacent segment
    let t = c.r * tanHalf;
    const tMax = Math.min(inLen, outLen) * 0.5;
    let r = c.r;
    if (t > tMax) {
      t = tMax;
      r = t / tanHalf;
    }
    const ux = inX / inLen;
    const uy = inY / inLen;
    const sx = c.x - ux * t;
    const sy = c.y - uy * t;
    // normal towards the turn centre
    const sign = turn > 0 ? 1 : -1;
    const nx = -uy * sign;
    const ny = ux * sign;
    const cx = sx + nx * r;
    const cy = sy + ny * r;
    const startAng = datan2(sy - cy, sx - cx);
    const segs = Math.max(3, Math.ceil(absTurn / 0.12));
    const v = Math.sqrt(LAT_ACCEL * r);
    const midSeg = Math.floor(segs / 2);
    for (let k = 0; k <= segs; k++) {
      const a = startAng + (turn * k) / segs;
      push(cx + r * dcos(a), cy + r * dsin(a), v);
      if (k === midSeg && c.node) nodeMarks.push({ id: c.node, ptIndex: pts.length / 2 - 1, ci: i });
    }
  }

  const cum: number[] = [0];
  for (let i = 1; i < pts.length / 2; i++) {
    const dx = pts[i * 2]! - pts[i * 2 - 2]!;
    const dy = pts[i * 2 + 1]! - pts[i * 2 - 1]!;
    cum.push(cum[i - 1]! + Math.sqrt(dx * dx + dy * dy));
  }
  const total = cum[cum.length - 1] ?? 0;
  const nodes = nodeMarks.map((m) => ({ id: m.id, d: cum[m.ptIndex] ?? 0, ci: m.ci }));
  return { pts, cum, vmax, nodes, total, reverse };
}

/** Binary-search the segment containing distance d. */
function segIndex(p: Path, d: number): number {
  const cum = p.cum;
  let lo = 0;
  let hi = cum.length - 1;
  if (d <= 0) return 0;
  if (d >= p.total) return Math.max(0, cum.length - 2);
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid]! <= d) lo = mid;
    else hi = mid;
  }
  return lo;
}

export function pointAt(p: Path, d: number): { x: number; y: number; h: number } {
  const n = p.cum.length;
  if (n === 0) return { x: 0, y: 0, h: 0 };
  if (n === 1) return { x: p.pts[0]!, y: p.pts[1]!, h: 0 };
  const i = segIndex(p, d);
  const x0 = p.pts[i * 2]!;
  const y0 = p.pts[i * 2 + 1]!;
  const x1 = p.pts[i * 2 + 2]!;
  const y1 = p.pts[i * 2 + 3]!;
  const segLen = p.cum[i + 1]! - p.cum[i]!;
  const t = segLen > 1e-9 ? Math.min(1, Math.max(0, (d - p.cum[i]!) / segLen)) : 0;
  let h = datan2(y1 - y0, x1 - x0);
  if (p.reverse) h += PI;
  return { x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, h };
}

/** Lowest curvature speed limit needed between d0 and d1, accounting for braking. */
export function speedLimitAhead(p: Path, d: number, lookahead: number, decel: number): number {
  let lim = STRAIGHT_VMAX;
  const start = segIndex(p, d);
  for (let i = start; i < p.cum.length; i++) {
    const di = p.cum[i]! - d;
    if (di > lookahead) break;
    const vm = p.vmax[i]!;
    if (vm >= STRAIGHT_VMAX) continue;
    const allowed = di <= 0 ? vm : Math.sqrt(vm * vm + 2 * decel * di);
    if (allowed < lim) lim = allowed;
  }
  return lim;
}

/**
 * Project point (x,y) onto the path between distances d0..d1.
 * Returns path distance of the closest point and the lateral distance.
 */
export function projectAhead(
  p: Path,
  d0: number,
  d1: number,
  x: number,
  y: number,
): { d: number; lat: number } | null {
  let best: { d: number; lat: number } | null = null;
  const startI = segIndex(p, d0);
  for (let i = startI; i < p.cum.length - 1; i++) {
    if (p.cum[i]! > d1) break;
    const ax = p.pts[i * 2]!;
    const ay = p.pts[i * 2 + 1]!;
    const bx = p.pts[i * 2 + 2]!;
    const by = p.pts[i * 2 + 3]!;
    const vx = bx - ax;
    const vy = by - ay;
    const len2 = vx * vx + vy * vy;
    let t = len2 > 0 ? ((x - ax) * vx + (y - ay) * vy) / len2 : 0;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const px = ax + vx * t;
    const py = ay + vy * t;
    const dx = x - px;
    const dy = y - py;
    const lat = Math.sqrt(dx * dx + dy * dy);
    const dd = p.cum[i]! + Math.sqrt(len2) * t;
    if (dd < d0 || dd > d1) continue;
    if (!best || lat < best.lat) best = { d: dd, lat };
  }
  return best;
}

/** Sample the path into points (for drawing route previews). */
export function samplePath(p: Path, from = 0, step = 12): number[] {
  const res: number[] = [];
  for (let d = from; d < p.total; d += step) {
    const pt = pointAt(p, d);
    res.push(pt.x, pt.y);
  }
  if (p.total > from) {
    const pt = pointAt(p, p.total);
    res.push(pt.x, pt.y);
  }
  return res;
}
