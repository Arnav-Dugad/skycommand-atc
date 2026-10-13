/**
 * SKYCOMMAND Cloudflare Worker
 *  - serves the static game (Workers Static Assets)
 *  - /api/daily            → today's challenge date (UTC)
 *  - /api/daily/submit     → server-authoritative verification via a Durable Object
 *  - /api/leaderboard      → verified scores from D1
 */

import { DurableObject } from 'cloudflare:workers';
import { SIM_VERSION } from '../src/sim/world';
import { utcDate, validClientId, validName, verifyDaily, type SubmitBody } from './verify';

export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  VERIFIER: DurableObjectNamespace<DailyVerifier>;
}

const MAX_BODY = 512 * 1024;
const SUBMITS_PER_DAY = 12;

function json(data: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...extra,
    },
  });
}

let schemaReady: Promise<unknown> | null = null;
function ensureSchema(db: D1Database) {
  if (!schemaReady) {
    schemaReady = db
      .batch([
        db.prepare(
          `CREATE TABLE IF NOT EXISTS scores (
            date TEXT NOT NULL,
            client_id TEXT NOT NULL,
            name TEXT NOT NULL,
            score INTEGER NOT NULL,
            flights INTEGER NOT NULL,
            replay_hash TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            PRIMARY KEY (date, client_id)
          )`,
        ),
        db.prepare('CREATE INDEX IF NOT EXISTS scores_by_date ON scores (date, score DESC)'),
      ])
      .catch((e) => {
        schemaReady = null;
        throw e;
      });
  }
  return schemaReady;
}

/** One Durable Object per challenge date: serialises verification, rate limits and dedupes. */
export class DailyVerifier extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    let body: SubmitBody;
    try {
      body = (await request.json()) as SubmitBody;
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }
    const key = `count:${body.clientId}`;
    const count = ((await this.ctx.storage.get<number>(key)) ?? 0) + 1;
    if (count > SUBMITS_PER_DAY) return json({ error: 'Too many submissions today — try again tomorrow' }, 429);
    await this.ctx.storage.put(key, count);

    const result = verifyDaily(body);
    if (!result.ok) return json({ error: result.error }, result.status);

    if (result.commandCount >= 5) {
      const seen = await this.ctx.storage.get<string>(`hash:${result.hash}`);
      if (seen && seen !== body.clientId) return json({ error: 'This replay was already submitted by another controller' }, 409);
      await this.ctx.storage.put(`hash:${result.hash}`, body.clientId);
    }

    const db = this.env.DB;
    await ensureSchema(db);
    await db
      .prepare(
        `INSERT INTO scores (date, client_id, name, score, flights, replay_hash, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(date, client_id) DO UPDATE SET
           name = excluded.name,
           score = excluded.score,
           flights = excluded.flights,
           replay_hash = excluded.replay_hash,
           created_at = excluded.created_at
         WHERE excluded.score > scores.score`,
      )
      .bind(body.date, body.clientId, body.name, result.score, result.flights, result.hash, Date.now())
      .run();
    const best = await db.prepare('SELECT score FROM scores WHERE date = ?1 AND client_id = ?2').bind(body.date, body.clientId).first<{ score: number }>();
    const bestScore = best?.score ?? result.score;
    const rank = await db.prepare('SELECT COUNT(*) AS c FROM scores WHERE date = ?1 AND score > ?2').bind(body.date, bestScore).first<{ c: number }>();
    const total = await db.prepare('SELECT COUNT(*) AS c FROM scores WHERE date = ?1').bind(body.date).first<{ c: number }>();
    return json({
      verifiedScore: result.score,
      bestScore,
      flights: result.flights,
      rank: (rank?.c ?? 0) + 1,
      total: total?.c ?? 1,
      claimedMatches: result.claimedMatches,
    });
  }
}

async function handleApi(request: Request, env: Env, url: URL): Promise<Response> {
  const path = url.pathname;
  if (path === '/api/health') return json({ ok: true, version: SIM_VERSION, date: utcDate() });

  if (path === '/api/daily' && request.method === 'GET') return json({ date: utcDate(), version: SIM_VERSION });

  if (path === '/api/daily/submit') {
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    const origin = request.headers.get('origin');
    if (origin && new URL(origin).host !== url.host) return json({ error: 'Cross-origin submissions are not allowed' }, 403);
    const len = Number(request.headers.get('content-length') ?? '0');
    if (len > MAX_BODY) return json({ error: 'Replay too large' }, 413);
    const text = await request.text();
    if (text.length > MAX_BODY) return json({ error: 'Replay too large' }, 413);
    let body: SubmitBody;
    try {
      body = JSON.parse(text) as SubmitBody;
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }
    if (!body || typeof body !== 'object') return json({ error: 'Invalid body' }, 400);
    if (body.date !== utcDate() && body.date !== utcDate(-1)) return json({ error: "That challenge is closed — play today's challenge!" }, 400);
    if (!validClientId(body.clientId)) return json({ error: 'Invalid player id' }, 400);
    if (!validName(body.name)) return json({ error: 'Invalid controller name' }, 400);
    const id = env.VERIFIER.idFromName(body.date);
    const stub = env.VERIFIER.get(id);
    return stub.fetch('https://verifier/submit', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
  }

  if (path === '/api/leaderboard' && request.method === 'GET') {
    const date = url.searchParams.get('date') ?? utcDate();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: 'Invalid date' }, 400);
    const client = url.searchParams.get('client') ?? '';
    await ensureSchema(env.DB);
    const res = await env.DB.prepare('SELECT client_id, name, score, flights FROM scores WHERE date = ?1 ORDER BY score DESC, created_at ASC LIMIT 50').bind(date).all<{ client_id: string; name: string; score: number; flights: number }>();
    const rows = (res.results ?? []).map((r, i) => ({ rank: i + 1, name: r.name, score: r.score, flights: r.flights, you: r.client_id === client }));
    return json({ date, rows });
  }

  return json({ error: 'Not found' }, 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(request, env, url);
      } catch (e) {
        console.error('api error', e);
        return json({ error: 'Server error' }, 500);
      }
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
