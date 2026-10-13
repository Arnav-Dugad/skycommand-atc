/**
 * Deterministic fixed-timestep simulation.
 *
 * Safety model on the ground:
 *  - every taxiway is one-way (no head-on conflicts possible)
 *  - junction/stand-mouth/hold nodes are exclusive locks, acquired ahead of time
 *  - car-following keeps a gap to any aircraft on the path ahead
 *  - runways are exclusive resources owned by one aircraft at a time
 *  - gates are exclusive reservations
 */

import { getType, SIZE_ORDER } from './aircraft';
import { AIRPORT, standStopY, type GraphNode, type RunwayId } from './airport';
import { angleDiff, clamp, datan2, dcos, dsin, dist, wrapAngle } from './dmath';
import { buildPath, pointAt, projectAhead, speedLimitAhead, type PathCtrl } from './path';
import { next, range } from './rng';
import { shortestRoute, routeVia } from './routing';
import { DT, TICK_HZ, type Aircraft, type Phase, type World } from './types';
import { clockMinutes, nowSec, pickWeather, spawnArrival } from './world';

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

export const ALLOWED: Record<Phase, Phase[]> = {
  inbound: ['holding', 'approach', 'diverted'],
  holding: ['approach', 'diverted', 'inbound'],
  approach: ['landing', 'goAround', 'inbound', 'diverted'],
  goAround: ['inbound', 'approach', 'diverted'],
  landing: ['vacated', 'taxiIn'],
  vacated: ['taxiIn'],
  taxiIn: ['parked'],
  parked: ['pushback'],
  pushback: ['readyTaxi'],
  readyTaxi: ['taxiOut'],
  taxiOut: ['holdShort'],
  holdShort: ['lineup'],
  lineup: ['takeoff'],
  takeoff: ['climbOut'],
  climbOut: ['departed'],
  departed: [],
  diverted: [],
};

export const AIRBORNE: ReadonlySet<Phase> = new Set(['inbound', 'holding', 'approach', 'goAround', 'climbOut', 'departed', 'diverted']);
export const ON_GROUND: ReadonlySet<Phase> = new Set([
  'landing', 'vacated', 'taxiIn', 'parked', 'pushback', 'readyTaxi', 'taxiOut', 'holdShort', 'lineup', 'takeoff',
]);

export interface Violation {
  tick: number;
  ac: string;
  from: Phase;
  to: Phase;
}
export const violations: Violation[] = [];

export function setPhase(world: World, ac: Aircraft, to: Phase): boolean {
  if (!ALLOWED[ac.phase].includes(to)) {
    violations.push({ tick: world.tick, ac: ac.id, from: ac.phase, to });
    if ((globalThis as { __SKY_STRICT?: boolean }).__SKY_STRICT) {
      throw new Error(`Invalid transition ${ac.phase} -> ${to} for ${ac.callsign}`);
    }
    return false;
  }
  ac.phase = to;
  ac.phaseTime = 0;
  ac.waitTime = 0;
  ac.waitReason = undefined;
  return true;
}

export function findAc(world: World, id: string | null | undefined): Aircraft | undefined {
  if (!id) return undefined;
  for (const a of world.aircraft) if (a.id === id) return a;
  return undefined;
}

function flightOf(world: World, ac: Aircraft) {
  return world.flights.find((f) => f.id === ac.flightId);
}

function clearPending(ac: Aircraft, kind: string) {
  if (!ac.pendingList) return;
  ac.pendingList = ac.pendingList.filter((p) => p.kind !== kind);
}

// ---------------------------------------------------------------------------
// Weather helpers
// ---------------------------------------------------------------------------

export function weatherDecel(world: World): number {
  switch (world.weather) {
    case 'rain':
      return 0.85;
    case 'storm':
      return 0.72;
    default:
      return 1;
  }
}

export function weatherTaxi(world: World): number {
  switch (world.weather) {
    case 'rain':
      return 0.92;
    case 'storm':
      return 0.85;
    case 'fog':
      return 0.88;
    default:
      return 1;
  }
}

// ---------------------------------------------------------------------------
// Node locks
// ---------------------------------------------------------------------------

function lockable(n: GraphNode): boolean {
  return n.kind === 'taxi' || n.kind === 'mouth' || n.kind === 'exit' || n.kind === 'hold';
}

const junctionCache: Record<string, boolean> = {};
export function isJunction(id: string): boolean {
  let v = junctionCache[id];
  if (v === undefined) {
    const n = AIRPORT.nodes[id]!;
    v = (AIRPORT.inn[id]!.length > 1 || AIRPORT.out[id]!.length > 1) && n.kind !== 'mouth';
    junctionCache[id] = v;
  }
  return v;
}

function needLock(ac: Aircraft, nodeId: string): boolean {
  if (ac.phase === 'pushback') return true;
  if (ac.path) {
    for (const pn of ac.path.nodes) if (pn.id === nodeId && pn.d >= ac.s) return true;
  }
  const n = AIRPORT.nodes[nodeId]!;
  const t = getType(ac.typeId);
  return dist(ac.x, ac.y, n.x, n.y) < Math.max(t.length, t.span) / 2 + 24;
}

export function releaseLocks(world: World, ac: Aircraft, all = false) {
  ac.locks = ac.locks.filter((n) => {
    const keep = !all && needLock(ac, n);
    if (!keep && world.nodeLocks[n] === ac.id) delete world.nodeLocks[n];
    return keep;
  });
}

function lockLimit(world: World, ac: Aircraft, brake: number, obsLimit: number): number {
  const p = ac.path!;
  const t = getType(ac.typeId);
  releaseLocks(world, ac);
  const look = ac.s + brake + t.length / 2 + 90;
  for (const pn of p.nodes) {
    if (pn.d < ac.s - 1) continue;
    if (pn.d > look) break;
    const node = AIRPORT.nodes[pn.id]!;
    if (!lockable(node)) continue;
    const holder = world.nodeLocks[pn.id];
    if (holder === ac.id) continue;
    const junction = isJunction(pn.id);
    let blocked = false;
    let margin = 14;
    if (holder) {
      blocked = true;
      const hac = findAc(world, holder);
      const ph = pointAt(p, pn.d).h;
      const crossing = !hac || Math.abs(angleDiff(hac.h, ph)) > 0.6;
      if (crossing && junction) margin = 92;
      ac.blockedBy = holder;
      ac.waitReason = 'Waiting for junction';
    } else if (junction && obsLimit < pn.d + t.length / 2 + 12 && pn.d < p.total - 1) {
      blocked = true;
      margin = 92;
      ac.waitReason = 'Keeping junction clear';
    }
    if (blocked) return pn.d - t.length / 2 - margin;
    world.nodeLocks[pn.id] = ac.id;
    ac.locks.push(pn.id);
  }
  return Infinity;
}

// ---------------------------------------------------------------------------
// Car following
// ---------------------------------------------------------------------------

function obstacleLimit(world: World, ac: Aircraft, brake: number): number {
  const p = ac.path!;
  const t = getType(ac.typeId);
  const look = Math.min(p.total, ac.s + brake + t.length + 140);
  let best = Infinity;
  for (const o of world.aircraft) {
    if (o === ac || o.alt > 0.02 || !ON_GROUND.has(o.phase)) continue;
    // cheap reject
    const dx = o.x - ac.x;
    const dy = o.y - ac.y;
    const reach = look - ac.s + 200;
    if (dx * dx + dy * dy > reach * reach) continue;
    // deterministic mutual-block breaker
    if (o.blockedBy === ac.id && ac.id < o.id) continue;
    const proj = projectAhead(p, ac.s + 1, look, o.x, o.y);
    if (!proj) continue;
    const ot = getType(o.typeId);
    const ph = pointAt(p, proj.d).h;
    const dh = angleDiff(ph, o.h);
    const c = Math.abs(dcos(dh));
    const sn = Math.abs(dsin(dh));
    const latThresh = 18 + t.fuselageWidth / 2 + sn * (ot.length / 2) + c * (ot.fuselageWidth / 2);
    if (proj.lat > latThresh) continue;
    const ext = c * (ot.length / 2) + sn * (ot.span / 2);
    const stop = proj.d - (t.length / 2 + ext + 16);
    if (stop < best) {
      best = stop;
      ac.blockedBy = o.id;
      ac.waitReason = 'Traffic ahead';
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Ground movement
// ---------------------------------------------------------------------------

interface MoveOpts {
  maxV: number;
  accel: number;
  decel: number;
  endOffset: number;
  noTraffic?: boolean;
  noLocks?: boolean;
}

function groundMove(world: World, ac: Aircraft, o: MoveOpts): boolean {
  const p = ac.path;
  if (!p || p.total <= 0) {
    ac.v = 0;
    return true;
  }
  ac.blockedBy = undefined;
  const prevReason = ac.waitReason;
  ac.waitReason = undefined;
  const brake = (ac.v * ac.v) / (2 * o.decel);
  const endLimit = p.total - o.endOffset;
  let limit = endLimit;
  let obs = Infinity;
  if (!o.noTraffic) {
    obs = obstacleLimit(world, ac, brake);
    if (obs < limit) limit = obs;
  }
  if (!o.noLocks) {
    const ll = lockLimit(world, ac, brake, obs);
    if (ll < limit) limit = ll;
  } else {
    releaseLocks(world, ac);
  }
  let vt = o.maxV;
  const curve = speedLimitAhead(p, ac.s, brake + 80, o.decel);
  if (curve < vt) vt = curve;
  const remain = limit - ac.s;
  const vStop = remain > 0 ? Math.sqrt(2 * o.decel * remain) : 0;
  if (vStop < vt) vt = vStop;
  if (ac.holdPos) {
    vt = 0;
    ac.waitReason = 'Holding position';
  }
  if (vt > ac.v) ac.v = Math.min(vt, ac.v + o.accel * DT);
  else ac.v = Math.max(vt, ac.v - o.decel * 1.8 * DT);
  let ds = ac.v * DT;
  if (ds > remain) {
    ds = remain > 0 ? remain : 0;
    if (remain <= 0.05) ac.v = 0;
  }
  ac.s += ds;
  const pt = pointAt(p, ac.s);
  ac.x = pt.x;
  ac.y = pt.y;
  ac.h = pt.h;
  const arrived = ac.s >= endLimit - 0.5 && ac.v < 0.6;
  if (!arrived && ac.v < 0.5 && limit < endLimit - 1) {
    ac.waitTime += DT;
    if (!ac.waitReason) ac.waitReason = prevReason ?? 'Waiting';
  } else if (!arrived && !ac.holdPos) {
    ac.waitTime = 0;
    if (ac.v > 1) ac.waitReason = undefined;
  }
  return arrived;
}

function setPath(ac: Aircraft, ctrl: PathCtrl[], kind: Aircraft['pathKind'], reverse = false) {
  ac.route = ctrl;
  ac.path = buildPath(ctrl, reverse);
  ac.pathKind = kind;
  ac.s = 0;
}

function nodeCtrl(id: string): PathCtrl {
  const n = AIRPORT.nodes[id]!;
  return { x: n.x, y: n.y, r: n.r, node: id };
}

/** The graph node an aircraft will pass next (or is standing on). */
export function nextNodeAhead(ac: Aircraft): string | undefined {
  if (ac.path && ac.pathKind !== 'pushback') {
    for (const pn of ac.path.nodes) if (pn.d >= ac.s - 1) return pn.id;
  }
  return ac.groundNode;
}

/**
 * Replace the remainder of an aircraft's route with `nodes` (nodes[0] must be the next
 * node ahead). Geometry already travelled is preserved so the aircraft never jumps.
 */
function reroute(ac: Aircraft, nodes: string[], tail: PathCtrl[], kind: Aircraft['pathKind']) {
  const split = nodes[0]!;
  const p = ac.path;
  if (p && ac.route && ac.pathKind !== 'pushback') {
    const pn = p.nodes.find((q) => q.id === split && q.d >= ac.s - 1);
    if (pn && pn.d > ac.s + 130) {
      const prefix = ac.route.slice(0, pn.ci + 1);
      const ctrl = [...prefix, ...nodes.slice(1).map(nodeCtrl), ...tail];
      const s = ac.s;
      ac.route = ctrl;
      ac.path = buildPath(ctrl);
      ac.pathKind = kind;
      ac.s = s;
      return;
    }
  }
  // start fresh from the current position
  const n0 = AIRPORT.nodes[split]!;
  const ctrl: PathCtrl[] = [];
  const dd = dist(ac.x, ac.y, n0.x, n0.y);
  if (dd < 6) {
    ctrl.push({ x: ac.x, y: ac.y, r: 0, node: split });
  } else {
    ctrl.push({ x: ac.x, y: ac.y, r: 0 });
    ctrl.push({ ...nodeCtrl(split), r: Math.min(n0.r, dd * 0.45) });
  }
  for (const id of nodes.slice(1)) ctrl.push(nodeCtrl(id));
  ctrl.push(...tail);
  setPath(ac, ctrl, kind);
}

export function planGateRoute(ac: Aircraft, gateId: string, via?: string[]): string[] | null {
  const gate = AIRPORT.gateById[gateId];
  if (!gate) return null;
  const start = nextNodeAhead(ac);
  if (!start) return null;
  return via && via.length ? routeVia(start, gate.mouth, via) : shortestRoute(start, gate.mouth);
}

export function planRunwayRoute(ac: Aircraft, runway: RunwayId, via?: string[]): string[] | null {
  const rw = AIRPORT.runways[runway];
  const start = nextNodeAhead(ac);
  if (!start) return null;
  return via && via.length ? routeVia(start, rw.holdNode, via) : shortestRoute(start, rw.holdNode);
}

export function startTaxiToGate(world: World, ac: Aircraft, via?: string[]): boolean {
  if (!ac.gate) return false;
  const gate = AIRPORT.gateById[ac.gate]!;
  const route = planGateRoute(ac, ac.gate, via);
  if (!route) return false;
  const t = getType(ac.typeId);
  reroute(ac, route, [{ x: gate.x, y: standStopY(gate, t.length), r: 0, node: gate.stand }], 'taxiIn');
  ac.holdPos = false;
  ac.approach = undefined;
  if (ac.phase !== 'taxiIn') setPhase(world, ac, 'taxiIn');
  clearPending(ac, 'park');
  const f = flightOf(world, ac);
  if (f) f.status = 'landing';
  return true;
}

export function startTaxiOut(world: World, ac: Aircraft, runway: RunwayId, via?: string[]): boolean {
  const route = planRunwayRoute(ac, runway, via);
  if (!route) return false;
  reroute(ac, route, [], 'taxiOut');
  ac.runway = runway;
  ac.pendingTaxiRunway = undefined;
  ac.pendingVia = undefined;
  ac.holdPos = false;
  if (ac.phase !== 'taxiOut') setPhase(world, ac, 'taxiOut');
  clearPending(ac, 'taxi');
  const f = flightOf(world, ac);
  if (f) f.status = 'departing';
  return true;
}

// ---------------------------------------------------------------------------
// Runways
// ---------------------------------------------------------------------------

export function arrivalsOnFinal(world: World, rw: RunwayId): Aircraft[] {
  return world.aircraft.filter((a) => a.phase === 'approach' && a.approach?.runway === rw && a.approach.stage === 'final');
}

export function departureBlockReason(world: World, ac: Aircraft, rw: RunwayId): string | null {
  const rs = world.runways[rw];
  if (rs.owner && rs.owner !== ac.id) return 'Runway in use';
  if (world.tick < rs.cooldownUntil) return 'Wake turbulence spacing';
  if (world.rules.safeRunway || world.rules.protectArrivals) {
    const rwy = AIRPORT.runways[rw];
    for (const a of arrivalsOnFinal(world, rw)) {
      if (rwy.touchdownX - a.x < 4300) return 'Arrival on final';
    }
  }
  return null;
}

function releaseRunway(world: World, ac: Aircraft, cooldownSec: number) {
  for (const id of ['R1', 'R2'] as RunwayId[]) {
    const rs = world.runways[id];
    if (rs.owner === ac.id) {
      rs.owner = null;
      rs.ownerKind = null;
      rs.cooldownUntil = Math.max(rs.cooldownUntil, world.tick + Math.round(cooldownSec * TICK_HZ));
      rs.lastCat = getType(ac.typeId).cat;
    }
    const qi = rs.arrivals.indexOf(ac.id);
    if (qi >= 0) rs.arrivals.splice(qi, 1);
  }
}

function canStartFinal(world: World, ac: Aircraft): boolean {
  const ap = ac.approach!;
  const rs = world.runways[ap.runway];
  const rw = AIRPORT.runways[ap.runway];
  let idx = rs.arrivals.indexOf(ac.id);
  if (idx < 0) {
    rs.arrivals.push(ac.id);
    idx = rs.arrivals.length - 1;
  }
  if (idx > 0) {
    const pred = findAc(world, rs.arrivals[idx - 1]);
    if (pred && pred.phase === 'approach') {
      if (pred.approach?.stage !== 'final') return false;
      const predDist = rw.touchdownX - pred.x;
      const myDist = rw.touchdownX - ac.x;
      let spacing = world.rules.arrivalSpacing;
      const pc = SIZE_ORDER[getType(pred.typeId).cat];
      const mc = SIZE_ORDER[getType(ac.typeId).cat];
      if (world.rules.wake && pc >= 2 && mc < pc) spacing += 320;
      if (world.weather === 'fog' && world.rules.wake) spacing += 250;
      if (myDist - predDist < spacing) return false;
    }
  }
  if (world.rules.protectArrivals && rs.ownerKind === 'departure') return false;
  if (world.rules.safeRunway) {
    if (rs.owner && rs.owner !== ac.id) return false;
    if (world.tick < rs.cooldownUntil) return false;
    rs.owner = ac.id;
    rs.ownerKind = 'arrival';
  }
  return true;
}

// ---------------------------------------------------------------------------
// Airborne flight model
// ---------------------------------------------------------------------------

function steerTo(ac: Aircraft, desired: number, rate: number) {
  const d = angleDiff(ac.h, desired);
  const m = rate * DT;
  ac.h = wrapAngle(ac.h + clamp(d, -m, m));
}

function flyStep(ac: Aircraft, targetV: number, targetAlt: number, altRate = 0.12) {
  if (ac.v < targetV) ac.v = Math.min(targetV, ac.v + 6 * DT);
  else ac.v = Math.max(targetV, ac.v - 5 * DT);
  if (ac.alt < targetAlt) ac.alt = Math.min(targetAlt, ac.alt + altRate * DT);
  else ac.alt = Math.max(targetAlt, ac.alt - altRate * DT);
  ac.x += dcos(ac.h) * ac.v * DT;
  ac.y += dsin(ac.h) * ac.v * DT;
}

function fixById(id: string | undefined) {
  return AIRPORT.holdFixes.find((f) => f.id === id) ?? AIRPORT.holdFixes[0]!;
}

function nearestFix(x: number, y: number) {
  let best = AIRPORT.holdFixes[0]!;
  let bd = Infinity;
  for (const f of AIRPORT.holdFixes) {
    const d = dist(x, y, f.x, f.y);
    if (d < bd) {
      bd = d;
      best = f;
    }
  }
  return best;
}

function assignHoldLevel(world: World, ac: Aircraft) {
  const used = new Set<number>();
  for (const a of world.aircraft) {
    if (a !== ac && a.fix === ac.fix && a.phase === 'holding') used.add(a.holdLevel);
  }
  let lvl = 0;
  while (used.has(lvl)) lvl++;
  ac.holdLevel = lvl;
}

function orbit(ac: Aircraft, cx: number, cy: number, radius: number, v: number, alt: number) {
  const a = datan2(ac.y - cy, ac.x - cx);
  const d = dist(ac.x, ac.y, cx, cy);
  // lead point on the circle, corrected for radial error
  const lead = 0.55;
  const r = radius + (radius - d) * 0.3;
  const tx = cx + dcos(a + lead) * r;
  const ty = cy + dsin(a + lead) * r;
  steerTo(ac, datan2(ty - ac.y, tx - ac.x), 0.55);
  flyStep(ac, v, alt);
}

function updateFuel(world: World, ac: Aircraft): boolean {
  if (world.rules.fuel) {
    ac.fuel -= DT;
    if (ac.fuel <= 60 && !ac.lowFuel) {
      ac.lowFuel = true;
      world.events.push({ t: 'lowFuel', ac: ac.id, callsign: ac.callsign });
      if (!ac.emergency) ac.emergency = { kind: 'fuel', deadline: world.tick + Math.round(ac.fuel * TICK_HZ) };
    }
    const committed = ac.phase === 'approach' && ac.approach?.stage === 'final';
    if (ac.fuel <= 0 && !committed) {
      divert(world, ac, 'Out of holding fuel');
      return true;
    }
  }
  if (ac.emergency && world.tick > ac.emergency.deadline) {
    const committed = ac.phase === 'approach' && ac.approach?.stage === 'final';
    if (!committed) {
      divert(world, ac, 'Emergency diverted elsewhere');
      return true;
    }
  }
  return false;
}

function updateInbound(world: World, ac: Aircraft) {
  if (updateFuel(world, ac)) return;
  const f = fixById(ac.fix);
  steerTo(ac, datan2(f.y - ac.y, f.x - ac.x), 0.45);
  flyStep(ac, 150, 0.9);
  if (ac.phaseTime > 20) ac.holdingTime += DT;
  if (dist(ac.x, ac.y, f.x, f.y) < 460) {
    setPhase(world, ac, 'holding');
    assignHoldLevel(world, ac);
    const fl = flightOf(world, ac);
    if (fl) fl.status = 'holding';
  }
}

function updateHolding(world: World, ac: Aircraft) {
  if (updateFuel(world, ac)) return;
  const f = fixById(ac.fix);
  ac.holdingTime += DT;
  orbit(ac, f.x, f.y, 300 + ac.holdLevel * 125, 125, 0.55 + Math.min(ac.holdLevel, 4) * 0.1);
}

export function approachEntry(rw: RunwayId, side: 1 | -1) {
  const r = AIRPORT.runways[rw];
  return { x: r.thresholdX - 3100, y: r.y + side * 520 };
}

function updateApproach(world: World, ac: Aircraft) {
  if (updateFuel(world, ac)) return;
  const ap = ac.approach!;
  const rw = AIRPORT.runways[ap.runway];
  const t = getType(ac.typeId);
  if (ap.stage === 'vector' || ap.stage === 'delay') {
    ac.holdingTime += ap.stage === 'delay' ? DT : 0;
    const e = approachEntry(ap.runway, ap.side);
    if (ap.stage === 'vector') {
      steerTo(ac, datan2(e.y - ac.y, e.x - ac.x), 0.5);
      flyStep(ac, 140, 0.5);
      if (dist(ac.x, ac.y, e.x, e.y) < 200) {
        if (canStartFinal(world, ac)) startFinal(world, ac);
        else ap.stage = 'delay';
      }
    } else {
      orbit(ac, e.x - 150, e.y, 300, 120, 0.5);
      if (canStartFinal(world, ac)) startFinal(world, ac);
    }
    return;
  }
  // final approach: pure pursuit on the extended centreline
  const look = ac.x > rw.thresholdX - 900 ? 380 : 620;
  const tx = Math.max(ac.x, rw.thresholdX - 4200) + look;
  steerTo(ac, datan2(rw.y - ac.y, tx - ac.x), 0.7);
  const dtd = rw.touchdownX - ac.x;
  const glide = clamp((dtd / 2400) * 0.45, 0, 0.5);
  const targetV = t.touchdownSpeed + 6 + clamp(dtd / 2400, 0, 1) * 30;
  if (ac.v < targetV) ac.v = Math.min(targetV, ac.v + 4 * DT);
  else ac.v = Math.max(targetV, ac.v - 4 * DT);
  if (ac.alt > glide) ac.alt = Math.max(glide, ac.alt - 0.06 * DT);
  ac.x += dcos(ac.h) * ac.v * DT;
  ac.y += dsin(ac.h) * ac.v * DT;

  const rs = world.runways[ap.runway];
  if (rs.owner !== ac.id && ac.x >= rw.thresholdX - 650) {
    // decision point
    if (Math.abs(ac.y - rw.y) > 40 || Math.abs(angleDiff(ac.h, 0)) > 0.3) {
      goAround(world, ac, 'Unstable approach');
      return;
    }
    if (world.weather === 'storm' && world.rules.severeWeather && next(world.rng) < 0.12) {
      goAround(world, ac, 'Wind shear on final');
      return;
    }
    if (rs.owner && rs.owner !== ac.id) {
      goAround(world, ac, 'Runway occupied');
      return;
    }
    rs.owner = ac.id;
    rs.ownerKind = 'arrival';
  }
  if (ac.x >= rw.touchdownX - 10 && rs.owner === ac.id) startLanding(world, ac);
}

function startFinal(world: World, ac: Aircraft) {
  ac.approach!.stage = 'final';
  clearPending(ac, 'land');
  world.events.push({ t: 'cleared', ac: ac.id, callsign: ac.callsign, what: `final ${AIRPORT.runways[ac.approach!.runway].name}` });
}

export function goAround(world: World, ac: Aircraft, reason: string) {
  const rw = ac.approach?.runway ?? 'R1';
  releaseRunway(world, ac, 1);
  if (!setPhase(world, ac, 'goAround')) return;
  ac.goArounds++;
  world.score.goArounds++;
  const r = AIRPORT.runways[rw];
  ac.goAroundTo = { x: r.x1 + 500, y: r.y };
  ac.approach = undefined;
  ac.pendingList = (ac.pendingList ?? []).filter((p) => p.kind !== 'land');
  adjustHappiness(world, -2);
  world.score.points = Math.max(0, world.score.points - 60);
  world.events.push({ t: 'goAround', ac: ac.id, callsign: ac.callsign, reason });
}

function updateGoAround(world: World, ac: Aircraft) {
  if (updateFuel(world, ac)) return;
  const g = ac.goAroundTo ?? { x: 3400, y: ac.y };
  steerTo(ac, datan2(g.y - ac.y, g.x - ac.x), 0.4);
  flyStep(ac, 150, 0.6, 0.1);
  if (ac.x > g.x - 150) {
    ac.fix = nearestFix(ac.x, ac.y).id;
    setPhase(world, ac, 'inbound');
  }
}

export function divert(world: World, ac: Aircraft, reason: string) {
  releaseRunway(world, ac, 0);
  if (ac.gate && world.gateRes[ac.gate] === ac.id) delete world.gateRes[ac.gate];
  if (!setPhase(world, ac, 'diverted')) return;
  ac.approach = undefined;
  world.score.diversions++;
  adjustHappiness(world, -8);
  world.score.points = Math.max(0, world.score.points - 300);
  const fl = flightOf(world, ac);
  if (fl) fl.status = 'diverted';
  world.events.push({ t: 'diverted', ac: ac.id, callsign: ac.callsign });
  world.events.push({ t: 'reward', coins: 0, points: -300, reason, ac: ac.id });
}

function updateDiverted(world: World, ac: Aircraft) {
  const away = datan2(ac.y - 1100, ac.x - 1550);
  steerTo(ac, away, 0.4);
  flyStep(ac, 170, 1);
  if (outOfBounds(ac)) ac.removeAt = world.tick;
}

function outOfBounds(ac: Aircraft) {
  return ac.x > 5600 || ac.x < -3200 || ac.y < -2600 || ac.y > 4800;
}

// ---------------------------------------------------------------------------
// Landing & ground phases
// ---------------------------------------------------------------------------

function exitFree(world: World, ac: Aircraft, holdNode: string) {
  const holder = world.nodeLocks[holdNode];
  if (holder && holder !== ac.id) return false;
  const n = AIRPORT.nodes[holdNode]!;
  for (const o of world.aircraft) {
    if (o !== ac && ON_GROUND.has(o.phase) && dist(o.x, o.y, n.x, n.y) < 80) return false;
  }
  return true;
}

function startLanding(world: World, ac: Aircraft) {
  const ap = ac.approach!;
  const rw = AIRPORT.runways[ap.runway];
  const t = getType(ac.typeId);
  const rs = world.runways[ap.runway];
  const qi = rs.arrivals.indexOf(ac.id);
  if (qi >= 0) rs.arrivals.splice(qi, 1);
  if (!setPhase(world, ac, 'landing')) return;
  ac.alt = 0;
  const decel = t.landingDecel * weatherDecel(world);
  const stopX = ac.x + (ac.v * ac.v - 35 * 35) / (2 * decel);
  let chosen = rw.exits.length - 1;
  for (let k = 0; k < rw.exits.length; k++) {
    const ex = rw.exits[k]!;
    if (ex.x >= stopX - 40 && exitFree(world, ac, ex.holdNode)) {
      chosen = k;
      break;
    }
  }
  const ex = rw.exits[chosen]!;
  ac.exitIndex = chosen;
  const ctrl: PathCtrl[] = [{ x: ac.x, y: ac.y, r: 0 }];
  for (const rn of rw.runwayNodes) {
    const n = AIRPORT.nodes[rn]!;
    if (n.x <= ac.x + 5) continue;
    if (rn === ex.runwayNode) {
      ctrl.push(nodeCtrl(rn));
      break;
    }
    ctrl.push({ ...nodeCtrl(rn), r: 0 });
  }
  ctrl.push(nodeCtrl(ex.holdNode));
  setPath(ac, ctrl, 'landing');
  world.score.arrivals++;
  world.dayFlights++;
  ac.arrivedAt = world.tick;
  const coins = 10 + SIZE_ORDER[t.cat] * 5;
  world.score.coins += coins;
  world.score.points += 100;
  world.score.xp += 8;
  const fl = flightOf(world, ac);
  if (fl) fl.status = 'landing';
  world.events.push({ t: 'touchdown', ac: ac.id, callsign: ac.callsign, runway: ap.runway });
  world.events.push({ t: 'reward', coins, points: 100, reason: 'Smooth landing', ac: ac.id });
  if (ac.emergency) {
    world.score.emergenciesHandled++;
    world.score.coins += 60;
    world.score.points += 400;
    adjustHappiness(world, 5);
    world.events.push({ t: 'reward', coins: 60, points: 400, reason: 'Emergency landed safely', ac: ac.id });
    ac.emergency = undefined;
  }
}

function updateLanding(world: World, ac: Aircraft) {
  const t = getType(ac.typeId);
  const p = ac.path!;
  const rw = AIRPORT.runways[ac.approach?.runway ?? (ac.y < 1100 ? 'R1' : 'R2')];
  const ex = rw.exits[ac.exitIndex ?? 0]!;
  const exD = p.nodes.find((n) => n.id === ex.runwayNode)?.d ?? 0;
  const onRunway = ac.s < exD + t.length / 2 + 60;
  const decel = t.landingDecel * weatherDecel(world);
  const arrived = groundMove(world, ac, {
    maxV: onRunway ? Math.max(35, ac.v - decel * DT) : t.taxiSpeed * weatherTaxi(world),
    accel: onRunway ? 0 : 4,
    decel: onRunway ? decel : 7,
    endOffset: 0,
  });
  const rs = world.runways[rw.id];
  if (!onRunway && rs.owner === ac.id) {
    releaseRunway(world, ac, 1);
    world.events.push({ t: 'vacated', ac: ac.id, callsign: ac.callsign });
    if (ac.gate) {
      if (startTaxiToGate(world, ac)) return;
    }
  }
  if (arrived && ac.phase === 'landing') {
    if (rs.owner === ac.id) releaseRunway(world, ac, 1);
    ac.groundNode = ex.holdNode;
    if (ac.gate && startTaxiToGate(world, ac)) return;
    setPhase(world, ac, 'vacated');
    ac.approach = undefined;
  }
}

function updateVacated(world: World, ac: Aircraft) {
  ac.v = 0;
  ac.waitTime += DT;
  ac.waitReason = 'Awaiting gate';
  releaseLocks(world, ac);
  if (ac.gate) startTaxiToGate(world, ac);
}

function updateTaxiIn(world: World, ac: Aircraft) {
  const t = getType(ac.typeId);
  const arrived = groundMove(world, ac, {
    maxV: t.taxiSpeed * weatherTaxi(world),
    accel: 4,
    decel: 7,
    endOffset: 0,
  });
  if (arrived) {
    const gate = AIRPORT.gateById[ac.gate!]!;
    setPhase(world, ac, 'parked');
    ac.v = 0;
    ac.h = gate.parkHeading;
    ac.turn = { stage: 'deboard', t: 0, total: t.turnaround * (world.config.mode === 'kids' ? 0.8 : 1) };
    const fl = flightOf(world, ac);
    if (fl) fl.status = 'atGate';
    world.events.push({ t: 'parked', ac: ac.id, callsign: ac.callsign, gate: gate.id });
    world.score.coins += 5;
    releaseLocks(world, ac);
  }
}

function updateParked(world: World, ac: Aircraft) {
  releaseLocks(world, ac);
  const tr = ac.turn;
  if (!tr) return;
  if (tr.stage !== 'ready') {
    tr.t += DT;
    const f = tr.t / tr.total;
    const prev = tr.stage;
    tr.stage = f < 0.3 ? 'deboard' : f < 0.5 ? 'service' : f < 1 ? 'board' : 'ready';
    if (prev !== tr.stage) {
      const fl = flightOf(world, ac);
      if (fl && tr.stage === 'board') fl.status = 'boarding';
      if (tr.stage === 'ready') world.events.push({ t: 'readyPushback', ac: ac.id, callsign: ac.callsign });
    }
  }
  if (tr.stage === 'ready' && ac.pushbackRequested) tryStartPushback(world, ac);
}

function ringNodes(side: 'N' | 'S'): string[] {
  const start = side === 'N' ? 'NE' : 'SE';
  const end = side === 'N' ? 'NW2' : 'SW2';
  const res: string[] = [start];
  let cur = start;
  let guard = 0;
  while (cur !== end && guard++ < 40) {
    const outs = AIRPORT.out[cur]!.filter((o) => {
      const n = AIRPORT.nodes[o]!;
      return n.y === AIRPORT.nodes[start]!.y && n.x < AIRPORT.nodes[cur]!.x;
    });
    if (!outs.length) break;
    cur = outs[0]!;
    res.push(cur);
  }
  return res;
}
const RING_NODES = { N: ringNodes('N'), S: ringNodes('S') };

export function pushbackFootprint(ac: Aircraft) {
  const gate = AIRPORT.gateById[ac.gate!]!;
  const t = getType(ac.typeId);
  const endX = gate.x + 150;
  const x0 = gate.x - t.span / 2 - 30;
  const x1 = endX + t.length / 2 + 30;
  const ring = RING_NODES[gate.side];
  const nodes = ring.filter((id) => {
    const n = AIRPORT.nodes[id]!;
    return n.x >= x0 && n.x <= x1;
  });
  // include first node east of the footprint so approaching traffic stops beyond our tail
  let east: string | undefined;
  for (const id of ring) {
    const n = AIRPORT.nodes[id]!;
    if (n.x > x1 && (!east || n.x < AIRPORT.nodes[east]!.x)) east = id;
  }
  if (east) nodes.push(east);
  // physical clearance must cover everything up to (and just beyond) the protecting node
  const checkX1 = Math.max(x1, east ? AIRPORT.nodes[east]!.x : x1) + 200;
  return { gate, endX, x0, x1, checkX1, nodes, ringY: AIRPORT.ringY[gate.side] };
}

export function pushbackBlockReason(world: World, ac: Aircraft): string | null {
  const fp = pushbackFootprint(ac);
  for (const n of fp.nodes) {
    const h = world.nodeLocks[n];
    if (h && h !== ac.id) return 'Taxilane busy';
  }
  for (const o of world.aircraft) {
    if (o === ac || !ON_GROUND.has(o.phase) || o.phase === 'parked') continue;
    if (Math.abs(o.y - fp.ringY) < 110 && o.x > fp.x0 - 80 && o.x < fp.checkX1) return 'Traffic behind';
  }
  return null;
}

function tryStartPushback(world: World, ac: Aircraft) {
  const reason = pushbackBlockReason(world, ac);
  if (reason) {
    ac.waitReason = reason;
    ac.waitTime += DT;
    return;
  }
  const fp = pushbackFootprint(ac);
  for (const n of fp.nodes) {
    world.nodeLocks[n] = ac.id;
    if (!ac.locks.includes(n)) ac.locks.push(n);
  }
  setPhase(world, ac, 'pushback');
  ac.pushbackRequested = false;
  clearPending(ac, 'pushback');
  setPath(
    ac,
    [
      { x: fp.gate.x, y: ac.y, r: 0 },
      { x: fp.gate.x, y: fp.ringY, r: 75 },
      { x: fp.endX, y: fp.ringY, r: 0 },
    ],
    'pushback',
    true,
  );
  ac.groundNode = fp.gate.mouth;
  const fl = flightOf(world, ac);
  if (fl) fl.status = 'departing';
}

function updatePushback(world: World, ac: Aircraft) {
  const arrived = groundMove(world, ac, { maxV: 10, accel: 2, decel: 3, endOffset: 0, noTraffic: true, noLocks: true });
  if (!arrived) return;
  ac.pushWait = (ac.pushWait ?? 0) + DT;
  if (ac.pushWait < 1.5) return; // tug disconnect + engine start
  ac.pushWait = undefined;
  if (ac.gate && world.gateRes[ac.gate] === ac.id) delete world.gateRes[ac.gate];
  ac.gate = undefined;
  ac.turn = undefined;
  ac.path = undefined;
  ac.route = undefined;
  setPhase(world, ac, 'readyTaxi');
  releaseLocks(world, ac);
  if (!ac.pendingTaxiRunway || !startTaxiOut(world, ac, ac.pendingTaxiRunway, ac.pendingVia)) {
    world.events.push({ t: 'readyTaxi', ac: ac.id, callsign: ac.callsign });
  }
}

function updateReadyTaxi(world: World, ac: Aircraft) {
  ac.v = 0;
  ac.waitTime += DT;
  ac.waitReason = 'Awaiting taxi';
  releaseLocks(world, ac);
  if (ac.pendingTaxiRunway) startTaxiOut(world, ac, ac.pendingTaxiRunway, ac.pendingVia);
}

function updateTaxiOut(world: World, ac: Aircraft) {
  const t = getType(ac.typeId);
  const arrived = groundMove(world, ac, {
    maxV: t.taxiSpeed * weatherTaxi(world),
    accel: 4,
    decel: 7,
    endOffset: t.length / 2,
  });
  if (arrived) {
    setPhase(world, ac, 'holdShort');
    world.events.push({ t: 'holdingShort', ac: ac.id, callsign: ac.callsign, runway: ac.runway! });
  }
}

function updateHoldShort(world: World, ac: Aircraft) {
  ac.v = 0;
  releaseLocks(world, ac);
  if (!ac.takeoffCleared) {
    ac.waitReason = 'Ready for departure';
    ac.waitTime += DT;
    return;
  }
  const rw = ac.runway!;
  const reason = departureBlockReason(world, ac, rw);
  if (reason) {
    ac.waitReason = reason;
    ac.waitTime += DT;
    return;
  }
  const rs = world.runways[rw];
  rs.owner = ac.id;
  rs.ownerKind = 'departure';
  const r = AIRPORT.runways[rw];
  const ent = AIRPORT.nodes[r.entryNode]!;
  setPhase(world, ac, 'lineup');
  clearPending(ac, 'takeoff');
  const t = getType(ac.typeId);
  setPath(
    ac,
    [
      { x: ac.x, y: ac.y, r: 0 },
      { ...nodeCtrl(r.holdNode), r: 0 },
      { x: ent.x, y: ent.y, r: 60 },
      { x: ent.x + 70 + t.length * 0.15, y: r.y, r: 0 },
    ],
    'lineup',
  );
  world.events.push({ t: 'cleared', ac: ac.id, callsign: ac.callsign, what: `line up ${r.name}` });
}

function updateLineup(world: World, ac: Aircraft) {
  const arrived = groundMove(world, ac, { maxV: 22, accel: 4, decel: 6, endOffset: 0, noTraffic: true });
  if (arrived) {
    if (ac.lineupWait === undefined) ac.lineupWait = 0;
    ac.lineupWait += DT;
    if (ac.lineupWait < 1.2) return;
    ac.lineupWait = undefined;
    const r = AIRPORT.runways[ac.runway!];
    setPhase(world, ac, 'takeoff');
    releaseLocks(world, ac, true);
    setPath(ac, [{ x: ac.x, y: ac.y, r: 0 }, { x: r.x1, y: r.y, r: 0 }, { x: r.x1 + 1500, y: r.y, r: 0 }], 'takeoff');
    world.events.push({ t: 'takeoffRoll', ac: ac.id, callsign: ac.callsign, runway: r.id });
  }
}

function updateTakeoff(world: World, ac: Aircraft) {
  const t = getType(ac.typeId);
  ac.v += t.takeoffAccel * DT;
  ac.s += ac.v * DT;
  const pt = pointAt(ac.path!, ac.s);
  ac.x = pt.x;
  ac.y = pt.y;
  ac.h = pt.h;
  if (ac.v >= t.rotateSpeed) {
    setPhase(world, ac, 'climbOut');
    ac.path = undefined;
    ac.alt = 0.001;
    const wake = world.rules.wake && SIZE_ORDER[t.cat] >= 2 ? 6 : 0;
    releaseRunway(world, ac, 2 + wake);
    awardDeparture(world, ac);
  }
}

function updateClimbOut(world: World, ac: Aircraft) {
  if (ac.x > 3300) steerTo(ac, ac.exitDir ?? 0, 0.25);
  flyStep(ac, 190, 1, 0.09);
  if (outOfBounds(ac)) {
    setPhase(world, ac, 'departed');
    ac.removeAt = world.tick + 1;
  }
}

function awardDeparture(world: World, ac: Aircraft) {
  const t = getType(ac.typeId);
  const fl = flightOf(world, ac);
  const base = { S: 40, M: 70, H: 120, J: 180 }[t.cat];
  const now = nowSec(world);
  const delay = fl ? Math.max(0, now - fl.schedDep) : 0;
  const onTime = delay <= 0;
  const mult = onTime ? 1.25 : Math.max(0.5, 1 - delay / 300);
  const coins = Math.round((base + ac.pax * 0.05) * mult * (ac.special ? 1.5 : 1));
  const points = Math.max(0, coins * 10 + (onTime ? 200 : 0) - ac.goArounds * 60);
  world.score.coins += coins;
  world.score.points += points;
  world.score.xp += Math.round(coins * 0.6);
  world.score.departures++;
  world.dayFlights++;
  if (SIZE_ORDER[t.cat] >= 2) world.score.heavyHandled++;
  if (onTime) {
    world.score.onTime++;
    adjustHappiness(world, 2);
  } else {
    world.score.late++;
    world.score.totalDelay += delay;
    adjustHappiness(world, delay > 60 ? -2 : -1);
  }
  if (fl) fl.status = 'departed';
  world.events.push({ t: 'departed', ac: ac.id, callsign: ac.callsign, coins, points, onTime, typeId: ac.typeId });
}

export function adjustHappiness(world: World, delta: number) {
  const d = delta < 0 ? delta * world.rules.penalties : delta;
  world.score.happiness = clamp(world.score.happiness + d, 0, 100);
}

// ---------------------------------------------------------------------------
// Main step
// ---------------------------------------------------------------------------

function updateAircraft(world: World, ac: Aircraft) {
  ac.phaseTime += DT;
  switch (ac.phase) {
    case 'inbound':
      return updateInbound(world, ac);
    case 'holding':
      return updateHolding(world, ac);
    case 'approach':
      return updateApproach(world, ac);
    case 'goAround':
      return updateGoAround(world, ac);
    case 'landing':
      return updateLanding(world, ac);
    case 'vacated':
      return updateVacated(world, ac);
    case 'taxiIn':
      return updateTaxiIn(world, ac);
    case 'parked':
      return updateParked(world, ac);
    case 'pushback':
      return updatePushback(world, ac);
    case 'readyTaxi':
      return updateReadyTaxi(world, ac);
    case 'taxiOut':
      return updateTaxiOut(world, ac);
    case 'holdShort':
      return updateHoldShort(world, ac);
    case 'lineup':
      return updateLineup(world, ac);
    case 'takeoff':
      return updateTakeoff(world, ac);
    case 'climbOut':
      return updateClimbOut(world, ac);
    case 'diverted':
      return updateDiverted(world, ac);
    case 'departed':
      ac.removeAt = world.tick;
      return;
  }
}

function updateWeather(world: World) {
  if (!world.rules.weather) return;
  if (world.tick >= world.weatherUntil) {
    const w = pickWeather(world);
    world.weatherUntil = world.tick + Math.round(range(world.rng, 150, 300) * TICK_HZ);
    if (w !== world.weather) {
      world.weather = w;
      world.events.push({ t: 'weather', weather: w });
    }
  }
}

export function activeCount(world: World) {
  return world.aircraft.filter((a) => a.phase !== 'departed' && a.phase !== 'diverted' && a.phase !== 'climbOut').length;
}

export function airborneArrivals(world: World) {
  return world.aircraft.filter((a) => a.phase === 'inbound' || a.phase === 'holding' || a.phase === 'approach' || a.phase === 'goAround').length;
}

function updateSpawning(world: World) {
  if (!world.autoSpawn) return;
  if (world.tick < world.nextSpawnTick) return;
  const active = activeCount(world);
  const freeGates = world.config.openGates.filter((g) => !world.gateRes[g]).length;
  const waitingForGates = world.aircraft.filter((a) => !a.gate && (a.phase === 'inbound' || a.phase === 'holding' || a.phase === 'approach' || a.phase === 'goAround' || a.phase === 'landing' || a.phase === 'vacated')).length;
  if (active >= world.rules.maxActive || airborneArrivals(world) >= world.rules.maxAirborne || waitingForGates >= freeGates + 1) {
    world.nextSpawnTick = world.tick + 3 * TICK_HZ;
    return;
  }
  spawnArrival(world);
  world.nextSpawnTick = world.tick + Math.round(range(world.rng, world.rules.spawnMin, world.rules.spawnMax) * TICK_HZ);
}

function updateHappiness(world: World) {
  if (world.tick - world.lastHappinessTick < 5 * TICK_HZ) return;
  world.lastHappinessTick = world.tick;
  for (const a of world.aircraft) {
    if ((a.phase === 'holding' || a.phase === 'inbound' || a.phase === 'approach') && a.holdingTime > 150) adjustHappiness(world, -0.2);
    if ((a.phase === 'vacated' || a.phase === 'readyTaxi' || a.phase === 'holdShort') && a.waitTime > 75) adjustHappiness(world, -0.15);
  }
  const s = world.score;
  const active = activeCount(world);
  if (active > s.maxSimultaneous) s.maxSimultaneous = active;
  if (world.rules.happinessGameOver && s.happiness <= 0 && !world.over) {
    world.over = true;
    world.overReason = 'Passengers lost patience with the airport';
    world.events.push({ t: 'gameOver', reason: world.overReason });
  }
}

export function starsForDay(world: World, flights: number, happiness: number): number {
  const th = world.config.mode === 'kids' ? [4, 10, 16] : world.config.mode === 'pro' ? [16, 32, 48] : [10, 22, 34];
  let stars = 0;
  if (flights >= th[0]!) stars = 1;
  if (flights >= th[1]! && happiness >= 45) stars = 2;
  if (flights >= th[2]! && happiness >= 70) stars = 3;
  return stars;
}

function updateDay(world: World) {
  const m = world.config.mode;
  if (m === 'sandbox' || m === 'menu' || m === 'daily') return;
  const mins = world.config.startMinutes + world.tick * DT;
  const prev = mins - DT;
  const k = Math.floor((mins - 1320) / 1440);
  const kp = Math.floor((prev - 1320) / 1440);
  if (k > kp) {
    const stars = starsForDay(world, world.dayFlights, world.score.happiness);
    world.day++;
    world.score.daysCompleted++;
    if (stars > world.score.bestDayStars) world.score.bestDayStars = stars;
    world.events.push({ t: 'dayEnd', day: world.day, stars, flights: world.dayFlights, happiness: Math.round(world.score.happiness) });
    world.dayFlights = 0;
  }
}

export function step(world: World): void {
  if (world.over) return;
  world.tick++;
  updateWeather(world);
  updateSpawning(world);
  for (let i = 0; i < world.aircraft.length; i++) updateAircraft(world, world.aircraft[i]!);
  if (world.aircraft.some((a) => a.removeAt !== undefined && a.removeAt <= world.tick)) {
    for (const a of world.aircraft) {
      if (a.removeAt !== undefined && a.removeAt <= world.tick) {
        releaseLocks(world, a, true);
        releaseRunway(world, a, 0);
        if (a.gate && world.gateRes[a.gate] === a.id) delete world.gateRes[a.gate];
      }
    }
    world.aircraft = world.aircraft.filter((a) => !(a.removeAt !== undefined && a.removeAt <= world.tick));
  }
  updateHappiness(world);
  updateDay(world);
  if (world.rules.durationTicks > 0 && world.tick >= world.rules.durationTicks && !world.over) {
    world.over = true;
    world.overReason = 'Challenge complete';
    world.events.push({ t: 'gameOver', reason: world.overReason });
  }
}

export function drainEvents(world: World) {
  const ev = world.events;
  world.events = [];
  return ev;
}

export { clockMinutes };
