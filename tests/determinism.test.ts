import { describe, expect, it } from 'vitest';
import { autopilotCommands } from '../src/sim/autopilot';
import { issue } from '../src/sim/commands';
import { step } from '../src/sim/engine';
import { cloneWorld, runReplay, worldHash, type Replay } from '../src/sim/replay';
import type { LoggedCommand } from '../src/sim/types';
import { createWorld, dailyConfig, MODE_RULES, SIM_VERSION } from '../src/sim/world';
import { fullConfig } from './helpers';

function recordAutopilot(cfg = fullConfig('casual', 99), seconds = 600) {
  const w = createWorld(cfg);
  const log: LoggedCommand[] = [];
  for (let i = 0; i < seconds * 20 && !w.over; i++) {
    if (w.tick % 20 === 0) {
      for (const c of autopilotCommands(w)) {
        const tick = w.tick;
        if (issue(w, c).ok) log.push({ tick, cmd: c });
      }
    }
    step(w);
    w.events.length = 0;
  }
  return { w, log, cfg };
}

describe('determinism', () => {
  it('same seed and commands give an identical world', () => {
    const a = recordAutopilot();
    const b = recordAutopilot();
    expect(worldHash(a.w)).toBe(worldHash(b.w));
  });

  it('replays reproduce the recorded session exactly', () => {
    const { w, log, cfg } = recordAutopilot();
    const replay: Replay = { version: SIM_VERSION, config: cfg, commands: log, endTick: w.tick };
    const r = runReplay(replay);
    expect(r.rejected).toBe(0);
    expect(r.world.score).toEqual(w.score);
    expect(worldHash(r.world)).toBe(worldHash(w));
  });

  it('save → load (JSON round-trip) continues identically', () => {
    const { w } = recordAutopilot(fullConfig('pro', 5), 300);
    const copy = cloneWorld(w);
    for (const world of [w, copy]) {
      for (let i = 0; i < 20 * 300; i++) {
        if (world.tick % 20 === 0) for (const c of autopilotCommands(world)) issue(world, c);
        step(world);
        world.events.length = 0;
      }
    }
    expect(worldHash(copy)).toBe(worldHash(w));
  });

  it('daily challenge config is the same for everyone on a date', () => {
    expect(dailyConfig('2026-10-13')).toEqual(dailyConfig('2026-10-13'));
    expect(dailyConfig('2026-10-13').seed).not.toBe(dailyConfig('2026-10-14').seed);
  });

  it('a daily run ends exactly at the challenge duration', () => {
    const { w } = recordAutopilot(dailyConfig('2026-10-13'), 400);
    expect(w.over).toBe(true);
    expect(w.tick).toBe(MODE_RULES.daily.durationTicks);
  });
});
