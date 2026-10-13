import { getType, SIZE_ORDER } from '../sim/aircraft';
import type { GameMode, SimEvent, World } from '../sim/types';
import { clockMinutes, nightAmount } from '../sim/world';

export type MissionKind = 'land' | 'depart' | 'onTime' | 'heavy' | 'rainLand' | 'nightDepart' | 'noGoAround' | 'coins' | 'stars' | 'emergency';

export interface Mission {
  id: string;
  kind: MissionKind;
  title: string;
  target: number;
  progress: number;
  rewardCoins: number;
  rewardXp: number;
  rewardStars: number;
  tier: number;
}

interface Template {
  kind: MissionKind;
  tier: number;
  make: (n: number) => { title: string; target: number };
  reward: number;
}

const TEMPLATES: Template[] = [
  { kind: 'land', tier: 1, make: (n) => ({ title: `Land ${n} aircraft`, target: n }), reward: 30 },
  { kind: 'depart', tier: 1, make: (n) => ({ title: `Send off ${n} departures`, target: n }), reward: 35 },
  { kind: 'onTime', tier: 1, make: (n) => ({ title: `Depart ${n} flights on time`, target: n }), reward: 45 },
  { kind: 'coins', tier: 1, make: (n) => ({ title: `Earn ${n * 100} coins`, target: n * 100 }), reward: 0.4 },
  { kind: 'heavy', tier: 2, make: (n) => ({ title: `Handle ${n} wide-body departures`, target: n }), reward: 90 },
  { kind: 'rainLand', tier: 2, make: (n) => ({ title: `Land ${n} aircraft in the rain`, target: n }), reward: 70 },
  { kind: 'nightDepart', tier: 2, make: (n) => ({ title: `Depart ${n} flights after dark`, target: n }), reward: 70 },
  { kind: 'noGoAround', tier: 3, make: (n) => ({ title: `Land ${n} in a row without a go-around`, target: n }), reward: 60 },
  { kind: 'stars', tier: 3, make: (n) => ({ title: `Finish a day with ${Math.min(3, n)} stars`, target: Math.min(3, n) }), reward: 200 },
  { kind: 'emergency', tier: 4, make: (n) => ({ title: `Land ${n} emergency aircraft safely`, target: n }), reward: 150 },
];

export function tierForLevel(level: number) {
  return level >= 6 ? 4 : level >= 4 ? 3 : level >= 2 ? 2 : 1;
}

export function newMission(level: number, existing: Mission[], seed: number): Mission {
  const tier = tierForLevel(level);
  const pool = TEMPLATES.filter((t) => t.tier <= tier && !existing.some((m) => m.kind === t.kind));
  const list = pool.length ? pool : TEMPLATES.filter((t) => t.tier <= tier);
  const t = list[Math.abs(seed) % list.length]!;
  const n = t.kind === 'stars' ? 2 + (level >= 5 ? 1 : 0) : t.kind === 'coins' ? 5 + level * 2 : Math.max(2, Math.round((3 + level) * (t.tier === 1 ? 1 : 0.6)));
  const spec = t.make(n);
  const coins = t.kind === 'coins' ? Math.round(spec.target * t.reward) : Math.round(t.reward * (1 + level * 0.15) * Math.max(1, n / 3));
  return {
    id: `${t.kind}-${seed}`,
    kind: t.kind,
    title: spec.title,
    target: spec.target,
    progress: 0,
    rewardCoins: coins,
    rewardXp: Math.round(coins * 0.5),
    rewardStars: t.tier >= 3 ? 2 : 1,
    tier: t.tier,
  };
}

/** Apply simulation events to mission progress. Returns true if anything changed. */
export function trackMissions(missions: Mission[], events: SimEvent[], world: World, mode: GameMode): boolean {
  if (mode === 'sandbox' || mode === 'menu' || mode === 'daily') return false;
  let changed = false;
  const bump = (kind: MissionKind, by = 1, set?: number) => {
    for (const m of missions) {
      if (m.kind !== kind || m.progress >= m.target) continue;
      m.progress = set !== undefined ? Math.max(m.progress, Math.min(m.target, set)) : Math.min(m.target, m.progress + by);
      changed = true;
    }
  };
  for (const e of events) {
    switch (e.t) {
      case 'touchdown':
        bump('land');
        if (world.weather === 'rain' || world.weather === 'storm') bump('rainLand');
        for (const m of missions) if (m.kind === 'noGoAround' && m.progress < m.target) (m.progress++, (changed = true));
        break;
      case 'goAround':
        for (const m of missions) if (m.kind === 'noGoAround' && m.progress < m.target) (m.progress = 0, (changed = true));
        break;
      case 'departed': {
        bump('depart');
        if (e.onTime) bump('onTime');
        if (SIZE_ORDER[getType(e.typeId).cat] >= 2) bump('heavy');
        if (nightAmount(clockMinutes(world)) > 0.5) bump('nightDepart');
        break;
      }
      case 'reward':
        if (e.coins > 0) bump('coins', e.coins);
        if (e.reason.startsWith('Emergency')) bump('emergency');
        break;
      case 'dayEnd':
        bump('stars', 0, e.stars);
        break;
      default:
        break;
    }
  }
  return changed;
}
