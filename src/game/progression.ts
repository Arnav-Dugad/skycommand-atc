import { AIRCRAFT } from '../sim/aircraft';
import { AIRPORT, type RunwayId } from '../sim/airport';
import type { GameMode, Weather, WorldConfig } from '../sim/types';
import { allTypesFor, SIM_VERSION } from '../sim/world';
import { THEMES } from '../render/themes';

export function xpForLevel(level: number): number {
  return 150 * level * (level - 1);
}

export function levelFor(xp: number): number {
  let l = 1;
  while (l < 50 && xp >= xpForLevel(l + 1)) l++;
  return l;
}

export function levelProgress(xp: number) {
  const l = levelFor(xp);
  const a = xpForLevel(l);
  const b = xpForLevel(l + 1);
  return { level: l, into: xp - a, need: b - a, pct: Math.min(1, (xp - a) / (b - a)) };
}

export type ShopKind = 'gate' | 'runway' | 'theme' | 'decor' | 'special' | 'weather';

export interface ShopItem {
  id: string;
  kind: ShopKind;
  name: string;
  desc: string;
  level: number;
  cost: number;
  icon: string;
}

export const DECOR_ITEMS: ShopItem[] = [
  { id: 'flowers', kind: 'decor', name: 'Flower Beds', desc: 'Colourful blooms around the tower and entrance.', level: 1, cost: 100, icon: '🌷' },
  { id: 'fountain', kind: 'decor', name: 'Welcome Fountain', desc: 'A sparkling fountain greets travellers landside.', level: 2, cost: 250, icon: '⛲' },
  { id: 'garden', kind: 'decor', name: 'Rooftop Gardens', desc: 'Green roofs on both terminal wings.', level: 3, cost: 400, icon: '🌿' },
  { id: 'solarfarm', kind: 'decor', name: 'Solar Farm', desc: 'Clean energy for the whole airport.', level: 4, cost: 500, icon: '🔆' },
  { id: 'turbines', kind: 'decor', name: 'Wind Turbines', desc: 'Gently spinning turbines beyond the north fence.', level: 4, cost: 600, icon: '🌬️' },
  { id: 'statue', kind: 'decor', name: 'Golden Plane Statue', desc: 'A tribute to aviation pioneers.', level: 5, cost: 800, icon: '🏆' },
  { id: 'ferris', kind: 'decor', name: 'Sky Wheel', desc: 'An observation wheel for plane spotters.', level: 6, cost: 1200, icon: '🎡' },
];

export const WEATHER_ITEMS: ShopItem[] = [
  { id: 'rain', kind: 'weather', name: 'Rain Showers', desc: 'Wet runways mean longer landing rolls.', level: 2, cost: 150, icon: '🌧️' },
  { id: 'fog', kind: 'weather', name: 'Morning Fog', desc: 'Low visibility and wider spacing (Pro).', level: 3, cost: 300, icon: '🌫️' },
  { id: 'storm', kind: 'weather', name: 'Thunderstorms', desc: 'Gusty storms with wind shear go-arounds (Pro).', level: 5, cost: 600, icon: '⛈️' },
];

export function shopCatalog(): ShopItem[] {
  const items: ShopItem[] = [];
  items.push({ id: 'R2', kind: 'runway', name: 'Open Runway 09R', desc: 'Open the south runway to double your capacity.', level: 2, cost: 250, icon: '🛬' });
  for (const g of AIRPORT.gates) {
    if (g.cost === 0) continue;
    const size = { S: 'Regional', M: 'Narrow-body', H: 'Wide-body', J: 'Super-jumbo' }[g.cat];
    items.push({
      id: g.id,
      kind: 'gate',
      name: `Gate ${g.label}`,
      desc: `${size} stand on the ${g.side === 'N' ? 'north' : 'south'} pier${g.cat === 'J' ? ' — fits the A380!' : ''}.`,
      level: g.unlockLevel,
      cost: g.cost,
      icon: g.cat === 'J' ? '🛩️' : '🚪',
    });
  }
  for (const a of AIRCRAFT.filter((x) => x.special)) {
    items.push({ id: a.id, kind: 'special', name: a.name, desc: `Rare visitor: ${a.inspiredBy}. Pays 50% bonus coins.`, level: a.unlockLevel, cost: a.unlockLevel * 300, icon: '✨' });
  }
  items.push(...WEATHER_ITEMS);
  for (const t of THEMES) {
    if (t.cost === 0) continue;
    items.push({ id: t.id, kind: 'theme', name: t.name, desc: t.blurb, level: t.unlockLevel, cost: t.cost, icon: t.id === 'coral' ? '🏝️' : t.id === 'desert' ? '🏜️' : '🏔️' });
  }
  items.push(...DECOR_ITEMS);
  return items;
}

export interface Unlocks {
  gates: string[];
  runways: RunwayId[];
  themes: string[];
  decor: string[];
  specials: string[];
  weather: Weather[];
}

export function defaultUnlocks(): Unlocks {
  return { gates: [], runways: ['R1'], themes: ['meadow'], decor: [], specials: [], weather: [] };
}

export function owns(u: Unlocks, item: ShopItem): boolean {
  switch (item.kind) {
    case 'gate':
      return u.gates.includes(item.id);
    case 'runway':
      return u.runways.includes(item.id as RunwayId);
    case 'theme':
      return u.themes.includes(item.id);
    case 'decor':
      return u.decor.includes(item.id);
    case 'special':
      return u.specials.includes(item.id);
    case 'weather':
      return u.weather.includes(item.id as Weather);
  }
}

export function freeGates(): string[] {
  return AIRPORT.gates.filter((g) => g.cost === 0).map((g) => g.id);
}

export function careerConfig(mode: GameMode, u: Unlocks, level: number, seed: number): WorldConfig {
  const baseWeather: Weather[] = mode === 'kids' ? ['clear', 'cloudy'] : ['clear', 'cloudy'];
  const extra = u.weather.filter((w) => mode !== 'kids' || w === 'rain');
  if (mode === 'sandbox') {
    return {
      mode,
      seed,
      openGates: AIRPORT.gates.map((g) => g.id),
      runways: ['R1', 'R2'],
      allowedTypes: AIRCRAFT.filter((a) => !a.special).map((a) => a.id),
      specialTypes: AIRCRAFT.filter((a) => a.special).map((a) => a.id),
      weatherKinds: ['clear', 'cloudy', 'rain', 'storm', 'fog'],
      startMinutes: 9 * 60,
      version: SIM_VERSION,
    };
  }
  return {
    mode,
    seed,
    openGates: [...new Set([...freeGates(), ...u.gates])],
    runways: u.runways.includes('R2') ? ['R1', 'R2'] : ['R1'],
    allowedTypes: allTypesFor(level),
    specialTypes: u.specials,
    weatherKinds: [...baseWeather, ...extra],
    startMinutes: 6 * 60,
    version: SIM_VERSION,
  };
}

export function menuConfig(seed: number): WorldConfig {
  const now = new Date();
  return {
    mode: 'menu',
    seed,
    openGates: AIRPORT.gates.map((g) => g.id),
    runways: ['R1', 'R2'],
    allowedTypes: AIRCRAFT.filter((a) => !a.special).map((a) => a.id),
    specialTypes: [],
    weatherKinds: ['clear'],
    startMinutes: now.getHours() * 60 + now.getMinutes(),
    version: SIM_VERSION,
  };
}
