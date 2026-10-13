import { describe, expect, it } from 'vitest';
import { autopilotCommands } from '../src/sim/autopilot';
import { issue } from '../src/sim/commands';
import { step } from '../src/sim/engine';
import type { LoggedCommand } from '../src/sim/types';
import { createWorld, dailyConfig, MODE_RULES, SIM_VERSION } from '../src/sim/world';
import { sanitizeCommand, sanitizeCommands, validName, verifyDaily } from '../worker/verify';

const DATE = '2026-10-13';

function playDaily() {
  const w = createWorld(dailyConfig(DATE));
  const log: LoggedCommand[] = [];
  while (!w.over) {
    if (w.tick % 20 === 0) {
      for (const c of autopilotCommands(w)) {
        const tick = w.tick;
        if (issue(w, c).ok) log.push({ tick, cmd: c });
      }
    }
    step(w);
    w.events.length = 0;
  }
  return { w, log };
}

describe('server-side verification', () => {
  const { w, log } = playDaily();
  const base = { date: DATE, clientId: 'abc12345-test', name: 'Swift Falcon 42', version: SIM_VERSION, endTick: MODE_RULES.daily.durationTicks };

  it('re-simulation reproduces the client score', () => {
    const r = verifyDaily({ ...base, commands: JSON.parse(JSON.stringify(log)), claimed: w.score.points });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.score).toBe(w.score.points);
      expect(r.claimedMatches).toBe(true);
      expect(r.rejected).toBe(0);
    }
  });

  it('ignores a forged claimed score', () => {
    const r = verifyDaily({ ...base, commands: log, claimed: 99_999_999 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.score).toBe(w.score.points);
      expect(r.claimedMatches).toBe(false);
    }
  });

  it('rejects incomplete runs, wrong versions and malformed replays', () => {
    expect(verifyDaily({ ...base, endTick: 100, commands: log }).ok).toBe(false);
    expect(verifyDaily({ ...base, version: 0, commands: log }).ok).toBe(false);
    expect(verifyDaily({ ...base, commands: 'nope' }).ok).toBe(false);
    expect(verifyDaily({ ...base, commands: [{ tick: -1, cmd: { t: 'hold', ac: 'A1' } }] }).ok).toBe(false);
    expect(verifyDaily({ ...base, commands: [{ tick: 5, cmd: { t: 'hold', ac: 'A1' } }, { tick: 2, cmd: { t: 'hold', ac: 'A1' } }] }).ok).toBe(false);
  });

  it('sanitizer whitelists commands and strips unknown fields', () => {
    expect(sanitizeCommand({ t: 'spawn', typeId: 'a380' })).toBeNull();
    expect(sanitizeCommand({ t: 'setTime', minutes: 1 })).toBeNull();
    expect(sanitizeCommand({ t: 'land', ac: 'A1', runway: 'R3' })).toBeNull();
    expect(sanitizeCommand({ t: 'park', ac: 'A1', gate: 'N1; DROP' })).toBeNull();
    expect(sanitizeCommand({ t: 'land', ac: 'A1', runway: 'R1', evil: 1 })).toEqual({ t: 'land', ac: 'A1', runway: 'R1' });
    expect(sanitizeCommands(new Array(5000).fill({ tick: 1, cmd: { t: 'hold', ac: 'A1' } }), 10000)).toBeNull();
  });

  it('only accepts safe generated names', () => {
    expect(validName('Swift Falcon 42')).toBe(true);
    expect(validName('Rude Word 42')).toBe(false);
    expect(validName('<script>')).toBe(false);
  });

  it('verification is fast enough for a Durable Object request', () => {
    const t = performance.now();
    verifyDaily({ ...base, commands: log });
    expect(performance.now() - t).toBeLessThan(3000);
  });
});
