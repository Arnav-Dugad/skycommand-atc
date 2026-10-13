import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { audio } from '../../audio/audio';
import { game } from '../../game/controller';
import { AIRCRAFT } from '../../sim/aircraft';
import type { Weather } from '../../sim/types';
import { clockMinutes } from '../../sim/world';
import { useGame } from '../../store/game';
import { cx, Toggle } from '../common';
import { fmtClock, WEATHER_ICON, WEATHER_NAME } from '../format';
import { useAircraftImage } from './AircraftPanel';

function SpawnTile({ id, name }: { id: string; name: string }) {
  const img = useAircraftImage(id, 'aurora', 96);
  return (
    <button
      type="button"
      data-testid={`spawn-${id}`}
      onClick={() => {
        const r = game.issue({ t: 'spawn', typeId: id });
        if (r.ok) {
          audio.play('confirm');
          game.checkAchievement('sandbox_architect');
        } else useGame.getState().toast({ kind: 'warning', title: r.reason ?? 'Cannot spawn' });
      }}
      className="flex flex-col items-center gap-1 rounded-xl bg-white/6 p-1.5 text-[0.7rem] font-bold hover:bg-white/12"
    >
      {img ? <img src={img} alt="" className="h-11 w-11 object-contain" /> : <span className="h-11 w-11" />}
      {name}
    </button>
  );
}

export function SandboxPanel() {
  useGame((s) => s.version);
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<'spawn' | 'sky' | 'traffic'>('spawn');
  const w = game.world;
  if (!w || w.config.mode !== 'sandbox') return null;
  const minutes = clockMinutes(w);
  return (
    <div className="pointer-events-none absolute right-2 top-[4.6rem] z-20 flex flex-col items-end sm:right-3">
      <button type="button" onClick={() => setOpen(!open)} className="glass pointer-events-auto mb-2 flex h-10 items-center gap-2 rounded-2xl px-3 text-sm font-bold" data-testid="btn-sandbox" aria-expanded={open}>
        🧪 Sandbox tools
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="glass pointer-events-auto w-[min(18rem,calc(100vw-1rem))] rounded-2xl p-2.5" data-testid="sandbox-panel">
            <div className="mb-2 grid grid-cols-3 gap-1 rounded-xl bg-white/6 p-0.5">
              {(
                [
                  ['spawn', 'Spawn'],
                  ['sky', 'Sky'],
                  ['traffic', 'Traffic'],
                ] as const
              ).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setTab(k)} className={cx('h-8 rounded-lg text-xs font-bold', tab === k ? 'bg-white/16' : 'text-white/60')}>
                  {l}
                </button>
              ))}
            </div>
            {tab === 'spawn' && (
              <div className="grid max-h-[50dvh] grid-cols-3 gap-1.5 overflow-y-auto scroll-thin">
                {AIRCRAFT.map((a) => (
                  <SpawnTile key={a.id} id={a.id} name={a.name} />
                ))}
              </div>
            )}
            {tab === 'sky' && (
              <div>
                <div className="mb-1 text-[0.7rem] font-bold uppercase tracking-wider text-white/45">Weather</div>
                <div className="grid grid-cols-5 gap-1">
                  {(['clear', 'cloudy', 'rain', 'storm', 'fog'] as Weather[]).map((wt) => (
                    <button
                      key={wt}
                      type="button"
                      title={WEATHER_NAME[wt]}
                      aria-label={WEATHER_NAME[wt]}
                      data-testid={`weather-${wt}`}
                      onClick={() => game.issue({ t: 'setWeather', weather: wt })}
                      className={cx('grid h-10 place-items-center rounded-xl text-xl', w.weather === wt ? 'bg-sky-500/40 ring-1 ring-sky-300' : 'bg-white/6 hover:bg-white/12')}
                    >
                      {WEATHER_ICON[wt]}
                    </button>
                  ))}
                </div>
                <div className="mb-1 mt-3 flex justify-between text-[0.7rem] font-bold uppercase tracking-wider text-white/45">
                  <span>Time of day</span>
                  <span className="font-mono text-white/80">{fmtClock(minutes)}</span>
                </div>
                <input type="range" min={0} max={1439} step={15} value={Math.floor(minutes)} aria-label="Time of day" onChange={(e) => game.issue({ t: 'setTime', minutes: Number(e.target.value) })} className="w-full accent-sky-400" />
                <div className="mt-1 grid grid-cols-4 gap-1">
                  {[
                    ['🌅', 6 * 60],
                    ['☀️', 12 * 60],
                    ['🌇', 19 * 60],
                    ['🌙', 23 * 60],
                  ].map(([icon, m]) => (
                    <button key={String(m)} type="button" onClick={() => game.issue({ t: 'setTime', minutes: Number(m) })} className="h-9 rounded-xl bg-white/6 text-lg hover:bg-white/12">
                      {icon}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {tab === 'traffic' && (
              <div>
                <Toggle checked={w.autoSpawn} onChange={(v) => game.issue({ t: 'setAutoSpawn', on: v })} label="Automatic traffic" desc="New arrivals keep coming" />
                <p className="mt-1 text-xs text-white/50">
                  Aircraft on field: <b>{w.aircraft.length}</b> · Money: <b>unlimited</b> · No game over.
                </p>
                <button type="button" onClick={() => useGame.getState().set({ overlay: 'customize' })} className="mt-2 h-10 w-full rounded-xl bg-white/8 text-sm font-bold hover:bg-white/14">
                  🎨 Customize airport
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ReplayBar() {
  useGame((s) => s.version);
  const replaying = useGame((s) => s.replaying);
  const speed = useGame((s) => s.speed);
  const paused = useGame((s) => s.paused);
  const set = useGame((s) => s.set);
  const w = game.world;
  const rp = game.replay;
  if (!replaying || !w || !rp) return null;
  const end = rp.data.endTick;
  const pct = end ? w.tick / end : 0;
  return (
    <div className="glass pointer-events-auto absolute inset-x-2 bottom-3 z-30 mx-auto flex max-w-2xl flex-wrap items-center gap-2 rounded-2xl p-2 sm:flex-nowrap safe-bottom" data-testid="replay-bar">
      <button type="button" className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 text-lg" onClick={() => set({ paused: !paused })} aria-label={paused ? 'Play' : 'Pause'}>
        {paused ? '▶️' : '⏸️'}
      </button>
      <input
        type="range"
        min={0}
        max={end}
        step={20}
        value={w.tick}
        aria-label="Replay position"
        onChange={(e) => game.seekReplay(Number(e.target.value))}
        className="min-w-0 flex-1 accent-violet-400"
      />
      <span className="w-14 text-center font-mono text-xs tabular-nums text-white/70">{Math.round(pct * 100)}%</span>
      <div className="flex rounded-xl bg-white/6 p-0.5">
        {[1, 2, 4, 8].map((n) => (
          <button key={n} type="button" onClick={() => set({ speed: n, paused: false })} className={cx('h-9 w-9 rounded-lg text-xs font-extrabold', speed === n ? 'bg-violet-500' : 'text-white/60')}>
            {n}×
          </button>
        ))}
      </div>
      <button type="button" className="h-10 rounded-xl bg-white/10 px-3 text-sm font-bold" onClick={() => game.quitToMenu(false)}>
        Exit
      </button>
    </div>
  );
}
