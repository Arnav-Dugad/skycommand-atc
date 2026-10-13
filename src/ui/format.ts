import { getType } from '../sim/aircraft';
import { AIRPORT } from '../sim/airport';
import type { Aircraft, Flight, World } from '../sim/types';
import { clockMinutes } from '../sim/world';

export function fmtClock(minutes: number) {
  const m = ((Math.floor(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** convert a sim time (seconds) to clock string */
export function simToClock(world: World, sec: number) {
  return fmtClock(world.config.startMinutes + world.timeOffset + sec);
}

export function nowClock(world: World) {
  return fmtClock(clockMinutes(world));
}

export const WEATHER_ICON: Record<string, string> = { clear: '☀️', cloudy: '⛅', rain: '🌧️', storm: '⛈️', fog: '🌫️' };
export const WEATHER_NAME: Record<string, string> = { clear: 'Clear', cloudy: 'Cloudy', rain: 'Rain', storm: 'Storm', fog: 'Fog' };

export function isDeparture(ac: Aircraft) {
  return ['parked', 'pushback', 'readyTaxi', 'taxiOut', 'holdShort', 'lineup', 'takeoff', 'climbOut', 'departed'].includes(ac.phase);
}

export interface StatusInfo {
  label: string;
  tone: 'blue' | 'amber' | 'green' | 'orange' | 'red' | 'violet' | 'slate';
  detail?: string;
}

export function statusOf(world: World, ac: Aircraft): StatusInfo {
  switch (ac.phase) {
    case 'inbound':
      return { label: 'Inbound', tone: 'blue', detail: 'Flying to the holding area' };
    case 'holding':
      return { label: 'Holding', tone: 'amber', detail: 'Circling — waiting to land' };
    case 'approach': {
      const rw = ac.approach ? AIRPORT.runways[ac.approach.runway].name : '';
      if (ac.approach?.stage === 'final') return { label: `Final ${rw}`, tone: 'green', detail: 'Lined up and descending' };
      if (ac.approach?.stage === 'delay') return { label: `Sequenced ${rw}`, tone: 'blue', detail: 'Waiting for spacing behind traffic' };
      return { label: `Approach ${rw}`, tone: 'blue', detail: 'Turning towards the runway' };
    }
    case 'goAround':
      return { label: 'Go-around', tone: 'red', detail: 'Climbing away to try again' };
    case 'landing':
      return { label: 'Landing roll', tone: 'green', detail: ac.gate ? `Then taxi to ${AIRPORT.gateById[ac.gate]?.label}` : 'Choose a gate!' };
    case 'vacated':
      return { label: 'Needs gate', tone: 'amber', detail: 'Off the runway, waiting for a gate' };
    case 'taxiIn':
      return { label: `Taxi to ${ac.gate ? AIRPORT.gateById[ac.gate]?.label : ''}`, tone: 'blue', detail: ac.holdPos ? 'Holding position' : ac.waitReason ?? 'Following the yellow line' };
    case 'parked': {
      const st = ac.turn?.stage;
      if (st === 'ready') return { label: ac.pushbackRequested ? 'Pushback soon' : 'Ready', tone: ac.pushbackRequested ? 'violet' : 'amber', detail: ac.pushbackRequested ? ac.waitReason ?? 'Waiting for a clear taxilane' : 'Boarding complete' };
      const lbl = st === 'deboard' ? 'Deplaning' : st === 'service' ? 'Servicing' : 'Boarding';
      return { label: lbl, tone: 'violet', detail: st === 'service' ? 'Refuelling and cleaning' : 'Passengers moving' };
    }
    case 'pushback':
      return { label: 'Pushback', tone: 'orange', detail: 'Tug pushing back' };
    case 'readyTaxi':
      return { label: 'Ready to taxi', tone: 'amber', detail: 'Choose a runway' };
    case 'taxiOut':
      return { label: `Taxi ${ac.runway ? AIRPORT.runways[ac.runway].name : ''}`, tone: 'orange', detail: ac.holdPos ? 'Holding position' : ac.takeoffCleared ? 'Cleared for take-off' : ac.waitReason ?? 'Heading to the runway' };
    case 'holdShort':
      return { label: ac.takeoffCleared ? 'Waiting' : 'Ready', tone: ac.takeoffCleared ? 'orange' : 'amber', detail: ac.takeoffCleared ? ac.waitReason ?? 'Cleared — waiting for runway' : 'Holding short, ready for take-off' };
    case 'lineup':
      return { label: 'Lining up', tone: 'orange' };
    case 'takeoff':
      return { label: 'Take-off roll', tone: 'green' };
    case 'climbOut':
      return { label: 'Departed', tone: 'green', detail: 'Climbing away' };
    case 'departed':
      return { label: 'Departed', tone: 'slate' };
    case 'diverted':
      return { label: 'Diverted', tone: 'red' };
  }
  void world;
}

export const TONE: Record<StatusInfo['tone'], string> = {
  blue: 'bg-sky-400/18 text-sky-200',
  amber: 'bg-amber-300/20 text-amber-200',
  green: 'bg-emerald-400/18 text-emerald-200',
  orange: 'bg-orange-400/18 text-orange-200',
  red: 'bg-rose-500/22 text-rose-200',
  violet: 'bg-violet-400/20 text-violet-200',
  slate: 'bg-white/10 text-white/60',
};

export function flightStatus(f: Flight) {
  return f.status;
}

export function typeName(ac: Aircraft) {
  return getType(ac.typeId).name;
}
