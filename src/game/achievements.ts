export interface Achievement {
  id: string;
  name: string;
  desc: string;
  icon: string;
  coins: number;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_landing', name: 'Wheels Down', desc: 'Land your very first aircraft.', icon: '🛬', coins: 50 },
  { id: 'first_departure', name: 'Have a Nice Flight', desc: 'Send off your first departure.', icon: '🛫', coins: 50 },
  { id: 'ten_flights', name: 'Getting Busy', desc: 'Complete 10 departures.', icon: '🔟', coins: 100 },
  { id: 'fifty_flights', name: 'Hub Status', desc: 'Complete 50 departures.', icon: '🏙️', coins: 300 },
  { id: 'century', name: 'Centurion', desc: 'Complete 100 departures.', icon: '💯', coins: 600 },
  { id: 'heavy_metal', name: 'Heavy Metal', desc: 'Handle a wide-body departure.', icon: '✈️', coins: 120 },
  { id: 'superjumbo', name: 'Gentle Giant', desc: 'Send off an A380.', icon: '🐋', coins: 250 },
  { id: 'night_owl', name: 'Night Owl', desc: 'Depart a flight after dark.', icon: '🦉', coins: 80 },
  { id: 'rain_maker', name: 'Singing in the Rain', desc: 'Land an aircraft in the rain.', icon: '🌧️', coins: 80 },
  { id: 'storm_chaser', name: 'Storm Chaser', desc: 'Land an aircraft during a thunderstorm.', icon: '⛈️', coins: 150 },
  { id: 'perfect_day', name: 'Perfect Day', desc: 'Earn 3 stars in a single day.', icon: '⭐', coins: 300 },
  { id: 'emergency_hero', name: 'Emergency Hero', desc: 'Land an emergency aircraft safely.', icon: '🚒', coins: 200 },
  { id: 'daily_challenger', name: 'Daily Challenger', desc: 'Complete a daily challenge.', icon: '📅', coins: 150 },
  { id: 'collector', name: 'Airport Tycoon', desc: 'Buy 5 upgrades in the Hangar.', icon: '🏗️', coins: 200 },
  { id: 'explorer', name: 'Plane Spotter', desc: 'Browse the aircraft encyclopedia.', icon: '🔭', coins: 40 },
  { id: 'sandbox_architect', name: 'Sandbox Architect', desc: 'Spawn an aircraft in Sandbox mode.', icon: '🧪', coins: 40 },
  { id: 'speed_demon', name: 'Fast Forward', desc: 'Play at 3× speed.', icon: '⏩', coins: 30 },
  { id: 'zen_master', name: 'Little Controller', desc: 'Complete a whole day in Kids mode.', icon: '🧸', coins: 120 },
  { id: 'pro_controller', name: 'Pro Controller', desc: 'Finish a Pro day with 2+ stars.', icon: '🎖️', coins: 400 },
  { id: 'special_guest', name: 'Special Guest', desc: 'Handle a rare special aircraft.', icon: '✨', coins: 120 },
];

export const ACH_BY_ID: Record<string, Achievement> = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));
