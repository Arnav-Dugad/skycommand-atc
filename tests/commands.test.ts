import { describe, expect, it } from 'vitest';
import { issue, validate } from '../src/sim/commands';
import { step } from '../src/sim/engine';
import { cloneWorld, worldHash } from '../src/sim/replay';
import type { World } from '../src/sim/types';
import { createWorld, spawnArrival } from '../src/sim/world';
import { fullConfig } from './helpers';

function fresh(mode: 'casual' | 'pro' | 'kids' = 'casual'): World {
  const w = createWorld(fullConfig(mode, 11), { initialParked: 0, autoSpawn: false });
  w.autoSpawn = false;
  return w;
}

function run(w: World, seconds: number) {
  for (let i = 0; i < seconds * 20; i++) step(w);
}

describe('command validation', () => {
  it('rejected commands never change state', () => {
    const w = fresh();
    const a = spawnArrival(w, 'a320')!;
    run(w, 1);
    const before = worldHash(w);
    const bad = [
      { t: 'takeoff', ac: a.id },
      { t: 'pushback', ac: a.id },
      { t: 'park', ac: a.id, gate: 'N99' },
      { t: 'park', ac: a.id, gate: 'N8' }, // too small (regional gate)
      { t: 'land', ac: 'A999', runway: 'R1' },
      { t: 'spawn', typeId: 'a320' }, // not sandbox
      { t: 'cancel', ac: a.id },
      { t: 'goAround', ac: a.id },
    ] as const;
    for (const c of bad) {
      const r = issue(w, c as never);
      expect(r.ok, JSON.stringify(c)).toBe(false);
      expect(r.reason).toBeTruthy();
    }
    expect(worldHash(w)).toBe(before);
  });

  it('a full arrival-to-departure loop works through commands', () => {
    const w = fresh();
    const a = spawnArrival(w, 'a320')!;
    expect(issue(w, { t: 'park', ac: a.id, gate: 'N1' }).ok).toBe(true);
    expect(issue(w, { t: 'land', ac: a.id, runway: 'R1' }).ok).toBe(true);
    let guard = 0;
    while (a.phase !== 'parked' && guard++ < 20 * 400) step(w);
    expect(a.phase).toBe('parked');
    expect(issue(w, { t: 'pushback', ac: a.id }).ok).toBe(false); // still boarding
    expect(issue(w, { t: 'taxi', ac: a.id, runway: 'R1' }).ok).toBe(true); // pre-assigned runway
    guard = 0;
    while (a.turn?.stage !== 'ready' && guard++ < 20 * 200) step(w);
    expect(issue(w, { t: 'pushback', ac: a.id }).ok).toBe(true);
    guard = 0;
    while (a.phase !== 'taxiOut' && a.phase !== 'holdShort' && guard++ < 20 * 300) step(w);
    expect(['taxiOut', 'holdShort']).toContain(a.phase);
    expect(issue(w, { t: 'takeoff', ac: a.id }).ok).toBe(true);
    guard = 0;
    while (w.score.departures === 0 && guard++ < 20 * 300) step(w);
    expect(w.score.departures).toBe(1);
    expect(w.score.arrivals).toBe(1);
    expect(w.gateRes['N1']).toBeUndefined();
  });

  it('gates are exclusive', () => {
    const w = fresh();
    const a = spawnArrival(w, 'a320')!;
    const b = spawnArrival(w, 'a320')!;
    expect(issue(w, { t: 'park', ac: a.id, gate: 'N1' }).ok).toBe(true);
    const r = issue(w, { t: 'park', ac: b.id, gate: 'N1' });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/occupied/i);
  });

  it('undo reverts instructions that have not executed yet', () => {
    const w = fresh();
    const a = spawnArrival(w, 'a320')!;
    expect(issue(w, { t: 'park', ac: a.id, gate: 'N1' }).ok).toBe(true);
    expect(issue(w, { t: 'land', ac: a.id, runway: 'R1' }).ok).toBe(true);
    expect(a.phase).toBe('approach');
    expect(issue(w, { t: 'cancel', ac: a.id }).ok).toBe(true); // undo land
    expect(a.phase).toBe('inbound');
    expect(w.runways.R1.arrivals).not.toContain(a.id);
    expect(issue(w, { t: 'cancel', ac: a.id }).ok).toBe(true); // undo park
    expect(a.gate).toBeUndefined();
    expect(w.gateRes['N1']).toBeUndefined();
    expect(issue(w, { t: 'cancel', ac: a.id }).ok).toBe(false);
  });

  it('validate is side-effect free', () => {
    const w = fresh();
    const a = spawnArrival(w, 'b737')!;
    const snap = JSON.stringify(cloneWorld(w));
    validate(w, { t: 'land', ac: a.id, runway: 'R1' });
    validate(w, { t: 'park', ac: a.id, gate: 'N2' });
    expect(JSON.stringify(w)).toBe(snap);
  });

  it('closed runways are rejected', () => {
    const w = createWorld({ ...fullConfig('casual', 4), runways: ['R1'] }, { initialParked: 0, autoSpawn: false });
    const a = spawnArrival(w, 'a320')!;
    expect(issue(w, { t: 'land', ac: a.id, runway: 'R2' }).ok).toBe(false);
  });

  it('sandbox can spawn and control weather/time', () => {
    const w = createWorld(fullConfig('sandbox', 5));
    const n = w.aircraft.length;
    expect(issue(w, { t: 'spawn', typeId: 'a380' }).ok).toBe(true);
    expect(w.aircraft.length).toBe(n + 1);
    expect(issue(w, { t: 'setWeather', weather: 'storm' }).ok).toBe(true);
    expect(w.weather).toBe('storm');
    expect(issue(w, { t: 'setTime', minutes: 22 * 60 }).ok).toBe(true);
  });

  it('kids mode never goes around even when runway is busy', () => {
    const w = fresh('kids');
    const arrivals = [spawnArrival(w, 'a320')!, spawnArrival(w, 'atr72')!, spawnArrival(w, 'b737')!];
    for (const a of arrivals) issue(w, { t: 'land', ac: a.id, runway: 'R1' });
    let goArounds = 0;
    for (let i = 0; i < 20 * 300; i++) {
      step(w);
      goArounds += w.events.filter((e) => e.t === 'goAround').length;
      w.events.length = 0;
    }
    expect(goArounds).toBe(0);
    expect(w.score.arrivals).toBe(3);
  });
});
