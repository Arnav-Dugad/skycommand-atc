import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { audio } from '../../audio/audio';
import { fetchDaily, fetchLeaderboard, submitDaily, type LeaderRow } from '../../game/api';
import { game, modeName } from '../../game/controller';
import { useGame } from '../../store/game';
import { useProfile } from '../../store/profile';
import { Button, cx, Modal, Stars } from '../common';

export function PauseMenu() {
  const overlay = useGame((s) => s.overlay);
  const set = useGame((s) => s.set);
  const mode = useGame((s) => s.mode);
  const w = game.world;
  return (
    <Modal open={overlay === 'pause'} onClose={() => set({ overlay: null })} title="Paused" subtitle={`${modeName(mode)} · Day ${(w?.day ?? 0) + 1}`} icon="⏸️" testId="pause-menu">
      <div className="grid gap-2">
        <Button size="lg" variant="primary" onClick={() => set({ overlay: null })} testId="btn-resume" sound="close">
          ▶ Resume
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => set({ overlay: 'missions' })}>🎯 Missions</Button>
          <Button onClick={() => set({ overlay: 'hangar' })}>🛠️ Hangar</Button>
          <Button onClick={() => set({ overlay: 'stats' })}>📊 Stats</Button>
          <Button onClick={() => set({ overlay: 'encyclopedia' })}>📖 Aircraft</Button>
          <Button onClick={() => set({ overlay: 'settings' })}>⚙️ Settings</Button>
          <Button onClick={() => set({ overlay: 'help' })}>❓ How to play</Button>
        </div>
        {mode !== 'daily' && (
          <Button onClick={() => set({ overlay: 'customize' })} testId="btn-customize">
            🎨 Customize airport
          </Button>
        )}
        <Button
          variant="secondary"
          onClick={() => {
            game.save();
            useGame.getState().toast({ kind: 'success', title: 'Game saved', icon: '💾' });
          }}
          testId="btn-save"
        >
          💾 Save game
        </Button>
        <Button variant="ghost" onClick={() => game.quitToMenu()} testId="btn-quit">
          🏠 Save & return to menu
        </Button>
      </div>
    </Modal>
  );
}

export function DaySummary() {
  const d = useGame((s) => s.daySummary);
  const set = useGame((s) => s.set);
  return (
    <Modal open={!!d} onClose={() => set({ daySummary: null })} title={`Day ${d?.day ?? ''} complete!`} subtitle="The night shift takes over — great work, controller." icon="🌙" testId="day-summary">
      {d && (
        <div className="flex flex-col items-center text-center">
          <Stars n={d.stars} size="text-5xl" />
          <p className="mt-2 text-sm text-white/60">{d.stars === 3 ? 'Perfect day! Flawless operations.' : d.stars === 2 ? 'Great job! Smooth and steady.' : d.stars === 1 ? 'Nice start — keep the flights flowing!' : 'Handle more flights to earn stars.'}</p>
          <div className="mt-4 grid w-full grid-cols-3 gap-2">
            <div className="rounded-2xl bg-white/6 p-3">
              <div className="text-2xl font-extrabold">{d.flights}</div>
              <div className="text-[0.66rem] font-bold uppercase tracking-wider text-white/45">Flights</div>
            </div>
            <div className="rounded-2xl bg-white/6 p-3">
              <div className="text-2xl font-extrabold">{d.happiness}%</div>
              <div className="text-[0.66rem] font-bold uppercase tracking-wider text-white/45">Happiness</div>
            </div>
            <div className="rounded-2xl bg-white/6 p-3">
              <div className="text-2xl font-extrabold">+{d.stars}</div>
              <div className="text-[0.66rem] font-bold uppercase tracking-wider text-white/45">Stars</div>
            </div>
          </div>
          <div className="mt-5 grid w-full grid-cols-2 gap-2">
            <Button onClick={() => game.quitToMenu()}>🏠 Menu</Button>
            <Button variant="primary" onClick={() => set({ daySummary: null })} testId="btn-next-day" sound="confirm">
              Keep playing →
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export function GameOver() {
  const g = useGame((s) => s.gameOver);
  const prof = useProfile();
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [msg, setMsg] = useState('');
  useEffect(() => {
    setState('idle');
    setMsg('');
  }, [g]);
  const submit = async () => {
    const r = game.dailyReplay();
    if (!r || !g?.dateKey) return;
    setState('sending');
    const res = await submitDaily(g.dateKey, prof.clientId, prof.nickname, r, g.points);
    if (res.ok) {
      setState('done');
      setMsg(`Verified score ${res.verifiedScore?.toLocaleString()} · Rank #${res.rank} of ${res.total}`);
      const d = useProfile.getState().daily;
      if (d) useProfile.getState().setDaily({ ...d, submitted: true });
      audio.play('achievement');
    } else {
      setState('error');
      setMsg(res.error ?? 'Could not submit');
      audio.play('error');
    }
  };
  return (
    <Modal open={!!g} title={g?.daily ? 'Challenge complete!' : 'Shift over'} subtitle={g?.reason} icon={g?.daily ? '🏁' : '😟'} testId="game-over" dismissable={false}>
      {g && (
        <div className="text-center">
          <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="font-mono text-5xl font-extrabold tabular-nums" data-testid="final-score">
            {g.points.toLocaleString()}
          </motion.div>
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-white/45">points</div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="rounded-2xl bg-white/6 p-3">
              <div className="text-xl font-extrabold">{g.arrivals}</div>
              <div className="text-[0.66rem] font-bold uppercase tracking-wider text-white/45">Landed</div>
            </div>
            <div className="rounded-2xl bg-white/6 p-3">
              <div className="text-xl font-extrabold">{g.departures}</div>
              <div className="text-[0.66rem] font-bold uppercase tracking-wider text-white/45">Departed</div>
            </div>
            <div className="rounded-2xl bg-white/6 p-3">
              <div className="text-xl font-extrabold">{g.happiness}%</div>
              <div className="text-[0.66rem] font-bold uppercase tracking-wider text-white/45">Happy</div>
            </div>
          </div>
          {g.daily && (
            <div className="mt-4 rounded-2xl bg-white/5 p-3 text-sm">
              <p className="text-white/70">Submit your run for the online leaderboard. The server re-simulates every instruction to verify your score.</p>
              <Button className="mt-3 w-full" variant="primary" disabled={state === 'sending' || state === 'done'} onClick={submit} testId="btn-submit-daily">
                {state === 'sending' ? 'Verifying run…' : state === 'done' ? '✓ Submitted' : `Submit as ${prof.nickname}`}
              </Button>
              {msg && <p className={cx('mt-2 text-sm font-semibold', state === 'error' ? 'text-rose-300' : 'text-emerald-300')}>{msg}</p>}
            </div>
          )}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button onClick={() => game.quitToMenu(false)} testId="btn-gameover-menu">
              🏠 Menu
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                if (g.daily) useGame.getState().set({ gameOver: null, overlay: 'leaderboard' });
                else game.startGame(useGame.getState().mode);
              }}
            >
              {g.daily ? '🏆 Leaderboard' : '↻ Try again'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export function DailyChallenge() {
  const overlay = useGame((s) => s.overlay);
  const set = useGame((s) => s.set);
  const daily = useProfile((s) => s.daily);
  const [info, setInfo] = useState<{ date: string; online: boolean } | null>(null);
  useEffect(() => {
    if (overlay === 'daily') fetchDaily().then(setInfo);
  }, [overlay]);
  const played = daily && info && daily.date === info.date;
  return (
    <Modal open={overlay === 'daily'} onClose={() => set({ overlay: null })} title="Daily Challenge" subtitle={info ? `${info.date} · same airport, same traffic for everyone` : 'Loading…'} icon="📅" testId="daily">
      <ul className="space-y-2 text-sm text-white/75">
        <li>⏱️ 6 hours of airport time (about 6 minutes)</li>
        <li>✈️ Busy mixed traffic with wide-bodies, fuel limits and emergencies</li>
        <li>🛡️ Scores are re-simulated on the server — no cheating possible by editing your browser</li>
        <li>🎁 Earn 150 coins the first time you finish each day's challenge</li>
      </ul>
      {!info?.online && info && <p className="mt-3 rounded-2xl bg-amber-400/15 p-3 text-sm text-amber-100">You're offline — you can still practise, and submit later when you're online.</p>}
      {played && <p className="mt-3 text-sm text-white/60">Your best today: <b>{daily.best.toLocaleString()}</b> points{daily.submitted ? ' (submitted)' : ''}.</p>}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button onClick={() => set({ overlay: 'leaderboard' })}>🏆 Leaderboard</Button>
        <Button
          variant="primary"
          disabled={!info}
          testId="btn-start-daily"
          onClick={() => {
            if (!info) return;
            game.clearSave();
            game.startGame('daily', { dateKey: info.date });
          }}
          sound="confirm"
        >
          Start challenge
        </Button>
      </div>
    </Modal>
  );
}

export function Leaderboard() {
  const overlay = useGame((s) => s.overlay);
  const set = useGame((s) => s.set);
  const clientId = useProfile((s) => s.clientId);
  const [rows, setRows] = useState<LeaderRow[] | null>(null);
  const [online, setOnline] = useState(true);
  const [date, setDate] = useState('');
  useEffect(() => {
    if (overlay !== 'leaderboard') return;
    setRows(null);
    fetchDaily().then(async (d) => {
      setDate(d.date);
      const r = await fetchLeaderboard(d.date, clientId);
      setRows(r.rows);
      setOnline(r.online);
    });
  }, [overlay, clientId]);
  return (
    <Modal open={overlay === 'leaderboard'} onClose={() => set({ overlay: game.kind === 'play' ? null : null })} title="Daily Leaderboard" subtitle={date ? `${date} · verified scores only` : ''} icon="🏆" testId="leaderboard">
      {!rows && <p className="py-6 text-center text-sm text-white/55">Loading scores…</p>}
      {rows && !online && <p className="py-6 text-center text-sm text-white/55">The leaderboard is unavailable offline. Your progress is safe on this device.</p>}
      {rows && online && rows.length === 0 && <p className="py-6 text-center text-sm text-white/55">No scores yet today — be the first controller on the board!</p>}
      {rows && rows.length > 0 && (
        <ol className="space-y-1.5">
          {rows.map((r) => (
            <li key={`${r.rank}-${r.name}`} className={cx('flex items-center gap-3 rounded-2xl px-3 py-2', r.you ? 'bg-sky-500/20 ring-1 ring-sky-300/50' : 'bg-white/5')}>
              <span className={cx('grid h-8 w-8 shrink-0 place-items-center rounded-xl text-sm font-black', r.rank === 1 ? 'bg-amber-300 text-amber-950' : r.rank === 2 ? 'bg-slate-200 text-slate-800' : r.rank === 3 ? 'bg-orange-300 text-orange-950' : 'bg-white/10')}>{r.rank}</span>
              <span className="min-w-0 flex-1 truncate font-semibold">
                {r.name}
                {r.you ? ' (you)' : ''}
              </span>
              <span className="text-xs text-white/45">{r.flights} flights</span>
              <span className="w-20 text-right font-mono font-bold tabular-nums">{r.score.toLocaleString()}</span>
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}

const STEPS = [
  { icon: '🛬', title: 'Tap a plane in the sky', text: 'Planes circle while they wait. Tap one, then press LAND.' },
  { icon: '🅿️', title: 'Pick a gate', text: 'After landing, press PARK and tap a green gate. The plane follows the yellow lines.' },
  { icon: '🧳', title: 'Wait for passengers', text: 'Watch the trucks and passengers. When boarding finishes, press PUSH BACK.' },
  { icon: '➡️', title: 'Taxi to the runway', text: 'Press TAXI and choose a runway. The plane drives to the hold line.' },
  { icon: '🛫', title: 'Take off!', text: 'Press TAKE OFF and earn coins. Happy passengers = happy airport!' },
];

export function HowToPlay() {
  const overlay = useGame((s) => s.overlay);
  const intro = useGame((s) => s.introOpen);
  const set = useGame((s) => s.set);
  const setDone = useProfile((s) => s.setTutorialDone);
  const open = overlay === 'help' || intro;
  const [i, setI] = useState(0);
  useEffect(() => {
    if (open) setI(0);
  }, [open]);
  const close = () => {
    set({ overlay: overlay === 'help' ? (game.kind === 'play' ? 'pause' : null) : overlay, introOpen: false });
  };
  const s = STEPS[i]!;
  return (
    <Modal open={open} onClose={close} title="How to play" subtitle="Five taps from sky to sky" icon="❓" testId="how-to-play">
      <div className="flex flex-col items-center text-center">
        <motion.div key={i} initial={{ scale: 0.6, rotate: -10, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} className="grid h-28 w-28 place-items-center rounded-[2rem] bg-gradient-to-br from-sky-400/30 to-violet-500/30 text-6xl">
          {s.icon}
        </motion.div>
        <motion.h3 key={`t${i}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-4 text-2xl font-extrabold">
          {i + 1}. {s.title}
        </motion.h3>
        <p className="mt-2 max-w-sm text-base text-white/70">{s.text}</p>
        <div className="mt-5 flex gap-1.5" aria-hidden>
          {STEPS.map((_, k) => (
            <span key={k} className={cx('h-2 rounded-full transition-all', k === i ? 'w-6 bg-sky-400' : 'w-2 bg-white/25')} />
          ))}
        </div>
        <div className="mt-5 grid w-full grid-cols-2 gap-2">
          <Button onClick={() => (i === 0 ? close() : setI(i - 1))}>{i === 0 ? 'Skip' : '← Back'}</Button>
          <Button
            variant="primary"
            testId="tutorial-next"
            onClick={() => {
              if (i < STEPS.length - 1) setI(i + 1);
              else {
                setDone(true);
                close();
              }
            }}
          >
            {i < STEPS.length - 1 ? 'Next →' : "Let's fly! ✈️"}
          </Button>
        </div>
        <p className="mt-4 text-xs text-white/45">Tip: pinch or scroll to zoom, drag to look around. Yellow rings mean a plane needs you!</p>
      </div>
    </Modal>
  );
}
