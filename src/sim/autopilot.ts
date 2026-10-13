/**
 * A simple automatic controller. Drives the animated main-menu airport, powers the
 * Kids-mode "helper" suggestions and is used by soak tests to exercise the full
 * arrival → departure loop.
 */

import { getType, SIZE_ORDER } from './aircraft';
import { AIRPORT, type RunwayId } from './airport';
import { validate } from './commands';
import type { Aircraft, Command, World } from './types';
import { gateFits } from './world';

export function bestGate(world: World, ac: Aircraft, preferSide?: 'N' | 'S'): string | null {
  const t = getType(ac.typeId);
  const candidates = AIRPORT.gates
    .filter((g) => world.config.openGates.includes(g.id) && !world.gateRes[g.id] && gateFits(g.cat, ac.typeId))
    // smallest fitting gate first, then preferred side, then nearest to the east (shorter taxi)
    .sort((a, b) => {
      const sa = SIZE_ORDER[a.cat] - SIZE_ORDER[t.cat];
      const sb = SIZE_ORDER[b.cat] - SIZE_ORDER[t.cat];
      if (sa !== sb) return sa - sb;
      const pa = a.side === preferSide ? 0 : 1;
      const pb = b.side === preferSide ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return b.x - a.x;
    });
  for (const g of candidates) {
    if (validate(world, { t: 'park', ac: ac.id, gate: g.id }).ok) return g.id;
  }
  return null;
}

export function bestRunwayForArrival(world: World, ac: Aircraft): RunwayId {
  const open = world.config.runways;
  if (open.length === 1) return open[0]!;
  let best: RunwayId = open[0]!;
  let bestScore = Infinity;
  for (const r of open) {
    const rw = AIRPORT.runways[r];
    const q = world.runways[r].arrivals.length;
    const score = q * 1000 + Math.abs(ac.y - rw.y);
    if (score < bestScore) {
      bestScore = score;
      best = r;
    }
  }
  return best;
}

export function bestRunwayForDeparture(world: World, ac: Aircraft): RunwayId {
  const open = world.config.runways;
  if (open.length === 1) return open[0]!;
  const gateY = ac.y;
  const north: RunwayId = 'R1';
  const south: RunwayId = 'R2';
  const pref = gateY < 1100 ? north : south;
  return open.includes(pref) ? pref : open[0]!;
}

/** True when no arrival will need this runway during the departure roll. */
export function departureSafe(world: World, ac: Aircraft): boolean {
  const rw = ac.runway;
  if (!rw) return false;
  const r = AIRPORT.runways[rw];
  if (world.runways[rw].owner && world.runways[rw].owner !== ac.id) return false;
  for (const a of world.aircraft) {
    if (a.phase !== 'approach' || a.approach?.runway !== rw) continue;
    if (a.approach.stage === 'final' && r.touchdownX - a.x < 4300) return false;
    if (a.approach.stage !== 'final' && Math.abs(a.x - (r.thresholdX - 3100)) < 600 && Math.abs(a.y - r.y) < 900) return false;
  }
  return true;
}

/** Suggest the single most useful next command (used for Kids hints). */
export function suggest(world: World): { cmd: Command; ac: Aircraft; text: string } | null {
  for (const ac of world.aircraft) {
    if (ac.phase === 'holdShort' && !ac.takeoffCleared) return { cmd: { t: 'takeoff', ac: ac.id }, ac, text: `${ac.callsign} is ready — tap it and press TAKE OFF!` };
  }
  for (const ac of world.aircraft) {
    if (ac.phase === 'vacated' && !ac.gate) {
      const g = bestGate(world, ac, ac.y < 1100 ? 'N' : 'S');
      if (g) return { cmd: { t: 'park', ac: ac.id, gate: g }, ac, text: `${ac.callsign} landed! Tap it, press PARK and pick a gate.` };
    }
  }
  for (const ac of world.aircraft) {
    if (ac.phase === 'readyTaxi') return { cmd: { t: 'taxi', ac: ac.id, runway: bestRunwayForDeparture(world, ac) }, ac, text: `${ac.callsign} wants to go! Tap it and press TAXI.` };
  }
  for (const ac of world.aircraft) {
    if (ac.phase === 'parked' && ac.turn?.stage === 'ready' && !ac.pushbackRequested) return { cmd: { t: 'pushback', ac: ac.id }, ac, text: `${ac.callsign} finished boarding. Press PUSH BACK!` };
  }
  for (const ac of world.aircraft) {
    if ((ac.phase === 'holding' || ac.phase === 'inbound') && validate(world, { t: 'land', ac: ac.id, runway: bestRunwayForArrival(world, ac) }).ok) {
      return { cmd: { t: 'land', ac: ac.id, runway: bestRunwayForArrival(world, ac) }, ac, text: `${ac.callsign} is waiting in the sky. Tap it and press LAND!` };
    }
  }
  return null;
}

/** Issue all reasonable commands (full automation). */
export function autopilotCommands(world: World): Command[] {
  const cmds: Command[] = [];
  const airborneQueued: Record<string, number> = { R1: 0, R2: 0 };
  for (const r of ['R1', 'R2'] as RunwayId[]) airborneQueued[r] = world.runways[r].arrivals.length;
  for (const ac of world.aircraft) {
    switch (ac.phase) {
      case 'inbound':
      case 'holding': {
        const rw = bestRunwayForArrival(world, ac);
        if (airborneQueued[rw]! >= 2) break;
        const g = ac.gate ?? bestGate(world, ac, rw === 'R1' ? 'N' : 'S');
        if (!g) break; // don't land without a gate to go to
        if (!ac.gate) cmds.push({ t: 'park', ac: ac.id, gate: g });
        cmds.push({ t: 'land', ac: ac.id, runway: rw });
        airborneQueued[rw]!++;
        break;
      }
      case 'vacated': {
        if (!ac.gate) {
          const g = bestGate(world, ac, ac.y < 1100 ? 'N' : 'S');
          if (g) cmds.push({ t: 'park', ac: ac.id, gate: g });
        }
        break;
      }
      case 'parked':
        if (ac.turn?.stage === 'ready' && !ac.pushbackRequested) {
          if (!ac.pendingTaxiRunway) cmds.push({ t: 'taxi', ac: ac.id, runway: bestRunwayForDeparture(world, ac) });
          cmds.push({ t: 'pushback', ac: ac.id });
        }
        break;
      case 'readyTaxi':
        cmds.push({ t: 'taxi', ac: ac.id, runway: bestRunwayForDeparture(world, ac) });
        break;
      case 'holdShort':
        if (!ac.takeoffCleared && departureSafe(world, ac)) cmds.push({ t: 'takeoff', ac: ac.id });
        break;
    }
  }
  return cmds;
}
