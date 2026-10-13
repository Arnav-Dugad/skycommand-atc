import { audio, haptic } from '../audio/audio';
import { AIRPORT, type RunwayId } from '../sim/airport';
import { bestGate, bestRunwayForArrival, bestRunwayForDeparture } from '../sim/autopilot';
import { arrivalsOnFinal } from '../sim/engine';
import { nearestNode, snappableNodes } from '../sim/routing';
import type { Aircraft, Command } from '../sim/types';
import { useGame } from '../store/game';
import { useProfile } from '../store/profile';
import { game } from './controller';

function ac(id: string | null): Aircraft | undefined {
  if (!id) return undefined;
  return game.world?.aircraft.find((a) => a.id === id);
}

function fail(reason: string) {
  useGame.getState().toast({ kind: 'warning', title: reason, icon: '✋', ttl: 2600 });
  audio.play('error');
}

function ok(label: string, icon: string) {
  audio.play('confirm');
  if (useProfile.getState().settings.haptics) haptic(15);
  useGame.getState().set({ pick: null });
  void label;
  void icon;
}

export function send(cmd: Command, label: string, icon = '✅') {
  const r = game.issue(cmd, label);
  if (!r.ok) {
    fail(r.reason ?? 'Not possible right now');
    return false;
  }
  ok(label, icon);
  return true;
}

function isKids() {
  return game.world?.config.mode === 'kids';
}

export function actionLand(id: string) {
  const a = ac(id);
  if (!a || !game.world) return;
  const runways = game.world.config.runways;
  if (runways.length === 1 || isKids()) {
    const rw = isKids() ? bestRunwayForArrival(game.world, a) : runways[0]!;
    send({ t: 'land', ac: a.id, runway: rw }, `Land ${AIRPORT.runways[rw].name}`, '🛬');
    return;
  }
  useGame.getState().set({ pick: { kind: 'runway', ac: a.id, purpose: 'land' } });
  audio.play('open');
}

export function actionPark(id: string) {
  const a = ac(id);
  if (!a || !game.world) return;
  if (isKids()) {
    const g = bestGate(game.world, a, a.y < 1100 ? 'N' : 'S');
    if (!g) return fail('No free gate fits this aircraft yet — wait for one to leave');
    send({ t: 'park', ac: a.id, gate: g }, `Park at ${AIRPORT.gateById[g]!.label}`, '🅿️');
    return;
  }
  useGame.getState().set({ pick: { kind: 'gate', ac: a.id, purpose: 'park' } });
  audio.play('open');
}

export function actionTaxi(id: string) {
  const a = ac(id);
  if (!a || !game.world) return;
  const runways = game.world.config.runways;
  if (runways.length === 1 || isKids()) {
    const rw = isKids() ? bestRunwayForDeparture(game.world, a) : runways[0]!;
    send({ t: 'taxi', ac: a.id, runway: rw }, `Taxi to ${AIRPORT.runways[rw].name}`, '➡️');
    return;
  }
  useGame.getState().set({ pick: { kind: 'runway', ac: a.id, purpose: 'taxi' } });
  audio.play('open');
}

export function actionPushback(id: string) {
  const a = ac(id);
  if (!a) return;
  if (send({ t: 'pushback', ac: a.id }, 'Push back', '⏪')) audio.play('pushback');
}

export function takeoffRisk(a: Aircraft): string | null {
  const w = game.world;
  if (!w || !a.runway) return null;
  if (w.rules.protectArrivals || w.rules.safeRunway) return null;
  const rw = AIRPORT.runways[a.runway];
  const close = arrivalsOnFinal(w, a.runway).filter((x) => rw.touchdownX - x.x < 4300);
  if (close.length) return `${close[0]!.callsign} is on final for ${rw.name}`;
  return null;
}

export function actionTakeoff(id: string, force = false) {
  const a = ac(id);
  if (!a) return;
  const risk = takeoffRisk(a);
  if (risk && !force && useProfile.getState().settings.confirmPro) {
    useGame.getState().set({ confirm: { text: `${risk}. Taking off now may force it to go around.`, ac: a.id } });
    audio.play('warning');
    return;
  }
  send({ t: 'takeoff', ac: a.id }, 'Take off', '🛫');
}

export function actionHold(id: string) {
  const a = ac(id);
  if (!a) return;
  if (a.holdPos) send({ t: 'resume', ac: a.id }, 'Continue', '▶️');
  else send({ t: 'hold', ac: a.id }, 'Hold', '✋');
}

export function actionGoAround(id: string) {
  const a = ac(id);
  if (!a) return;
  send({ t: 'goAround', ac: a.id }, 'Go around', '🔄');
}

export function pickGate(gateId: string) {
  const ui = useGame.getState();
  const p = ui.pick;
  if (!p || p.kind !== 'gate') return;
  send({ t: 'park', ac: p.ac, gate: gateId }, `Park at ${AIRPORT.gateById[gateId]?.label}`, '🅿️');
}

export function pickRunway(rw: RunwayId) {
  const ui = useGame.getState();
  const p = ui.pick;
  if (!p || p.kind !== 'runway') return;
  if (p.purpose === 'land') send({ t: 'land', ac: p.ac, runway: rw }, `Land ${AIRPORT.runways[rw].name}`, '🛬');
  else send({ t: 'taxi', ac: p.ac, runway: rw }, `Taxi to ${AIRPORT.runways[rw].name}`, '➡️');
}

/** Turn a hand-drawn line into via-points snapped to taxiway nodes. */
export function snapDrag(pts: number[]): string[] {
  const ids = snappableNodes();
  const out: string[] = [];
  for (let i = 0; i < pts.length; i += 2) {
    const n = nearestNode(pts[i]!, pts[i + 1]!, 75, ids);
    if (n && out[out.length - 1] !== n) out.push(n);
  }
  return out;
}

export function finishDrag(acId: string, pts: number[], endGate: string | null, endRunway: RunwayId | null) {
  const a = ac(acId);
  if (!a || !game.world) return;
  const via = snapDrag(pts).filter((n) => AIRPORT.nodes[n]?.kind !== 'hold');
  const arrival = ['inbound', 'holding', 'approach', 'goAround', 'landing', 'vacated', 'taxiIn'].includes(a.phase);
  if (arrival) {
    const gate = endGate;
    if (!gate) return fail('Drag the line to a parking gate');
    const cmd: Command = { t: 'park', ac: a.id, gate, via: a.phase === 'vacated' || a.phase === 'taxiIn' ? via : undefined };
    const v = game.canIssue(cmd);
    if (v.ok) return void send(cmd, `Park at ${AIRPORT.gateById[gate]?.label}`, '🅿️');
    const plain: Command = { t: 'park', ac: a.id, gate };
    if (game.canIssue(plain).ok) {
      useGame.getState().toast({ kind: 'info', title: 'Route adjusted', text: 'Snapped to the nearest valid taxiways', icon: '🧭' });
      return void send(plain, `Park at ${AIRPORT.gateById[gate]?.label}`, '🅿️');
    }
    return fail(v.ok ? 'Not possible' : v.reason);
  }
  const rw = endRunway;
  if (!rw) return fail('Drag the line to a runway holding point');
  const cmd: Command = { t: 'taxi', ac: a.id, runway: rw, via };
  if (game.canIssue(cmd).ok) return void send(cmd, `Taxi to ${AIRPORT.runways[rw].name}`, '➡️');
  const plain: Command = { t: 'taxi', ac: a.id, runway: rw };
  const v2 = game.canIssue(plain);
  if (v2.ok) {
    useGame.getState().toast({ kind: 'info', title: 'Route adjusted', text: 'Snapped to the nearest valid taxiways', icon: '🧭' });
    return void send(plain, `Taxi to ${AIRPORT.runways[rw].name}`, '➡️');
  }
  fail(v2.reason);
}

export function canDragRoute(a: Aircraft) {
  return ['vacated', 'taxiIn', 'readyTaxi', 'taxiOut', 'parked', 'holding', 'inbound', 'approach', 'landing'].includes(a.phase);
}

export function selectAircraft(id: string | null, focus = false) {
  const ui = useGame.getState();
  if (id === ui.selected && !focus) return;
  ui.set({ selected: id, pick: ui.pick && ui.pick.ac === id ? ui.pick : null });
  if (id) {
    audio.play('select');
    const narrow = typeof window !== 'undefined' && window.innerWidth < 640;
    if (narrow && focus) ui.set({ boardOpen: false });
    if (focus) {
      const a = ac(id);
      if (a && game.renderer) {
        const cam = game.renderer.camera;
        const z = Math.max(cam.zoom, 0.55);
        // keep the aircraft above the bottom sheet on phones
        cam.focus(a.x, a.y + (narrow ? 120 / z : 0), z);
      }
    }
  }
}

export function cycleAircraft(dir = 1) {
  const w = game.world;
  if (!w) return;
  const list = w.aircraft.filter((a) => a.phase !== 'departed' && a.phase !== 'diverted' && a.phase !== 'climbOut');
  if (!list.length) return;
  const att = list.filter((a) => game.attention.has(a.id));
  const pool = att.length ? att : list;
  const cur = useGame.getState().selected;
  const i = pool.findIndex((a) => a.id === cur);
  const next = pool[(i + dir + pool.length) % pool.length]!;
  selectAircraft(next.id, true);
}
