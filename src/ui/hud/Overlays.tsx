import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { actionTakeoff, pickRunway } from '../../game/actions';
import { game } from '../../game/controller';
import { AIRPORT } from '../../sim/airport';
import { useGame } from '../../store/game';
import { useProfile } from '../../store/profile';
import { Button, cx } from '../common';

export function Toasts() {
  const toasts = useGame((s) => s.toasts);
  const dismiss = useGame((s) => s.dismissToast);
  const tone = {
    info: 'border-sky-300/30',
    success: 'border-emerald-300/40',
    warning: 'border-amber-300/50',
    error: 'border-rose-400/60',
    reward: 'border-amber-200/40',
    achievement: 'border-violet-300/60 bg-gradient-to-r from-violet-600/40 to-sky-600/30',
  } as const;
  const pick = useGame((s) => s.pick);
  return (
    <div className={cx('pointer-events-none absolute left-1/2 z-40 flex w-[min(21rem,calc(100vw-1rem))] -translate-x-1/2 flex-col items-center gap-2', pick ? 'top-[9.5rem]' : 'top-[4.6rem]')} aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.button
            key={t.id}
            type="button"
            onClick={() => dismiss(t.id)}
            initial={{ opacity: 0, y: -14, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className={cx('glass pointer-events-auto flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left', tone[t.kind])}
          >
            {t.icon && (
              <motion.span className="text-2xl leading-none" initial={t.kind === 'achievement' ? { scale: 0, rotate: -40 } : false} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 10 }} aria-hidden>
                {t.icon}
              </motion.span>
            )}
            <span className="min-w-0 flex-1">
              {t.kind === 'achievement' && <span className="block text-[0.62rem] font-extrabold uppercase tracking-[0.18em] text-violet-200">Achievement</span>}
              <span className="block truncate text-sm font-bold">{t.title}</span>
              {t.text && <span className="block text-[0.78rem] leading-snug text-white/65">{t.text}</span>}
            </span>
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function RadioLog() {
  const radio = useGame((s) => s.radio);
  const open = useGame((s) => s.radioOpen);
  const set = useGame((s) => s.set);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [radio.length, open]);
  const last = radio[radio.length - 1];
  return (
    <div className="pointer-events-none absolute bottom-3 right-2 z-20 hidden w-[min(22rem,calc(100vw-1rem))] flex-col items-end gap-2 sm:right-3 md:flex safe-bottom">
      <div className="sr-only" aria-live="polite">
        {last ? `${last.callsign ?? 'Tower'}: ${last.text}` : ''}
      </div>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} className="glass pointer-events-auto max-h-64 w-full overflow-y-auto rounded-2xl p-2 scroll-thin" data-testid="radio-log">
            {radio.map((m) => (
              <div key={m.id} className="flex gap-2 rounded-lg px-1.5 py-1 text-[0.78rem] leading-snug">
                <span className="shrink-0 font-mono text-white/35">{m.time}</span>
                <span className={cx('min-w-0', m.kind === 'alert' ? 'text-rose-200' : m.kind === 'tower' ? 'text-sky-200' : m.kind === 'system' ? 'text-white/55' : 'text-white/85')}>
                  {m.callsign && <b className="mr-1 font-mono">{m.callsign}</b>}
                  {m.kind === 'tower' && <b className="mr-1">Tower:</b>}
                  {m.text}
                </span>
              </div>
            ))}
            <div ref={end} />
          </motion.div>
        )}
      </AnimatePresence>
      <button type="button" onClick={() => set({ radioOpen: !open })} className="glass pointer-events-auto flex max-w-full items-center gap-2 rounded-2xl px-3 py-2 text-left text-[0.78rem]" data-testid="btn-radio" aria-expanded={open}>
        <span aria-hidden>📻</span>
        <span className="min-w-0 truncate text-white/70">{last ? `${last.callsign ? `${last.callsign}: ` : ''}${last.text}` : 'Radio is quiet'}</span>
      </button>
    </div>
  );
}

/** Speech bubble that follows the aircraft the helper wants you to tap. */
export function HintBubble() {
  const hint = useGame((s) => s.hint);
  const selected = useGame((s) => s.selected);
  const mode = useGame((s) => s.mode);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!hint) return;
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const p = game.renderer?.aircraftScreen(hint.ac);
      setPos((old) => (p && (!old || Math.abs(old.x - p.x) > 0.5 || Math.abs(old.y - p.y) > 0.5) ? p : old));
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [hint]);
  if (!hint || !pos || selected === hint.ac) return null;
  const W = game.renderer?.camera.w ?? 1000;
  const H = game.renderer?.camera.h ?? 800;
  const onScreen = pos.x > 20 && pos.y > 80 && pos.x < W - 20 && pos.y < H - 40;
  const x = Math.max(130, Math.min(W - 130, pos.x));
  const y = Math.max(140, Math.min(H - 60, pos.y));
  return (
    <div className="pointer-events-none absolute z-20" style={{ left: x, top: y - 64, transform: 'translate(-50%, -100%)' }}>
      <motion.button
        type="button"
        key={hint.ac + hint.text}
        initial={{ opacity: 0, y: 8, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        onClick={() => {
          const ui = useGame.getState();
          ui.set({ selected: hint.ac });
          const a = game.world?.aircraft.find((q) => q.id === hint.ac);
          if (a && game.renderer && !onScreen) game.renderer.camera.focus(a.x, a.y);
        }}
        className={cx(
          'pointer-events-auto relative block w-max max-w-[16rem] rounded-2xl bg-white px-3.5 py-2.5 text-left text-[0.85rem] font-bold leading-snug text-slate-800 shadow-2xl',
          mode === 'kids' && 'text-[0.95rem]',
        )}
        data-testid="hint-bubble"
      >
        <span className="mr-1" aria-hidden>
          {onScreen ? '👇' : '👀'}
        </span>
        {hint.text}
        <span className="absolute -bottom-2 left-1/2 h-4 w-4 -translate-x-1/2 rotate-45 bg-white" aria-hidden />
      </motion.button>
    </div>
  );
}

export function UndoButton() {
  const undo = useGame((s) => s.undo);
  const replaying = useGame((s) => s.replaying);
  const selected = useGame((s) => s.selected);
  const last = undo[undo.length - 1];
  if (!last || replaying) return null;
  const ac = game.world?.aircraft.find((a) => a.id === last.ac);
  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={() => game.undo()}
      className={cx(
        'glass pointer-events-auto absolute left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full px-4 py-2 text-[0.82rem] font-bold',
        selected ? 'bottom-[15.5rem] sm:bottom-[14.5rem]' : 'bottom-4 safe-bottom',
      )}
      data-testid="btn-undo"
      title="Undo the last instruction that hasn't happened yet (U / Ctrl+Z)"
    >
      <span aria-hidden>↩️</span> Undo: <span className="font-mono">{ac?.callsign}</span> {last.label}
    </motion.button>
  );
}

export function PickBanner() {
  const pick = useGame((s) => s.pick);
  const set = useGame((s) => s.set);
  useGame((s) => s.version);
  const w = game.world;
  if (!pick || !w) return null;
  const ac = w.aircraft.find((a) => a.id === pick.ac);
  if (!ac) return null;
  return (
    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="glass pointer-events-auto absolute left-1/2 top-[4.6rem] z-30 flex w-[min(30rem,calc(100vw-1rem))] -translate-x-1/2 flex-col gap-2 rounded-2xl px-3 py-2.5" data-testid="pick-banner">
      <div className="flex items-center gap-2">
        <span className="text-xl" aria-hidden>
          {pick.kind === 'gate' ? '🅿️' : pick.purpose === 'land' ? '🛬' : '➡️'}
        </span>
        <p className="min-w-0 flex-1 text-[0.85rem] font-semibold leading-snug">
          {pick.kind === 'gate' ? (
            <>
              Tap a <span className="font-extrabold text-emerald-300">green gate</span> for <span className="font-mono">{ac.callsign}</span>
            </>
          ) : (
            <>
              Choose a runway for <span className="font-mono">{ac.callsign}</span>
            </>
          )}
        </p>
        <Button size="sm" variant="ghost" onClick={() => set({ pick: null })} sound="close">
          Cancel
        </Button>
      </div>
      {pick.kind === 'runway' && (
        <div className="grid grid-cols-2 gap-2">
          {(['R1', 'R2'] as const).map((rid) => {
            const r = AIRPORT.runways[rid];
            const open = w.config.runways.includes(rid);
            const busy = w.runways[rid].owner;
            const q = w.runways[rid].arrivals.length;
            return (
              <Button key={rid} variant={open ? 'primary' : 'secondary'} disabled={!open} onClick={() => pickRunway(rid)} testId={`pick-${rid}`} sound={null}>
                <span className="font-mono">{r.name}</span>
                <span className="text-[0.72rem] font-semibold opacity-80">{!open ? 'Closed' : rid === 'R1' ? 'North' : 'South'}{busy ? ' · busy' : q ? ` · ${q} queued` : ''}</span>
              </Button>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}

export function ConfirmTakeoff() {
  const c = useGame((s) => s.confirm);
  const set = useGame((s) => s.set);
  const setSetting = useProfile((s) => s.setSetting);
  return (
    <AnimatePresence>
      {c && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="pointer-events-auto fixed inset-0 z-50 grid place-items-center bg-ink-950/50 p-4">
          <motion.div initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} className="glass w-full max-w-sm rounded-3xl p-5" role="alertdialog" aria-label="Runway conflict warning">
            <div className="mb-2 text-3xl">⚠️</div>
            <h3 className="text-lg font-extrabold">Runway conflict</h3>
            <p className="mt-1 text-sm text-white/70">{c.text}</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button onClick={() => set({ confirm: null })}>Wait</Button>
              <Button
                variant="warning"
                onClick={() => {
                  set({ confirm: null });
                  actionTakeoff(c.ac, true);
                }}
              >
                Take off anyway
              </Button>
            </div>
            <button type="button" className="mt-3 w-full text-center text-xs text-white/45 underline" onClick={() => setSetting('confirmPro', false)}>
              Don't ask again
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
