import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { actionGoAround, actionHold, actionLand, actionPark, actionPushback, actionTakeoff, actionTaxi } from '../../game/actions';
import { game } from '../../game/controller';
import { getType, LIVERY_BY_ID, SIZE_LABEL } from '../../sim/aircraft';
import { AIRPORT } from '../../sim/airport';
import { availableActions } from '../../sim/commands';
import { departureBlockReason } from '../../sim/engine';
import type { Aircraft } from '../../sim/types';
import { useGame } from '../../store/game';
import { cx, IconButton, Meter } from '../common';
import { isDeparture, simToClock, statusOf, TONE } from '../format';

const imgCache = new Map<string, string>();
export function useAircraftImage(typeId: string, liveryId: string, size = 160) {
  const key = `${typeId}:${liveryId}:${size}`;
  const [src, setSrc] = useState(imgCache.get(key) ?? '');
  useEffect(() => {
    if (imgCache.has(key)) {
      setSrc(imgCache.get(key)!);
      return;
    }
    const r = game.renderer;
    if (!r?.ready) return;
    try {
      const c = r.aircraftCanvas(typeId, liveryId, size);
      const url = c.toDataURL('image/png');
      imgCache.set(key, url);
      setSrc(url);
    } catch {
      /* ignore */
    }
  }, [key, typeId, liveryId, size]);
  return src;
}

interface ActionDef {
  id: string;
  icon: string;
  label: string;
  key: string;
  run: () => void;
  tone: 'blue' | 'green' | 'orange' | 'violet' | 'slate' | 'red';
  disabled?: boolean;
  hint?: string;
  primary?: boolean;
}

const TONES: Record<ActionDef['tone'], string> = {
  blue: 'from-sky-400 to-blue-600 shadow-[0_10px_24px_-10px_rgb(56_132_255/0.9)]',
  green: 'from-emerald-400 to-emerald-600 shadow-[0_10px_24px_-10px_rgb(16_185_129/0.9)]',
  orange: 'from-orange-300 to-orange-500 shadow-[0_10px_24px_-10px_rgb(249_115_22/0.9)]',
  violet: 'from-violet-400 to-violet-600 shadow-[0_10px_24px_-10px_rgb(139_92_246/0.9)]',
  slate: 'from-slate-500 to-slate-700',
  red: 'from-rose-400 to-rose-600 shadow-[0_10px_24px_-10px_rgb(244_63_94/0.9)]',
};

function actionsFor(ac: Aircraft): ActionDef[] {
  const w = game.world!;
  const a = availableActions(w, ac);
  const list: ActionDef[] = [];
  const id = ac.id;
  const p = ac.phase;
  if (a.land) list.push({ id: 'land', icon: '🛬', label: p === 'approach' ? 'Change runway' : 'Land', key: 'L', run: () => actionLand(id), tone: 'blue', primary: p !== 'approach' });
  if (a.goAround) list.push({ id: 'goAround', icon: '🔄', label: 'Go around', key: 'G', run: () => actionGoAround(id), tone: 'red' });
  if (a.park) list.push({ id: 'park', icon: '🅿️', label: ac.gate ? 'Change gate' : 'Park', key: 'P', run: () => actionPark(id), tone: 'violet', primary: p === 'vacated' || (p === 'landing' && !ac.gate) });
  if (p === 'parked') {
    const ready = ac.turn?.stage === 'ready';
    list.push({ id: 'pushback', icon: '⏪', label: ac.pushbackRequested ? 'Pushing soon' : 'Push back', key: 'B', run: () => actionPushback(id), tone: 'orange', disabled: !a.pushbackReady, hint: ready ? (ac.pushbackRequested ? 'Waiting for a clear taxilane' : undefined) : 'Still boarding', primary: ready && !ac.pushbackRequested });
  }
  if (a.taxi) list.push({ id: 'taxi', icon: '➡️', label: p === 'taxiOut' ? 'Change runway' : ac.pendingTaxiRunway ? `Taxi ${AIRPORT.runways[ac.pendingTaxiRunway].name} ✓` : 'Taxi', key: 'T', run: () => actionTaxi(id), tone: 'blue', primary: p === 'readyTaxi' });
  if (p === 'taxiOut' || p === 'holdShort') {
    list.push({ id: 'takeoff', icon: '🛫', label: ac.takeoffCleared ? 'Cleared ✓' : 'Take off', key: 'T', run: () => actionTakeoff(id), tone: 'green', disabled: !a.takeoff, primary: p === 'holdShort' && !ac.takeoffCleared });
  }
  if (p === 'taxiIn' || p === 'taxiOut') list.push({ id: 'hold', icon: ac.holdPos ? '▶️' : '✋', label: ac.holdPos ? 'Continue' : 'Hold', key: 'H', run: () => actionHold(id), tone: ac.holdPos ? 'green' : 'slate' });
  if (p === 'approach' && ac.approach?.stage !== 'final') list.push({ id: 'hold', icon: '✋', label: 'Hold', key: 'H', run: () => actionHold(id), tone: 'slate' });
  return list;
}

export function AircraftPanel() {
  useGame((s) => s.version);
  const selected = useGame((s) => s.selected);
  const hint = useGame((s) => s.hint);
  const replaying = useGame((s) => s.replaying);
  const picking = useGame((s) => !!s.pick);
  const set = useGame((s) => s.set);
  const w = game.world;
  const ac = w && selected ? w.aircraft.find((a) => a.id === selected) : undefined;
  useEffect(() => {
    if (selected && !ac) set({ selected: null, pick: null });
  }, [selected, ac, set]);
  return (
    <AnimatePresence>
      {ac && w && !picking && (
        <motion.section
          key={ac.id}
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={{ type: 'spring', stiffness: 360, damping: 32 }}
          className="glass pointer-events-auto absolute inset-x-0 bottom-0 z-30 rounded-t-[26px] px-3 pb-3 pt-2.5 sm:inset-x-auto sm:bottom-3 sm:left-1/2 sm:w-[min(36rem,calc(100vw-2rem))] sm:-translate-x-1/2 sm:rounded-[26px] safe-bottom"
          data-testid="aircraft-panel"
          aria-label={`Aircraft ${ac.callsign}`}
        >
          <PanelBody ac={ac} hintAction={hint?.ac === ac.id ? hint.text : null} replaying={replaying} />
        </motion.section>
      )}
    </AnimatePresence>
  );
}

function PanelBody({ ac, hintAction, replaying }: { ac: Aircraft; hintAction: string | null; replaying: boolean }) {
  const w = game.world!;
  const set = useGame((s) => s.set);
  const t = getType(ac.typeId);
  const liv = LIVERY_BY_ID[ac.liveryId];
  const f = w.flights.find((x) => x.id === ac.flightId);
  const st = statusOf(w, ac);
  const img = useAircraftImage(ac.typeId, ac.liveryId, 120);
  const acts = useMemo(() => (replaying ? [] : actionsFor(ac)), [ac, ac.phase, ac.holdPos, ac.takeoffCleared, ac.pushbackRequested, ac.turn?.stage, ac.gate, ac.pendingTaxiRunway, replaying, w.tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const dep = isDeparture(ac);
  const kids = w.config.mode === 'kids';

  let progress: { label: string; value: number; color: string; right?: string } | null = null;
  if (ac.phase === 'parked' && ac.turn) {
    const v = Math.min(1, ac.turn.t / ac.turn.total);
    const stageLbl = ac.turn.stage === 'deboard' ? 'Passengers leaving' : ac.turn.stage === 'service' ? 'Cleaning & refuelling' : ac.turn.stage === 'board' ? 'Boarding' : 'Ready to go';
    const pax = ac.turn.stage === 'board' ? Math.round(((v - 0.5) / 0.5) * ac.pax) : ac.turn.stage === 'deboard' ? Math.round((1 - v / 0.3) * ac.pax) : ac.turn.stage === 'ready' ? ac.pax : 0;
    progress = { label: stageLbl, value: v, color: 'linear-gradient(90deg,#9775fa,#4dabf7)', right: `${Math.max(0, pax)}/${ac.pax} 🧑` };
  } else if (w.rules.fuel && ['inbound', 'holding', 'approach', 'goAround'].includes(ac.phase)) {
    const v = Math.min(1, ac.fuel / 330);
    progress = { label: 'Holding fuel', value: v, color: ac.fuel < 60 ? '#ff6b6b' : ac.fuel < 120 ? '#fcc419' : '#38d9a9', right: `${Math.max(0, Math.round(ac.fuel))}s` };
  } else if (ac.path && ['taxiIn', 'taxiOut', 'landing'].includes(ac.phase)) {
    const v = Math.min(1, ac.s / Math.max(1, ac.path.total));
    progress = { label: ac.phase === 'landing' ? 'Rolling out' : 'Taxi progress', value: v, color: dep ? '#ff922b' : '#4dabf7', right: `${Math.round(ac.v * 1.0)} kt` };
  }

  const blocked = ac.phase === 'holdShort' && ac.takeoffCleared && ac.runway ? departureBlockReason(w, ac, ac.runway) : null;

  return (
    <div>
      <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-white/20 sm:hidden" aria-hidden />
      <div className="flex items-center gap-3">
        <div className="relative grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br from-sky-200/20 to-sky-500/5 sm:h-16 sm:w-16">
          {img ? <img src={img} alt="" className="h-full w-full object-contain p-1" draggable={false} /> : <span className="text-2xl">✈️</span>}
          <span className="absolute bottom-0 left-0 right-0 h-1" style={{ background: `#${(liv?.tail ?? 0).toString(16).padStart(6, '0')}` }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <h2 className="font-mono text-xl font-extrabold tracking-tight sm:text-2xl" data-testid="panel-callsign">
              {ac.callsign}
            </h2>
            <span className={cx('rounded-lg px-2 py-0.5 text-[0.7rem] font-bold uppercase tracking-wide', TONE[st.tone])} data-testid="panel-status">
              {st.label}
            </span>
            {ac.emergency && <span className="animate-pulse rounded-lg bg-rose-500 px-2 py-0.5 text-[0.7rem] font-black uppercase">Emergency · {ac.emergency.kind}</span>}
          </div>
          <div className="truncate text-[0.8rem] text-white/60">
            {liv?.name} · {t.name} <span className="text-white/35">({SIZE_LABEL[t.cat]})</span>
          </div>
          <div className="truncate text-[0.78rem] text-white/50">
            {f ? (dep ? `To ${f.dest} · STD ${simToClock(w, f.schedDep)}` : `From ${f.origin} · STA ${simToClock(w, f.schedArr)}`) : ''}
            {ac.gate ? ` · Gate ${AIRPORT.gateById[ac.gate]?.label}` : ''}
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-1 self-start">
          <IconButton label="Close" onClick={() => set({ selected: null, pick: null })} testId="panel-close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </IconButton>
          <IconButton
            label="Follow aircraft"
            onClick={() => {
              const r = game.renderer;
              if (!r) return;
              const id = ac.id;
              r.camera.follow = () => {
                const a = game.world?.aircraft.find((x) => x.id === id);
                return a ? { x: a.x, y: a.y } : null;
              };
              r.camera.focus(ac.x, ac.y, Math.max(r.camera.zoom, 0.7));
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <circle cx="12" cy="12" r="7" />
              <circle cx="12" cy="12" r="2" fill="currentColor" />
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3" strokeLinecap="round" />
            </svg>
          </IconButton>
        </div>
      </div>

      {(st.detail || blocked) && (
        <p className="mt-2 text-[0.82rem] text-white/70" data-testid="panel-detail">
          {blocked ? `⏳ ${blocked} — will take off automatically` : st.detail}
          {ac.waitReason && ac.waitTime > 2 && !blocked && st.detail !== ac.waitReason ? ` · ${ac.waitReason}` : ''}
        </p>
      )}

      {progress && (
        <div className="mt-2">
          <div className="mb-1 flex justify-between text-[0.72rem] font-semibold text-white/55">
            <span>{progress.label}</span>
            <span className="tabular-nums">{progress.right}</span>
          </div>
          <Meter value={progress.value} color={progress.color} label={progress.label} />
        </div>
      )}

      {hintAction && kids && (
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-2 rounded-xl bg-emerald-400/15 px-3 py-2 text-sm font-semibold text-emerald-100">
          💡 {hintAction}
        </motion.div>
      )}

      {acts.length > 0 ? (
        <div className={cx('mt-3 grid gap-2', acts.length >= 3 ? 'grid-cols-3' : acts.length === 2 ? 'grid-cols-2' : 'grid-cols-1')} data-testid="action-buttons">
          {acts.map((a) => (
            <motion.button
              key={a.id}
              type="button"
              whileTap={a.disabled ? undefined : { scale: 0.95 }}
              disabled={a.disabled}
              onClick={a.run}
              data-testid={`act-${a.id}`}
              aria-label={`${a.label}${a.hint ? ` — ${a.hint}` : ''}`}
              className={cx(
                'relative flex h-[3.6rem] flex-col items-center justify-center rounded-2xl bg-gradient-to-b px-2 text-white transition-[filter] disabled:cursor-not-allowed disabled:opacity-45 sm:h-16',
                TONES[a.tone],
                a.primary && !a.disabled && 'ring-2 ring-white/70',
                kids && 'sm:h-[4.4rem]',
              )}
            >
              <span className="text-[1.35rem] leading-none" aria-hidden>
                {a.icon}
              </span>
              <span className="mt-1 text-[0.8rem] font-extrabold leading-tight">{a.label}</span>
              {a.hint && <span className="text-[0.62rem] font-semibold text-white/80">{a.hint}</span>}
              <kbd className="absolute right-1.5 top-1 hidden rounded bg-black/20 px-1 font-mono text-[0.6rem] text-white/70 lg:block">{a.key}</kbd>
              {a.primary && !a.disabled && <span className="pointer-events-none absolute inset-0 animate-pulse rounded-2xl ring-2 ring-white/40" />}
            </motion.button>
          ))}
        </div>
      ) : (
        <p className="mt-3 rounded-xl bg-white/6 px-3 py-2.5 text-center text-sm text-white/60">
          {replaying ? 'Replay — controls are disabled' : ac.phase === 'takeoff' || ac.phase === 'lineup' ? '🛫 Taking off — enjoy the view!' : ac.phase === 'climbOut' ? '👋 Goodbye! Flight departed.' : 'Nothing to do right now — the crew has it covered.'}
        </p>
      )}
      {!kids && !replaying && ['vacated', 'taxiIn', 'readyTaxi', 'taxiOut'].includes(ac.phase) && (
        <p className="mt-2 hidden text-center text-[0.7rem] text-white/40 sm:block">Tip: drag from the aircraft along the taxiways to draw your own route.</p>
      )}
    </div>
  );
}
