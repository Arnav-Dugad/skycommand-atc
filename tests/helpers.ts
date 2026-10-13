import { autopilotCommands } from '../src/sim/autopilot';
import { issue } from '../src/sim/commands';
import { step } from '../src/sim/engine';
import { checkInvariants, snapshotPositions, type InvariantIssue } from '../src/sim/invariants';
import type { GameMode, Weather, World, WorldConfig } from '../src/sim/types';
import { SIM_VERSION } from '../src/sim/world';
import { AIRPORT } from '../src/sim/airport';

export function fullConfig(mode: GameMode, seed: number): WorldConfig {
  return {
    mode,
    seed,
    openGates: AIRPORT.gates.map((g) => g.id),
    runways: ['R1', 'R2'],
    allowedTypes: ['atr72', 'e190', 'a320', 'b737', 'a321', 'b787', 'a350', 'b777', 'a380'],
    specialTypes: ['classic', 'swift', 'solar'],
    weatherKinds: ['clear', 'cloudy', 'rain', 'storm', 'fog'] as Weather[],
    startMinutes: 360,
    version: SIM_VERSION,
  };
}

export function runAuto(world: World, seconds: number, every = 20) {
  const issues: InvariantIssue[] = [];
  let prev = snapshotPositions(world);
  const stuck = new Map<string, number>();
  const goReasons: Record<string, number> = {};
  for (let i = 0; i < seconds * 20; i++) {
    if (world.tick % every === 0) for (const c of autopilotCommands(world)) issue(world, c);
    step(world);
    for (const e of world.events) if (e.t === 'goAround') goReasons[e.reason] = (goReasons[e.reason] ?? 0) + 1;
    world.events.length = 0;
    issues.push(...checkInvariants(world, prev));
    prev = snapshotPositions(world);
    for (const a of world.aircraft) {
      if (a.waitTime > 0) stuck.set(a.id, Math.max(stuck.get(a.id) ?? 0, a.waitTime));
    }
    if (world.over) break;
  }
  return { issues, stuck, goReasons };
}
