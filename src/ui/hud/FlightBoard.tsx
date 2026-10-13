import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { selectAircraft } from '../../game/actions';
import { game } from '../../game/controller';
import { getType, LIVERY_BY_ID } from '../../sim/aircraft';
import { AIRPORT } from '../../sim/airport';
import type { Aircraft } from '../../sim/types';
import { useGame } from '../../store/game';
import { cx } from '../common';
import { isDeparture, simToClock, statusOf, TONE } from '../format';

function Row({ ac, dep }: { ac: Aircraft; dep: boolean }) {
  const w = game.world!;
  const selected = useGame((s) => s.selected === ac.id);
  const f = w.flights.find((x) => x.id === ac.flightId);
  const st = statusOf(w, ac);
  const t = getType(ac.typeId);
  const att = game.attention.has(ac.id);
  const liv = LIVERY_BY_ID[ac.liveryId];
  const late = f && dep && w.tick / 20 > f.schedDep;
  return (
    <motion.button
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      type="button"
      data-testid={`board-row-${ac.callsign}`}
      onClick={() => selectAircraft(ac.id, true)}
      className={cx(
        'group relative flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors',
        selected ? 'bg-sky-500/22 ring-1 ring-sky-400/60' : 'hover:bg-white/7',
      )}
    >
      <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ background: `#${(liv?.tail ?? 0x4dabf7).toString(16).padStart(6, '0')}` }} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[0.92rem] font-bold tracking-tight">{ac.callsign}</span>
          {ac.emergency && <span className="rounded bg-rose-500 px-1 text-[0.6rem] font-black uppercase">SOS</span>}
          {ac.special && <span aria-label="special">✨</span>}
          <span className="truncate text-[0.72rem] text-white/45">{t.name}</span>
        </div>
        <div className="truncate text-[0.72rem] text-white/55">
          {dep ? `→ ${f?.dest ?? ''}` : `${f?.origin ?? ''} →`}
          {ac.gate ? ` · ${AIRPORT.gateById[ac.gate]?.label}` : ''}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className={cx('rounded-md px-1.5 py-0.5 text-[0.64rem] font-bold uppercase tracking-wide', TONE[st.tone])}>{st.label}</span>
        <span className={cx('font-mono text-[0.68rem] tabular-nums', late ? 'text-rose-300' : 'text-white/45')}>{f ? simToClock(w, dep ? f.schedDep : f.schedArr) : ''}</span>
      </div>
      {att && <span className="absolute -left-0.5 top-1/2 h-2.5 w-2.5 -translate-y-1/2 animate-pulse-soft rounded-full bg-amber-300" aria-label="needs attention" />}
    </motion.button>
  );
}

export function FlightBoard() {
  useGame((s) => s.version);
  const open = useGame((s) => s.boardOpen);
  const set = useGame((s) => s.set);
  const [tab, setTab] = useState<'arr' | 'dep'>('arr');
  const w = game.world;
  if (!w) return null;
  const active = w.aircraft.filter((a) => a.phase !== 'departed' && a.phase !== 'diverted' && a.phase !== 'climbOut');
  const arrivals = active.filter((a) => !isDeparture(a));
  const departures = active.filter((a) => isDeparture(a));
  const list = tab === 'arr' ? arrivals : departures;
  const order = (a: Aircraft) => (game.attention.has(a.id) ? 0 : 1);
  list.sort((a, b) => order(a) - order(b) || a.id.localeCompare(b.id, 'en', { numeric: true }));
  const nextIn = Math.max(0, Math.round((w.nextSpawnTick - w.tick) / 20));
  const attArr = arrivals.filter((a) => game.attention.has(a.id)).length;
  const attDep = departures.filter((a) => game.attention.has(a.id)).length;

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.aside
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="glass pointer-events-auto absolute left-2 top-[4.6rem] z-20 flex max-h-[calc(100dvh-12rem)] w-[min(19rem,calc(100vw-1rem))] flex-col overflow-hidden rounded-2xl sm:left-3"
            data-testid="flight-board"
            aria-label="Flight board"
          >
            <div className="flex items-center gap-1 border-b border-white/8 p-1.5">
              {(
                [
                  ['arr', 'Arrivals', arrivals.length, attArr, '🛬'],
                  ['dep', 'Departures', departures.length, attDep, '🛫'],
                ] as const
              ).map(([k, label, n, att, icon]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setTab(k)}
                  className={cx('relative flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl text-[0.8rem] font-bold transition-colors', tab === k ? 'bg-white/14 text-white' : 'text-white/55 hover:text-white')}
                  data-testid={`tab-${k}`}
                >
                  <span aria-hidden>{icon}</span>
                  {label}
                  <span className="rounded-full bg-white/12 px-1.5 text-[0.68rem] tabular-nums">{n}</span>
                  {att > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-amber-300" />}
                </button>
              ))}
              <button type="button" aria-label="Hide flight board" onClick={() => set({ boardOpen: false })} className="grid h-9 w-9 place-items-center rounded-xl text-white/60 hover:bg-white/10 hover:text-white">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                  <path d="M15 6l-6 6 6 6" />
                </svg>
              </button>
            </div>
            <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-1.5">
              <AnimatePresence initial={false}>
                {list.map((a) => (
                  <Row key={a.id} ac={a} dep={tab === 'dep'} />
                ))}
              </AnimatePresence>
              {list.length === 0 && (
                <div className="px-3 py-6 text-center text-sm text-white/45">{tab === 'arr' ? 'No arrivals right now — enjoy the calm ☕' : 'No departures yet. Parked aircraft will appear here.'}</div>
              )}
            </div>
            {tab === 'arr' && w.autoSpawn && (
              <div className="border-t border-white/8 px-3 py-2 text-[0.72rem] text-white/50">
                Next arrival expected in <span className="font-mono font-bold text-white/80">{nextIn}s</span>
              </div>
            )}
          </motion.aside>
        )}
      </AnimatePresence>
      {!open && (
        <motion.button
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          type="button"
          onClick={() => set({ boardOpen: true })}
          className="glass pointer-events-auto absolute left-2 top-[4.6rem] z-20 flex h-11 items-center gap-2 rounded-2xl px-3 text-sm font-bold sm:left-3"
          data-testid="btn-board"
          aria-label="Show flight board"
        >
          <span aria-hidden>📋</span>
          <span className="hidden sm:inline">Flights</span>
          {attArr + attDep > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-amber-300 px-1 text-[0.7rem] font-black text-amber-950">{attArr + attDep}</span>}
        </motion.button>
      )}
    </>
  );
}
