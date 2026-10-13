/**
 * Aircraft catalogue. Dimensions are in world units (roughly 2 units per real metre)
 * so relative sizes stay true to the real-world aircraft that inspired each type.
 */

export type SizeCat = 'S' | 'M' | 'H' | 'J';
export const SIZE_ORDER: Record<SizeCat, number> = { S: 0, M: 1, H: 2, J: 3 };
export const SIZE_LABEL: Record<SizeCat, string> = {
  S: 'Regional',
  M: 'Narrow-body',
  H: 'Wide-body',
  J: 'Super-jumbo',
};

export type EngineLayout = 'twinProp' | 'twinWing' | 'twinRear' | 'quadWing';
export type TailType = 'T' | 'conventional';
export type WingTip = 'plain' | 'sharklet' | 'scimitar' | 'raked' | 'curved' | 'blended';

export interface AircraftType {
  id: string;
  name: string;
  inspiredBy: string;
  maker: string;
  cat: SizeCat;
  /** World units */
  length: number;
  span: number;
  fuselageWidth: number;
  engines: EngineLayout;
  engineCount: number;
  tail: TailType;
  wingTip: WingTip;
  /** Wing sweep in radians (visual) */
  sweep: number;
  /** Wing root position along fuselage from nose (0..1) */
  wingPos: number;
  highWing: boolean;
  doubleDeck: boolean;
  paxMin: number;
  paxMax: number;
  touchdownSpeed: number;
  landingDecel: number;
  rotateSpeed: number;
  takeoffAccel: number;
  taxiSpeed: number;
  turnaround: number; // sim seconds
  unlockLevel: number;
  special?: boolean;
  facts: {
    realLength: string;
    realSpan: string;
    range: string;
    firstFlight: string;
    fun: string;
  };
}

export const AIRCRAFT: readonly AircraftType[] = [
  {
    id: 'atr72',
    name: 'ATR 72',
    inspiredBy: 'ATR 72-600',
    maker: 'ATR',
    cat: 'S',
    length: 54,
    span: 54,
    fuselageWidth: 6,
    engines: 'twinProp',
    engineCount: 2,
    tail: 'T',
    wingTip: 'plain',
    sweep: 0.02,
    wingPos: 0.44,
    highWing: true,
    doubleDeck: false,
    paxMin: 58,
    paxMax: 72,
    touchdownSpeed: 88,
    landingDecel: 10,
    rotateSpeed: 92,
    takeoffAccel: 11,
    taxiSpeed: 48,
    turnaround: 26,
    unlockLevel: 1,
    facts: {
      realLength: '27.2 m',
      realSpan: '27.1 m',
      range: '1,500 km',
      firstFlight: '1988',
      fun: 'Its high wing keeps the propellers safely above gravel and snow on short regional runways.',
    },
  },
  {
    id: 'e190',
    name: 'E190',
    inspiredBy: 'Embraer E190',
    maker: 'Embraer',
    cat: 'S',
    length: 72,
    span: 57,
    fuselageWidth: 6.5,
    engines: 'twinWing',
    engineCount: 2,
    tail: 'conventional',
    wingTip: 'scimitar',
    sweep: 0.42,
    wingPos: 0.46,
    highWing: false,
    doubleDeck: false,
    paxMin: 94,
    paxMax: 114,
    touchdownSpeed: 96,
    landingDecel: 9.5,
    rotateSpeed: 106,
    takeoffAccel: 10.5,
    taxiSpeed: 47,
    turnaround: 30,
    unlockLevel: 1,
    facts: {
      realLength: '36.2 m',
      realSpan: '28.7 m',
      range: '4,500 km',
      firstFlight: '2004',
      fun: 'Its "double-bubble" cabin has no middle seats — every passenger gets a window or an aisle.',
    },
  },
  {
    id: 'a320',
    name: 'A320',
    inspiredBy: 'Airbus A320neo',
    maker: 'Airbus',
    cat: 'M',
    length: 75,
    span: 72,
    fuselageWidth: 8,
    engines: 'twinWing',
    engineCount: 2,
    tail: 'conventional',
    wingTip: 'sharklet',
    sweep: 0.44,
    wingPos: 0.45,
    highWing: false,
    doubleDeck: false,
    paxMin: 150,
    paxMax: 186,
    touchdownSpeed: 104,
    landingDecel: 9,
    rotateSpeed: 116,
    takeoffAccel: 10,
    taxiSpeed: 46,
    turnaround: 36,
    unlockLevel: 1,
    facts: {
      realLength: '37.6 m',
      realSpan: '35.8 m',
      range: '6,300 km',
      firstFlight: '1987',
      fun: 'The first airliner flown entirely with digital fly-by-wire controls and side-sticks.',
    },
  },
  {
    id: 'b737',
    name: '737',
    inspiredBy: 'Boeing 737-800',
    maker: 'Boeing',
    cat: 'M',
    length: 79,
    span: 72,
    fuselageWidth: 7.6,
    engines: 'twinWing',
    engineCount: 2,
    tail: 'conventional',
    wingTip: 'scimitar',
    sweep: 0.44,
    wingPos: 0.47,
    highWing: false,
    doubleDeck: false,
    paxMin: 162,
    paxMax: 189,
    touchdownSpeed: 106,
    landingDecel: 9,
    rotateSpeed: 118,
    takeoffAccel: 10,
    taxiSpeed: 46,
    turnaround: 36,
    unlockLevel: 1,
    facts: {
      realLength: '39.5 m',
      realSpan: '35.8 m',
      range: '5,400 km',
      firstFlight: '1997 (737 family: 1967)',
      fun: 'Its engines have flattened bottoms so they fit under the low-slung wing.',
    },
  },
  {
    id: 'a321',
    name: 'A321',
    inspiredBy: 'Airbus A321neo',
    maker: 'Airbus',
    cat: 'M',
    length: 89,
    span: 72,
    fuselageWidth: 8,
    engines: 'twinWing',
    engineCount: 2,
    tail: 'conventional',
    wingTip: 'sharklet',
    sweep: 0.44,
    wingPos: 0.47,
    highWing: false,
    doubleDeck: false,
    paxMin: 190,
    paxMax: 230,
    touchdownSpeed: 108,
    landingDecel: 8.8,
    rotateSpeed: 120,
    takeoffAccel: 9.6,
    taxiSpeed: 45,
    turnaround: 40,
    unlockLevel: 2,
    facts: {
      realLength: '44.5 m',
      realSpan: '35.8 m',
      range: '7,400 km',
      firstFlight: '1993',
      fun: 'A stretched A320 with extra doors over the wing so it can still board quickly.',
    },
  },
  {
    id: 'b787',
    name: '787',
    inspiredBy: 'Boeing 787-9',
    maker: 'Boeing',
    cat: 'H',
    length: 126,
    span: 120,
    fuselageWidth: 12,
    engines: 'twinWing',
    engineCount: 2,
    tail: 'conventional',
    wingTip: 'raked',
    sweep: 0.5,
    wingPos: 0.46,
    highWing: false,
    doubleDeck: false,
    paxMin: 260,
    paxMax: 296,
    touchdownSpeed: 112,
    landingDecel: 8.2,
    rotateSpeed: 128,
    takeoffAccel: 8.4,
    taxiSpeed: 42,
    turnaround: 52,
    unlockLevel: 3,
    facts: {
      realLength: '62.8 m',
      realSpan: '60.1 m',
      range: '14,000 km',
      firstFlight: '2013 (787 family: 2009)',
      fun: 'Half of the airframe is carbon-fibre composite, and its wings flex upward several metres in flight.',
    },
  },
  {
    id: 'a350',
    name: 'A350',
    inspiredBy: 'Airbus A350-900',
    maker: 'Airbus',
    cat: 'H',
    length: 134,
    span: 129,
    fuselageWidth: 12.5,
    engines: 'twinWing',
    engineCount: 2,
    tail: 'conventional',
    wingTip: 'curved',
    sweep: 0.52,
    wingPos: 0.46,
    highWing: false,
    doubleDeck: false,
    paxMin: 300,
    paxMax: 340,
    touchdownSpeed: 113,
    landingDecel: 8,
    rotateSpeed: 130,
    takeoffAccel: 8.2,
    taxiSpeed: 42,
    turnaround: 55,
    unlockLevel: 4,
    facts: {
      realLength: '66.8 m',
      realSpan: '64.75 m',
      range: '15,000 km',
      firstFlight: '2013',
      fun: 'Its wingtips curl gracefully upward — and the cockpit windows look like it wears a mask.',
    },
  },
  {
    id: 'b777',
    name: '777',
    inspiredBy: 'Boeing 777-300ER',
    maker: 'Boeing',
    cat: 'H',
    length: 148,
    span: 129.6,
    fuselageWidth: 12.4,
    engines: 'twinWing',
    engineCount: 2,
    tail: 'conventional',
    wingTip: 'raked',
    sweep: 0.54,
    wingPos: 0.47,
    highWing: false,
    doubleDeck: false,
    paxMin: 360,
    paxMax: 396,
    touchdownSpeed: 116,
    landingDecel: 7.8,
    rotateSpeed: 132,
    takeoffAccel: 7.8,
    taxiSpeed: 41,
    turnaround: 60,
    unlockLevel: 5,
    facts: {
      realLength: '73.9 m',
      realSpan: '64.8 m',
      range: '13,600 km',
      firstFlight: '2003 (777 family: 1994)',
      fun: 'Each engine is almost as wide as a 737 fuselage — among the most powerful jet engines ever built.',
    },
  },
  {
    id: 'a380',
    name: 'A380',
    inspiredBy: 'Airbus A380-800',
    maker: 'Airbus',
    cat: 'J',
    length: 146,
    span: 160,
    fuselageWidth: 14.5,
    engines: 'quadWing',
    engineCount: 4,
    tail: 'conventional',
    wingTip: 'plain',
    sweep: 0.58,
    wingPos: 0.49,
    highWing: false,
    doubleDeck: true,
    paxMin: 480,
    paxMax: 560,
    touchdownSpeed: 118,
    landingDecel: 7.4,
    rotateSpeed: 134,
    takeoffAccel: 7.2,
    taxiSpeed: 38,
    turnaround: 70,
    unlockLevel: 6,
    facts: {
      realLength: '72.7 m',
      realSpan: '79.8 m',
      range: '15,200 km',
      firstFlight: '2005',
      fun: 'The world\'s largest passenger jet has two full decks — its wing area could hold 70 parked cars.',
    },
  },
  // ---- Special aircraft (unlockable visitors) ----
  {
    id: 'classic',
    name: 'Classic Liner',
    inspiredBy: 'Douglas DC-3 era piston airliner',
    maker: 'Heritage',
    cat: 'S',
    length: 40,
    span: 58,
    fuselageWidth: 5,
    engines: 'twinProp',
    engineCount: 2,
    tail: 'conventional',
    wingTip: 'plain',
    sweep: 0.08,
    wingPos: 0.36,
    highWing: false,
    doubleDeck: false,
    paxMin: 21,
    paxMax: 32,
    touchdownSpeed: 70,
    landingDecel: 9,
    rotateSpeed: 74,
    takeoffAccel: 10,
    taxiSpeed: 40,
    turnaround: 22,
    unlockLevel: 3,
    special: true,
    facts: {
      realLength: '19.7 m',
      realSpan: '29.0 m',
      range: '2,400 km',
      firstFlight: '1935',
      fun: 'Classic piston liners made air travel practical — many still fly heritage tours today.',
    },
  },
  {
    id: 'swift',
    name: 'Swift SST',
    inspiredBy: 'Supersonic delta-wing transport',
    maker: 'Concept',
    cat: 'M',
    length: 122,
    span: 52,
    fuselageWidth: 6,
    engines: 'twinRear',
    engineCount: 4,
    tail: 'conventional',
    wingTip: 'plain',
    sweep: 1.05,
    wingPos: 0.62,
    highWing: false,
    doubleDeck: false,
    paxMin: 88,
    paxMax: 100,
    touchdownSpeed: 120,
    landingDecel: 8,
    rotateSpeed: 140,
    takeoffAccel: 11,
    taxiSpeed: 44,
    turnaround: 40,
    unlockLevel: 5,
    special: true,
    facts: {
      realLength: '61.7 m (classic SST)',
      realSpan: '25.6 m',
      range: '7,200 km',
      firstFlight: '1969 (supersonic transports)',
      fun: 'Supersonic airliners crossed the Atlantic in under 3.5 hours — faster than the Earth turns.',
    },
  },
  {
    id: 'solar',
    name: 'Sun Glider',
    inspiredBy: 'Solar-electric long-wing demonstrator',
    maker: 'Concept',
    cat: 'M',
    length: 46,
    span: 74,
    fuselageWidth: 4,
    engines: 'twinProp',
    engineCount: 4,
    tail: 'conventional',
    wingTip: 'plain',
    sweep: 0,
    wingPos: 0.4,
    highWing: true,
    doubleDeck: false,
    paxMin: 2,
    paxMax: 6,
    touchdownSpeed: 60,
    landingDecel: 8,
    rotateSpeed: 62,
    takeoffAccel: 8,
    taxiSpeed: 34,
    turnaround: 20,
    unlockLevel: 4,
    special: true,
    facts: {
      realLength: '22.4 m',
      realSpan: '72 m (real); scaled to fit gates',
      range: 'Unlimited by day ☀️',
      firstFlight: '2009 (solar demonstrators)',
      fun: 'Solar aircraft have flown around the world without a single drop of fuel.',
    },
  },
];

export const AIRCRAFT_BY_ID: Record<string, AircraftType> = Object.fromEntries(
  AIRCRAFT.map((a) => [a.id, a]),
);

export function getType(id: string): AircraftType {
  const t = AIRCRAFT_BY_ID[id];
  if (!t) throw new Error(`Unknown aircraft type ${id}`);
  return t;
}

export interface Livery {
  id: string;
  name: string;
  code: string;
  body: number;
  tail: number;
  accent: number;
  stripe: number;
  engine: number;
}

/** Original, fictional airlines — no real-world branding. */
export const LIVERIES: readonly Livery[] = [
  { id: 'aurora', name: 'Aurora Air', code: 'AUR', body: 0xf7f9fc, tail: 0x3b5bdb, accent: 0x74c0fc, stripe: 0x3b5bdb, engine: 0x3b5bdb },
  { id: 'coral', name: 'Coral Wings', code: 'CRW', body: 0xfffaf5, tail: 0xff6b6b, accent: 0xffa94d, stripe: 0xff8787, engine: 0xe9ecef },
  { id: 'nimbus', name: 'Nimbus Airways', code: 'NMB', body: 0xf1f3f5, tail: 0x0b7285, accent: 0x63e6be, stripe: 0x0b7285, engine: 0x0b7285 },
  { id: 'sunpeak', name: 'Sunpeak', code: 'SPK', body: 0xfffdf2, tail: 0xf59f00, accent: 0xe8590c, stripe: 0xfab005, engine: 0xf1f3f5 },
  { id: 'violet', name: 'Violet Sky', code: 'VSK', body: 0xfbf7ff, tail: 0x7048e8, accent: 0xda77f2, stripe: 0x9775fa, engine: 0x7048e8 },
  { id: 'evergreen', name: 'Evergreen Air', code: 'EVG', body: 0xf8fff8, tail: 0x2b8a3e, accent: 0x94d82d, stripe: 0x40c057, engine: 0xe9ecef },
  { id: 'midnight', name: 'Midnight Express', code: 'MNX', body: 0xe7ecf3, tail: 0x1c2541, accent: 0xffd43b, stripe: 0x1c2541, engine: 0x1c2541 },
  { id: 'tidewave', name: 'Tidewave', code: 'TDW', body: 0xf3fbff, tail: 0x1098ad, accent: 0x15aabf, stripe: 0x0c8599, engine: 0xf1f3f5 },
  { id: 'rosewood', name: 'Rosewood', code: 'RSW', body: 0xfff5f7, tail: 0xa61e4d, accent: 0xf783ac, stripe: 0xc2255c, engine: 0xa61e4d },
  { id: 'polar', name: 'Polar Line', code: 'PLR', body: 0xffffff, tail: 0x495057, accent: 0x4dabf7, stripe: 0x228be6, engine: 0xdee2e6 },
];

export const SPECIAL_LIVERY: Livery = {
  id: 'heritage',
  name: 'SkyCommand Heritage',
  code: 'SKY',
  body: 0xfefcf3,
  tail: 0xd9480f,
  accent: 0x2f9e44,
  stripe: 0x1864ab,
  engine: 0xadb5bd,
};

export const LIVERY_BY_ID: Record<string, Livery> = Object.fromEntries(
  [...LIVERIES, SPECIAL_LIVERY].map((l) => [l.id, l]),
);

export const CITIES: readonly string[] = [
  'Lisbon', 'Oslo', 'Nairobi', 'Kyoto', 'Seville', 'Auckland', 'Montreal', 'Reykjavik', 'Cairo', 'Lima',
  'Bergen', 'Cusco', 'Mumbai', 'Hanoi', 'Zurich', 'Perth', 'Dakar', 'Santiago', 'Vienna', 'Busan',
  'Honolulu', 'Marrakesh', 'Helsinki', 'Bogotá', 'Cape Town', 'Denver', 'Edinburgh', 'Muscat', 'Manila', 'Porto',
];
