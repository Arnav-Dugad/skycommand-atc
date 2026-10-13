import type { RunwayId } from './airport';
import type { Path } from './path';
import type { RngState } from './rng';

export const TICK_HZ = 20;
export const DT = 1 / TICK_HZ;

export type GameMode = 'kids' | 'casual' | 'pro' | 'sandbox' | 'daily' | 'menu';

export type Weather = 'clear' | 'cloudy' | 'rain' | 'storm' | 'fog';

export type Phase =
  | 'inbound'
  | 'holding'
  | 'approach'
  | 'goAround'
  | 'landing'
  | 'vacated'
  | 'taxiIn'
  | 'parked'
  | 'pushback'
  | 'readyTaxi'
  | 'taxiOut'
  | 'holdShort'
  | 'lineup'
  | 'takeoff'
  | 'climbOut'
  | 'departed'
  | 'diverted';

export type ApproachStage = 'vector' | 'delay' | 'final';
export type TurnStage = 'deboard' | 'service' | 'board' | 'ready';

export interface Aircraft {
  id: string;
  flightId: string;
  callsign: string;
  typeId: string;
  liveryId: string;
  phase: Phase;
  phaseTime: number;
  x: number;
  y: number;
  h: number;
  v: number;
  alt: number; // 0 = ground, 1 = ~3000ft
  // airborne guidance
  fix?: string;
  holdLevel: number;
  holdAngle: number;
  approach?: { runway: RunwayId; stage: ApproachStage; side: 1 | -1; delayAngle: number };
  goAroundTo?: { x: number; y: number };
  exitDir?: number;
  // ground
  path?: Path;
  s: number;
  route?: import("./path").PathCtrl[];
  pathKind?: 'landing' | 'taxiIn' | 'stand' | 'pushback' | 'taxiOut' | 'lineup' | 'takeoff';
  holdPos: boolean;
  locks: string[];
  waitReason?: string;
  waitTime: number;
  exitIndex?: number;
  // assignments
  gate?: string;
  runway?: RunwayId; // departure runway
  takeoffCleared: boolean;
  pendingTaxiRunway?: RunwayId;
  pushbackRequested: boolean;
  // turnaround
  turn?: { stage: TurnStage; t: number; total: number };
  pax: number;
  fuel: number; // seconds of holding fuel remaining (Pro)
  emergency?: { kind: 'medical' | 'fuel' | 'engine'; deadline: number };
  goArounds: number;
  holdingTime: number;
  arrivedAt?: number;
  /** issued, not-yet-executed, undoable commands (most recent last) */
  pendingList?: { cmdId: number; kind: 'land' | 'park' | 'taxi' | 'pushback' | 'takeoff' }[];
  pendingVia?: string[];
  blockedBy?: string;
  groundNode?: string;
  lowFuel?: boolean;
  lineupWait?: number;
  pushWait?: number;
  special: boolean;
  removeAt?: number;
}

export interface Flight {
  id: string;
  callsign: string;
  airline: string;
  liveryId: string;
  typeId: string;
  origin: string;
  dest: string;
  pax: number;
  schedArr: number; // sim seconds
  schedDep: number;
  status: 'scheduled' | 'inbound' | 'holding' | 'landing' | 'atGate' | 'boarding' | 'departing' | 'departed' | 'diverted';
  acId?: string;
  emergency?: 'medical' | 'fuel' | 'engine';
  special: boolean;
  departureOnly: boolean;
}

export interface ModeRules {
  spawnMin: number;
  spawnMax: number;
  maxActive: number;
  maxAirborne: number;
  initialParked: number;
  /** min distance between successive arrivals on final */
  arrivalSpacing: number;
  /** Kids: arrivals only start final when runway is guaranteed */
  safeRunway: boolean;
  /** Casual: departures wait for arrivals; Pro: player must manage */
  protectArrivals: boolean;
  wake: boolean;
  fuel: boolean;
  emergencies: boolean;
  weather: boolean;
  severeWeather: boolean;
  happinessGameOver: boolean;
  penalties: number; // multiplier 0..1
  durationTicks: number; // 0 = endless
  autoSpawn: boolean;
}

export interface WorldConfig {
  mode: GameMode;
  seed: number;
  openGates: string[];
  runways: RunwayId[];
  allowedTypes: string[];
  specialTypes: string[];
  weatherKinds: Weather[];
  startMinutes: number; // clock minutes at t=0, e.g. 360 = 06:00
  version: number;
}

export interface Score {
  points: number;
  coins: number;
  xp: number;
  arrivals: number;
  departures: number;
  goArounds: number;
  diversions: number;
  onTime: number;
  late: number;
  totalDelay: number;
  emergenciesHandled: number;
  happiness: number;
  maxSimultaneous: number;
  heavyHandled: number;
  daysCompleted: number;
  bestDayStars: number;
}

export type SimEvent =
  | { t: 'spawn'; ac: string; callsign: string }
  | { t: 'requestLand'; ac: string; callsign: string }
  | { t: 'cleared'; ac: string; callsign: string; what: string }
  | { t: 'touchdown'; ac: string; callsign: string; runway: RunwayId }
  | { t: 'vacated'; ac: string; callsign: string }
  | { t: 'parked'; ac: string; callsign: string; gate: string }
  | { t: 'readyPushback'; ac: string; callsign: string }
  | { t: 'readyTaxi'; ac: string; callsign: string }
  | { t: 'holdingShort'; ac: string; callsign: string; runway: RunwayId }
  | { t: 'takeoffRoll'; ac: string; callsign: string; runway: RunwayId }
  | { t: 'departed'; ac: string; callsign: string; coins: number; points: number; onTime: boolean; typeId: string }
  | { t: 'goAround'; ac: string; callsign: string; reason: string }
  | { t: 'diverted'; ac: string; callsign: string }
  | { t: 'emergency'; ac: string; callsign: string; kind: string }
  | { t: 'lowFuel'; ac: string; callsign: string }
  | { t: 'weather'; weather: Weather }
  | { t: 'dayEnd'; day: number; stars: number; flights: number; happiness: number }
  | { t: 'gameOver'; reason: string }
  | { t: 'reward'; coins: number; points: number; reason: string; ac?: string };

export interface RunwayState {
  owner: string | null;
  ownerKind: 'arrival' | 'departure' | null;
  arrivals: string[]; // queue of aircraft cleared to land, in order
  cooldownUntil: number; // tick
  lastCat: string;
}

export interface World {
  config: WorldConfig;
  rules: ModeRules;
  tick: number;
  rng: RngState;
  aircraft: Aircraft[];
  flights: Flight[];
  nextFlightNo: number;
  nextAcNo: number;
  nextSpawnTick: number;
  runways: Record<RunwayId, RunwayState>;
  gateRes: Record<string, string>; // gate -> aircraft id
  nodeLocks: Record<string, string>; // node -> aircraft id
  weather: Weather;
  weatherUntil: number;
  score: Score;
  events: SimEvent[];
  over: boolean;
  overReason?: string;
  day: number;
  dayFlights: number;
  autoSpawn: boolean;
  timeOffset: number; // sandbox time-of-day offset in minutes
  cmdSeq: number;
  lastHappinessTick: number;
}

export type Command =
  | { t: 'land'; ac: string; runway: RunwayId }
  | { t: 'goAround'; ac: string }
  | { t: 'hold'; ac: string }
  | { t: 'resume'; ac: string }
  | { t: 'park'; ac: string; gate: string; via?: string[] }
  | { t: 'taxi'; ac: string; runway: RunwayId; via?: string[] }
  | { t: 'pushback'; ac: string }
  | { t: 'takeoff'; ac: string }
  | { t: 'cancel'; ac: string }
  | { t: 'spawn'; typeId: string }
  | { t: 'setWeather'; weather: Weather }
  | { t: 'setTime'; minutes: number }
  | { t: 'setAutoSpawn'; on: boolean };

export interface CommandResult {
  ok: boolean;
  reason?: string;
  cmdId?: number;
}

export interface LoggedCommand {
  tick: number;
  cmd: Command;
}
