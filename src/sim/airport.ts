/**
 * Airport layout: runways, a one-way taxi network and gates.
 *
 * Coordinate system: x → east, y → south (screen-like). Heading 0 = east.
 *
 * Every taxiway is one-way, so aircraft never meet head-on. Traffic only merges or
 * branches at junctions, which are protected with exclusive node locks. This keeps
 * the ground flow deadlock-resistant while still offering route choices:
 *
 *  R1 (north) ─ exits ─▶ A ─▶ NE ─┬─▶ Ring N (west) ─▶ NW ─┬─▶ NW2 ─▶ HP1 ─▶ R1
 *                               │                          └─▶ (x=560 ↓) SW
 *                               └─▶ (x=2760 ↓) SE
 *  R2 (south) ─ exits ─▶ B ─▶ BE ─▶ (x=2950 ↑) SE2 ─▶ SE ─▶ Ring S (west) ─▶ SW ─▶ SW2 ─┬─▶ HP2 ─▶ R2
 *                                          └─▶ NE2 ─▶ NE                                └─▶ (x=320 ↑) NW2
 */

import type { SizeCat } from './aircraft';

export type RunwayId = 'R1' | 'R2';

export interface GraphNode {
  id: string;
  x: number;
  y: number;
  kind: 'taxi' | 'runway' | 'exit' | 'hold' | 'mouth' | 'stand' | 'entry';
  /** Fillet radius used when a path turns at this node */
  r: number;
}

export interface Runway {
  id: RunwayId;
  name: string;
  oppositeName: string;
  y: number;
  x0: number;
  x1: number;
  width: number;
  thresholdX: number;
  touchdownX: number;
  entryNode: string;
  holdNode: string;
  endNode: string;
  /** Runway nodes from west to east (excluding entry) */
  runwayNodes: string[];
  exits: { runwayNode: string; holdNode: string; joinNode: string; x: number }[];
  /** Direction exits turn: +1 = towards +y (south), -1 = towards -y (north) */
  exitSide: 1 | -1;
}

export interface Gate {
  id: string;
  label: string;
  side: 'N' | 'S';
  x: number;
  cat: SizeCat;
  mouth: string;
  stand: string;
  /** y of terminal face where noses stop */
  faceY: number;
  /** heading of a parked aircraft (pointing at the terminal) */
  parkHeading: number;
  /** Starting set of gates are open; others unlock via progression */
  unlockLevel: number;
  cost: number;
}

export interface Airport {
  nodes: Record<string, GraphNode>;
  out: Record<string, string[]>;
  inn: Record<string, string[]>;
  runways: Record<RunwayId, Runway>;
  gates: Gate[];
  gateById: Record<string, Gate>;
  bounds: { x0: number; y0: number; x1: number; y1: number };
  terminal: { x0: number; x1: number; y0: number; y1: number };
  holdFixes: { id: string; x: number; y: number }[];
  ringY: { N: number; S: number };
}

export const RING_N_Y = 680;
export const RING_S_Y = 1520;
export const TAXI_A_Y = 480;
export const TAXI_B_Y = 1720;
export const R1_Y = 200;
export const R2_Y = 2000;
export const TERMINAL_N_FACE = 960;
export const TERMINAL_S_FACE = 1240;
export const RUNWAY_X0 = 180;
export const RUNWAY_X1 = 2900;
export const RUNWAY_WIDTH = 90;

const GATES_N: { x: number; cat: SizeCat; lvl: number; cost: number }[] = [
  { x: 860, cat: 'M', lvl: 1, cost: 0 },
  { x: 1010, cat: 'M', lvl: 1, cost: 0 },
  { x: 1180, cat: 'H', lvl: 3, cost: 900 },
  { x: 1390, cat: 'J', lvl: 6, cost: 2400 },
  { x: 1600, cat: 'H', lvl: 4, cost: 1200 },
  { x: 1790, cat: 'M', lvl: 1, cost: 0 },
  { x: 1950, cat: 'M', lvl: 2, cost: 400 },
  { x: 2110, cat: 'S', lvl: 1, cost: 0 },
  { x: 2260, cat: 'M', lvl: 3, cost: 600 },
  { x: 2420, cat: 'H', lvl: 5, cost: 1500 },
];

const GATES_S: { x: number; cat: SizeCat; lvl: number; cost: number }[] = [
  { x: 860, cat: 'S', lvl: 2, cost: 200 },
  { x: 990, cat: 'S', lvl: 2, cost: 250 },
  { x: 1130, cat: 'M', lvl: 2, cost: 350 },
  { x: 1280, cat: 'M', lvl: 2, cost: 400 },
  { x: 1450, cat: 'H', lvl: 4, cost: 1100 },
  { x: 1650, cat: 'J', lvl: 7, cost: 2800 },
  { x: 1850, cat: 'H', lvl: 5, cost: 1400 },
  { x: 2030, cat: 'M', lvl: 3, cost: 500 },
  { x: 2190, cat: 'M', lvl: 3, cost: 550 },
  { x: 2350, cat: 'S', lvl: 4, cost: 450 },
];

const EXIT_XS = [1150, 1550, 1950];
const END_EXIT_X = 2600;

function buildAirport(): Airport {
  const nodes: Record<string, GraphNode> = {};
  const out: Record<string, string[]> = {};
  const inn: Record<string, string[]> = {};

  const node = (id: string, x: number, y: number, kind: GraphNode['kind'] = 'taxi', r = 70) => {
    nodes[id] = { id, x, y, kind, r };
    out[id] = [];
    inn[id] = [];
  };
  const edge = (a: string, b: string) => {
    if (!nodes[a] || !nodes[b]) throw new Error(`edge ${a}->${b} missing node`);
    out[a]!.push(b);
    inn[b]!.push(a);
  };
  const chain = (...ids: string[]) => {
    for (let i = 0; i < ids.length - 1; i++) edge(ids[i]!, ids[i + 1]!);
  };

  // ---------- Runways ----------
  const runways = {} as Record<RunwayId, Runway>;
  const makeRunway = (id: RunwayId, y: number, side: 1 | -1, taxiY: number, eastNode: string) => {
    const p = id;
    const entry = `${p}_ENT`;
    const hold = `${p}_HP`;
    node(entry, 320, y, 'entry', 60);
    node(hold, 320, y + side * 160, 'hold', 60);
    const rwNodes: string[] = [];
    const exits: Runway['exits'] = [];
    for (const ex of EXIT_XS) {
      const rn = `${p}_X${ex}`;
      node(rn, ex, y, 'runway', 260);
      rwNodes.push(rn);
    }
    const endExitNode = `${p}_X${END_EXIT_X}`;
    node(endExitNode, END_EXIT_X, y, 'runway', 120);
    rwNodes.push(endExitNode);
    const endNode = `${p}_END`;
    node(endNode, RUNWAY_X1, y, 'runway', 10);
    rwNodes.push(endNode);
    // runway centreline, eastbound
    chain(entry, ...rwNodes);
    // rapid exits
    EXIT_XS.forEach((ex, i) => {
      const hn = `${p}_EH${i + 1}`;
      const jn = `${p}_J${i + 1}`;
      node(hn, ex + 210, y + side * 150, 'exit', 90);
      node(jn, ex + 340, taxiY, 'taxi', 90);
      edge(`${p}_X${ex}`, hn);
      edge(hn, jn);
      exits.push({ runwayNode: `${p}_X${ex}`, holdNode: hn, joinNode: jn, x: ex });
    });
    const endHold = `${p}_EH4`;
    node(endHold, END_EXIT_X + 100, y + side * 150, 'exit', 70);
    edge(endExitNode, endHold);
    edge(endHold, eastNode);
    exits.push({ runwayNode: endExitNode, holdNode: endHold, joinNode: eastNode, x: END_EXIT_X });
    // parallel taxiway, eastbound
    chain(`${p}_J1`, `${p}_J2`, `${p}_J3`, eastNode);
    edge(hold, entry);
    runways[id] = {
      id,
      name: id === 'R1' ? '09L' : '09R',
      oppositeName: id === 'R1' ? '27R' : '27L',
      y,
      x0: RUNWAY_X0,
      x1: RUNWAY_X1,
      width: RUNWAY_WIDTH,
      thresholdX: 300,
      touchdownX: 560,
      entryNode: entry,
      holdNode: hold,
      endNode,
      runwayNodes: rwNodes,
      exits,
      exitSide: side,
    };
  };

  // East corner nodes must exist before runways connect to them
  node('AE', 2760, TAXI_A_Y, 'taxi', 80);
  node('NE', 2760, RING_N_Y, 'taxi', 80);
  node('SE', 2760, RING_S_Y, 'taxi', 80);
  node('BE', 2950, TAXI_B_Y, 'taxi', 80);
  node('SE2', 2950, RING_S_Y, 'taxi', 60);
  node('NE2', 2950, RING_N_Y, 'taxi', 80);
  // West corner nodes
  node('NW', 560, RING_N_Y, 'taxi', 80);
  node('NW2', 320, RING_N_Y, 'taxi', 80);
  node('SW', 560, RING_S_Y, 'taxi', 80);
  node('SW2', 320, RING_S_Y, 'taxi', 80);

  makeRunway('R1', R1_Y, 1, TAXI_A_Y, 'AE');
  makeRunway('R2', R2_Y, -1, TAXI_B_Y, 'BE');

  // ---------- Gates ----------
  const gates: Gate[] = [];
  const makeGates = (
    side: 'N' | 'S',
    defs: typeof GATES_N,
    ringY: number,
    faceY: number,
    parkHeading: number,
  ) => {
    defs.forEach((g, i) => {
      const id = `${side}${i + 1}`;
      const mouth = `M_${id}`;
      const stand = `S_${id}`;
      node(mouth, g.x, ringY, 'mouth', 62);
      // stand node is a reference point near the terminal face; actual stop depends on aircraft length
      node(stand, g.x, faceY + (side === 'N' ? -24 : 24), 'stand', 10);
      edge(mouth, stand);
      gates.push({
        id,
        label: `${side === 'N' ? 'A' : 'B'}${i + 1}`,
        side,
        x: g.x,
        cat: g.cat,
        mouth,
        stand,
        faceY,
        parkHeading,
        unlockLevel: g.lvl,
        cost: g.cost,
      });
    });
  };
  makeGates('N', GATES_N, RING_N_Y, TERMINAL_N_FACE, Math.PI / 2);
  makeGates('S', GATES_S, RING_S_Y, TERMINAL_S_FACE, -Math.PI / 2);

  // ---------- Mid-field connectors (taxiway → ring shortcuts) ----------
  node('CN', 1490, RING_N_Y, 'taxi', 50);
  node('CS', 1945, RING_S_Y, 'taxi', 50);

  // ---------- Rings (westbound) ----------
  const ringSorted = (side: 'N' | 'S', extra: string) =>
    [...gates.filter((g) => g.side === side).map((g) => g.mouth), extra].sort((a, b) => nodes[b]!.x - nodes[a]!.x);
  chain('NE', ...ringSorted('N', 'CN'), 'NW', 'NW2', 'R1_HP');
  chain('SE', ...ringSorted('S', 'CS'), 'SW', 'SW2', 'R2_HP');
  edge('R1_J1', 'CN');
  edge('R2_J2', 'CS');

  // ---------- Connectors ----------
  edge('AE', 'NE'); // A → ring N corner
  edge('NE', 'SE'); // east lane southbound
  chain('BE', 'SE2', 'NE2', 'NE'); // outer east lane northbound
  edge('SE2', 'SE');
  edge('NW', 'SW'); // west lane southbound
  edge('SW2', 'NW2'); // outer west lane northbound

  const gateById = Object.fromEntries(gates.map((g) => [g.id, g]));

  return {
    nodes,
    out,
    inn,
    runways,
    gates,
    gateById,
    bounds: { x0: -600, y0: -500, x1: 3700, y1: 2700 },
    terminal: { x0: 760, x1: 2560, y0: TERMINAL_N_FACE, y1: TERMINAL_S_FACE },
    holdFixes: [
      { id: 'HN1', x: 700, y: -760 },
      { id: 'HN2', x: 2300, y: -760 },
      { id: 'HS1', x: 700, y: 2960 },
      { id: 'HS2', x: 2300, y: 2960 },
      { id: 'HE', x: 4100, y: 1100 },
    ],
    ringY: { N: RING_N_Y, S: RING_S_Y },
  };
}

export const AIRPORT: Airport = buildAirport();

/** Taxiway segments for rendering (each directed edge once). */
export function taxiEdges(ap: Airport = AIRPORT): { a: GraphNode; b: GraphNode; runway: boolean }[] {
  const res: { a: GraphNode; b: GraphNode; runway: boolean }[] = [];
  for (const [a, outs] of Object.entries(ap.out)) {
    for (const b of outs) {
      const na = ap.nodes[a]!;
      const nb = ap.nodes[b]!;
      const runway =
        (na.kind === 'runway' || na.kind === 'entry') && (nb.kind === 'runway' || nb.kind === 'entry');
      res.push({ a: na, b: nb, runway });
    }
  }
  return res;
}

export function standStopY(gate: Gate, length: number): number {
  return gate.side === 'N' ? gate.faceY - 22 - length / 2 : gate.faceY + 22 + length / 2;
}
