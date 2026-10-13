import type { Replay } from '../sim/replay';

export interface DailyInfo {
  date: string;
  online: boolean;
}

export interface LeaderRow {
  rank: number;
  name: string;
  score: number;
  flights: number;
  you?: boolean;
}

async function withTimeout<T>(p: Promise<T>, ms = 6000): Promise<T> {
  let t: number | undefined;
  const timeout = new Promise<never>((_, rej) => {
    t = window.setTimeout(() => rej(new Error('timeout')), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    window.clearTimeout(t);
  }
}

export async function fetchDaily(): Promise<DailyInfo> {
  try {
    const r = await withTimeout(fetch('/api/daily', { headers: { accept: 'application/json' } }));
    if (!r.ok) throw new Error(String(r.status));
    const j = (await r.json()) as { date: string };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(j.date)) throw new Error('bad date');
    return { date: j.date, online: true };
  } catch {
    return { date: new Date().toISOString().slice(0, 10), online: false };
  }
}

export interface SubmitResult {
  ok: boolean;
  verifiedScore?: number;
  rank?: number;
  total?: number;
  error?: string;
}

export async function submitDaily(date: string, clientId: string, name: string, replay: Replay, claimed: number): Promise<SubmitResult> {
  try {
    const r = await withTimeout(
      fetch('/api/daily/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ date, clientId, name, claimed, version: replay.version, commands: replay.commands, endTick: replay.endTick }),
      }),
      20000,
    );
    const j = (await r.json()) as SubmitResult & { error?: string };
    if (!r.ok) return { ok: false, error: j.error ?? `Server error ${r.status}` };
    return { ...j, ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error && e.message === 'timeout' ? 'The server took too long to answer' : 'You appear to be offline' };
  }
}

export async function fetchLeaderboard(date: string, clientId: string): Promise<{ rows: LeaderRow[]; online: boolean }> {
  try {
    const r = await withTimeout(fetch(`/api/leaderboard?date=${encodeURIComponent(date)}&client=${encodeURIComponent(clientId)}`));
    if (!r.ok) throw new Error(String(r.status));
    const j = (await r.json()) as { rows: LeaderRow[] };
    return { rows: j.rows ?? [], online: true };
  } catch {
    return { rows: [], online: false };
  }
}
