/**
 * Procedural top-down aircraft illustrations. Each aircraft is drawn nose-to-the-right
 * (+x) centred on the origin, in world units, then cached as a texture.
 */

import { Graphics } from 'pixi.js';
import type { AircraftType, Livery } from '../sim/aircraft';

const WING = 0xdfe5ec;
const WING_EDGE = 0xa7b1bc;
const OUTLINE = 0x7d8794;
const WINDOW = 0x223044;

function mirror(pts: number[]): number[] {
  const res: number[] = [];
  for (let i = 0; i < pts.length; i += 2) res.push(pts[i]!, -pts[i + 1]!);
  return res;
}

interface WingSpec {
  rootX: number; // centre of root chord
  rootChord: number;
  semi: number;
  body: number; // half fuselage width
  sweep: number;
  taper: number;
  kink: boolean;
  raked?: boolean;
}

function wingPoly(w: WingSpec): { pts: number[]; leAt: (y: number) => number; teAt: (y: number) => number } {
  const tanS = Math.tan(w.sweep);
  const rootLE = w.rootX + w.rootChord / 2;
  const rootTE = w.rootX - w.rootChord / 2;
  const span = w.semi - w.body;
  const tipLE = rootLE - tanS * span;
  const tipChord = w.rootChord * w.taper;
  const tipTE = tipLE - tipChord - (w.raked ? w.rootChord * 0.12 : 0);
  const yK = w.body + span * 0.34;
  const kinkTE = w.kink ? rootTE - tanS * span * 0.08 : rootTE - (rootTE - tipTE) * 0.34;
  const pts = w.kink
    ? [rootLE, w.body, tipLE, w.semi, tipTE, w.semi, kinkTE, yK, rootTE, w.body]
    : [rootLE, w.body, tipLE, w.semi, tipTE, w.semi, rootTE, w.body];
  const leAt = (y: number) => rootLE - tanS * (y - w.body);
  const teAt = (y: number) => {
    if (!w.kink) return rootTE + ((tipTE - rootTE) * (y - w.body)) / span;
    if (y <= yK) return rootTE + ((kinkTE - rootTE) * (y - w.body)) / (yK - w.body);
    return kinkTE + ((tipTE - kinkTE) * (y - yK)) / (w.semi - yK);
  };
  return { pts, leAt, teAt };
}

export function drawAircraft(g: Graphics, t: AircraftType, liv: Livery) {
  const len = t.length;
  const fw = t.fuselageWidth;
  const nose = len / 2;
  const tail = -len / 2;
  const semi = t.span / 2;
  const isProp = t.engines === 'twinProp';
  const isDelta = t.id === 'swift';
  const isSolar = t.id === 'solar';
  const isClassic = t.id === 'classic';

  // ---------------- main wing ----------------
  const rootChord = isDelta ? len * 0.62 : isSolar ? len * 0.09 : isProp ? len * 0.12 : isClassic ? len * 0.2 : len * 0.2;
  const wingX = nose - t.wingPos * len;
  const wing = wingPoly({
    rootX: wingX,
    rootChord,
    semi,
    body: fw / 2,
    sweep: t.sweep,
    taper: isDelta ? 0.04 : isSolar ? 0.9 : isProp ? 0.55 : isClassic ? 0.45 : 0.27,
    kink: !isProp && !isDelta && !isSolar && !isClassic,
    raked: t.wingTip === 'raked',
  });

  // engines under wing are drawn before wings for low wing (visible ahead of LE anyway)
  const engineColor = liv.engine;
  const drawPod = (cx: number, cy: number, l: number, w: number) => {
    g.roundRect(cx - l / 2, cy - w / 2, l, w, w * 0.45).fill({ color: engineColor });
    g.roundRect(cx - l / 2, cy - w / 2, l, w, w * 0.45).stroke({ width: 0.35, color: OUTLINE, alpha: 0.7 });
    // intake lip
    g.ellipse(cx + l / 2 - 0.4, cy, 0.9, w * 0.42).fill({ color: 0x343a40 });
    // exhaust
    g.roundRect(cx - l / 2 - l * 0.12, cy - w * 0.22, l * 0.16, w * 0.44, w * 0.2).fill({ color: 0x868e96 });
  };

  const podSpecs: { x: number; y: number; l: number; w: number }[] = [];
  if (t.engines === 'twinWing' || t.engines === 'quadWing') {
    const ys = t.engines === 'quadWing' ? [0.27, 0.55] : [t.cat === 'S' ? 0.3 : 0.33];
    const engL = len * (t.engines === 'quadWing' ? 0.075 : t.cat === 'H' ? 0.08 : 0.1);
    const engW = t.engines === 'quadWing' ? fw * 0.42 : t.cat === 'H' ? fw * 0.58 : fw * 0.52;
    for (const f of ys) {
      const y = fw / 2 + (semi - fw / 2) * f;
      const le = wing.leAt(y);
      podSpecs.push({ x: le + engL * 0.15, y, l: engL, w: engW });
    }
  }

  // wing shadow/edge
  const wingDraw = (pts: number[]) => {
    g.poly(pts, true).fill({ color: WING });
    g.poly(pts, true).stroke({ width: 0.4, color: WING_EDGE, alpha: 0.9, join: 'round' });
  };
  wingDraw(wing.pts);
  wingDraw(mirror(wing.pts));

  // flap / aileron lines
  if (!isDelta) {
    for (const s of [1, -1]) {
      const y0 = fw / 2 + 1;
      const y1 = semi - 1;
      g.moveTo(wing.teAt(y0) + rootChord * 0.18, s * y0)
        .lineTo(wing.teAt(y1) + rootChord * 0.06, s * y1)
        .stroke({ width: 0.3, color: WING_EDGE, alpha: 0.8 });
      // wing walkway / root fairing tint
      g.poly([wing.leAt(y0) - 1, s * y0, wing.leAt(y0 + 3) - 1.5, s * (y0 + 3), wing.teAt(y0 + 3) + 1, s * (y0 + 3), wing.teAt(y0) + 1, s * y0], true).fill({
        color: 0xc9d1da,
      });
    }
  } else {
    // delta wing panel lines
    for (const s of [1, -1]) {
      g.moveTo(wingX + rootChord * 0.3, s * fw * 0.5)
        .lineTo(wingX - rootChord * 0.45, s * semi * 0.9)
        .stroke({ width: 0.35, color: WING_EDGE, alpha: 0.8 });
    }
  }

  // wingtip devices
  for (const s of [1, -1]) {
    const tipLE = wing.leAt(semi);
    const tipTE = wing.teAt(semi);
    const c = tipLE - tipTE;
    if (t.wingTip === 'sharklet' || t.wingTip === 'scimitar') {
      g.poly([tipLE - c * 0.15, s * semi, tipTE + c * 0.05, s * semi, tipTE - c * 0.12, s * (semi + 1.4), tipLE - c * 0.45, s * (semi + 1.2)], true).fill({
        color: liv.accent,
      });
    } else if (t.wingTip === 'curved') {
      g.poly([tipLE, s * semi, tipTE, s * semi, tipTE - c * 0.25, s * (semi + 1.6), tipLE - c * 0.55, s * (semi + 1.8)], true).fill({ color: liv.tail });
    } else if (t.wingTip === 'raked') {
      g.poly([tipLE, s * semi, tipTE, s * semi, tipTE - c * 0.3, s * (semi + 0.6)], true).fill({ color: WING_EDGE });
    }
  }

  // underwing pods (visible from above, ahead of leading edge)
  for (const p of podSpecs) {
    drawPod(p.x, p.y, p.l, p.w);
    drawPod(p.x, -p.y, p.l, p.w);
    // pylon
    g.rect(p.x - p.l * 0.2, p.y - 0.5, p.l * 0.5, 1).fill({ color: 0xadb5bd });
    g.rect(p.x - p.l * 0.2, -p.y - 0.5, p.l * 0.5, 1).fill({ color: 0xadb5bd });
  }

  // propeller engines on/under wing
  if (isProp) {
    const n = t.engineCount;
    const fracs = n === 4 ? [0.25, 0.55] : isClassic ? [0.24] : [0.3];
    for (const f of fracs) {
      const y = fw / 2 + (semi - fw / 2) * f;
      const le = wing.leAt(y);
      const nl = len * (isClassic ? 0.2 : 0.2);
      const nw = isClassic ? fw * 0.95 : isSolar ? 1.6 : fw * 0.48;
      for (const s of [1, -1]) {
        g.roundRect(le - nl * 0.55, s * y - nw / 2, nl, nw, nw * 0.5).fill({ color: isClassic ? 0xadb5bd : liv.body });
        g.roundRect(le - nl * 0.55, s * y - nw / 2, nl, nw, nw * 0.5).stroke({ width: 0.35, color: OUTLINE, alpha: 0.7 });
        // spinner
        g.ellipse(le + nl * 0.45, s * y, 1.1, nw * 0.3).fill({ color: liv.accent });
        // prop disc
        const pr = isSolar ? 3 : isClassic ? 6 : 7.5;
        g.ellipse(le + nl * 0.47, s * y, 0.7, pr).fill({ color: 0x495057, alpha: 0.28 });
        g.moveTo(le + nl * 0.47, s * y - pr).lineTo(le + nl * 0.47, s * y + pr).stroke({ width: 0.5, color: 0x343a40, alpha: 0.5 });
      }
    }
  }

  // rear-mounted nacelles (delta)
  if (t.engines === 'twinRear') {
    for (const s of [1, -1]) {
      const y = fw / 2 + 4.5;
      const x = wingX - rootChord * 0.28;
      g.roundRect(x - 11, s * y - 3.2, 22, 6.4, 1.5).fill({ color: 0xced4da });
      g.roundRect(x - 11, s * y - 3.2, 22, 6.4, 1.5).stroke({ width: 0.35, color: OUTLINE, alpha: 0.8 });
      g.rect(x - 12.5, s * y - 2.4, 1.8, 4.8).fill({ color: 0x495057 });
    }
  }

  // ---------------- horizontal stabiliser (conventional tail) ----------------
  const stabSemi = isDelta ? 0 : isSolar ? semi * 0.22 : t.span * (isProp ? 0.17 : 0.17);
  const drawStab = (x: number) => {
    if (stabSemi <= 0) return;
    const sw = wingPoly({
      rootX: x,
      rootChord: len * (isProp ? 0.1 : 0.1),
      semi: stabSemi,
      body: fw * 0.3,
      sweep: t.sweep + 0.06,
      taper: 0.45,
      kink: false,
    });
    g.poly(sw.pts, true).fill({ color: WING });
    g.poly(sw.pts, true).stroke({ width: 0.35, color: WING_EDGE, alpha: 0.9 });
    const m = mirror(sw.pts);
    g.poly(m, true).fill({ color: WING });
    g.poly(m, true).stroke({ width: 0.35, color: WING_EDGE, alpha: 0.9 });
  };
  if (t.tail === 'conventional') drawStab(tail + len * 0.1);

  // ---------------- fuselage ----------------
  const noseLen = Math.min(fw * (isDelta ? 4.5 : 1.35), len * 0.2);
  const tailStart = tail + len * (isProp ? 0.24 : 0.22);
  const body: number[] = [];
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * (Math.PI / 2);
    body.push(nose - noseLen * (1 - Math.cos(a)), (fw / 2) * Math.sin(a));
  }
  body.push(tailStart, fw / 2);
  // tail cone (slight upsweep look)
  body.push(tail + len * 0.06, fw * 0.24, tail + 0.6, fw * 0.1, tail, 0);
  const full = [...body];
  for (let i = body.length - 2; i >= 0; i -= 2) {
    if (body[i + 1] === 0) continue;
    full.push(body[i]!, -body[i + 1]!);
  }
  g.poly(full, true).fill({ color: liv.body });

  // livery: rear wrap in tail colour
  if (!isClassic && !isSolar) {
    const wrapStart = tail + len * 0.2;
    const wrap: number[] = [wrapStart + 4, fw / 2, tailStart, fw / 2, tail + len * 0.06, fw * 0.24, tail + 0.6, fw * 0.1, tail, 0, tail + 0.6, -fw * 0.1, tail + len * 0.06, -fw * 0.24, tailStart, -fw / 2, wrapStart + 4, -fw / 2, wrapStart, 0];
    g.poly(wrap, true).fill({ color: liv.tail, alpha: 0.95 });
  }
  // crown stripe
  g.roundRect(tail + len * 0.18, -fw * 0.11, len * 0.6 - noseLen, fw * 0.22, fw * 0.1).fill({ color: liv.stripe, alpha: 0.85 });
  // glossy highlight
  g.roundRect(tail + len * 0.12, -fw * 0.2, len * 0.72, fw * 0.4, fw * 0.2).fill({ color: 0xffffff, alpha: 0.18 });
  if (t.doubleDeck) {
    g.roundRect(nose - len * 0.62, -fw * 0.36, len * 0.5, fw * 0.72, fw * 0.3).stroke({ width: 0.35, color: OUTLINE, alpha: 0.35 });
  }
  g.poly(full, true).stroke({ width: 0.4, color: OUTLINE, alpha: 0.75, join: 'round' });

  // cockpit windscreen
  const wx = nose - noseLen * (isDelta ? 0.35 : 0.55);
  g.roundRect(wx - noseLen * 0.14, -fw * 0.33, noseLen * 0.28, fw * 0.66, fw * 0.15).fill({ color: WINDOW });
  g.roundRect(wx - noseLen * 0.1, -fw * 0.26, noseLen * 0.08, fw * 0.18, 0.4).fill({ color: 0x8fb7d8, alpha: 0.8 });
  // nose cone accent
  if (isDelta) g.ellipse(nose - 2, 0, 3, fw * 0.12).fill({ color: 0x495057 });

  // ---------------- vertical fin (seen from above) ----------------
  const finLen = len * (isProp ? 0.22 : 0.19);
  const finStart = tail + 0.8;
  const finW = Math.max(1.2, fw * 0.28);
  g.poly([finStart, 0, finStart + finLen * 0.25, -finW / 2, finStart + finLen, -finW * 0.18, finStart + finLen * 1.05, 0, finStart + finLen, finW * 0.18, finStart + finLen * 0.25, finW / 2], true).fill({
    color: liv.tail,
  });
  g.poly([finStart, 0, finStart + finLen * 0.25, -finW / 2, finStart + finLen, -finW * 0.18, finStart + finLen * 1.05, 0, finStart + finLen, finW * 0.18, finStart + finLen * 0.25, finW / 2], true).stroke({
    width: 0.3,
    color: 0x000000,
    alpha: 0.25,
  });
  // fin highlight in accent
  g.poly([finStart + finLen * 0.3, -finW * 0.18, finStart + finLen * 0.85, -finW * 0.06, finStart + finLen * 0.85, finW * 0.06, finStart + finLen * 0.3, finW * 0.18], true).fill({
    color: liv.accent,
    alpha: 0.9,
  });
  if (t.tail === 'T') drawStab(tail + len * 0.04);

  // beacon positions are drawn dynamically by renderer
}

export function vehicleArt(g: Graphics, kind: string, color = 0xffd43b) {
  switch (kind) {
    case 'tug': // baggage tug
      g.roundRect(-3.5, -2.2, 7, 4.4, 1).fill({ color });
      g.roundRect(-0.5, -1.8, 3.2, 3.6, 0.6).fill({ color: 0x343a40 });
      break;
    case 'cart':
      g.roundRect(-3, -2.1, 6, 4.2, 0.6).fill({ color: 0x868e96 });
      g.rect(-2.4, -1.6, 2.2, 1.4).fill({ color: 0x4dabf7 });
      g.rect(0.2, -1.6, 2, 1.5).fill({ color: 0xff8787 });
      g.rect(-2.4, 0.2, 2.6, 1.4).fill({ color: 0xffd43b });
      g.rect(0.6, 0.3, 1.8, 1.3).fill({ color: 0x69db7c });
      break;
    case 'fuel':
      g.roundRect(-8, -2.6, 16, 5.2, 1.2).fill({ color: 0xf1f3f5 });
      g.roundRect(-7, -2.1, 10.5, 4.2, 2).fill({ color: 0xced4da });
      g.rect(-6.5, -0.4, 9.5, 0.8).fill({ color: 0xfab005 });
      g.roundRect(4.2, -2.4, 3.6, 4.8, 0.8).fill({ color: 0x1971c2 });
      break;
    case 'catering':
      g.roundRect(-6.5, -2.6, 13, 5.2, 1).fill({ color: 0xffffff });
      g.rect(-6, -2.2, 8.5, 4.4).fill({ color: 0xe9ecef });
      g.rect(-5.5, -0.3, 7.5, 0.6).fill({ color: 0xf06595 });
      g.roundRect(3.2, -2.3, 3, 4.6, 0.8).fill({ color: 0x495057 });
      break;
    case 'bus':
      g.roundRect(-12, -3.2, 24, 6.4, 1.6).fill({ color: 0x1c7ed6 });
      g.roundRect(-11, -2.5, 22, 5, 1.2).fill({ color: 0xe7f5ff });
      for (let i = -9; i <= 7; i += 4) g.rect(i, -1.2, 2.5, 2.4).fill({ color: 0xadb5bd });
      break;
    case 'pushtug':
      g.roundRect(-5, -3, 10, 6, 1.4).fill({ color: 0xfab005 });
      g.rect(-4.2, -2.4, 3, 4.8).fill({ color: 0x212529 });
      g.rect(1, -3, 1, 6).fill({ color: 0x212529, alpha: 0.6 });
      break;
    case 'fire':
      g.roundRect(-9, -3.2, 18, 6.4, 1.4).fill({ color: 0xe03131 });
      g.rect(-7.5, -2.4, 11, 4.8).fill({ color: 0xc92a2a });
      g.rect(-6.5, -0.5, 9, 1).fill({ color: 0xf1f3f5 });
      g.roundRect(4.2, -2.8, 4, 5.6, 1).fill({ color: 0xf1f3f5 });
      g.rect(5.5, -2.6, 1.2, 5.2).fill({ color: 0x4dabf7 });
      break;
    case 'follow':
      g.roundRect(-4, -2.2, 8, 4.4, 1.2).fill({ color: 0xfab005 });
      for (let i = 0; i < 4; i++) g.rect(-3 + i * 1.6, -1.6 + (i % 2) * 1.6, 1.6, 1.6).fill({ color: 0x212529 });
      g.rect(-1, -2.4, 2, 4.8).fill({ color: 0xffffff, alpha: 0.3 });
      break;
    default: // car
      g.roundRect(-4.2, -2, 8.4, 4, 1.4).fill({ color });
      g.roundRect(-1.8, -1.6, 3.6, 3.2, 0.8).fill({ color: 0x343a40, alpha: 0.75 });
      g.roundRect(-1.4, -1.4, 2.8, 2.8, 0.6).fill({ color });
  }
}
