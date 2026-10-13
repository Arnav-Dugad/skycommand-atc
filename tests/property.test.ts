/**
 * Property-based tests: random (often nonsensical) player instructions are fired at the
 * simulation. Whatever the player does, the safety invariants must hold.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { AIRPORT } from '../src/sim/airport';
import { issue } from '../src/sim/commands';
import { step, violations } from '../src/sim/engine';
import { checkInvariants, snapshotPositions } from '../src/sim/invariants';
import type { Command, GameMode, World } from '../src/sim/types';
import { createWorld } from '../src/sim/world';
import { fullConfig } from './helpers';

const KINDS = ['land', 'goAround', 'hold', 'resume', 'park', 'taxi', 'pushback', 'takeoff', 'cancel'] as const;

const action = fc.record({
  kind: fc.constantFrom(...KINDS),
  acPick: fc.nat(40),
  gatePick: fc.nat(AIRPORT.gates.length - 1),
  rw: fc.constantFrom('R1' as const, 'R2' as const),
  wait: fc.integer({ min: 1, max: 160 }),
});

function toCommand(w: World, a: { kind: (typeof KINDS)[number]; acPick: number; gatePick: number; rw: 'R1' | 'R2' }): Command | null {
  if (!w.aircraft.length) return null;
  const ac = w.aircraft[a.acPick % w.aircraft.length]!.id;
  switch (a.kind) {
    case 'land':
      return { t: 'land', ac, runway: a.rw };
    case 'park':
      return { t: 'park', ac, gate: AIRPORT.gates[a.gatePick]!.id };
    case 'taxi':
      return { t: 'taxi', ac, runway: a.rw };
    default:
      return { t: a.kind, ac } as Command;
  }
}

function runRandom(mode: GameMode, seed: number, actions: { kind: (typeof KINDS)[number]; acPick: number; gatePick: number; rw: 'R1' | 'R2'; wait: number }[]) {
  violations.length = 0;
  const w = createWorld(fullConfig(mode, seed));
  let prev = snapshotPositions(w);
  const issues: string[] = [];
  for (const a of actions) {
    const cmd = toCommand(w, a);
    if (cmd) issue(w, cmd);
    for (let i = 0; i < a.wait; i++) {
      step(w);
      w.events.length = 0;
      for (const iss of checkInvariants(w, prev)) issues.push(`${iss.kind}: ${iss.detail}`);
      prev = snapshotPositions(w);
    }
  }
  return { w, issues };
}

describe('random instructions never break safety invariants', () => {
  for (const mode of ['casual', 'pro', 'kids'] as GameMode[]) {
    it(`${mode}`, () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 1e6 }), fc.array(action, { minLength: 20, maxLength: 70 }), (seed, actions) => {
          const { issues } = runRandom(mode, seed, actions);
          expect(violations).toEqual([]);
          expect(issues.slice(0, 5)).toEqual([]);
        }),
        { numRuns: 12, seed: 4242 },
      );
    });
  }
});
