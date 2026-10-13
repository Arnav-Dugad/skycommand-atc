import { AIRPORT, type Airport } from './airport';

/** Nodes that ordinary taxi routes must never pass through. */
function blockedForTaxi(ap: Airport, id: string, target: string): boolean {
  const n = ap.nodes[id]!;
  if (id === target) return false;
  return n.kind === 'runway' || n.kind === 'entry' || n.kind === 'stand' || n.kind === 'hold';
}

/**
 * Shortest directed route between two graph nodes (Dijkstra).
 * Returns the node list including both ends, or null when unreachable.
 */
export function shortestRoute(from: string, to: string, ap: Airport = AIRPORT): string[] | null {
  if (from === to) return [from];
  if (!ap.nodes[from] || !ap.nodes[to]) return null;
  const dist: Record<string, number> = { [from]: 0 };
  const prev: Record<string, string> = {};
  const done: Record<string, boolean> = {};
  const open: string[] = [from];
  while (open.length) {
    // pick min (graph is small; deterministic tie-break by insertion order)
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (dist[open[i]!]! < dist[open[bi]!]!) bi = i;
    const u = open.splice(bi, 1)[0]!;
    if (done[u]) continue;
    done[u] = true;
    if (u === to) break;
    const nu = ap.nodes[u]!;
    for (const v of ap.out[u]!) {
      if (done[v]) continue;
      if (blockedForTaxi(ap, v, to)) continue;
      const nv = ap.nodes[v]!;
      const dx = nv.x - nu.x;
      const dy = nv.y - nu.y;
      const nd = dist[u]! + Math.sqrt(dx * dx + dy * dy);
      if (dist[v] === undefined || nd < dist[v]!) {
        dist[v] = nd;
        prev[v] = u;
        open.push(v);
      }
    }
  }
  if (dist[to] === undefined) return null;
  const res: string[] = [to];
  let c = to;
  while (c !== from) {
    c = prev[c]!;
    res.push(c);
  }
  return res.reverse();
}

/** Route through optional via-points. */
export function routeVia(from: string, to: string, via: string[] = [], ap: Airport = AIRPORT): string[] | null {
  const stops = [from, ...via.filter((v) => v !== from && v !== to), to];
  const res: string[] = [from];
  for (let i = 0; i < stops.length - 1; i++) {
    const seg = shortestRoute(stops[i]!, stops[i + 1]!, ap);
    if (!seg) return null;
    res.push(...seg.slice(1));
  }
  return res;
}

export function routeLength(route: string[], ap: Airport = AIRPORT): number {
  let d = 0;
  for (let i = 1; i < route.length; i++) {
    const a = ap.nodes[route[i - 1]!]!;
    const b = ap.nodes[route[i]!]!;
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    d += Math.sqrt(dx * dx + dy * dy);
  }
  return d;
}

/** Nodes a dragged line may snap to (taxiway nodes, mouths, holds). */
export function snappableNodes(ap: Airport = AIRPORT): string[] {
  return Object.values(ap.nodes)
    .filter((n) => n.kind === 'taxi' || n.kind === 'mouth' || n.kind === 'hold')
    .map((n) => n.id);
}

export function nearestNode(
  x: number,
  y: number,
  maxDist: number,
  ids: string[] = snappableNodes(),
  ap: Airport = AIRPORT,
): string | null {
  let best: string | null = null;
  let bd = maxDist * maxDist;
  for (const id of ids) {
    const n = ap.nodes[id]!;
    const dx = n.x - x;
    const dy = n.y - y;
    const d = dx * dx + dy * dy;
    if (d < bd) {
      bd = d;
      best = id;
    }
  }
  return best;
}
