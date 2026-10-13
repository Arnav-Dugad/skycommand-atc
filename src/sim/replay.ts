import { issue } from './commands';
import { step } from './engine';
import { hashString } from './rng';
import type { LoggedCommand, ModeRules, World, WorldConfig } from './types';
import { createWorld, SIM_VERSION } from './world';

export interface Replay {
  version: number;
  config: WorldConfig;
  rules?: Partial<ModeRules>;
  commands: LoggedCommand[];
  endTick: number;
  label?: string;
  createdAt?: number;
}

export interface ReplayRunner {
  world: World;
  cursor: number;
  rejected: number;
}

export function startReplay(replay: Replay): ReplayRunner {
  if (replay.version !== SIM_VERSION) throw new Error('Replay was recorded with a different game version');
  return { world: createWorld(replay.config, replay.rules), cursor: 0, rejected: 0 };
}

/** Advance a replay runner by one tick, applying commands recorded at the current tick. */
export function replayStep(runner: ReplayRunner, replay: Replay): void {
  const w = runner.world;
  const cmds = replay.commands;
  while (runner.cursor < cmds.length && cmds[runner.cursor]!.tick <= w.tick) {
    const c = cmds[runner.cursor]!;
    if (c.tick === w.tick) {
      const r = issue(w, c.cmd);
      if (!r.ok) runner.rejected++;
    } else runner.rejected++;
    runner.cursor++;
  }
  step(w);
  w.events.length = 0;
}

/** Re-simulate a full replay. Used both for playback seeking and server verification. */
export function runReplay(replay: Replay, untilTick = replay.endTick): ReplayRunner {
  const runner = startReplay(replay);
  // commands must be ordered by tick
  for (let i = 1; i < replay.commands.length; i++) {
    if (replay.commands[i]!.tick < replay.commands[i - 1]!.tick) throw new Error('Commands out of order');
  }
  while (runner.world.tick < untilTick && !runner.world.over) replayStep(runner, replay);
  return runner;
}

/** Stable fingerprint of simulation state (for determinism checks). */
export function worldHash(world: World): number {
  const slim = {
    tick: world.tick,
    rng: world.rng.s,
    score: world.score,
    weather: world.weather,
    ac: world.aircraft.map((a) => [a.id, a.phase, Math.round(a.x * 1000), Math.round(a.y * 1000), Math.round(a.h * 1000), Math.round(a.v * 1000)]),
    locks: world.nodeLocks,
    gates: world.gateRes,
    rw: world.runways,
  };
  return hashString(JSON.stringify(slim));
}

export function cloneWorld(world: World): World {
  return JSON.parse(JSON.stringify(world)) as World;
}
