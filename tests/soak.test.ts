import { describe, expect, it } from 'vitest';
import { violations } from '../src/sim/engine';
import type { GameMode } from '../src/sim/types';
import { createWorld } from '../src/sim/world';
import { fullConfig, runAuto } from './helpers';

describe('autopilot soak', () => {
  for (const mode of ['casual', 'pro', 'kids'] as GameMode[]) {
    for (const seed of [1, 7, 42]) {
      it(`${mode} seed ${seed} runs a full day without safety violations`, () => {
        violations.length = 0;
        const world = createWorld(fullConfig(mode, seed));
        const { issues, stuck, goReasons } = runAuto(world, 900);
        const summary = {
          arrivals: world.score.arrivals,
          departures: world.score.departures,
          goArounds: world.score.goArounds,
          diversions: world.score.diversions,
          maxWait: Math.max(0, ...stuck.values()),
          goReasons,
          over: world.overReason,
          happiness: Math.round(world.score.happiness),
          aircraft: world.aircraft.map((a) => `${a.callsign}:${a.phase}:${a.waitReason ?? ''}:${a.waitTime.toFixed(0)}`),
        };
        console.log(mode, seed, JSON.stringify(summary));
        if (issues.length) console.log(issues.slice(0, 15));
        expect(violations).toEqual([]);
        expect(issues.filter((i) => i.kind !== 'overlap')).toEqual([]);
        expect(issues.filter((i) => i.kind === 'overlap').length).toBe(0);
        expect(world.score.departures).toBeGreaterThanOrEqual(mode === 'kids' ? 5 : 10);
      });
    }
  }
});
