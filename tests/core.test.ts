import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { levelFor, xpForLevel, shopCatalog, careerConfig, defaultUnlocks } from '../src/game/progression';
import { newMission, trackMissions } from '../src/game/missions';
import { AIRPORT } from '../src/sim/airport';
import { datan2, dcos, dsin, wrapAngle } from '../src/sim/dmath';
import { buildPath, pointAt } from '../src/sim/path';
import { makeRng, next } from '../src/sim/rng';
import { routeVia, shortestRoute } from '../src/sim/routing';
import { createWorld } from '../src/sim/world';
import { fullConfig } from './helpers';

describe('deterministic math', () => {
  it('sin/cos/atan2 match Math within 1e-9', () => {
    fc.assert(
      fc.property(fc.double({ min: -50, max: 50, noNaN: true }), (a) => {
        expect(Math.abs(dsin(a) - Math.sin(a))).toBeLessThan(1e-9);
        expect(Math.abs(dcos(a) - Math.cos(a))).toBeLessThan(1e-9);
      }),
    );
    fc.assert(
      fc.property(fc.double({ min: -1e4, max: 1e4, noNaN: true }), fc.double({ min: -1e4, max: 1e4, noNaN: true }), (y, x) => {
        if (Math.abs(x) + Math.abs(y) < 1e-9) return;
        // compare as directions: atan2(-0, x<0) may be +PI or -PI
        expect(Math.abs(wrapAngle(datan2(y, x) - Math.atan2(y, x)))).toBeLessThan(1e-9);
      }),
    );
  });
  it('wrapAngle stays in (-PI, PI]', () => {
    fc.assert(
      fc.property(fc.double({ min: -1000, max: 1000, noNaN: true }), (a) => {
        const w = wrapAngle(a);
        expect(w).toBeGreaterThan(-Math.PI - 1e-12);
        expect(w).toBeLessThanOrEqual(Math.PI + 1e-12);
      }),
    );
  });
  it('rng is reproducible', () => {
    const a = makeRng(123);
    const b = makeRng(123);
    for (let i = 0; i < 100; i++) expect(next(a)).toBe(next(b));
  });
});

describe('airport graph & routing', () => {
  it('every runway exit can reach every gate, and every gate can reach both runways', () => {
    for (const r of Object.values(AIRPORT.runways)) {
      for (const ex of r.exits) {
        for (const g of AIRPORT.gates) {
          const route = shortestRoute(ex.holdNode, g.mouth);
          expect(route, `${ex.holdNode} -> ${g.mouth}`).not.toBeNull();
        }
      }
    }
    for (const g of AIRPORT.gates) {
      for (const r of Object.values(AIRPORT.runways)) expect(shortestRoute(g.mouth, r.holdNode), `${g.id} -> ${r.id}`).not.toBeNull();
    }
  });
  it('taxi routes never use runway, stand or foreign holding nodes', () => {
    for (const g of AIRPORT.gates) {
      const route = shortestRoute('R1_EH1', g.mouth)!;
      for (const id of route.slice(1, -1)) expect(['runway', 'entry', 'stand', 'hold']).not.toContain(AIRPORT.nodes[id]!.kind);
    }
  });
  it('taxiways are one-way (no edge has a reverse twin)', () => {
    for (const [a, outs] of Object.entries(AIRPORT.out)) for (const b of outs) expect(AIRPORT.out[b]!.includes(a)).toBe(false);
  });
  it('via routing honours waypoints and rejects impossible ones', () => {
    const r = routeVia('R1_EH1', AIRPORT.gateById['N1']!.mouth, ['NE']);
    expect(r).not.toBeNull();
    expect(r!.includes('NE')).toBe(true);
    // runway nodes can never be used as via points
    expect(routeVia('R1_EH1', AIRPORT.gateById['N1']!.mouth, ['R2_X1550'])).toBeNull();
  });
  it('filleted paths are continuous', () => {
    const p = buildPath([
      { x: 0, y: 0, r: 0 },
      { x: 200, y: 0, r: 60 },
      { x: 200, y: 200, r: 60 },
      { x: 0, y: 200, r: 0 },
    ]);
    let prev = pointAt(p, 0);
    for (let d = 1; d <= p.total; d += 1) {
      const pt = pointAt(p, d);
      expect(Math.hypot(pt.x - prev.x, pt.y - prev.y)).toBeLessThan(1.01);
      prev = pt;
    }
  });
});

describe('progression', () => {
  it('levels are monotonic', () => {
    for (let l = 1; l < 20; l++) {
      expect(levelFor(xpForLevel(l))).toBe(l);
      expect(levelFor(xpForLevel(l + 1) - 1)).toBe(l);
    }
  });
  it('shop catalogue has unique ids and sane prices', () => {
    const items = shopCatalog();
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
    for (const i of items) expect(i.cost).toBeGreaterThan(0);
  });
  it('career config only opens owned gates and runways', () => {
    const cfg = careerConfig('casual', defaultUnlocks(), 1, 1);
    expect(cfg.runways).toEqual(['R1']);
    for (const g of cfg.openGates) expect(AIRPORT.gateById[g]!.cost).toBe(0);
    expect(cfg.allowedTypes).not.toContain('a380');
  });
  it('missions track events and never exceed target', () => {
    const world = createWorld(fullConfig('casual', 3));
    const m = [newMission(1, [], 0)];
    m[0]!.kind = 'land';
    m[0]!.target = 2;
    for (let i = 0; i < 5; i++) trackMissions(m, [{ t: 'touchdown', ac: 'A1', callsign: 'X', runway: 'R1' }], world, 'casual');
    expect(m[0]!.progress).toBe(2);
    // sandbox never progresses missions
    const m2 = [{ ...m[0]!, progress: 0 }];
    trackMissions(m2, [{ t: 'touchdown', ac: 'A1', callsign: 'X', runway: 'R1' }], world, 'sandbox');
    expect(m2[0]!.progress).toBe(0);
  });
});
