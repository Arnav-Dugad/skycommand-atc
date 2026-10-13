/**
 * Player commands. Every command is validated against the current world state
 * before it is applied; invalid commands are rejected with a friendly reason and
 * never change state. Replays only need the accepted commands plus the seed.
 */

import { AIRCRAFT_BY_ID } from './aircraft';
import { AIRPORT, type RunwayId } from './airport';
import {
  AIRBORNE,
  divert as _divert,
  findAc,
  goAround,
  planGateRoute,
  planRunwayRoute,
  setPhase,
  startTaxiOut,
  startTaxiToGate,
} from './engine';
import { DT, type Aircraft, type Command, type CommandResult, type World } from './types';
import { gateFits, spawnArrival } from './world';

void _divert;

const ARRIVAL_PRE_GATE = new Set(['inbound', 'holding', 'approach', 'goAround', 'landing', 'vacated', 'taxiIn']);

export type Validation = { ok: true } | { ok: false; reason: string };
const OK: Validation = { ok: true };
const no = (reason: string): Validation => ({ ok: false, reason });

function runwayOpen(world: World, rw: RunwayId) {
  return world.config.runways.includes(rw);
}

export function gateAvailable(world: World, ac: Aircraft, gateId: string): Validation {
  const gate = AIRPORT.gateById[gateId];
  if (!gate) return no('Unknown gate');
  if (!world.config.openGates.includes(gateId)) return no('Gate is locked — unlock it in the Hangar');
  const holder = world.gateRes[gateId];
  if (holder && holder !== ac.id) return no('Gate is occupied');
  if (!gateFits(gate.cat, ac.typeId)) return no('Aircraft is too big for this gate');
  return OK;
}

export function validate(world: World, cmd: Command): Validation {
  if (world.over) return no('Session has ended');
  switch (cmd.t) {
    case 'spawn': {
      if (world.config.mode !== 'sandbox') return no('Only available in Sandbox');
      if (!AIRCRAFT_BY_ID[cmd.typeId]) return no('Unknown aircraft');
      if (world.aircraft.length >= 28) return no('The sky is full!');
      return OK;
    }
    case 'setWeather':
      if (world.config.mode !== 'sandbox') return no('Only available in Sandbox');
      if (!['clear', 'cloudy', 'rain', 'storm', 'fog'].includes(cmd.weather)) return no('Unknown weather');
      return OK;
    case 'setTime':
      if (world.config.mode !== 'sandbox') return no('Only available in Sandbox');
      if (!Number.isFinite(cmd.minutes)) return no('Invalid time');
      return OK;
    case 'setAutoSpawn':
      if (world.config.mode !== 'sandbox') return no('Only available in Sandbox');
      return OK;
    default:
      break;
  }
  const ac = findAc(world, cmd.ac);
  if (!ac) return no('Aircraft not found');
  switch (cmd.t) {
    case 'land': {
      if (!runwayOpen(world, cmd.runway)) return no('Runway is closed');
      if (ac.phase === 'approach') {
        if (ac.approach?.stage === 'final') return no('Already on final approach');
        if (ac.approach?.runway === cmd.runway) return no('Already cleared to land');
        return OK; // switching runway before final
      }
      if (!['inbound', 'holding', 'goAround'].includes(ac.phase)) return no('Not able to land right now');
      if (ac.phase === 'goAround' && ac.phaseTime < 8) return no('Climbing out — try again in a moment');
      return OK;
    }
    case 'goAround':
      if (ac.phase !== 'approach') return no('Only aircraft on approach can go around');
      if (ac.alt <= 0.0) return no('Already on the runway');
      return OK;
    case 'hold':
      if (ac.phase === 'approach' && ac.approach?.stage !== 'final') return OK;
      if (ac.phase === 'approach') return no('On final — use Go around instead');
      if (['taxiIn', 'taxiOut'].includes(ac.phase)) return ac.holdPos ? no('Already holding') : OK;
      if (ac.phase === 'inbound' || ac.phase === 'holding') return no('Already holding');
      return no('Cannot hold right now');
    case 'resume':
      if (!ac.holdPos) return no('Not holding');
      return OK;
    case 'park': {
      if (!ARRIVAL_PRE_GATE.has(ac.phase)) return no('This aircraft is not arriving');
      const g = gateAvailable(world, ac, cmd.gate);
      if (!g.ok) return g;
      if (ac.phase === 'vacated' || ac.phase === 'taxiIn') {
        const route = planGateRoute(ac, cmd.gate, cmd.via);
        if (!route) return no(cmd.via?.length ? 'That route does not follow the taxiways' : 'No taxi route to that gate');
      }
      return OK;
    }
    case 'taxi': {
      if (!runwayOpen(world, cmd.runway)) return no('Runway is closed');
      if (ac.phase === 'parked' || ac.phase === 'pushback') return OK; // pre-assigned, runs after pushback
      if (ac.phase !== 'readyTaxi' && ac.phase !== 'taxiOut') return no('Not ready to taxi for departure');
      if (ac.phase === 'taxiOut' && ac.runway === cmd.runway && !cmd.via?.length) return no('Already taxiing there');
      const route = planRunwayRoute(ac, cmd.runway, cmd.via);
      if (!route) return no(cmd.via?.length ? 'That route does not follow the taxiways' : 'No route from here — try the other runway');
      return OK;
    }
    case 'pushback':
      if (ac.phase !== 'parked') return no('Not at a gate');
      if (ac.turn?.stage !== 'ready') return no(ac.pushbackRequested ? 'Pushback already requested' : 'Still boarding passengers');
      if (ac.pushbackRequested) return no('Pushback already requested');
      return OK;
    case 'takeoff':
      if (ac.phase !== 'holdShort' && ac.phase !== 'taxiOut') return no('Taxi to a runway first');
      if (ac.takeoffCleared) return no('Already cleared for take-off');
      return OK;
    case 'cancel': {
      const p = ac.pendingList?.[ac.pendingList.length - 1];
      if (!p) return no('Nothing to undo');
      return OK;
    }
  }
  return no('Unknown command');
}

function pushPending(world: World, ac: Aircraft, kind: 'land' | 'park' | 'taxi' | 'pushback' | 'takeoff'): number {
  const id = world.cmdSeq++;
  ac.pendingList = (ac.pendingList ?? []).filter((p) => p.kind !== kind);
  ac.pendingList.push({ cmdId: id, kind });
  return id;
}

function clearPendingKind(ac: Aircraft, kind: string) {
  if (ac.pendingList) ac.pendingList = ac.pendingList.filter((p) => p.kind !== kind);
}

function cancelApproach(world: World, ac: Aircraft) {
  const rw = ac.approach?.runway;
  if (rw) {
    const rs = world.runways[rw];
    const i = rs.arrivals.indexOf(ac.id);
    if (i >= 0) rs.arrivals.splice(i, 1);
    if (rs.owner === ac.id) {
      rs.owner = null;
      rs.ownerKind = null;
    }
  }
  ac.approach = undefined;
  let best = AIRPORT.holdFixes[0]!;
  let bd = Infinity;
  for (const f of AIRPORT.holdFixes) {
    const d = (f.x - ac.x) * (f.x - ac.x) + (f.y - ac.y) * (f.y - ac.y);
    if (d < bd) {
      bd = d;
      best = f;
    }
  }
  ac.fix = best.id;
  setPhase(world, ac, 'inbound');
}

export function issue(world: World, cmd: Command): CommandResult {
  const v = validate(world, cmd);
  if (!v.ok) return { ok: false, reason: v.reason };
  switch (cmd.t) {
    case 'spawn':
      spawnArrival(world, cmd.typeId);
      return { ok: true };
    case 'setWeather':
      world.weather = cmd.weather;
      world.weatherUntil = world.tick + 400 * 20;
      world.events.push({ t: 'weather', weather: cmd.weather });
      return { ok: true };
    case 'setTime': {
      const cur = (world.config.startMinutes + world.tick * DT) % 1440;
      world.timeOffset = (((cmd.minutes - cur) % 1440) + 1440) % 1440;
      return { ok: true };
    }
    case 'setAutoSpawn':
      world.autoSpawn = cmd.on;
      return { ok: true };
    default:
      break;
  }
  const ac = findAc(world, cmd.ac)!;
  switch (cmd.t) {
    case 'land': {
      if (ac.phase === 'approach') cancelApproach(world, ac);
      const rs = world.runways[cmd.runway];
      setPhase(world, ac, 'approach');
      const side: 1 | -1 = ac.y < AIRPORT.runways[cmd.runway].y ? -1 : 1;
      ac.approach = { runway: cmd.runway, stage: 'vector', side, delayAngle: 0 };
      if (!rs.arrivals.includes(ac.id)) rs.arrivals.push(ac.id);
      const fl = world.flights.find((f) => f.id === ac.flightId);
      if (fl) fl.status = 'landing';
      world.events.push({ t: 'cleared', ac: ac.id, callsign: ac.callsign, what: `to land runway ${AIRPORT.runways[cmd.runway].name}` });
      return { ok: true, cmdId: pushPending(world, ac, 'land') };
    }
    case 'goAround':
      goAround(world, ac, 'Instructed by tower');
      return { ok: true };
    case 'hold':
      if (ac.phase === 'approach') {
        cancelApproach(world, ac);
        clearPendingKind(ac, 'land');
      } else ac.holdPos = true;
      return { ok: true };
    case 'resume':
      ac.holdPos = false;
      return { ok: true };
    case 'park': {
      if (ac.gate && ac.gate !== cmd.gate && world.gateRes[ac.gate] === ac.id) delete world.gateRes[ac.gate];
      ac.gate = cmd.gate;
      world.gateRes[cmd.gate] = ac.id;
      const id = pushPending(world, ac, 'park');
      if (ac.phase === 'vacated' || ac.phase === 'taxiIn') {
        startTaxiToGate(world, ac, cmd.via);
        return { ok: true };
      }
      world.events.push({ t: 'cleared', ac: ac.id, callsign: ac.callsign, what: `gate ${AIRPORT.gateById[cmd.gate]!.label} after landing` });
      return { ok: true, cmdId: id };
    }
    case 'taxi': {
      if (ac.phase === 'parked' || ac.phase === 'pushback') {
        ac.pendingTaxiRunway = cmd.runway;
        ac.pendingVia = cmd.via;
        return { ok: true, cmdId: pushPending(world, ac, 'taxi') };
      }
      startTaxiOut(world, ac, cmd.runway, cmd.via);
      return { ok: true };
    }
    case 'pushback': {
      ac.pushbackRequested = true;
      return { ok: true, cmdId: pushPending(world, ac, 'pushback') };
    }
    case 'takeoff': {
      ac.takeoffCleared = true;
      world.events.push({ t: 'cleared', ac: ac.id, callsign: ac.callsign, what: 'for take-off' });
      return { ok: true, cmdId: pushPending(world, ac, 'takeoff') };
    }
    case 'cancel': {
      const p = ac.pendingList!.pop()!;
      switch (p.kind) {
        case 'land':
          if (ac.phase === 'approach' && ac.approach?.stage !== 'final') cancelApproach(world, ac);
          break;
        case 'park':
          if (ac.gate && AIRBORNE.has(ac.phase)) {
            if (world.gateRes[ac.gate] === ac.id) delete world.gateRes[ac.gate];
            ac.gate = undefined;
          } else if (ac.gate && ac.phase === 'landing') {
            if (world.gateRes[ac.gate] === ac.id) delete world.gateRes[ac.gate];
            ac.gate = undefined;
          }
          break;
        case 'taxi':
          ac.pendingTaxiRunway = undefined;
          ac.pendingVia = undefined;
          break;
        case 'pushback':
          if (ac.phase === 'parked') ac.pushbackRequested = false;
          break;
        case 'takeoff':
          if (ac.phase === 'holdShort' || ac.phase === 'taxiOut') ac.takeoffCleared = false;
          break;
      }
      return { ok: true };
    }
  }
  return { ok: false, reason: 'Unknown command' };
}

/** Which buttons make sense for this aircraft right now (UI helper). */
export function availableActions(world: World, ac: Aircraft) {
  const tryCmd = (c: Command) => validate(world, c);
  const rw = world.config.runways[0] ?? 'R1';
  return {
    land: ['inbound', 'holding', 'goAround'].includes(ac.phase) || (ac.phase === 'approach' && ac.approach?.stage !== 'final'),
    goAround: tryCmd({ t: 'goAround', ac: ac.id }).ok,
    hold: tryCmd({ t: 'hold', ac: ac.id }).ok,
    resume: ac.holdPos,
    park: ARRIVAL_PRE_GATE.has(ac.phase),
    taxi: ['parked', 'pushback', 'readyTaxi', 'taxiOut'].includes(ac.phase) && tryCmd({ t: 'taxi', ac: ac.id, runway: rw }).ok !== undefined,
    pushback: ac.phase === 'parked',
    pushbackReady: tryCmd({ t: 'pushback', ac: ac.id }).ok,
    takeoff: tryCmd({ t: 'takeoff', ac: ac.id }).ok,
    undo: !!ac.pendingList?.length,
  };
}
