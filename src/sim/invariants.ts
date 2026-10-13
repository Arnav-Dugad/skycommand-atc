/**
 * Safety invariants checked by tests (and optionally in development builds).
 */

import { getType } from './aircraft';
import { AIRPORT } from './airport';
import { dcos, dsin } from './dmath';
import { ALLOWED, ON_GROUND } from './engine';
import type { Aircraft, World } from './types';

export interface InvariantIssue {
  tick: number;
  kind: string;
  detail: string;
}

interface Box {
  cx: number;
  cy: number;
  ux: number;
  uy: number;
  hl: number;
  hw: number;
}

function fuselageBox(a: Aircraft, shrink = 0.92): Box {
  const t = getType(a.typeId);
  return { cx: a.x, cy: a.y, ux: dcos(a.h), uy: dsin(a.h), hl: (t.length / 2) * shrink, hw: (t.fuselageWidth / 2) * shrink };
}

function project(b: Box, ax: number, ay: number) {
  // half-extent of box b along axis (ax, ay)
  const vx = -b.uy;
  const vy = b.ux;
  return b.hl * Math.abs(b.ux * ax + b.uy * ay) + b.hw * Math.abs(vx * ax + vy * ay);
}

export function boxesOverlap(a: Box, b: Box): boolean {
  const axes = [
    [a.ux, a.uy],
    [-a.uy, a.ux],
    [b.ux, b.uy],
    [-b.uy, b.ux],
  ] as const;
  const dx = b.cx - a.cx;
  const dy = b.cy - a.cy;
  for (const [ax, ay] of axes) {
    const d = Math.abs(dx * ax + dy * ay);
    if (d > project(a, ax, ay) + project(b, ax, ay)) return false;
  }
  return true;
}

export function checkInvariants(world: World, prev?: Map<string, { x: number; y: number; v: number }>): InvariantIssue[] {
  const issues: InvariantIssue[] = [];
  const tick = world.tick;
  const ground = world.aircraft.filter((a) => ON_GROUND.has(a.phase) && a.alt < 0.01);
  for (let i = 0; i < ground.length; i++) {
    for (let j = i + 1; j < ground.length; j++) {
      const a = ground[i]!;
      const b = ground[j]!;
      if (boxesOverlap(fuselageBox(a), fuselageBox(b))) {
        issues.push({ tick, kind: 'overlap', detail: `${a.callsign}(${a.phase}) overlaps ${b.callsign}(${b.phase})` });
      }
    }
  }
  for (const a of world.aircraft) {
    if (!Number.isFinite(a.x) || !Number.isFinite(a.y) || !Number.isFinite(a.h) || !Number.isFinite(a.v)) {
      issues.push({ tick, kind: 'nan', detail: a.callsign });
    }
    if (!(a.phase in ALLOWED)) issues.push({ tick, kind: 'phase', detail: `${a.callsign} unknown phase ${a.phase}` });
    if (prev) {
      const p = prev.get(a.id);
      if (p) {
        const dx = a.x - p.x;
        const dy = a.y - p.y;
        const moved = Math.sqrt(dx * dx + dy * dy);
        const maxMove = (Math.max(a.v, p.v) + 2) * (1 / 20) + 1.5;
        if (moved > maxMove) issues.push({ tick, kind: 'teleport', detail: `${a.callsign} moved ${moved.toFixed(2)} in one tick (${a.phase})` });
      }
    }
  }
  for (const [g, id] of Object.entries(world.gateRes)) {
    const a = world.aircraft.find((x) => x.id === id);
    if (!a) issues.push({ tick, kind: 'gate', detail: `gate ${g} reserved by missing ${id}` });
    else if (a.gate !== g) issues.push({ tick, kind: 'gate', detail: `gate ${g} reserved by ${a.callsign} which targets ${a.gate}` });
  }
  const gateHolders = new Map<string, string>();
  for (const a of world.aircraft) {
    if (a.gate) {
      if (gateHolders.has(a.gate)) issues.push({ tick, kind: 'gate', detail: `two aircraft assigned to ${a.gate}` });
      gateHolders.set(a.gate, a.id);
    }
  }
  for (const [n, id] of Object.entries(world.nodeLocks)) {
    if (!world.aircraft.some((x) => x.id === id)) issues.push({ tick, kind: 'lock', detail: `node ${n} locked by missing ${id}` });
  }
  for (const r of Object.values(AIRPORT.runways)) {
    const onRunway = ground.filter(
      (a) => Math.abs(a.y - r.y) < r.width / 2 && a.x > r.x0 && a.x < r.x1 && a.phase !== 'holdShort',
    );
    if (onRunway.length > 1) {
      issues.push({ tick, kind: 'runway', detail: `${onRunway.length} aircraft on ${r.name}: ${onRunway.map((a) => `${a.callsign}:${a.phase}`).join(',')}` });
    }
    const owner = world.runways[r.id].owner;
    if (owner && !world.aircraft.some((a) => a.id === owner)) issues.push({ tick, kind: 'runway', detail: `${r.name} owned by missing aircraft` });
    for (const a of onRunway) {
      if (owner !== a.id && a.phase !== 'landing' && a.phase !== 'climbOut') {
        issues.push({ tick, kind: 'runway', detail: `${a.callsign} on ${r.name} without clearance (${a.phase})` });
      }
    }
  }
  return issues;
}

export function snapshotPositions(world: World) {
  const m = new Map<string, { x: number; y: number; v: number }>();
  for (const a of world.aircraft) m.set(a.id, { x: a.x, y: a.y, v: a.v });
  return m;
}
