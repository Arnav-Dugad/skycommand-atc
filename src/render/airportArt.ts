import { Container, Graphics, Sprite, Text, TilingSprite, type Texture } from 'pixi.js';
import { getType, LIVERY_BY_ID } from '../sim/aircraft';
import {
  AIRPORT,
  RING_N_Y,
  RING_S_Y,
  RUNWAY_WIDTH,
  TERMINAL_N_FACE,
  TERMINAL_S_FACE,
  taxiEdges,
  type GraphNode,
} from '../sim/airport';
import { buildPath, samplePath } from '../sim/path';
import type { TextureBank } from './textures';
import type { Theme } from './themes';

export const TAXI_W = 46;
export const PROPERTY = { x0: -950, y0: -620, x1: 3850, y1: 2640 };
export const TERMINAL_BUILDING = { x0: 760, x1: 2560, y0: TERMINAL_N_FACE + 30, y1: TERMINAL_S_FACE - 30 };

export interface StaticLight {
  x: number;
  y: number;
  color: number;
  size: number;
  kind: 'runway' | 'threshold' | 'end' | 'taxi' | 'apron' | 'approach' | 'building' | 'tower';
  seq?: number;
}

export interface AirportArt {
  ground: Container;
  upper: Container; // building roofs etc drawn above ground aircraft
  lights: StaticLight[];
  animated: {
    radar: Container[];
    turbines: Container[];
    ferris: Container[];
    windsocks: Container[];
    fountains: Container[];
  };
}

function rand(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

function label(text: string, size: number, color: number, weight: '600' | '700' | '800' = '800') {
  const t = new Text({
    text,
    style: {
      fontFamily: 'Plus Jakarta Sans Variable, Plus Jakarta Sans, system-ui, sans-serif',
      fontSize: size,
      fill: color,
      fontWeight: weight,
      letterSpacing: size * 0.06,
    },
    resolution: 3,
  });
  t.anchor.set(0.5);
  return t;
}

function strokePath(g: Graphics, pts: number[], width: number, color: number, alpha = 1) {
  if (pts.length < 4) return;
  g.moveTo(pts[0]!, pts[1]!);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i]!, pts[i + 1]!);
  g.stroke({ width, color, alpha, cap: 'round', join: 'round' });
}

function filletPairs(): { pts: number[]; nodes: [GraphNode, GraphNode, GraphNode] }[] {
  const res: { pts: number[]; nodes: [GraphNode, GraphNode, GraphNode] }[] = [];
  for (const id of Object.keys(AIRPORT.nodes)) {
    const n = AIRPORT.nodes[id]!;
    for (const a of AIRPORT.inn[id]!) {
      for (const b of AIRPORT.out[id]!) {
        const na = AIRPORT.nodes[a]!;
        const nb = AIRPORT.nodes[b]!;
        if (nb.kind === 'stand') continue;
        const rwy = (k: string) => k === 'runway' || k === 'entry';
        if (rwy(na.kind) && rwy(n.kind) && rwy(nb.kind)) continue;
        const p = buildPath([
          { x: na.x, y: na.y, r: 0 },
          { x: n.x, y: n.y, r: n.r },
          { x: nb.x, y: nb.y, r: 0 },
        ]);
        res.push({ pts: samplePath(p, 0, 6), nodes: [na, n, nb] });
      }
    }
  }
  return res;
}

export function buildAirportArt(bank: TextureBank, theme: Theme, decor: string[]): AirportArt {
  const ground = new Container();
  const upper = new Container();
  const lights: StaticLight[] = [];
  const animated: AirportArt['animated'] = { radar: [], turbines: [], ferris: [], windsocks: [], fountains: [] };
  const R = rand(4242);

  // ---------------- terrain ----------------
  const bg = new Graphics();
  bg.rect(-6000, -5000, 16000, 13000).fill({ color: theme.background });
  ground.addChild(bg);

  const land = new Graphics();
  if (theme.id === 'coral') {
    // sandy beach and shallow lagoon rings
    land.roundRect(PROPERTY.x0 - 520, PROPERTY.y0 - 520, PROPERTY.x1 - PROPERTY.x0 + 1040, PROPERTY.y1 - PROPERTY.y0 + 1040, 900).fill({ color: theme.waterLight, alpha: 0.7 });
    land.roundRect(PROPERTY.x0 - 260, PROPERTY.y0 - 260, PROPERTY.x1 - PROPERTY.x0 + 520, PROPERTY.y1 - PROPERTY.y0 + 520, 700).fill({ color: theme.sand });
  } else {
    land.rect(-6000, -5000, 16000, 13000).fill({ color: theme.ground });
  }
  ground.addChild(land);

  const grass = new TilingSprite({ texture: bank.grass(theme), width: PROPERTY.x1 - PROPERTY.x0 + 200, height: PROPERTY.y1 - PROPERTY.y0 + 200 });
  grass.position.set(PROPERTY.x0 - 100, PROPERTY.y0 - 100);
  grass.tileScale.set(1.6);
  if (theme.id === 'coral') {
    const mask = new Graphics().roundRect(PROPERTY.x0 - 100, PROPERTY.y0 - 100, PROPERTY.x1 - PROPERTY.x0 + 200, PROPERTY.y1 - PROPERTY.y0 + 200, 500).fill(0xffffff);
    ground.addChild(mask);
    grass.mask = mask;
  }
  ground.addChild(grass);

  // landscape features outside the fence
  const scenery = new Graphics();
  if (theme.id === 'meadow' || theme.id === 'frost') {
    // river across the north and a lake to the south-west
    const river = [-6000, -1500, -3000, -1150, -1200, -1350, 600, -1050, 2400, -1380, 4200, -1000, 7000, -1300];
    strokePath(scenery, river, 260, theme.water);
    strokePath(scenery, river, 150, theme.waterLight, 0.35);
    scenery.ellipse(-2100, 2900, 900, 520).fill({ color: theme.water });
    scenery.ellipse(-2150, 2860, 700, 360).fill({ color: theme.waterLight, alpha: 0.35 });
    // fields
    const fieldColors = theme.snow ? [0xf1f5f9, 0xe2e8f0, 0xf8fafc] : [0xa9d18e, 0x94c47d, 0xc5e0a5, 0xd8c99b];
    for (let i = 0; i < 26; i++) {
      const x = -5200 + (i % 13) * 820 + R() * 200;
      const y = i < 13 ? -2600 + R() * 500 : 3500 + R() * 600;
      scenery.roundRect(x, y, 600 + R() * 300, 420 + R() * 260, 30).fill({ color: fieldColors[i % fieldColors.length]!, alpha: 0.8 });
    }
  } else if (theme.id === 'desert') {
    for (let i = 0; i < 40; i++) {
      const x = -5500 + R() * 14000;
      const y = -4500 + R() * 12000;
      if (x > PROPERTY.x0 - 400 && x < PROPERTY.x1 + 400 && y > PROPERTY.y0 - 400 && y < PROPERTY.y1 + 400) continue;
      scenery.ellipse(x, y, 500 + R() * 600, 140 + R() * 120).fill({ color: theme.grassLight, alpha: 0.6 });
      scenery.ellipse(x + 60, y + 40, 420 + R() * 400, 70 + R() * 60).fill({ color: theme.grassDark, alpha: 0.5 });
    }
    scenery.ellipse(-1900, 2700, 360, 220).fill({ color: theme.water });
  } else if (theme.id === 'coral') {
    for (let i = 0; i < 18; i++) {
      const x = -5000 + R() * 13000;
      const y = -4000 + R() * 11000;
      if (x > PROPERTY.x0 - 900 && x < PROPERTY.x1 + 900 && y > PROPERTY.y0 - 900 && y < PROPERTY.y1 + 900) continue;
      scenery.ellipse(x, y, 260 + R() * 200, 160 + R() * 120).fill({ color: theme.waterLight, alpha: 0.5 });
      scenery.ellipse(x, y, 160 + R() * 100, 90 + R() * 60).fill({ color: theme.sand });
      scenery.ellipse(x, y, 110, 60).fill({ color: theme.grass });
    }
  }
  ground.addChild(scenery);

  // perimeter fence & service road
  const fence = new Graphics();
  fence.roundRect(PROPERTY.x0 + 40, PROPERTY.y0 + 40, PROPERTY.x1 - PROPERTY.x0 - 80, PROPERTY.y1 - PROPERTY.y0 - 80, 120).stroke({ width: 12, color: 0x8d8f86, alpha: 0.55 });
  fence.roundRect(PROPERTY.x0 + 40, PROPERTY.y0 + 40, PROPERTY.x1 - PROPERTY.x0 - 80, PROPERTY.y1 - PROPERTY.y0 - 80, 120).stroke({ width: 1, color: 0xf1f3f5, alpha: 0.5 });
  fence.roundRect(PROPERTY.x0 + 8, PROPERTY.y0 + 8, PROPERTY.x1 - PROPERTY.x0 - 16, PROPERTY.y1 - PROPERTY.y0 - 16, 140).stroke({ width: 1.5, color: 0x495057, alpha: 0.6 });
  ground.addChild(fence);

  // ---------------- pavement ----------------
  const pave = new Graphics();
  const edges = taxiEdges().filter((e) => !e.runway && e.b.kind !== 'stand');
  const fillets = filletPairs();
  // shoulders
  for (const e of edges) strokePath(pave, [e.a.x, e.a.y, e.b.x, e.b.y], TAXI_W + 16, theme.shoulder, 0.9);
  for (const f of fillets) strokePath(pave, f.pts, TAXI_W + 16, theme.shoulder, 0.9);

  // aprons
  const apronN = { x0: 455, x1: 2840, y0: RING_N_Y - 60, y1: TERMINAL_N_FACE };
  const apronS = { x0: 455, x1: 2840, y0: TERMINAL_S_FACE, y1: RING_S_Y + 60 };
  for (const a of [apronN, apronS]) {
    pave.roundRect(a.x0 - 8, a.y0 - 8, a.x1 - a.x0 + 16, a.y1 - a.y0 + 16, 36).fill({ color: theme.shoulder });
    pave.roundRect(a.x0, a.y0, a.x1 - a.x0, a.y1 - a.y0, 30).fill({ color: theme.apron });
  }
  // west & east apron links
  pave.rect(470, RING_N_Y, 200, RING_S_Y - RING_N_Y).fill({ color: theme.grass, alpha: 0 });

  for (const e of edges) strokePath(pave, [e.a.x, e.a.y, e.b.x, e.b.y], TAXI_W, theme.taxiway);
  for (const f of fillets) strokePath(pave, f.pts, TAXI_W, theme.taxiway);

  // concrete joints on aprons
  for (const a of [apronN, apronS]) {
    for (let x = a.x0 + 40; x < a.x1; x += 48) pave.moveTo(x, a.y0 + 6).lineTo(x, a.y1 - 6);
    for (let y = a.y0 + 40; y < a.y1; y += 48) pave.moveTo(a.x0 + 6, y).lineTo(a.x1 - 6, y);
    pave.stroke({ width: 0.7, color: 0x000000, alpha: 0.06 });
  }
  // stands (lighter concrete)
  for (const gte of AIRPORT.gates) {
    const w = { S: 74, M: 92, H: 136, J: 170 }[gte.cat];
    const depth = { S: 90, M: 120, H: 175, J: 195 }[gte.cat];
    const y0 = gte.side === 'N' ? TERMINAL_N_FACE - depth : TERMINAL_S_FACE;
    const y1 = gte.side === 'N' ? TERMINAL_N_FACE : TERMINAL_S_FACE + depth;
    pave.roundRect(gte.x - w / 2, y0, w, y1 - y0, 6).fill({ color: theme.stand });
    // red/white safety boundary
    pave.roundRect(gte.x - w / 2, y0, w, y1 - y0, 6).stroke({ width: 1, color: 0xe03131, alpha: 0.45 });
  }
  ground.addChild(pave);

  // ---------------- runways ----------------
  const rwG = new Graphics();
  for (const r of Object.values(AIRPORT.runways)) {
    const hw = RUNWAY_WIDTH / 2;
    rwG.rect(r.x0 - 70, r.y - hw - 14, r.x1 - r.x0 + 140, RUNWAY_WIDTH + 28).fill({ color: theme.shoulder });
    rwG.rect(r.x0, r.y - hw, r.x1 - r.x0, RUNWAY_WIDTH).fill({ color: theme.asphalt });
    // subtle rubber deposits in touchdown zones
    for (const tx of [r.touchdownX - 120, r.x1 - 520]) {
      for (let i = 0; i < 6; i++) rwG.rect(tx + i * 45, r.y - 16, 30, 32).fill({ color: 0x000000, alpha: 0.08 });
    }
    // blast pads with chevrons
    for (const [bx, dir] of [
      [r.x0 - 70, 1],
      [r.x1, -1],
    ] as const) {
      rwG.rect(bx, r.y - hw + 6, 70, RUNWAY_WIDTH - 12).fill({ color: theme.taxiway });
      for (let i = 0; i < 3; i++) {
        const cx = dir > 0 ? bx + 18 + i * 20 : bx + 52 - i * 20;
        rwG.moveTo(cx, r.y - hw + 12).lineTo(cx + dir * 14, r.y).lineTo(cx, r.y + hw - 12).stroke({ width: 3, color: 0xfcc419, alpha: 0.9 });
      }
    }
    // edge lines
    rwG.rect(r.x0, r.y - hw + 2, r.x1 - r.x0, 2.2).fill({ color: 0xffffff });
    rwG.rect(r.x0, r.y + hw - 4.2, r.x1 - r.x0, 2.2).fill({ color: 0xffffff });
    // threshold piano keys (both ends)
    for (const tx of [r.x0 + 12, r.x1 - 62]) {
      for (let i = 0; i < 6; i++) {
        rwG.rect(tx, r.y - hw + 8 + i * 6.2, 50, 3.4).fill({ color: 0xffffff });
        rwG.rect(tx, r.y + hw - 11.4 - i * 6.2, 50, 3.4).fill({ color: 0xffffff });
      }
    }
    // centreline
    for (let x = r.x0 + 190; x < r.x1 - 190; x += 54) rwG.rect(x, r.y - 1.1, 32, 2.2).fill({ color: 0xffffff });
    // touchdown zone & aiming point (both ends)
    for (const [base, dir] of [
      [r.x0 + 150, 1],
      [r.x1 - 150, -1],
    ] as const) {
      // aiming point
      const ax = base + dir * 260;
      rwG.rect(dir > 0 ? ax : ax - 60, r.y - 26, 60, 9).fill({ color: 0xffffff });
      rwG.rect(dir > 0 ? ax : ax - 60, r.y + 17, 60, 9).fill({ color: 0xffffff });
      for (const k of [120, 400, 540, 680]) {
        const x = base + dir * k;
        for (const off of [-30, -24, 22, 28]) rwG.rect(dir > 0 ? x : x - 36, r.y + off, 36, 2.6).fill({ color: 0xffffff });
      }
    }
    ground.addChild(rwG);
    // designators
    const westNum = label(r.name, 30, 0xffffff);
    westNum.position.set(r.x0 + 112, r.y);
    westNum.rotation = Math.PI / 2;
    const eastNum = label(r.oppositeName, 30, 0xffffff);
    eastNum.position.set(r.x1 - 112, r.y);
    eastNum.rotation = -Math.PI / 2;
    ground.addChild(westNum, eastNum);

    // lights: edges, threshold, end
    for (let x = r.x0; x <= r.x1; x += 60) {
      lights.push({ x, y: r.y - hw - 3, color: 0xfff3bf, size: 0.5, kind: 'runway' });
      lights.push({ x, y: r.y + hw + 3, color: 0xfff3bf, size: 0.5, kind: 'runway' });
    }
    for (let y = r.y - hw; y <= r.y + hw; y += 9) {
      lights.push({ x: r.x0 - 2, y, color: 0x69db7c, size: 0.55, kind: 'threshold' });
      lights.push({ x: r.x1 + 2, y, color: 0xff6b6b, size: 0.55, kind: 'end' });
    }
    // approach lighting system (west)
    const als = new Graphics();
    let seq = 0;
    for (let x = r.x0 - 90; x >= r.x0 - 900; x -= 60) {
      als.rect(x - 1, r.y - 14, 2, 28).fill({ color: 0x868e96 });
      for (let k = -2; k <= 2; k++) lights.push({ x, y: r.y + k * 6, color: 0xffffff, size: 0.45, kind: 'approach', seq });
      seq++;
    }
    als.rect(r.x0 - 390, r.y - 60, 2, 120).fill({ color: 0x868e96 });
    for (let k = -9; k <= 9; k++) lights.push({ x: r.x0 - 390, y: r.y + k * 6.5, color: 0xffffff, size: 0.45, kind: 'approach' });
    ground.addChild(als);
  }

  // ---------------- taxiway markings ----------------
  const mk = new Graphics();
  for (const e of edges) {
    const runwayAdj = e.a.kind === 'runway' || e.b.kind === 'entry';
    strokePath(mk, [e.a.x, e.a.y, e.b.x, e.b.y], 1.6, runwayAdj ? 0x8ce99a : 0xffd43b, 0.95);
  }
  for (const f of fillets) strokePath(mk, f.pts, 1.4, 0xffd43b, 0.85);
  // taxiway edge lines (thin)
  for (const e of edges) {
    const dx = e.b.x - e.a.x;
    const dy = e.b.y - e.a.y;
    const l = Math.hypot(dx, dy);
    if (l < 1) continue;
    const nx = -dy / l;
    const ny = dx / l;
    if (e.a.kind !== 'runway' && e.b.kind !== 'entry') {
      for (const s of [-1, 1]) {
        const o = (TAXI_W / 2 - 2) * s;
        mk.moveTo(e.a.x + nx * o, e.a.y + ny * o).lineTo(e.b.x + nx * o, e.b.y + ny * o);
      }
    }
    // blue edge lights
    const n = Math.floor(l / 70);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      for (const s of [-1, 1]) {
        lights.push({ x: e.a.x + dx * t + nx * (TAXI_W / 2 + 4) * s, y: e.a.y + dy * t + ny * (TAXI_W / 2 + 4) * s, color: 0x4dabf7, size: 0.38, kind: 'taxi' });
      }
    }
  }
  mk.stroke({ width: 0.8, color: 0xffd43b, alpha: 0.35 });

  // direction arrows on one-way taxiways
  for (const e of edges) {
    const dx = e.b.x - e.a.x;
    const dy = e.b.y - e.a.y;
    const l = Math.hypot(dx, dy);
    if (l < 220 || e.a.kind === 'mouth' || e.b.kind === 'mouth') continue;
    const ux = dx / l;
    const uy = dy / l;
    const cx = e.a.x + dx * 0.5;
    const cy = e.a.y + dy * 0.5;
    const s = 7;
    mk.poly([cx + ux * s, cy + uy * s, cx - ux * s - uy * s * 0.8, cy - uy * s + ux * s * 0.8, cx - ux * s * 0.4, cy - uy * s * 0.4, cx - ux * s + uy * s * 0.8, cy - uy * s - ux * s * 0.8], true).fill({ color: 0xffd43b, alpha: 0.9 });
  }

  // hold-short bars
  for (const r of Object.values(AIRPORT.runways)) {
    const hp = AIRPORT.nodes[r.holdNode]!;
    const dir = r.y < hp.y ? -1 : 1;
    for (let k = 0; k < 2; k++) mk.rect(hp.x - TAXI_W / 2, hp.y + dir * (k * 4) - 0.8, TAXI_W, 1.6).fill({ color: 0xffd43b });
    for (let k = 0; k < 2; k++) {
      for (let x = hp.x - TAXI_W / 2; x < hp.x + TAXI_W / 2; x += 6) mk.rect(x, hp.y + dir * (10 + k * 4) - 0.8, 3.5, 1.6).fill({ color: 0xffd43b });
    }
    // red stop bar lights
    for (let x = hp.x - TAXI_W / 2 + 3; x < hp.x + TAXI_W / 2; x += 6) lights.push({ x, y: hp.y - dir * 3, color: 0xff4d4d, size: 0.42, kind: 'taxi' });
    // exit hold bars
    for (const ex of r.exits) {
      const n = AIRPORT.nodes[ex.holdNode]!;
      mk.circle(n.x, n.y, 2.5).fill({ color: 0xffd43b, alpha: 0.6 });
    }
  }

  // stand lead-in lines, stop bars and numbers
  for (const gte of AIRPORT.gates) {
    const ringY = gte.side === 'N' ? RING_N_Y : RING_S_Y;
    const dir = gte.side === 'N' ? 1 : -1;
    const lead = buildPath([
      { x: gte.x + 120, y: ringY, r: 0 },
      { x: gte.x, y: ringY, r: 62 },
      { x: gte.x, y: gte.faceY - dir * 20, r: 0 },
    ]);
    strokePath(mk, samplePath(lead, 0, 6), 1.4, 0xffd43b, 0.9);
    // stop marks for each size
    for (const len of [54, 75, 126, 146]) {
      const y = gte.faceY - dir * (22 + len) ;
      void y;
    }
    mk.rect(gte.x - 9, gte.faceY - dir * 24 - 1, 18, 2).fill({ color: 0xffffff, alpha: 0.9 });
    const lbl = label(gte.label, 13, 0xffd43b, '800');
    lbl.position.set(gte.x + (gte.cat === 'S' ? 22 : 28), ringY + dir * 60);
    ground.addChild(lbl);
  }
  ground.addChild(mk);

  // taxiway designation signs
  const signs: [string, number, number][] = [
    ['A', 1700, 455],
    ['A', 2500, 455],
    ['B', 1700, 1745],
    ['B', 2500, 1745],
    ['N', 1500, 650],
    ['S', 1500, 1550],
    ['W', 610, 1100],
    ['E', 2860, 1100],
    ['H1', 360, 420],
    ['H2', 360, 1780],
  ];
  for (const [txt, x, y] of signs) {
    const c = new Container();
    const bgS = new Graphics().roundRect(-11, -7, 22, 14, 2).fill({ color: 0x212529 }).roundRect(-11, -7, 22, 14, 2).stroke({ width: 1, color: 0xfcc419 });
    const t = label(txt, 9, 0xfcc419, '800');
    c.addChild(bgS, t);
    c.position.set(x, y);
    ground.addChild(c);
  }

  // ---------------- buildings ----------------
  const bld = new Graphics();
  const tb = TERMINAL_BUILDING;
  // service roads along the facades
  bld.rect(tb.x0 - 20, TERMINAL_N_FACE, tb.x1 - tb.x0 + 40, 30).fill({ color: 0x6c757d });
  bld.rect(tb.x0 - 20, TERMINAL_S_FACE - 30, tb.x1 - tb.x0 + 40, 30).fill({ color: 0x6c757d });
  for (let x = tb.x0; x < tb.x1; x += 26) {
    bld.rect(x, TERMINAL_N_FACE + 14.4, 14, 1.2).fill({ color: 0xffffff, alpha: 0.7 });
    bld.rect(x, TERMINAL_S_FACE - 15.6, 14, 1.2).fill({ color: 0xffffff, alpha: 0.7 });
  }
  ground.addChild(bld);

  const roof = new Graphics();
  // shadow
  roof.roundRect(tb.x0 + 10, tb.y0 + 12, tb.x1 - tb.x0, tb.y1 - tb.y0, 26).fill({ color: 0x000000, alpha: 0.16 });
  roof.roundRect(tb.x0, tb.y0, tb.x1 - tb.x0, tb.y1 - tb.y0, 26).fill({ color: theme.roof });
  roof.roundRect(tb.x0, tb.y0, tb.x1 - tb.x0, tb.y1 - tb.y0, 26).stroke({ width: 3, color: theme.roofAccent });
  // glass facade edges
  roof.rect(tb.x0 + 20, tb.y0, tb.x1 - tb.x0 - 40, 7).fill({ color: theme.glass, alpha: 0.9 });
  roof.rect(tb.x0 + 20, tb.y1 - 7, tb.x1 - tb.x0 - 40, 7).fill({ color: theme.glass, alpha: 0.9 });
  // skylight strips
  for (const yy of [tb.y0 + 34, tb.y1 - 46]) {
    roof.roundRect(tb.x0 + 70, yy, tb.x1 - tb.x0 - 140, 12, 6).fill({ color: theme.glass, alpha: 0.85 });
    for (let x = tb.x0 + 80; x < tb.x1 - 80; x += 20) roof.rect(x, yy, 1.2, 12).fill({ color: 0xffffff, alpha: 0.6 });
  }
  // wave-shaped roof ribs
  for (let x = tb.x0 + 40; x < tb.x1 - 30; x += 60) {
    roof.moveTo(x, tb.y0 + 52).quadraticCurveTo(x + 30, (tb.y0 + tb.y1) / 2, x, tb.y1 - 58).stroke({ width: 1, color: theme.roofAccent, alpha: 0.9 });
  }
  // central atrium dome
  const cx = (tb.x0 + tb.x1) / 2;
  const cy = (tb.y0 + tb.y1) / 2;
  roof.circle(cx, cy, 62).fill({ color: theme.roofAccent });
  roof.circle(cx, cy, 56).fill({ color: theme.glass, alpha: 0.9 });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    roof.moveTo(cx, cy).lineTo(cx + Math.cos(a) * 56, cy + Math.sin(a) * 56);
  }
  roof.stroke({ width: 1.2, color: 0xffffff, alpha: 0.7 });
  roof.circle(cx, cy, 14).fill({ color: 0xffffff, alpha: 0.85 });
  // HVAC units & solar arrays at the wing ends
  for (let i = 0; i < 3; i++) {
    const x = tb.x0 + 70 + i * 52;
    roof.roundRect(x, cy - 16, 40, 32, 4).fill({ color: 0xadb5bd });
    roof.circle(x + 12, cy, 7).fill({ color: 0x868e96 });
    roof.circle(x + 28, cy, 7).fill({ color: 0x868e96 });
  }
  for (let i = 0; i < 2; i++) {
    const x = tb.x1 - 150 - i * 84;
    for (let r = 0; r < 3; r++) roof.rect(x, cy - 26 + r * 18, 70, 14).fill({ color: 0x1c3d6e });
    for (let r = 0; r < 3; r++) for (let k = 1; k < 7; k++) roof.rect(x + k * 10, cy - 26 + r * 18, 0.8, 14).fill({ color: 0x4dabf7, alpha: 0.5 });
  }
  if (decor.includes('garden')) {
    for (const gx of [tb.x0 + 90, tb.x1 - 90]) {
      roof.roundRect(gx - 50, cy - 40, 100, 80, 20).fill({ color: theme.treeLight });
      for (let i = 0; i < 9; i++) roof.circle(gx - 36 + (i % 3) * 36, cy - 26 + Math.floor(i / 3) * 26, 9).fill({ color: theme.tree });
    }
  }
  upper.addChild(roof);
  const nameColor = theme.roofAccent === 0xcfd8e2 ? 0xb6c3d1 : 0xc9b79c;
  const name = label('SKYCOMMAND', 46, nameColor, '800');
  name.position.set(cx - 400, cy);
  const name2 = label('INTERNATIONAL', 46, nameColor, '800');
  name2.position.set(cx + 420, cy);
  upper.addChild(name, name2);

  // terminal facade glow lights
  for (let x = tb.x0 + 30; x < tb.x1 - 30; x += 40) {
    lights.push({ x, y: tb.y0 + 3, color: 0xffd8a8, size: 1.1, kind: 'building' });
    lights.push({ x, y: tb.y1 - 3, color: 0xffd8a8, size: 1.1, kind: 'building' });
  }

  // apron flood masts
  for (let x = 700; x <= 2700; x += 400) {
    for (const y of [RING_N_Y + 70, RING_S_Y - 70]) {
      const m = new Graphics().circle(x, y, 3).fill({ color: 0x495057 });
      ground.addChild(m);
      lights.push({ x, y, color: 0xffe8cc, size: 5.5, kind: 'apron' });
    }
  }

  // ---------------- control tower, fire station, radar ----------------
  const tw = new Graphics();
  const tx0 = 440;
  const ty0 = 1100;
  tw.roundRect(tx0 - 50, ty0 - 60, 100, 120, 14).fill({ color: 0x000000, alpha: 0.12 });
  tw.roundRect(tx0 - 56, ty0 - 66, 100, 120, 14).fill({ color: theme.roofAccent });
  tw.roundRect(tx0 - 56, ty0 - 66, 100, 120, 14).stroke({ width: 2, color: 0xadb5bd });
  tw.circle(tx0 + 4, ty0 + 6, 36).fill({ color: 0x000000, alpha: 0.18 });
  tw.circle(tx0, ty0, 34).fill({ color: 0x343a40 });
  tw.circle(tx0, ty0, 30).fill({ color: theme.glass });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    tw.moveTo(tx0 + Math.cos(a) * 22, ty0 + Math.sin(a) * 22).lineTo(tx0 + Math.cos(a) * 30, ty0 + Math.sin(a) * 30);
  }
  tw.stroke({ width: 1.4, color: 0x343a40 });
  tw.circle(tx0, ty0, 22).fill({ color: 0xf1f3f5 });
  tw.circle(tx0, ty0, 6).fill({ color: 0xadb5bd });
  tw.moveTo(tx0, ty0).lineTo(tx0 + 14, ty0 - 10).stroke({ width: 1.5, color: 0x868e96 });
  upper.addChild(tw);
  const twl = label('ATC', 11, 0x495057, '800');
  twl.position.set(tx0 - 6, ty0 + 44);
  upper.addChild(twl);
  lights.push({ x: tx0, y: ty0, color: 0xff6b6b, size: 1, kind: 'tower' });
  lights.push({ x: tx0, y: ty0, color: 0x9be7ff, size: 3.5, kind: 'building' });

  // radar dish
  const radar = new Container();
  radar.position.set(140, 860);
  const radarBase = new Graphics().circle(0, 0, 16).fill({ color: 0xced4da }).circle(0, 0, 16).stroke({ width: 1.5, color: 0x868e96 });
  const radarBar = new Graphics().roundRect(-3, -22, 6, 44, 3).fill({ color: 0xf8f9fa }).roundRect(-3, -22, 6, 44, 3).stroke({ width: 1, color: 0x868e96 });
  radar.addChild(radarBase);
  const spin = new Container();
  spin.addChild(radarBar);
  radar.addChild(spin);
  upper.addChild(radar);
  animated.radar.push(spin);

  // fire station
  const fs = new Graphics();
  fs.roundRect(66, 1236, 150, 86, 8).fill({ color: 0x000000, alpha: 0.14 });
  fs.roundRect(60, 1230, 150, 86, 8).fill({ color: 0xc92a2a });
  fs.roundRect(66, 1236, 138, 74, 6).fill({ color: 0xe03131 });
  for (let i = 0; i < 4; i++) fs.rect(72 + i * 34, 1302, 26, 12).fill({ color: 0xf1f3f5 });
  upper.addChild(fs);
  const fsl = label('FIRE', 14, 0xffffff, '800');
  fsl.position.set(135, 1270);
  upper.addChild(fsl);
  for (let i = 0; i < 3; i++) {
    const s = new Sprite(bank.vehicle('fire'));
    s.anchor.set(0.5);
    s.rotation = -Math.PI / 2;
    s.position.set(85 + i * 34, 1340);
    ground.addChild(s);
  }

  // ---------------- hangars, cargo, fuel ----------------
  const hg = new Graphics();
  // maintenance apron
  hg.roundRect(3020, 560, 560, 520, 30).fill({ color: theme.apron });
  hg.roundRect(3020, 1180, 560, 440, 30).fill({ color: theme.apron });
  // connector taxiways to east lane (decor)
  hg.rect(2970, 760, 60, 46).fill({ color: theme.taxiway });
  hg.rect(2970, 1380, 60, 46).fill({ color: theme.taxiway });
  for (let i = 0; i < 2; i++) {
    const y = 600 + i * 240;
    hg.roundRect(3290, y + 8, 260, 200, 18).fill({ color: 0x000000, alpha: 0.15 });
    hg.roundRect(3280, y, 260, 200, 18).fill({ color: 0xdee2e6 });
    for (let k = 0; k < 9; k++) hg.rect(3280 + 8 + k * 28, y + 6, 18, 188).fill({ color: k % 2 ? 0xced4da : 0xe9ecef });
    hg.roundRect(3280, y, 260, 200, 18).stroke({ width: 2, color: 0xadb5bd });
    hg.rect(3278, y + 30, 6, 140).fill({ color: 0x495057 });
  }
  // cargo warehouse & containers
  hg.roundRect(3380, 1230, 170, 340, 10).fill({ color: 0xffa94d });
  hg.roundRect(3380, 1230, 170, 340, 10).stroke({ width: 2, color: 0xe8590c });
  for (let k = 0; k < 8; k++) hg.rect(3392, 1244 + k * 40, 146, 3).fill({ color: 0xe8590c, alpha: 0.6 });
  const contColors = [0x1971c2, 0xe03131, 0x2f9e44, 0xf08c00, 0x5f3dc4, 0x0c8599];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 5; c++) {
      hg.rect(3060 + c * 26, 1450 + r * 36, 22, 30).fill({ color: contColors[(r * 5 + c) % contColors.length]! });
      hg.rect(3060 + c * 26, 1450 + r * 36, 22, 30).stroke({ width: 0.8, color: 0x000000, alpha: 0.3 });
    }
  }
  // fuel farm
  for (let i = 0; i < 4; i++) {
    const fx = 3250 + (i % 2) * 120;
    const fy = 1980 + Math.floor(i / 2) * 120;
    hg.circle(fx + 5, fy + 6, 46).fill({ color: 0x000000, alpha: 0.14 });
    hg.circle(fx, fy, 46).fill({ color: 0xf1f3f5 });
    hg.circle(fx, fy, 46).stroke({ width: 2, color: 0xadb5bd });
    hg.circle(fx, fy, 20).stroke({ width: 1.5, color: 0xced4da });
  }
  hg.roundRect(3170, 1900, 280, 260, 20).stroke({ width: 3, color: 0x868e96, alpha: 0.6 });
  upper.addChild(hg);
  const cargoLbl = label('CARGO', 18, 0xffffff, '800');
  cargoLbl.position.set(3465, 1400);
  cargoLbl.rotation = Math.PI / 2;
  upper.addChild(cargoLbl);

  // static decor aircraft (hangar & cargo)
  const decoA = new Sprite(bank.aircraft('b777', 'polar'));
  decoA.anchor.set(0.5);
    decoA.position.set(3170, 1330);
  decoA.rotation = Math.PI;
  ground.addChild(decoA);
  const decoB = new Sprite(bank.aircraft('atr72', 'evergreen'));
  decoB.anchor.set(0.5);
    decoB.position.set(3150, 700);
  decoB.rotation = Math.PI;
  ground.addChild(decoB);
  void getType;
  void LIVERY_BY_ID;

  // ---------------- landside (south) ----------------
  const ls = new Graphics();
  // roads
  ls.rect(-6000, 2700, 16000, 34).fill({ color: 0x5c636a });
  for (let x = -6000; x < 10000; x += 40) ls.rect(x, 2716, 22, 2).fill({ color: 0xffffff, alpha: 0.7 });
  ls.rect(1500, 2640, 34, 60).fill({ color: 0x5c636a });
  // car parks
  const carColors = [0xe03131, 0x1971c2, 0xf8f9fa, 0x212529, 0x868e96, 0xfab005, 0x2f9e44, 0x7048e8];
  for (let p = 0; p < 3; p++) {
    const px = 600 + p * 700;
    ls.roundRect(px, 2770, 560, 240, 14).fill({ color: 0x868e96 });
    for (let row = 0; row < 5; row++) {
      for (let c = 0; c < 26; c++) {
        const x = px + 14 + c * 20.5;
        const y = 2784 + row * 44;
        ls.rect(x, y, 0.8, 18).fill({ color: 0xffffff, alpha: 0.6 });
        if (R() < 0.72) ls.roundRect(x + 4, y + 2, 12, 14, 3).fill({ color: carColors[Math.floor(R() * carColors.length)]! });
      }
    }
  }
  ground.addChild(ls);

  // ---------------- trees ----------------
  const treeTex: Texture = bank.tree(theme.tree, theme.treeDark, theme.treeLight, !!theme.snow);
  const treeLayer = new Container();
  const placeTree = (x: number, y: number, s: number) => {
    const sh = new Sprite(treeTex);
    sh.anchor.set(0.5);
    sh.tint = 0x000000;
    sh.alpha = 0.18;
    sh.scale.set(s);
    sh.position.set(x + 8 * s, y + 10 * s);
    const t = new Sprite(treeTex);
    t.anchor.set(0.5);
    t.scale.set(s);
    t.position.set(x, y);
    treeLayer.addChild(sh, t);
  };
  // tree belts outside the airfield
  for (let i = 0; i < 260; i++) {
    const side = i % 4;
    let x = 0;
    let y = 0;
    if (side === 0) {
      x = -1800 + R() * 6600;
      y = PROPERTY.y0 - 120 - R() * 380;
    } else if (side === 1) {
      x = -1800 + R() * 6600;
      y = PROPERTY.y1 + 420 + R() * 500;
    } else if (side === 2) {
      x = PROPERTY.x0 - 120 - R() * 700;
      y = -600 + R() * 3400;
    } else {
      x = PROPERTY.x1 + 120 + R() * 600;
      y = -600 + R() * 3400;
    }
    if (theme.id === 'desert' && R() < 0.6) continue;
    placeTree(x, y, 0.7 + R() * 0.8);
  }
  // groves inside the property (clear of runways/taxiways)
  const groves: [number, number, number][] = [
    [120, 620, 9],
    [140, 1580, 9],
    [3150, 300, 8],
    [3250, 2400, 10],
    [-500, 1100, 12],
    [1600, 2350, 10],
    [800, 2380, 8],
    [2600, 2380, 8],
    [1200, -300, 10],
    [2400, -350, 10],
  ];
  for (const [gx, gy, n] of groves) for (let i = 0; i < n; i++) placeTree(gx + (R() - 0.5) * 200, gy + (R() - 0.5) * 140, 0.6 + R() * 0.6);
  ground.addChild(treeLayer);

  // ---------------- wind socks ----------------
  for (const r of Object.values(AIRPORT.runways)) {
    const ws = new Container();
    ws.position.set(r.x0 + 330, r.y + (r.y < 1100 ? -100 : 100));
    const pole = new Graphics().circle(0, 0, 2.5).fill({ color: 0x495057 });
    const sock = new Graphics();
    for (let i = 0; i < 5; i++) sock.rect(i * 5, -2.5 + i * 0.3, 5, 5 - i * 0.6).fill({ color: i % 2 ? 0xffffff : 0xfd7e14 });
    ws.addChild(sock, pole);
    ground.addChild(ws);
    animated.windsocks.push(ws);
  }

  // ---------------- unlockable decorations ----------------
  if (decor.includes('flowers')) {
    const fl = new Graphics();
    const cols = [0xff8fab, 0xffd43b, 0xda77f2, 0xff6b6b, 0x74c0fc];
    for (const [bx, by] of [
      [440, 960],
      [440, 1250],
      [1660, 2600],
    ] as const) {
      fl.roundRect(bx - 60, by - 22, 120, 44, 22).fill({ color: theme.treeDark });
      for (let i = 0; i < 40; i++) fl.circle(bx - 52 + R() * 104, by - 16 + R() * 32, 2.6).fill({ color: cols[i % cols.length]! });
    }
    ground.addChild(fl);
  }
  if (decor.includes('solarfarm')) {
    const sf = new Graphics();
    for (let r = 0; r < 6; r++) for (let c = 0; c < 10; c++) sf.rect(-780 + c * 34, 2150 + r * 40, 30, 26).fill({ color: 0x1c3d6e }).rect(-780 + c * 34, 2150 + r * 40, 30, 26).stroke({ width: 0.8, color: 0x74c0fc, alpha: 0.6 });
    ground.addChild(sf);
  }
  if (decor.includes('turbines')) {
    for (let i = 0; i < 4; i++) {
      const tc = new Container();
      tc.position.set(-300 + i * 520, -520);
      const base = new Graphics().circle(0, 0, 5).fill({ color: 0xf1f3f5 }).circle(0, 0, 5).stroke({ width: 1, color: 0xadb5bd });
      const rot = new Container();
      const blades = new Graphics();
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2;
        blades.moveTo(0, 0).lineTo(Math.cos(a) * 46, Math.sin(a) * 46);
      }
      blades.stroke({ width: 3.5, color: 0xf8f9fa, cap: 'round' });
      rot.addChild(blades);
      tc.addChild(rot, base);
      upper.addChild(tc);
      animated.turbines.push(rot);
    }
  }
  if (decor.includes('ferris')) {
    const fc = new Container();
    fc.position.set(2500, 2900);
    const rot = new Container();
    const wheel = new Graphics().circle(0, 0, 70).stroke({ width: 3, color: 0xffffff });
    const cols = [0xff6b6b, 0xffd43b, 0x69db7c, 0x4dabf7, 0xda77f2, 0xff922b];
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      wheel.moveTo(0, 0).lineTo(Math.cos(a) * 70, Math.sin(a) * 70).stroke({ width: 1, color: 0xffffff, alpha: 0.7 });
      wheel.circle(Math.cos(a) * 72, Math.sin(a) * 72, 7).fill({ color: cols[k % cols.length]! });
    }
    rot.addChild(wheel);
    fc.addChild(rot);
    upper.addChild(fc);
    animated.ferris.push(rot);
  }
  if (decor.includes('fountain')) {
    const fo = new Container();
    fo.position.set(cx, 2600);
    const basin = new Graphics().circle(0, 0, 46).fill({ color: 0xdee2e6 }).circle(0, 0, 40).fill({ color: theme.water });
    const jets = new Container();
    const jg = new Graphics();
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      jg.circle(Math.cos(a) * 22, Math.sin(a) * 22, 4).fill({ color: 0xffffff, alpha: 0.85 });
    }
    jg.circle(0, 0, 8).fill({ color: 0xffffff });
    jets.addChild(jg);
    fo.addChild(basin, jets);
    ground.addChild(fo);
    animated.fountains.push(jets);
  }
  if (decor.includes('statue')) {
    const st = new Container();
    st.position.set(1550, 2600);
    const plinth = new Graphics().roundRect(-40, -40, 80, 80, 10).fill({ color: 0xced4da });
    const sp = new Sprite(bank.aircraft('classic', 'heritage'));
    sp.anchor.set(0.5);
        sp.rotation = -Math.PI / 4;
    sp.tint = 0xffd43b;
    st.addChild(plinth, sp);
    ground.addChild(st);
  }

  return { ground, upper, lights, animated };
}
