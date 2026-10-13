import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { audio } from '../../audio/audio';
import { fetchDaily } from '../../game/api';
import { game, modeName } from '../../game/controller';
import { levelProgress } from '../../game/progression';
import type { GameMode } from '../../sim/types';
import { useGame } from '../../store/game';
import { useProfile } from '../../store/profile';
import { Button, Coin, cx, Meter, Modal } from '../common';

export function Loading() {
  const p = useGame((s) => s.loadProgress);
  const text = useGame((s) => s.loadText);
  return (
    <motion.div className="fixed inset-0 z-[60] grid place-items-center overflow-hidden bg-[radial-gradient(ellipse_at_top,#1c3faa_0%,#0b1222_60%)]" exit={{ opacity: 0 }} transition={{ duration: 0.6 }} data-testid="loading">
      <div className="pointer-events-none absolute inset-0 opacity-40" aria-hidden>
        {Array.from({ length: 30 }, (_, i) => (
          <span key={i} className="absolute h-0.5 w-0.5 rounded-full bg-white" style={{ left: `${(i * 37) % 100}%`, top: `${(i * 53) % 100}%`, opacity: 0.3 + ((i * 7) % 10) / 15 }} />
        ))}
      </div>
      <div className="flex w-[min(26rem,86vw)] flex-col items-center text-center">
        <motion.div initial={{ x: -180, y: 60, rotate: -20, opacity: 0 }} animate={{ x: 0, y: 0, rotate: -12, opacity: 1 }} transition={{ duration: 1.2, ease: 'easeOut' }} className="mb-4 text-6xl" aria-hidden>
          ✈️
        </motion.div>
        <h1 className="font-display text-5xl font-extrabold tracking-tight sm:text-6xl">
          SKY<span className="text-sky-brand">COMMAND</span>
        </h1>
        <p className="mt-1 text-sm font-semibold uppercase tracking-[0.3em] text-white/50">Airport Control</p>
        <div className="mt-8 w-full">
          <Meter value={p} color="linear-gradient(90deg,#4dabf7,#9775fa)" label="Loading" />
          <p className="mt-3 text-sm text-white/60">{text}</p>
        </div>
      </div>
    </motion.div>
  );
}

const MODES: { id: GameMode; title: string; icon: string; color: string; age: string; bullets: string[] }[] = [
  { id: 'kids', title: 'Kids', icon: '🧸', color: 'from-pink-400 to-orange-300', age: 'Ages 5+', bullets: ['One plane at a time', 'Planes never bump', 'Friendly hints', 'No pressure'] },
  { id: 'casual', title: 'Casual', icon: '☀️', color: 'from-sky-400 to-blue-600', age: 'Everyone', bullets: ['Relaxed traffic', 'Simple scoring', 'Runway protection', 'Day & night'] },
  { id: 'pro', title: 'Pro ATC', icon: '🎧', color: 'from-violet-500 to-indigo-700', age: 'Challenge', bullets: ['Heavy traffic', 'Runway conflicts', 'Fuel & emergencies', 'Wake separation'] },
  { id: 'sandbox', title: 'Sandbox', icon: '🧪', color: 'from-emerald-400 to-teal-600', age: 'Create', bullets: ['Unlimited money', 'Spawn any aircraft', 'Control weather & time', 'No game over'] },
];

export function ModeSelect() {
  const overlay = useGame((s) => s.overlay);
  const set = useGame((s) => s.set);
  const tutorialDone = useProfile((s) => s.tutorialDone);
  const start = (m: GameMode) => {
    audio.play('confirm');
    game.clearSave();
    game.startGame(m);
    if (!tutorialDone || m === 'kids') useGame.getState().set({ introOpen: true });
  };
  return (
    <Modal open={overlay === 'modes'} onClose={() => set({ overlay: null })} title="Choose how to play" subtitle="Every mode is free — switch any time." wide icon="🎮" testId="mode-select">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {MODES.map((m, i) => (
          <motion.button
            key={m.id}
            type="button"
            data-testid={`mode-${m.id}`}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            whileHover={{ y: -4 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => start(m.id)}
            className="group relative flex flex-col overflow-hidden rounded-3xl bg-white/6 p-4 text-left ring-1 ring-white/10 transition-colors hover:bg-white/10"
          >
            <div className={cx('mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br text-3xl shadow-lg', m.color)}>{m.icon}</div>
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-xl font-extrabold">{m.title}</h3>
              <span className="text-[0.68rem] font-bold uppercase tracking-wider text-white/45">{m.age}</span>
            </div>
            <ul className="mt-2 space-y-1 text-sm text-white/65">
              {m.bullets.map((b) => (
                <li key={b} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
                  {b}
                </li>
              ))}
            </ul>
            <span className="mt-4 inline-flex h-10 items-center justify-center rounded-2xl bg-white/12 text-sm font-bold transition-colors group-hover:bg-white/20">Play {m.title} →</span>
          </motion.button>
        ))}
      </div>
    </Modal>
  );
}

export function MainMenu() {
  const set = useGame((s) => s.set);
  const prof = useProfile();
  const lp = levelProgress(prof.xp);
  const [save, setSave] = useState(() => game.hasSave());
  const [daily, setDaily] = useState<{ date: string; online: boolean } | null>(null);
  useEffect(() => {
    setSave(game.hasSave());
    fetchDaily().then(setDaily);
  }, []);
  const claimable = prof.missions.filter((m) => m.progress >= m.target).length;
  const dailyDone = prof.daily && daily && prof.daily.date === daily.date;

  const tiles: { id: Parameters<typeof set>[0]['overlay']; label: string; icon: string; badge?: number }[] = [
    { id: 'hangar', label: 'Hangar', icon: '🛠️' },
    { id: 'missions', label: 'Missions', icon: '🎯', badge: claimable },
    { id: 'encyclopedia', label: 'Aircraft', icon: '📖' },
    { id: 'leaderboard', label: 'Leaderboard', icon: '🏆' },
    { id: 'stats', label: 'Stats', icon: '📊' },
    { id: 'replays', label: 'Replays', icon: '🎬' },
    { id: 'settings', label: 'Settings', icon: '⚙️' },
    { id: 'help', label: 'How to play', icon: '❓' },
  ];

  return (
    <motion.div className="no-scrollbar pointer-events-auto fixed inset-0 z-30 flex flex-col overflow-y-auto overflow-x-hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} data-testid="main-menu">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-ink-950/85 via-ink-950/45 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-ink-950/80 to-transparent" />
      <div className="relative mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 pb-6 pt-6 sm:px-8 sm:pt-10 lg:flex-row lg:items-center lg:gap-10 safe-top safe-bottom">
        <div className="pointer-events-auto flex flex-1 flex-col">
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
            <p className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-white/70 backdrop-blur">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" /> Tower open
            </p>
            <h1 className="font-display text-[3.4rem] font-extrabold leading-[0.9] tracking-tight text-shadow sm:text-7xl lg:text-8xl">
              SKY<span className="bg-gradient-to-r from-sky-300 to-sky-500 bg-clip-text text-transparent">COMMAND</span>
            </h1>
            <p className="mt-3 max-w-md text-base font-medium text-white/80 text-shadow sm:text-lg">Land them. Park them. Launch them. Run the friendliest international airport in the sky.</p>
          </motion.div>

          <motion.div className="mt-6 flex max-w-md flex-col gap-3" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            {save && (
              <Button
                size="xl"
                variant="success"
                testId="btn-continue"
                onClick={() => {
                  audio.unlock();
                  if (!game.resume()) setSave(null);
                }}
                sound="confirm"
              >
                ▶ Continue {modeName(save.config.mode)} <span className="text-sm font-semibold opacity-80">· Day {save.world.day + 1}</span>
              </Button>
            )}
            <Button
              size="xl"
              variant="primary"
              testId="btn-play"
              onClick={() => {
                audio.unlock();
                set({ overlay: 'modes' });
              }}
              sound="open"
            >
              ✈️ {save ? 'New game' : 'Play'}
            </Button>
            <Button
              size="lg"
              variant="secondary"
              testId="btn-daily"
              onClick={() => {
                audio.unlock();
                set({ overlay: 'daily' });
              }}
              className="justify-between"
              sound="open"
            >
              <span>📅 Daily Challenge</span>
              <span className="text-xs font-semibold text-white/60">{dailyDone ? `Best ${prof.daily!.best.toLocaleString()}` : daily?.online ? 'Verified online' : 'Offline practice'}</span>
            </Button>
          </motion.div>

          <motion.div className="mt-6 grid max-w-md grid-cols-4 gap-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }}>
            {tiles.map((t) => (
              <motion.button
                key={t.label}
                type="button"
                whileTap={{ scale: 0.94 }}
                whileHover={{ y: -2 }}
                data-testid={`menu-${t.id}`}
                onClick={() => {
                  audio.unlock();
                  audio.play('open');
                  if (t.id === 'encyclopedia') game.checkAchievement('explorer');
                  set({ overlay: t.id });
                }}
                className="glass relative flex flex-col items-center gap-1 rounded-2xl px-1 py-2.5 text-[0.72rem] font-bold text-white/85"
              >
                <span className="text-2xl leading-none" aria-hidden>
                  {t.icon}
                </span>
                {t.label}
                {!!t.badge && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-amber-300 px-1 text-[0.68rem] font-black text-amber-950">{t.badge}</span>}
              </motion.button>
            ))}
          </motion.div>
        </div>

        <motion.aside className="pointer-events-auto w-full max-w-md lg:w-96" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}>
          <div className="glass rounded-3xl p-4">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-sky-400 to-violet-500 text-xl font-black">{lp.level}</div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-bold">{prof.nickname}</div>
                <div className="text-xs text-white/55">
                  Level {lp.level} · {lp.into}/{lp.need} XP
                </div>
                <Meter value={lp.pct} color="linear-gradient(90deg,#4dabf7,#9775fa)" className="mt-1.5 h-1.5" label="Level progress" />
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-2xl bg-white/6 py-2">
                <div className="flex items-center justify-center gap-1 font-bold tabular-nums">
                  <Coin /> {prof.coins.toLocaleString()}
                </div>
                <div className="text-[0.62rem] font-bold uppercase tracking-wider text-white/45">Coins</div>
              </div>
              <div className="rounded-2xl bg-white/6 py-2">
                <div className="font-bold tabular-nums">⭐ {prof.stars}</div>
                <div className="text-[0.62rem] font-bold uppercase tracking-wider text-white/45">Stars</div>
              </div>
              <div className="rounded-2xl bg-white/6 py-2">
                <div className="font-bold tabular-nums">🛫 {prof.stats.departures}</div>
                <div className="text-[0.62rem] font-bold uppercase tracking-wider text-white/45">Flights</div>
              </div>
            </div>
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between text-[0.7rem] font-extrabold uppercase tracking-[0.14em] text-white/45">
                <span>Missions</span>
                <button type="button" className="text-sky-300 normal-case tracking-normal" onClick={() => set({ overlay: 'missions' })}>
                  View all
                </button>
              </div>
              <div className="space-y-2">
                {prof.missions.map((m) => (
                  <div key={m.id} className="rounded-2xl bg-white/5 px-3 py-2">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate font-semibold">{m.title}</span>
                      <span className="shrink-0 text-xs font-bold tabular-nums text-white/60">
                        {Math.min(m.progress, m.target)}/{m.target}
                      </span>
                    </div>
                    <Meter value={m.progress / m.target} color={m.progress >= m.target ? '#38d9a9' : '#4dabf7'} className="mt-1.5 h-1.5" label={m.title} />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <p className="mt-3 text-center text-[0.7rem] text-white/40">100% free · No ads · No purchases · Works offline</p>
        </motion.aside>
      </div>
    </motion.div>
  );
}
