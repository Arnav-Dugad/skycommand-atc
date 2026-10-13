/**
 * Cosmetic ground vehicles. These are purely visual (not part of the deterministic
 * simulation) and react to what aircraft are doing: service trucks visit parked
 * aircraft, a tug pushes departures back, fire trucks escort emergency landings and
 * ambient traffic drives around the perimeter and landside roads.
 */

import { Container, Sprite } from 'pixi.js';
import { getType } from '../sim/aircraft';
import { AIRPORT, TERMINAL_N_FACE, TERMINAL_S_FACE } from '../sim/airport';
import type { Aircraft, World } from '../sim/types';
import { PROPERTY } from './airportArt';
import type { TextureBank } from './textures';

interface Vehicle {
  id: number;
  kind: string;
  sprite: Sprite;
  head?: Sprite;
  head2?: Sprite;
  flash?: Sprite;
  pts: number[];
  seg: number;
  segT: number;
  speed: number;
  state: 'in' | 'wait' | 'out' | 'loop';
  waitFor?: () => boolean;
  minWait: number;
  waited: number;
  heading: number;
  alpha: number;
  follow?: { ac: string; local: [number, number]; rot: number };
  remove?: boolean;
  owner?: string;
  trailOf?: Vehicle;
  trailGap?: number;
  history?: number[];
}

const SCALE = 1.5;

export class VehicleSystem {
  private layer: Container;
  private lights: Container;
  private bank: TextureBank;
  private vehicles: Vehicle[] = [];
  private serviced = new Set<string>();
  private pushTugs = new Map<string, Vehicle>();
  private fireDone = new Set<string>();
  private nextId = 1;
  private ambientMade = false;
  enabled = true;

  constructor(layer: Container, lights: Container, bank: TextureBank) {
    this.layer = layer;
    this.lights = lights;
    this.bank = bank;
  }

  private make(kind: string, color?: number, withLights = true): Vehicle {
    const sprite = new Sprite(this.bank.vehicle(kind, color));
    sprite.anchor.set(0.5);
    sprite.scale.set(SCALE);
    this.layer.addChild(sprite);
    const v: Vehicle = {
      id: this.nextId++,
      kind,
      sprite,
      pts: [],
      seg: 0,
      segT: 0,
      speed: 20,
      state: 'in',
      minWait: 0,
      waited: 0,
      heading: 0,
      alpha: 0,
    };
    if (withLights) {
      const h = new Sprite(this.bank.glow());
      h.anchor.set(0.5);
      h.blendMode = 'add';
      h.tint = 0xfff4d6;
      h.scale.set(0.16);
      this.lights.addChild(h);
      v.head = h;
      const h2 = new Sprite(this.bank.glow());
      h2.anchor.set(0.5);
      h2.blendMode = 'add';
      h2.tint = 0xff4d4d;
      h2.scale.set(0.08);
      this.lights.addChild(h2);
      v.head2 = h2;
    }
    if (kind === 'fire' || kind === 'follow') {
      const f = new Sprite(this.bank.glow());
      f.anchor.set(0.5);
      f.blendMode = 'add';
      f.scale.set(0.3);
      this.lights.addChild(f);
      v.flash = f;
    }
    this.vehicles.push(v);
    return v;
  }

  private destroyVehicle(v: Vehicle) {
    v.sprite.destroy();
    v.head?.destroy();
    v.head2?.destroy();
    v.flash?.destroy();
  }

  reset() {
    for (const v of this.vehicles) this.destroyVehicle(v);
    this.vehicles = [];
    this.serviced.clear();
    this.pushTugs.clear();
    this.fireDone.clear();
    this.ambientMade = false;
  }

  private local(ac: Aircraft, fx: number, rx: number): [number, number] {
    const c = Math.cos(ac.h);
    const s = Math.sin(ac.h);
    return [ac.x + c * fx - s * rx, ac.y + s * fx + c * rx];
  }

  private spawnService(ac: Aircraft) {
    const t = getType(ac.typeId);
    const gate = ac.gate ? AIRPORT.gateById[ac.gate] : undefined;
    if (!gate) return;
    const roadY = gate.side === 'N' ? TERMINAL_N_FACE + 15 : TERMINAL_S_FACE - 15;
    const stillParked = () => ac.phase === 'parked' && ac.turn?.stage !== 'ready';
    const jobs: { kind: string; fx: number; rx: number; delay: number; color?: number; train?: number }[] = [
      { kind: 'tug', fx: -t.length * 0.27, rx: t.fuselageWidth / 2 + 7, delay: 0.5, color: 0xffd43b, train: 2 },
      { kind: 'catering', fx: -t.length * 0.34, rx: -(t.fuselageWidth / 2 + 7), delay: 3 },
    ];
    if (t.cat !== 'S' || t.id === 'e190') jobs.push({ kind: 'fuel', fx: -t.length * 0.02, rx: t.span * 0.27, delay: 5 });
    if (t.cat === 'H' || t.cat === 'J') jobs.push({ kind: 'tug', fx: t.length * 0.2, rx: t.fuselageWidth / 2 + 7, delay: 2, color: 0x74c0fc, train: 2 });
    for (const j of jobs) {
      const [tx, ty] = this.local(ac, j.fx, j.rx);
      const startX = gate.x + (tx > gate.x ? 70 : -70);
      const pts = [startX, roadY, tx, roadY, tx, ty];
      const v = this.make(j.kind, j.color);
      v.pts = pts;
      v.speed = 16;
      v.state = 'in';
      v.waitFor = stillParked;
      v.minWait = 4;
      v.waited = -j.delay;
      v.owner = ac.id;
      this.place(v, 0);
      if (j.train) {
        let lead = v;
        for (let k = 0; k < j.train; k++) {
          const cart = this.make('cart', undefined, false);
          cart.trailOf = lead;
          cart.trailGap = 11;
          cart.owner = ac.id;
          lead = cart;
        }
      }
    }
  }

  private place(v: Vehicle, _dt: number) {
    const i = Math.min(v.seg, v.pts.length / 2 - 2);
    const x0 = v.pts[i * 2]!;
    const y0 = v.pts[i * 2 + 1]!;
    const x1 = v.pts[i * 2 + 2]!;
    const y1 = v.pts[i * 2 + 3]!;
    v.sprite.position.set(x0 + (x1 - x0) * v.segT, y0 + (y1 - y0) * v.segT);
    if (Math.abs(x1 - x0) + Math.abs(y1 - y0) > 0.01) {
      const target = Math.atan2(y1 - y0, x1 - x0) + (v.state === 'out' ? 0 : 0);
      v.heading = target;
    }
    v.sprite.rotation = v.heading;
  }

  private advance(v: Vehicle, dt: number, reverse: boolean): boolean {
    let dist = v.speed * dt;
    while (dist > 0) {
      const n = v.pts.length / 2 - 1;
      if (v.seg >= n) return true;
      const x0 = v.pts[v.seg * 2]!;
      const y0 = v.pts[v.seg * 2 + 1]!;
      const x1 = v.pts[v.seg * 2 + 2]!;
      const y1 = v.pts[v.seg * 2 + 3]!;
      const L = Math.hypot(x1 - x0, y1 - y0) || 0.001;
      const remain = (1 - v.segT) * L;
      if (dist < remain) {
        v.segT += dist / L;
        dist = 0;
      } else {
        dist -= remain;
        v.seg++;
        v.segT = 0;
      }
    }
    void reverse;
    return v.seg >= v.pts.length / 2 - 1;
  }

  private ambient() {
    if (this.ambientMade) return;
    this.ambientMade = true;
    // perimeter patrol
    const p = PROPERTY;
    const inset = 40;
    const loop = [p.x0 + inset, p.y0 + inset, p.x1 - inset, p.y0 + inset, p.x1 - inset, p.y1 - inset, p.x0 + inset, p.y1 - inset, p.x0 + inset, p.y0 + inset];
    for (let k = 0; k < 2; k++) {
      const v = this.make('follow');
      v.pts = loop;
      v.speed = 34;
      v.state = 'loop';
      v.seg = k * 2;
      v.alpha = 1;
    }
    // landside traffic
    const colors = [0xe03131, 0x1971c2, 0xf8f9fa, 0x212529, 0xfab005, 0x2f9e44, 0x7048e8];
    for (let k = 0; k < 9; k++) {
      const dir = k % 2 === 0;
      const v = this.make(k === 4 ? 'bus' : 'car', colors[k % colors.length]);
      v.pts = dir ? [-3000, 2709, 6500, 2709] : [6500, 2725, -3000, 2725];
      v.speed = 40 + (k % 3) * 8;
      v.state = 'loop';
      v.segT = (k * 0.137) % 1;
      v.alpha = 1;
    }
    // airside buses on terminal service roads
    for (const [y, dir] of [
      [TERMINAL_N_FACE + 8, 1],
      [TERMINAL_S_FACE - 22, -1],
    ] as const) {
      const v = this.make('bus');
      v.pts = dir > 0 ? [740, y, 2580, y] : [2580, y + 14, 740, y + 14];
      v.speed = 22;
      v.state = 'loop';
      v.alpha = 1;
    }
  }

  update(world: World, dt: number, time: number, night: number) {
    if (!this.enabled) {
      if (this.vehicles.length) this.reset();
      return;
    }
    this.ambient();
    const acById = new Map(world.aircraft.map((a) => [a.id, a]));

    for (const ac of world.aircraft) {
      if (ac.phase === 'parked' && ac.turn && ac.turn.stage !== 'ready' && !this.serviced.has(ac.id)) {
        this.serviced.add(ac.id);
        this.spawnService(ac);
      }
      if (ac.phase === 'pushback' && !this.pushTugs.has(ac.id)) {
        const v = this.make('pushtug');
        const t = getType(ac.typeId);
        v.follow = { ac: ac.id, local: [t.length / 2 + 8, 0], rot: Math.PI };
        v.state = 'wait';
        v.alpha = 0;
        v.owner = ac.id;
        this.pushTugs.set(ac.id, v);
      }
    }
    // fire trucks for emergencies on short final / landing
    for (const ac of world.aircraft) {
      if (!ac.emergency) continue;
      if (ac.phase === 'approach' && ac.approach?.stage === 'final' && !this.fireDone.has(ac.id)) {
        this.fireDone.add(ac.id);
        const rw = AIRPORT.runways[ac.approach.runway];
        const side = rw.y < 1100 ? 1 : -1;
        for (let k = 0; k < 3; k++) {
          const v = this.make('fire');
          const yRoad = rw.y + side * 120;
          const tx = 1250 + k * 70;
          v.pts = [135, 1330, 135, yRoad, tx, yRoad];
          v.speed = 48;
          v.state = 'in';
          v.minWait = 16;
          v.waited = -k * 0.6;
          v.waitFor = () => false;
        }
      }
    }

    const dayAlpha = Math.max(0, Math.min(1, night * 1.4));
    for (const v of this.vehicles) {
      if (v.trailOf) {
        // follow the leader's breadcrumb trail
        const L = v.trailOf;
        if (L.remove) {
          v.remove = true;
          continue;
        }
        L.history = L.history ?? [];
        const hx = L.sprite.x;
        const hy = L.sprite.y;
        const hist = L.history;
        if (hist.length < 2 || Math.hypot(hist[hist.length - 2]! - hx, hist[hist.length - 1]! - hy) > 0.5) hist.push(hx, hy);
        if (hist.length > 200) hist.splice(0, hist.length - 200);
        // walk back gap distance along history
        let need = v.trailGap ?? 7;
        let px = hx;
        let py = hy;
        let i = hist.length - 2;
        while (i >= 0 && need > 0) {
          const d = Math.hypot(hist[i]! - px, hist[i + 1]! - py);
          if (d >= need) {
            const t = need / d;
            px = px + (hist[i]! - px) * t;
            py = py + (hist[i + 1]! - py) * t;
            need = 0;
          } else {
            need -= d;
            px = hist[i]!;
            py = hist[i + 1]!;
            i -= 2;
          }
        }
        const ang = Math.atan2(v.trailOf.sprite.y - py, v.trailOf.sprite.x - px);
        if (Math.hypot(v.trailOf.sprite.x - px, v.trailOf.sprite.y - py) > 0.3) v.sprite.rotation = ang;
        v.sprite.position.set(px, py);
        v.sprite.alpha = L.sprite.alpha;
        continue;
      }
      if (v.follow) {
        const ac = acById.get(v.follow.ac);
        if (!ac || (ac.phase !== 'pushback' && ac.phase !== 'readyTaxi' && ac.phase !== 'parked')) {
          // detach: drive back towards the terminal and fade out
          if (v.state !== 'out') {
            v.state = 'out';
            const x0 = v.sprite.x;
            const y0 = v.sprite.y;
            const ty = y0 < 1100 ? TERMINAL_N_FACE + 15 : TERMINAL_S_FACE - 15;
            v.pts = [x0, y0, x0 - 10, ty, x0 - 70, ty];
            v.seg = 0;
            v.segT = 0;
            v.follow = undefined;
          }
        } else {
          const [x, y] = this.local(ac, v.follow.local[0], v.follow.local[1]);
          v.sprite.position.set(x, y);
          v.sprite.rotation = ac.h + v.follow.rot;
          v.alpha = Math.min(1, v.alpha + dt * 2);
          if (ac.phase === 'readyTaxi' || (ac.phase === 'pushback' && ac.v === 0 && ac.s > 5)) {
            // tug disconnects after pushback
            if (ac.phase === 'readyTaxi') v.follow = { ...v.follow, ac: '__none__' };
          }
        }
      } else if (v.state === 'loop') {
        if (this.advance(v, dt, false)) {
          v.seg = 0;
          v.segT = 0;
        }
        this.place(v, dt);
      } else if (v.state === 'in') {
        if (v.waited < 0) {
          v.waited += dt;
          v.sprite.visible = false;
          continue;
        }
        v.sprite.visible = true;
        v.alpha = Math.min(1, v.alpha + dt * 1.5);
        if (this.advance(v, dt, false)) {
          v.state = 'wait';
          v.waited = 0;
        }
        this.place(v, dt);
      } else if (v.state === 'wait') {
        v.waited += dt;
        const owner = v.owner ? acById.get(v.owner) : undefined;
        const keep = v.waitFor ? v.waitFor() : false;
        if (v.waited > v.minWait && (!keep || (v.owner && !owner))) {
          v.state = 'out';
          v.pts = reversePts(v.pts);
          v.seg = 0;
          v.segT = 0;
        }
      } else if (v.state === 'out') {
        const done = this.advance(v, dt, true);
        this.place(v, dt);
        if (done) v.alpha -= dt * 2;
        if (v.alpha <= 0) v.remove = true;
      }
      v.sprite.alpha = v.alpha;
      if (v.head) {
        const c = Math.cos(v.sprite.rotation);
        const s = Math.sin(v.sprite.rotation);
        v.head.position.set(v.sprite.x + c * 6, v.sprite.y + s * 6);
        v.head.alpha = dayAlpha * v.alpha * 0.9;
        v.head.visible = dayAlpha > 0.02;
        v.head2!.position.set(v.sprite.x - c * 5, v.sprite.y - s * 5);
        v.head2!.alpha = dayAlpha * v.alpha * 0.8;
        v.head2!.visible = dayAlpha > 0.02;
      }
      if (v.flash) {
        const on = Math.floor(time * 4 + v.id) % 2 === 0;
        v.flash.tint = v.kind === 'fire' ? (on ? 0xff3b3b : 0x4dabf7) : 0xffb703;
        v.flash.position.set(v.sprite.x, v.sprite.y);
        v.flash.alpha = (on ? 0.9 : 0.25) * v.alpha * (v.kind === 'fire' ? 1 : 0.6);
      }
    }
    // cleanup
    const keep: Vehicle[] = [];
    for (const v of this.vehicles) {
      if (v.remove) this.destroyVehicle(v);
      else keep.push(v);
    }
    this.vehicles = keep;
    for (const [id, v] of this.pushTugs) if (v.remove) this.pushTugs.delete(id);
    // forget services for aircraft that left
    for (const id of [...this.serviced]) if (!acById.has(id)) this.serviced.delete(id);
  }
}

function reversePts(p: number[]) {
  const r: number[] = [];
  for (let i = p.length - 2; i >= 0; i -= 2) r.push(p[i]!, p[i + 1]!);
  return r;
}
