/**
 * Persistent offline profile (localStorage). This is single-player progression only —
 * it is never trusted for competitive scoring, which is verified server-side.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { ACH_BY_ID } from '../game/achievements';
import { newMission, type Mission } from '../game/missions';
import { defaultUnlocks, levelFor, owns, shopCatalog, type Unlocks } from '../game/progression';
import type { RunwayId } from '../sim/airport';
import type { Weather } from '../sim/types';

export interface Settings {
  master: number;
  sfx: number;
  music: number;
  musicOn: boolean;
  reduceMotion: boolean;
  highContrast: boolean;
  colorblind: boolean;
  uiScale: number;
  labels: 'all' | 'minimal' | 'none';
  hints: boolean;
  haptics: boolean;
  quality: 'auto' | 'high' | 'medium' | 'low';
  vehicles: boolean;
  confirmPro: boolean;
}

export interface Stats {
  arrivals: number;
  departures: number;
  goArounds: number;
  diversions: number;
  onTime: number;
  emergencies: number;
  daysCompleted: number;
  bestDayStars: number;
  bestSessionPoints: number;
  playSeconds: number;
  coinsEarned: number;
  maxSimultaneous: number;
  sessions: number;
  purchases: number;
  heavy: number;
}

export interface Profile {
  version: number;
  clientId: string;
  nickname: string;
  coins: number;
  xp: number;
  stars: number;
  unlocks: Unlocks;
  activeTheme: string;
  activeDecor: string[];
  achievements: Record<string, number>;
  missions: Mission[];
  missionsDone: number;
  stats: Stats;
  tutorialDone: boolean;
  seenEncyclopedia: string[];
  daily: { date: string; best: number; submitted: boolean; rewarded: boolean } | null;
  settings: Settings;
}

const ADJ = ['Swift', 'Sunny', 'Brave', 'Clever', 'Calm', 'Mighty', 'Happy', 'Lucky', 'Bright', 'Cosmic', 'Breezy', 'Golden'];
const NOUN = ['Falcon', 'Eagle', 'Comet', 'Albatross', 'Swallow', 'Condor', 'Kestrel', 'Puffin', 'Heron', 'Pelican', 'Osprey', 'Swift'];

export function randomNickname() {
  const a = ADJ[Math.floor(Math.random() * ADJ.length)];
  const n = NOUN[Math.floor(Math.random() * NOUN.length)];
  return `${a} ${n} ${Math.floor(10 + Math.random() * 89)}`;
}

export const NICK_PARTS = { ADJ, NOUN };

function uuid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export const DEFAULT_SETTINGS: Settings = {
  master: 0.8,
  sfx: 0.8,
  music: 0.35,
  musicOn: true,
  reduceMotion: false,
  highContrast: false,
  colorblind: false,
  uiScale: 1,
  labels: 'all',
  hints: true,
  haptics: true,
  quality: 'auto',
  vehicles: true,
  confirmPro: true,
};

function freshProfile(): Profile {
  const missions: Mission[] = [];
  for (let i = 0; i < 3; i++) missions.push(newMission(1, missions, i * 7 + 1));
  return {
    version: 1,
    clientId: uuid(),
    nickname: randomNickname(),
    coins: 150,
    xp: 0,
    stars: 0,
    unlocks: defaultUnlocks(),
    activeTheme: 'meadow',
    activeDecor: [],
    achievements: {},
    missions,
    missionsDone: 0,
    stats: {
      arrivals: 0,
      departures: 0,
      goArounds: 0,
      diversions: 0,
      onTime: 0,
      emergencies: 0,
      daysCompleted: 0,
      bestDayStars: 0,
      bestSessionPoints: 0,
      playSeconds: 0,
      coinsEarned: 0,
      maxSimultaneous: 0,
      sessions: 0,
      purchases: 0,
      heavy: 0,
    },
    tutorialDone: false,
    seenEncyclopedia: [],
    daily: null,
    settings: { ...DEFAULT_SETTINGS },
  };
}

interface ProfileActions {
  addCoins: (n: number) => void;
  addXp: (n: number) => void;
  addStars: (n: number) => void;
  buy: (itemId: string) => { ok: boolean; reason?: string };
  unlockAchievement: (id: string) => boolean;
  setMissions: (m: Mission[]) => void;
  claimMission: (id: string) => { ok: boolean; coins?: number };
  updateStats: (fn: (s: Stats) => void) => void;
  setSetting: <K extends keyof Settings>(k: K, v: Settings[K]) => void;
  setTheme: (id: string) => void;
  toggleDecor: (id: string) => void;
  setNickname: (n: string) => void;
  setTutorialDone: (v: boolean) => void;
  markEncyclopedia: (id: string) => void;
  setDaily: (d: Profile['daily']) => void;
  reset: () => void;
}

export const useProfile = create<Profile & ProfileActions>()(
  persist(
    (set, get) => ({
      ...freshProfile(),
      addCoins: (n) => {
        if (!Number.isFinite(n) || n <= 0) return;
        set((s) => ({ coins: Math.min(9_999_999, s.coins + Math.round(n)), stats: { ...s.stats, coinsEarned: s.stats.coinsEarned + Math.round(n) } }));
      },
      addXp: (n) => {
        if (!Number.isFinite(n) || n <= 0) return;
        set((s) => ({ xp: s.xp + Math.round(n) }));
      },
      addStars: (n) => {
        if (!Number.isFinite(n) || n <= 0) return;
        set((s) => ({ stars: s.stars + Math.round(n) }));
      },
      buy: (itemId) => {
        const s = get();
        const item = shopCatalog().find((i) => i.id === itemId);
        if (!item) return { ok: false, reason: 'Unknown item' };
        if (owns(s.unlocks, item)) return { ok: false, reason: 'Already owned' };
        if (levelFor(s.xp) < item.level) return { ok: false, reason: `Reach level ${item.level} first` };
        if (s.coins < item.cost) return { ok: false, reason: 'Not enough coins' };
        const u: Unlocks = JSON.parse(JSON.stringify(s.unlocks));
        switch (item.kind) {
          case 'gate':
            u.gates.push(item.id);
            break;
          case 'runway':
            u.runways.push(item.id as RunwayId);
            break;
          case 'theme':
            u.themes.push(item.id);
            break;
          case 'decor':
            u.decor.push(item.id);
            break;
          case 'special':
            u.specials.push(item.id);
            break;
          case 'weather':
            u.weather.push(item.id as Weather);
            break;
        }
        set({
          coins: s.coins - item.cost,
          unlocks: u,
          stats: { ...s.stats, purchases: s.stats.purchases + 1 },
          activeDecor: item.kind === 'decor' ? [...s.activeDecor, item.id] : s.activeDecor,
          activeTheme: item.kind === 'theme' ? item.id : s.activeTheme,
        });
        return { ok: true };
      },
      unlockAchievement: (id) => {
        const s = get();
        if (s.achievements[id] || !ACH_BY_ID[id]) return false;
        const a = ACH_BY_ID[id]!;
        set({ achievements: { ...s.achievements, [id]: Date.now() }, coins: s.coins + a.coins });
        return true;
      },
      setMissions: (m) => set({ missions: m }),
      claimMission: (id) => {
        const s = get();
        const m = s.missions.find((x) => x.id === id);
        if (!m || m.progress < m.target) return { ok: false };
        const rest = s.missions.filter((x) => x.id !== id);
        const lvl = levelFor(s.xp + m.rewardXp);
        const fresh = newMission(lvl, rest, s.missionsDone * 31 + Date.now() % 997);
        set({
          coins: s.coins + m.rewardCoins,
          xp: s.xp + m.rewardXp,
          stars: s.stars + m.rewardStars,
          missions: [...rest, fresh],
          missionsDone: s.missionsDone + 1,
        });
        return { ok: true, coins: m.rewardCoins };
      },
      updateStats: (fn) => {
        const st = { ...get().stats };
        fn(st);
        set({ stats: st });
      },
      setSetting: (k, v) => set((s) => ({ settings: { ...s.settings, [k]: v } })),
      setTheme: (id) => {
        if (!get().unlocks.themes.includes(id)) return;
        set({ activeTheme: id });
      },
      toggleDecor: (id) => {
        const s = get();
        if (!s.unlocks.decor.includes(id)) return;
        set({ activeDecor: s.activeDecor.includes(id) ? s.activeDecor.filter((d) => d !== id) : [...s.activeDecor, id] });
      },
      setNickname: (n) => set({ nickname: n }),
      setTutorialDone: (v) => set({ tutorialDone: v }),
      markEncyclopedia: (id) => {
        const s = get();
        if (!s.seenEncyclopedia.includes(id)) set({ seenEncyclopedia: [...s.seenEncyclopedia, id] });
      },
      setDaily: (d) => set({ daily: d }),
      reset: () => set({ ...freshProfile() }),
    }),
    {
      name: 'skycommand.profile.v1',
      storage: createJSONStorage(() => localStorage),
      version: 1,
      partialize: (s) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { addCoins, addXp, addStars, buy, unlockAchievement, setMissions, claimMission, updateStats, setSetting, setTheme, toggleDecor, setNickname, setTutorialDone, markEncyclopedia, setDaily, reset, ...rest } = s;
        return rest;
      },
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<Profile>;
        const fresh = freshProfile();
        return {
          ...current,
          ...fresh,
          ...p,
          unlocks: { ...fresh.unlocks, ...(p.unlocks ?? {}) },
          stats: { ...fresh.stats, ...(p.stats ?? {}) },
          settings: { ...fresh.settings, ...(p.settings ?? {}) },
          missions: Array.isArray(p.missions) && p.missions.length ? p.missions : fresh.missions,
        };
      },
    },
  ),
);

export function currentLevel() {
  return levelFor(useProfile.getState().xp);
}

// Persist the freshly generated profile (client id, nickname) immediately so it is stable across reloads.
try {
  if (typeof localStorage !== 'undefined' && !localStorage.getItem('skycommand.profile.v1')) useProfile.setState({ version: 1 });
} catch {
  /* storage unavailable */
}
