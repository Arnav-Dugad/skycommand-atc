import { AIRCRAFT, AIRCRAFT_BY_ID, CITIES, LIVERIES, SPECIAL_LIVERY, SIZE_ORDER, getType } from './aircraft';
import { AIRPORT, standStopY, type RunwayId } from './airport';
import { datan2 } from './dmath';
import { makeRng, next, int, pick, range, weighted, hashString } from './rng';
import { DT, TICK_HZ, type Aircraft, type Flight, type GameMode, type ModeRules, type Weather, type World, type WorldConfig } from './types';

export const SIM_VERSION = 3;

export const MODE_RULES: Record<GameMode, ModeRules> = {
  kids: {
    spawnMin: 40, spawnMax: 55, maxActive: 4, maxAirborne: 2, initialParked: 1,
    arrivalSpacing: 3200, safeRunway: true, protectArrivals: true, wake: false, fuel: false,
    emergencies: false, weather: true, severeWeather: false, happinessGameOver: false,
    penalties: 0, durationTicks: 0, autoSpawn: true,
  },
  casual: {
    spawnMin: 30, spawnMax: 46, maxActive: 9, maxAirborne: 4, initialParked: 2,
    arrivalSpacing: 3200, safeRunway: false, protectArrivals: true, wake: false, fuel: false,
    emergencies: false, weather: true, severeWeather: false, happinessGameOver: false,
    penalties: 0.6, durationTicks: 0, autoSpawn: true,
  },
  pro: {
    spawnMin: 19, spawnMax: 30, maxActive: 16, maxAirborne: 7, initialParked: 3,
    arrivalSpacing: 2800, safeRunway: false, protectArrivals: false, wake: true, fuel: true,
    emergencies: true, weather: true, severeWeather: true, happinessGameOver: true,
    penalties: 1, durationTicks: 0, autoSpawn: true,
  },
  daily: {
    spawnMin: 22, spawnMax: 32, maxActive: 14, maxAirborne: 6, initialParked: 3,
    arrivalSpacing: 3000, safeRunway: false, protectArrivals: true, wake: true, fuel: true,
    emergencies: true, weather: true, severeWeather: false, happinessGameOver: false,
    penalties: 1, durationTicks: 360 * TICK_HZ, autoSpawn: true,
  },
  sandbox: {
    spawnMin: 34, spawnMax: 50, maxActive: 24, maxAirborne: 10, initialParked: 2,
    arrivalSpacing: 3200, safeRunway: false, protectArrivals: true, wake: false, fuel: false,
    emergencies: false, weather: false, severeWeather: false, happinessGameOver: false,
    penalties: 0, durationTicks: 0, autoSpawn: true,
  },
  menu: {
    spawnMin: 14, spawnMax: 22, maxActive: 10, maxAirborne: 4, initialParked: 4,
    arrivalSpacing: 3200, safeRunway: false, protectArrivals: true, wake: false, fuel: false,
    emergencies: false, weather: false, severeWeather: false, happinessGameOver: false,
    penalties: 0, durationTicks: 0, autoSpawn: true,
  },
};

export const ALL_RUNWAYS: RunwayId[] = ['R1', 'R2'];

/** Fixed, fully unlocked configuration used for verified daily challenges. */
export function dailyConfig(dateKey: string): WorldConfig {
  return {
    mode: 'daily',
    seed: hashString(`skycommand-daily-${dateKey}`),
    openGates: AIRPORT.gates.filter((g) => g.unlockLevel <= 5).map((g) => g.id),
    runways: ['R1', 'R2'],
    allowedTypes: ['atr72', 'e190', 'a320', 'b737', 'a321', 'b787', 'a350', 'b777'],
    specialTypes: [],
    weatherKinds: ['clear', 'cloudy', 'rain', 'fog'],
    startMinutes: 6 * 60,
    version: SIM_VERSION,
  };
}

export function createWorld(config: WorldConfig, rulesOverride?: Partial<ModeRules>): World {
  const rules = { ...MODE_RULES[config.mode], ...rulesOverride };
  const world: World = {
    config,
    rules,
    tick: 0,
    rng: makeRng(config.seed),
    aircraft: [],
    flights: [],
    nextFlightNo: 1,
    nextAcNo: 1,
    nextSpawnTick: 3 * TICK_HZ,
    runways: {
      R1: { owner: null, ownerKind: null, arrivals: [], cooldownUntil: 0, lastCat: 'M' },
      R2: { owner: null, ownerKind: null, arrivals: [], cooldownUntil: 0, lastCat: 'M' },
    },
    gateRes: {},
    nodeLocks: {},
    weather: 'clear',
    weatherUntil: 90 * TICK_HZ,
    score: {
      points: 0, coins: 0, xp: 0, arrivals: 0, departures: 0, goArounds: 0, diversions: 0,
      onTime: 0, late: 0, totalDelay: 0, emergenciesHandled: 0, happiness: 75, maxSimultaneous: 0,
      heavyHandled: 0, daysCompleted: 0, bestDayStars: 0,
    },
    events: [],
    over: false,
    day: 0,
    dayFlights: 0,
    autoSpawn: rules.autoSpawn,
    timeOffset: 0,
    cmdSeq: 1,
    lastHappinessTick: 0,
  };
  for (let i = 0; i < rules.initialParked; i++) spawnParked(world);
  return world;
}

export function nowSec(world: World): number {
  return world.tick * DT;
}

/** Game clock in minutes of day (1 sim second = 1 game minute). */
export function clockMinutes(world: World): number {
  const m = world.config.startMinutes + world.timeOffset + world.tick * DT;
  return ((m % 1440) + 1440) % 1440;
}

/** 0 = full day, 1 = full night */
export function nightAmount(minutes: number): number {
  const h = minutes / 60;
  if (h >= 7 && h <= 18.5) return 0;
  if (h > 18.5 && h < 20.5) return (h - 18.5) / 2;
  if (h >= 20.5 || h < 5) return 1;
  return 1 - (h - 5) / 2; // 5..7 sunrise
}

export function openGateList(world: World) {
  return AIRPORT.gates.filter((g) => world.config.openGates.includes(g.id));
}

export function gateFits(gateCat: string, typeId: string): boolean {
  const t = getType(typeId);
  return SIZE_ORDER[gateCat as keyof typeof SIZE_ORDER] >= SIZE_ORDER[t.cat];
}

function chooseType(world: World, special: boolean): string {
  const pool = special ? world.config.specialTypes : world.config.allowedTypes;
  const openGates = openGateList(world);
  const fits = pool.filter((id) => AIRCRAFT_BY_ID[id] && openGates.some((g) => gateFits(g.cat, id)));
  if (fits.length === 0) return 'a320';
  return weighted(
    world.rng,
    fits.map((id) => {
      const t = getType(id);
      const w = t.cat === 'S' ? 3 : t.cat === 'M' ? 4 : t.cat === 'H' ? 1.6 : 0.8;
      return { item: id, w };
    }),
  );
}

function makeFlight(world: World, typeId: string, special: boolean, departureOnly: boolean): Flight {
  const livery = special ? SPECIAL_LIVERY : pick(world.rng, LIVERIES);
  const t = getType(typeId);
  let callsign = '';
  for (let tries = 0; tries < 20; tries++) {
    callsign = `${livery.code}${int(world.rng, 101, 989)}`;
    if (!world.flights.some((f) => f.callsign === callsign && f.status !== 'departed' && f.status !== 'diverted')) break;
  }
  const now = nowSec(world);
  const flight: Flight = {
    id: `F${world.nextFlightNo++}`,
    callsign,
    airline: livery.name,
    liveryId: livery.id,
    typeId,
    origin: pick(world.rng, CITIES),
    dest: pick(world.rng, CITIES),
    pax: int(world.rng, t.paxMin, t.paxMax),
    schedArr: now + 90,
    schedDep: now + 90 + 150 + t.turnaround + 150 + int(world.rng, 0, 40),
    status: 'inbound',
    special,
    departureOnly,
  };
  if (flight.dest === flight.origin) flight.dest = CITIES[(CITIES.indexOf(flight.origin) + 7) % CITIES.length]!;
  world.flights.push(flight);
  if (world.flights.length > 80) {
    // keep the board compact: drop oldest finished flights
    const idx = world.flights.findIndex((f) => f.status === 'departed' || f.status === 'diverted');
    if (idx >= 0) world.flights.splice(idx, 1);
  }
  return flight;
}

function baseAircraft(world: World, flight: Flight): Aircraft {
  return {
    id: `A${world.nextAcNo++}`,
    flightId: flight.id,
    callsign: flight.callsign,
    typeId: flight.typeId,
    liveryId: flight.liveryId,
    phase: 'inbound',
    phaseTime: 0,
    x: 0,
    y: 0,
    h: 0,
    v: 0,
    alt: 0,
    holdLevel: 0,
    holdAngle: 0,
    s: 0,
    holdPos: false,
    locks: [],
    waitTime: 0,
    takeoffCleared: false,
    pushbackRequested: false,
    pax: flight.pax,
    fuel: 9999,
    goArounds: 0,
    holdingTime: 0,
    special: flight.special,
  };
}

export function spawnArrival(world: World, forcedType?: string): Aircraft | null {
  const special = !forcedType && world.config.specialTypes.length > 0 && next(world.rng) < 0.07;
  const typeId = forcedType ?? chooseType(world, special);
  const flight = makeFlight(world, typeId, special || !!getType(typeId).special, false);
  const ac = baseAircraft(world, flight);
  flight.acId = ac.id;
  // pick the least-busy hold fix (deterministic)
  const fixes = AIRPORT.holdFixes;
  let best = fixes[0]!;
  let bestLoad = Infinity;
  const offset = int(world.rng, 0, fixes.length - 1);
  for (let i = 0; i < fixes.length; i++) {
    const f = fixes[(i + offset) % fixes.length]!;
    const load = world.aircraft.filter((a) => a.fix === f.id && (a.phase === 'holding' || a.phase === 'inbound')).length;
    if (load < bestLoad) {
      bestLoad = load;
      best = f;
    }
  }
  const cx = 1550;
  const cy = 1100;
  const dx = best.x - cx;
  const dy = best.y - cy;
  const dl = Math.sqrt(dx * dx + dy * dy) || 1;
  const spread = range(world.rng, -0.35, 0.35);
  const ux = dx / dl - (dy / dl) * spread;
  const uy = dy / dl + (dx / dl) * spread;
  ac.x = best.x + ux * 1500;
  ac.y = best.y + uy * 1500;
  const hx = best.x - ac.x;
  const hy = best.y - ac.y;
  ac.h = headingOf(hx, hy);
  ac.v = 150;
  ac.alt = 1;
  ac.fix = best.id;
  ac.exitDir = range(world.rng, -0.7, 0.7);
  if (world.rules.fuel) ac.fuel = range(world.rng, 170, 330);
  if (world.rules.emergencies && next(world.rng) < 0.08) {
    const kind = pick(world.rng, ['medical', 'engine', 'fuel'] as const);
    ac.emergency = { kind, deadline: world.tick + 160 * TICK_HZ };
    flight.emergency = kind;
    if (kind === 'fuel') ac.fuel = Math.min(ac.fuel, 110);
    world.events.push({ t: 'emergency', ac: ac.id, callsign: ac.callsign, kind });
  }
  world.aircraft.push(ac);
  world.events.push({ t: 'spawn', ac: ac.id, callsign: ac.callsign });
  world.events.push({ t: 'requestLand', ac: ac.id, callsign: ac.callsign });
  return ac;
}

function headingOf(dx: number, dy: number): number {
  return datan2(dy, dx);
}

/** Aircraft already at a gate when the shift starts (gives immediate departures). */
export function spawnParked(world: World): Aircraft | null {
  const free = openGateList(world).filter((g) => !world.gateRes[g.id]);
  if (free.length === 0) return null;
  const gate = free[int(world.rng, 0, free.length - 1)]!;
  const candidates = world.config.allowedTypes.filter((id) => AIRCRAFT_BY_ID[id] && gateFits(gate.cat, id));
  const typeId = candidates.length ? pick(world.rng, candidates) : 'a320';
  const flight = makeFlight(world, typeId, false, true);
  const t = getType(typeId);
  const now = nowSec(world);
  flight.schedArr = now - 30;
  flight.schedDep = now + t.turnaround * 0.6 + 230 + int(world.rng, 0, 60);
  flight.status = 'boarding';
  const ac = baseAircraft(world, flight);
  flight.acId = ac.id;
  ac.phase = 'parked';
  ac.gate = gate.id;
  world.gateRes[gate.id] = ac.id;
  ac.x = gate.x;
  ac.y = standStopY(gate, t.length);
  ac.h = gate.parkHeading;
  ac.exitDir = range(world.rng, -0.7, 0.7);
  const total = t.turnaround;
  const startT = range(world.rng, total * 0.3, total * 0.65);
  ac.turn = { stage: 'board', t: startT, total };
  world.aircraft.push(ac);
  return ac;
}

export function pickWeather(world: World): Weather {
  const kinds = world.config.weatherKinds.filter((k) => world.rules.severeWeather || k !== 'storm');
  if (kinds.length === 0) return 'clear';
  return weighted(
    world.rng,
    kinds.map((k) => ({ item: k, w: k === 'clear' ? 4 : k === 'cloudy' ? 3 : k === 'rain' ? 2 : 1 })),
  );
}

export function allTypesFor(level: number): string[] {
  return AIRCRAFT.filter((a) => !a.special && a.unlockLevel <= level).map((a) => a.id);
}
