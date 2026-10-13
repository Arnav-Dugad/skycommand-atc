import { motion } from 'motion/react';
import { game, modeName } from '../../game/controller';
import { levelProgress } from '../../game/progression';
import { useGame } from '../../store/game';
import { useProfile } from '../../store/profile';
import { Coin, cx, IconButton } from '../common';
import { nowClock, WEATHER_ICON, WEATHER_NAME } from '../format';
import { clockMinutes, nightAmount } from '../../sim/world';

function Ring({ pct, children, color = '#4dabf7' }: { pct: number; children: React.ReactNode; color?: string }) {
  const r = 15;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative grid h-10 w-10 place-items-center">
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 36 36">
        <circle cx="18" cy="18" r={r} fill="none" stroke="rgb(255 255 255 / 0.12)" strokeWidth="3.5" />
        <motion.circle cx="18" cy="18" r={r} fill="none" stroke={color} strokeWidth="3.5" strokeLinecap="round" strokeDasharray={c} animate={{ strokeDashoffset: c * (1 - pct) }} transition={{ type: 'spring', stiffness: 80, damping: 18 }} />
      </svg>
      <span className="text-[0.72rem] font-extrabold">{children}</span>
    </div>
  );
}

export function TopBar() {
  useGame((s) => s.version);
  const speed = useGame((s) => s.speed);
  const paused = useGame((s) => s.paused);
  const mode = useGame((s) => s.mode);
  const replaying = useGame((s) => s.replaying);
  const set = useGame((s) => s.set);
  const coins = useProfile((s) => s.coins);
  const xp = useProfile((s) => s.xp);
  const w = game.world;
  if (!w) return null;
  const s = w.score;
  const lp = levelProgress(xp);
  const happy = s.happiness;
  const face = happy >= 75 ? '😄' : happy >= 50 ? '🙂' : happy >= 30 ? '😐' : '😟';
  const happyColor = happy >= 60 ? '#38d9a9' : happy >= 35 ? '#fcc419' : '#ff6b6b';
  const total = s.onTime + s.late;
  const eff = total ? s.onTime / total : 1;
  const night = nightAmount(clockMinutes(w)) > 0.5;
  const daily = mode === 'daily';
  const remaining = daily ? Math.max(0, (w.rules.durationTicks - w.tick) / 20) : 0;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 px-2 pt-2 sm:px-3 sm:pt-3 safe-top pad-safe">
      <div className="glass pointer-events-auto mx-auto flex h-14 max-w-[1600px] items-center gap-1 rounded-2xl px-1.5 sm:gap-2 sm:px-2" data-testid="top-bar">
        <IconButton label="Menu" onClick={() => set({ overlay: 'pause' })} testId="btn-menu">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </IconButton>
        <div className="hidden min-w-0 items-center gap-2 md:flex">
          <span className="font-display text-xl font-extrabold leading-none tracking-tight">
            SKY<span className="text-sky-brand">COMMAND</span>
          </span>
          <span className={cx('rounded-full px-2 py-0.5 text-[0.68rem] font-bold uppercase tracking-wide', replaying ? 'bg-violet-500/30 text-violet-100' : 'bg-white/10 text-white/70')}>{replaying ? 'Replay' : modeName(mode)}</span>
        </div>

        {/* clock */}
        <div className="flex min-w-0 items-center gap-1.5 rounded-xl bg-white/6 px-2.5 py-1.5" title={`${WEATHER_NAME[w.weather]} · ${night ? 'Night' : 'Day'}`}>
          <span className="text-lg leading-none" aria-hidden>
            {night && w.weather === 'clear' ? '🌙' : WEATHER_ICON[w.weather]}
          </span>
          <div className="leading-tight">
            <div className="font-mono text-[0.95rem] font-bold tabular-nums" data-testid="clock">
              {nowClock(w)}
            </div>
            <div className="hidden text-[0.62rem] font-semibold uppercase tracking-wider text-white/50 sm:block">{daily ? `${Math.floor(remaining / 60)}:${String(Math.floor(remaining % 60)).padStart(2, '0')} left` : `Day ${w.day + 1}`}</div>
          </div>
        </div>

        <div className="flex-1" />

        {/* happiness */}
        <div className="flex items-center gap-1.5 rounded-xl px-1.5 py-1" title={`Airport happiness ${Math.round(happy)}%`} data-testid="happiness">
          <span className="text-xl leading-none" aria-hidden>
            {face}
          </span>
          <div className="hidden w-20 lg:block">
            <div className="mb-1 flex justify-between text-[0.62rem] font-bold uppercase tracking-wide text-white/55">
              <span>Happiness</span>
              <span className="tabular-nums">{Math.round(happy)}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <motion.div className="h-full rounded-full" style={{ background: happyColor }} animate={{ width: `${happy}%` }} />
            </div>
          </div>
          <span className="text-sm font-bold tabular-nums lg:hidden">{Math.round(happy)}</span>
        </div>

        <div className="hidden items-center gap-1.5 rounded-xl px-1.5 py-1 md:flex" title="Departures on time">
          <span className="text-lg" aria-hidden>
            ⏱️
          </span>
          <div className="leading-tight">
            <div className="text-sm font-bold tabular-nums">{Math.round(eff * 100)}%</div>
            <div className="text-[0.6rem] font-semibold uppercase tracking-wide text-white/50">on time</div>
          </div>
        </div>

        {daily ? (
          <div className="flex items-center gap-1.5 rounded-xl bg-white/6 px-2.5 py-1.5" title="Challenge score">
            <span aria-hidden>🏆</span>
            <span className="font-mono text-sm font-bold tabular-nums" data-testid="points">
              {s.points.toLocaleString()}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 rounded-xl bg-white/6 px-2.5 py-1.5" title="Coins" data-testid="coins">
            <Coin />
            <span className="text-sm font-bold tabular-nums">{mode === 'sandbox' ? '∞' : coins.toLocaleString()}</span>
          </div>
        )}

        <div className="hidden sm:block" title={`Level ${lp.level} — ${lp.into}/${lp.need} XP`}>
          <Ring pct={lp.pct}>{lp.level}</Ring>
        </div>

        <div className="hidden items-center rounded-xl bg-white/6 p-0.5 sm:flex" role="group" aria-label="Game speed">
          {[1, 2, 3].map((n) => (
            <button
              key={n}
              type="button"
              data-testid={`speed-${n}`}
              onClick={() => {
                set({ speed: n, paused: false });
                if (n === 3) game.checkAchievement('speed_demon');
              }}
              className={cx('h-9 w-9 rounded-lg text-sm font-extrabold transition-colors', speed === n && !paused ? 'bg-sky-500 text-white' : 'text-white/65 hover:text-white')}
            >
              {n}×
            </button>
          ))}
        </div>
        <button
          type="button"
          className="h-10 rounded-xl bg-white/6 px-2.5 text-sm font-extrabold sm:hidden"
          onClick={() => set({ speed: speed >= 3 ? 1 : speed + 1, paused: false })}
          aria-label={`Speed ${speed}×`}
        >
          {speed}×
        </button>
        <IconButton label={paused ? 'Resume' : 'Pause'} onClick={() => set({ paused: !paused })} active={paused} testId="btn-pause">
          {paused ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M7 5v14l12-7z" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="5" width="4" height="14" rx="1.2" />
              <rect x="14" y="5" width="4" height="14" rx="1.2" />
            </svg>
          )}
        </IconButton>
      </div>
      {paused && !replaying && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="pointer-events-none mx-auto mt-2 w-max rounded-full bg-amber-400 px-3 py-1 text-xs font-extrabold uppercase tracking-widest text-amber-950 shadow-lg">
          Paused
        </motion.div>
      )}
    </div>
  );
}
