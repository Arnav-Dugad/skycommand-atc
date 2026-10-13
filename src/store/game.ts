import { create } from 'zustand';
import type { GameMode } from '../sim/types';

export type Screen = 'loading' | 'menu' | 'game';
export type Overlay =
  | null
  | 'modes'
  | 'hangar'
  | 'missions'
  | 'encyclopedia'
  | 'stats'
  | 'replays'
  | 'leaderboard'
  | 'settings'
  | 'pause'
  | 'help'
  | 'daily'
  | 'customize';

export interface Toast {
  id: number;
  kind: 'info' | 'success' | 'warning' | 'error' | 'reward' | 'achievement';
  title: string;
  text?: string;
  icon?: string;
  ttl: number;
}

export interface RadioMsg {
  id: number;
  time: string;
  callsign?: string;
  text: string;
  kind: 'pilot' | 'tower' | 'system' | 'alert';
}

export interface Pick {
  kind: 'gate' | 'runway';
  ac: string;
  purpose: 'land' | 'park' | 'taxi';
}

export interface UndoEntry {
  ac: string;
  cmdId: number;
  label: string;
}

export interface DaySummary {
  day: number;
  stars: number;
  flights: number;
  happiness: number;
  coins: number;
}

export interface GameOverInfo {
  reason: string;
  points: number;
  arrivals: number;
  departures: number;
  happiness: number;
  daily: boolean;
  dateKey?: string;
}

interface GameUI {
  screen: Screen;
  overlay: Overlay;
  version: number;
  mode: GameMode;
  selected: string | null;
  pick: Pick | null;
  toasts: Toast[];
  radio: RadioMsg[];
  speed: number;
  paused: boolean;
  hint: { text: string; ac: string } | null;
  undo: UndoEntry[];
  daySummary: DaySummary | null;
  gameOver: GameOverInfo | null;
  boardOpen: boolean;
  radarOpen: boolean;
  radioOpen: boolean;
  replaying: boolean;
  loadProgress: number;
  loadText: string;
  introOpen: boolean;
  confirm: { text: string; ac: string } | null;
  set: (p: Partial<GameUI>) => void;
  toast: (t: Omit<Toast, 'id' | 'ttl'> & { ttl?: number }) => void;
  dismissToast: (id: number) => void;
  pushRadio: (m: Omit<RadioMsg, 'id'>) => void;
  bump: () => void;
}

let toastId = 1;
let radioId = 1;

export const useGame = create<GameUI>()((set, get) => ({
  screen: 'loading',
  overlay: null,
  version: 0,
  mode: 'menu',
  selected: null,
  pick: null,
  toasts: [],
  radio: [],
  speed: 1,
  paused: false,
  hint: null,
  undo: [],
  daySummary: null,
  gameOver: null,
  boardOpen: typeof window !== 'undefined' ? window.innerWidth >= 1024 : true,
  radarOpen: typeof window !== 'undefined' ? window.innerWidth >= 768 : true,
  radioOpen: false,
  replaying: false,
  loadProgress: 0,
  loadText: 'Preparing runway…',
  introOpen: false,
  confirm: null,
  set: (p) => set(p),
  toast: (t) => {
    const id = toastId++;
    const toast: Toast = { ttl: 3200, ...t, id };
    set({ toasts: [...get().toasts.slice(-3), toast] });
    window.setTimeout(() => get().dismissToast(id), toast.ttl);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  pushRadio: (m) => set({ radio: [...get().radio.slice(-39), { ...m, id: radioId++ }] }),
  bump: () => set({ version: get().version + 1 }),
}));
