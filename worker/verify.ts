/**
 * Pure verification logic shared by the Worker and the test-suite.
 * Never trusts client-provided scores: it rebuilds a clean command list from the
 * submitted payload and re-simulates the whole challenge deterministically.
 */

import { runReplay, type Replay } from '../src/sim/replay';
import { hashString } from '../src/sim/rng';
import type { Command, LoggedCommand, Weather } from '../src/sim/types';
import { dailyConfig, MODE_RULES, SIM_VERSION } from '../src/sim/world';

export const MAX_COMMANDS = 4000;
export const ADJ = ['Swift', 'Sunny', 'Brave', 'Clever', 'Calm', 'Mighty', 'Happy', 'Lucky', 'Bright', 'Cosmic', 'Breezy', 'Golden'];
export const NOUN = ['Falcon', 'Eagle', 'Comet', 'Albatross', 'Swallow', 'Condor', 'Kestrel', 'Puffin', 'Heron', 'Pelican', 'Osprey', 'Swift'];

export interface SubmitBody {
  date: string;
  clientId: string;
  name: string;
  claimed?: number;
  version: number;
  commands: unknown;
  endTick: number;
}

export type VerifyResult =
  | { ok: true; score: number; flights: number; hash: string; claimedMatches: boolean; rejected: number; commandCount: number }
  | { ok: false; error: string; status: number };

const ID_RE = /^A\d{1,5}$/;
const NODE_RE = /^[A-Za-z0-9_]{1,16}$/;
const GATE_RE = /^[NS]\d{1,2}$/;

export function validName(name: unknown): name is string {
  if (typeof name !== 'string' || name.length > 40) return false;
  const parts = name.split(' ');
  if (parts.length !== 3) return false;
  return ADJ.includes(parts[0]!) && NOUN.includes(parts[1]!) && /^\d{2}$/.test(parts[2]!);
}

export function validClientId(id: unknown): id is string {
  return typeof id === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(id);
}

/** Re-create a command from untrusted JSON with strict whitelisting. */
export function sanitizeCommand(raw: unknown): Command | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  const ac = typeof c.ac === 'string' && ID_RE.test(c.ac) ? c.ac : null;
  const rw = c.runway === 'R1' || c.runway === 'R2' ? c.runway : null;
  const via = Array.isArray(c.via) ? c.via : undefined;
  let cleanVia: string[] | undefined;
  if (via !== undefined) {
    if (via.length > 24 || !via.every((v) => typeof v === 'string' && NODE_RE.test(v))) return null;
    cleanVia = via as string[];
  }
  switch (c.t) {
    case 'land':
      return ac && rw ? { t: 'land', ac, runway: rw } : null;
    case 'goAround':
    case 'hold':
    case 'resume':
    case 'pushback':
    case 'takeoff':
    case 'cancel':
      return ac ? ({ t: c.t, ac } as Command) : null;
    case 'park':
      return ac && typeof c.gate === 'string' && GATE_RE.test(c.gate) ? { t: 'park', ac, gate: c.gate, ...(cleanVia ? { via: cleanVia } : {}) } : null;
    case 'taxi':
      return ac && rw ? { t: 'taxi', ac, runway: rw, ...(cleanVia ? { via: cleanVia } : {}) } : null;
    case 'setWeather':
      return ['clear', 'cloudy', 'rain', 'storm', 'fog'].includes(c.weather as string) ? { t: 'setWeather', weather: c.weather as Weather } : null;
    default:
      return null;
  }
}

export function sanitizeCommands(raw: unknown, maxTick: number): LoggedCommand[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_COMMANDS) return null;
  const out: LoggedCommand[] = [];
  let last = 0;
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null;
    const it = item as Record<string, unknown>;
    const tick = it.tick;
    if (typeof tick !== 'number' || !Number.isInteger(tick) || tick < 0 || tick > maxTick || tick < last) return null;
    const cmd = sanitizeCommand(it.cmd);
    if (!cmd) return null;
    last = tick;
    out.push({ tick, cmd });
  }
  return out;
}

export function verifyDaily(body: SubmitBody): VerifyResult {
  if (body.version !== SIM_VERSION) return { ok: false, error: 'Please refresh the game — a newer version is available', status: 409 };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date)) return { ok: false, error: 'Invalid date', status: 400 };
  const duration = MODE_RULES.daily.durationTicks;
  if (body.endTick !== duration) return { ok: false, error: 'The challenge must be completed before submitting', status: 400 };
  const commands = sanitizeCommands(body.commands, duration);
  if (!commands) return { ok: false, error: 'Invalid replay data', status: 400 };
  const replay: Replay = { version: SIM_VERSION, config: dailyConfig(body.date), commands, endTick: duration };
  const runner = runReplay(replay, duration);
  const w = runner.world;
  if (!w.over || w.tick !== duration) return { ok: false, error: 'Replay did not reach the end of the challenge', status: 400 };
  const score = w.score.points;
  const flights = w.score.arrivals + w.score.departures;
  const hash = hashString(`${body.date}|${JSON.stringify(commands)}`).toString(16);
  return { ok: true, score, flights, hash, claimedMatches: body.claimed === score, rejected: runner.rejected, commandCount: commands.length };
}

export function utcDate(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return d.toISOString().slice(0, 10);
}
