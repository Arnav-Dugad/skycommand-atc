import { motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { audio } from '../../audio/audio';
import { ACHIEVEMENTS } from '../../game/achievements';
import { deleteReplay, game, loadReplays, modeName, type StoredReplay } from '../../game/controller';
import { DECOR_ITEMS, levelFor, owns, shopCatalog, type ShopItem, type ShopKind } from '../../game/progression';
import { THEMES } from '../../render/themes';
import { AIRCRAFT, LIVERIES, SIZE_LABEL } from '../../sim/aircraft';
import { useGame } from '../../store/game';
import { NICK_PARTS, useProfile } from '../../store/profile';
import { Button, Coin, cx, Meter, Modal, Pill, SectionTitle, Slider, Toggle } from '../common';
import { useAircraftImage } from '../hud/AircraftPanel';

const KIND_LABEL: Record<ShopKind, string> = {
  runway: 'Runways',
  gate: 'Gates & stands',
  special: 'Special aircraft',
  weather: 'Weather',
  theme: 'Airport locations',
  decor: 'Decorations',
};

export function Hangar() {
  const overlay = useGame((s) => s.overlay);
  const set = useGame((s) => s.set);
  const prof = useProfile();
  const level = levelFor(prof.xp);
  const [tab, setTab] = useState<ShopKind>('gate');
  const items = useMemo(() => shopCatalog(), []);
  const visible = items.filter((i) => i.kind === tab || (tab === 'gate' && i.kind === 'runway'));
  const buy = (it: ShopItem) => {
    const r = prof.buy(it.id);
    if (r.ok) {
      audio.play('coin');
      useGame.getState().toast({ kind: 'success', title: `Unlocked ${it.name}!`, icon: it.icon });
      if (useProfile.getState().stats.purchases >= 5) game.checkAchievement('collector');
      if (game.kind === 'play') useGame.getState().toast({ kind: 'info', title: 'Takes effect next session', text: 'Start a new game to use new gates and runways.', icon: 'ℹ️' });
    } else {
      audio.play('error');
      useGame.getState().toast({ kind: 'warning', title: r.reason ?? 'Cannot buy', icon: '🔒' });
    }
  };
  return (
    <Modal open={overlay === 'hangar'} onClose={() => set({ overlay: game.kind === 'play' ? 'pause' : null })} title="Hangar" subtitle={`Level ${level} · ${prof.coins.toLocaleString()} coins — everything is earned by playing, never bought.`} wide icon="🛠️" testId="hangar">
      <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1 scroll-thin">
        {(['gate', 'special', 'weather', 'theme', 'decor'] as ShopKind[]).map((k) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={cx('h-9 shrink-0 rounded-xl px-3 text-sm font-bold', tab === k ? 'bg-white/16 text-white' : 'bg-white/5 text-white/60 hover:text-white')}>
            {k === 'gate' ? 'Gates & runways' : KIND_LABEL[k]}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((it) => {
          const have = owns(prof.unlocks, it);
          const locked = level < it.level;
          return (
            <div key={it.id} className={cx('flex flex-col rounded-2xl p-3 ring-1', have ? 'bg-emerald-500/8 ring-emerald-400/25' : 'bg-white/5 ring-white/8')} data-testid={`shop-${it.id}`}>
              <div className="flex items-start gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/8 text-2xl">{it.icon}</div>
                <div className="min-w-0 flex-1">
                  <div className="font-bold leading-tight">{it.name}</div>
                  <div className="mt-0.5 text-[0.78rem] leading-snug text-white/55">{it.desc}</div>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between gap-2">
                {have ? (
                  <Pill color="bg-emerald-400/20 text-emerald-200">✓ Owned</Pill>
                ) : locked ? (
                  <Pill color="bg-white/8 text-white/55">🔒 Level {it.level}</Pill>
                ) : (
                  <span className="flex items-center gap-1 text-sm font-bold">
                    <Coin /> {it.cost.toLocaleString()}
                  </span>
                )}
                {!have && (
                  <Button size="sm" variant={locked || prof.coins < it.cost ? 'secondary' : 'primary'} disabled={locked || prof.coins < it.cost} onClick={() => buy(it)} testId={`buy-${it.id}`} sound={null}>
                    Unlock
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

export function Missions() {
  const overlay = useGame((s) => s.overlay);
  const set = useGame((s) => s.set);
  const prof = useProfile();
  const [tab, setTab] = useState<'missions' | 'achievements'>('missions');
  const got = Object.keys(prof.achievements).length;
  return (
    <Modal open={overlay === 'missions'} onClose={() => set({ overlay: game.kind === 'play' ? 'pause' : null })} title="Missions & Achievements" subtitle={`${prof.missionsDone} missions completed · ${got}/${ACHIEVEMENTS.length} achievements`} wide icon="🎯" testId="missions">
      <div className="mb-3 grid grid-cols-2 gap-1 rounded-2xl bg-white/5 p-1 sm:w-80">
        {(['missions', 'achievements'] as const).map((k) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={cx('h-9 rounded-xl text-sm font-bold capitalize', tab === k ? 'bg-white/14' : 'text-white/55')}>
            {k}
          </button>
        ))}
      </div>
      {tab === 'missions' ? (
        <div className="grid gap-2.5 sm:grid-cols-3">
          {prof.missions.map((m) => {
            const done = m.progress >= m.target;
            return (
              <motion.div layout key={m.id} className={cx('flex flex-col rounded-2xl p-3.5 ring-1', done ? 'bg-emerald-500/10 ring-emerald-300/40' : 'bg-white/5 ring-white/8')}>
                <Pill color="w-max bg-white/10 text-white/60">Tier {m.tier}</Pill>
                <div className="mt-2 font-bold">{m.title}</div>
                <Meter value={m.progress / m.target} color={done ? '#38d9a9' : '#4dabf7'} className="mt-2.5" label={m.title} />
                <div className="mt-1 text-right text-xs tabular-nums text-white/55">
                  {Math.min(m.progress, m.target)}/{m.target}
                </div>
                <div className="mt-2 flex items-center gap-2 text-sm text-white/70">
                  <Coin /> {m.rewardCoins} · ⭐ {m.rewardStars} · {m.rewardXp} XP
                </div>
                <Button
                  className="mt-3"
                  size="sm"
                  variant={done ? 'success' : 'secondary'}
                  disabled={!done}
                  sound={null}
                  testId={`claim-${m.kind}`}
                  onClick={() => {
                    const r = useProfile.getState().claimMission(m.id);
                    if (r.ok) {
                      audio.play('coin');
                      useGame.getState().toast({ kind: 'reward', title: 'Reward claimed!', text: `+${r.coins} coins`, icon: '🎁' });
                    }
                  }}
                >
                  {done ? 'Claim reward' : 'In progress'}
                </Button>
              </motion.div>
            );
          })}
          <p className="text-xs text-white/45 sm:col-span-3">Missions track progress in Kids, Casual and Pro modes. New, harder missions appear as you level up.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {ACHIEVEMENTS.map((a) => {
            const when = prof.achievements[a.id];
            return (
              <div key={a.id} className={cx('flex items-center gap-3 rounded-2xl p-3 ring-1', when ? 'bg-violet-500/12 ring-violet-300/30' : 'bg-white/4 ring-white/6')}>
                <div className={cx('grid h-11 w-11 shrink-0 place-items-center rounded-xl text-2xl', when ? 'bg-violet-400/25' : 'bg-white/6 grayscale')}>{a.icon}</div>
                <div className="min-w-0">
                  <div className={cx('font-bold', !when && 'text-white/60')}>{a.name}</div>
                  <div className="text-[0.76rem] leading-snug text-white/50">{a.desc}</div>
                  <div className="mt-0.5 text-[0.7rem] font-semibold text-white/40">{when ? `Unlocked ${new Date(when).toLocaleDateString()}` : `Reward: ${a.coins} coins`}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

function AircraftCard({ id }: { id: string }) {
  const t = AIRCRAFT.find((a) => a.id === id)!;
  const [liv, setLiv] = useState(0);
  const livery = t.special ? 'heritage' : LIVERIES[liv % LIVERIES.length]!.id;
  const img = useAircraftImage(t.id, livery, 260);
  const level = levelFor(useProfile((s) => s.xp));
  const locked = !t.special && t.unlockLevel > level;
  return (
    <div className="flex flex-col overflow-hidden rounded-3xl bg-white/5 ring-1 ring-white/8" data-testid={`ency-${t.id}`}>
      <button type="button" onClick={() => setLiv((l) => l + 1)} className="relative grid h-44 place-items-center bg-[radial-gradient(circle_at_50%_40%,rgb(77_171_247/0.25),transparent_70%)]" title="Tap to change livery">
        {img ? (
          <img
            src={img}
            alt={`${t.name} top-down illustration`}
            style={{ width: `${Math.round(48 + (112 * Math.max(t.length, t.span)) / 160)}px`, height: `${Math.round(48 + (112 * Math.max(t.length, t.span)) / 160)}px` }}
            className={cx('object-contain drop-shadow-2xl', locked && 'opacity-50 grayscale')}
          />
        ) : (
          <span className="text-4xl">✈️</span>
        )}
        <span className="absolute bottom-2 right-3 text-[0.65rem] font-semibold text-white/40">tap: new livery</span>
      </button>
      <div className="p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-xl font-extrabold">{t.name}</h3>
          <Pill color={t.special ? 'bg-amber-300/20 text-amber-200' : 'bg-sky-400/15 text-sky-200'}>{t.special ? 'Special' : SIZE_LABEL[t.cat]}</Pill>
        </div>
        <p className="text-xs text-white/50">Inspired by the {t.inspiredBy}</p>
        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
          <dt className="text-white/45">Length</dt>
          <dd className="font-semibold">{t.facts.realLength}</dd>
          <dt className="text-white/45">Wingspan</dt>
          <dd className="font-semibold">{t.facts.realSpan}</dd>
          <dt className="text-white/45">Passengers</dt>
          <dd className="font-semibold">
            {t.paxMin}–{t.paxMax}
          </dd>
          <dt className="text-white/45">Range</dt>
          <dd className="font-semibold">{t.facts.range}</dd>
          <dt className="text-white/45">Engines</dt>
          <dd className="font-semibold">
            {t.engineCount} × {t.engines === 'twinProp' ? 'propeller' : 'jet'}
          </dd>
          <dt className="text-white/45">First flight</dt>
          <dd className="font-semibold">{t.facts.firstFlight}</dd>
        </dl>
        <p className="mt-3 rounded-2xl bg-white/5 p-3 text-sm leading-relaxed text-white/75">💡 {t.facts.fun}</p>
        {locked && <p className="mt-2 text-xs font-semibold text-amber-200">Arrives at your airport from level {t.unlockLevel}.</p>}
        {t.special && <p className="mt-2 text-xs font-semibold text-amber-200">Unlock this rare visitor in the Hangar.</p>}
      </div>
    </div>
  );
}

export function Encyclopedia() {
  const overlay = useGame((s) => s.overlay);
  const set = useGame((s) => s.set);
  return (
    <Modal open={overlay === 'encyclopedia'} onClose={() => set({ overlay: game.kind === 'play' ? 'pause' : null })} title="Aircraft Encyclopedia" subtitle="Real aircraft that inspired SKYCOMMAND's fleet, shown to relative scale. Liveries are fictional." wide icon="📖" testId="encyclopedia">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {AIRCRAFT.map((a) => (
          <AircraftCard key={a.id} id={a.id} />
        ))}
      </div>
    </Modal>
  );
}

export function Stats() {
  const overlay = useGame((s) => s.overlay);
  const set = useGame((s) => s.set);
  const st = useProfile((s) => s.stats);
  const w = game.kind === 'play' ? game.world : null;
  const rows: [string, string | number][] = [
    ['Departures', st.departures],
    ['Arrivals', st.arrivals],
    ['On-time departures', `${st.departures ? Math.round((st.onTime / st.departures) * 100) : 0}%`],
    ['Wide-body flights', st.heavy],
    ['Go-arounds', st.goArounds],
    ['Diversions', st.diversions],
    ['Emergencies handled', st.emergencies],
    ['Days completed', st.daysCompleted],
    ['Best day', '⭐'.repeat(st.bestDayStars) || '—'],
    ['Busiest moment', `${st.maxSimultaneous} aircraft`],
    ['Coins earned', st.coinsEarned.toLocaleString()],
    ['Best session score', st.bestSessionPoints.toLocaleString()],
    ['Sessions played', st.sessions],
    ['Time in the tower', `${Math.floor(st.playSeconds / 3600)}h ${Math.floor((st.playSeconds % 3600) / 60)}m`],
  ];
  return (
    <Modal open={overlay === 'stats'} onClose={() => set({ overlay: game.kind === 'play' ? 'pause' : null })} title="Airport Statistics" wide icon="📊" testId="stats">
      {w && (
        <>
          <SectionTitle>This session</SectionTitle>
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ['Score', w.score.points.toLocaleString()],
              ['Landed', w.score.arrivals],
              ['Departed', w.score.departures],
              ['Happiness', `${Math.round(w.score.happiness)}%`],
              ['On time', w.score.onTime],
              ['Late', w.score.late],
              ['Avg delay', w.score.late ? `${Math.round(w.score.totalDelay / w.score.late)}s` : '—'],
              ['Go-arounds', w.score.goArounds],
            ].map(([k, v]) => (
              <div key={String(k)} className="rounded-2xl bg-white/5 p-3">
                <div className="text-[0.66rem] font-bold uppercase tracking-wider text-white/45">{k}</div>
                <div className="mt-0.5 text-xl font-extrabold tabular-nums">{v}</div>
              </div>
            ))}
          </div>
        </>
      )}
      <SectionTitle>All time</SectionTitle>
      <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between border-b border-white/6 py-2 text-sm">
            <span className="text-white/60">{k}</span>
            <span className="font-bold tabular-nums">{v}</span>
          </div>
        ))}
      </div>
    </Modal>
  );
}

export function Replays() {
  const overlay = useGame((s) => s.overlay);
  const set = useGame((s) => s.set);
  const [list, setList] = useState<StoredReplay[]>(() => loadReplays());
  const open = overlay === 'replays';
  useMemo(() => {
    if (open) setList(loadReplays());
  }, [open]);
  return (
    <Modal open={open} onClose={() => set({ overlay: game.kind === 'play' ? 'pause' : null })} title="Replays" subtitle="Every session is recorded as a tiny list of instructions and re-simulated exactly." icon="🎬" testId="replays">
      {list.length === 0 && <p className="py-6 text-center text-sm text-white/55">No replays yet — finish a day or a challenge and it will appear here.</p>}
      <div className="space-y-2">
        {list.map((r) => (
          <div key={r.id} className="flex items-center gap-3 rounded-2xl bg-white/5 p-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/8 text-xl">🎞️</div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold">{r.label}</div>
              <div className="text-xs text-white/50">
                {modeName(r.mode)} · {r.flights} flights · {r.points.toLocaleString()} pts · {Math.round(r.endTick / 20 / 60)} min
              </div>
            </div>
            <Button size="sm" variant="primary" onClick={() => game.playReplay(r)} testId="replay-play">
              Watch
            </Button>
            <button
              type="button"
              aria-label="Delete replay"
              className="grid h-9 w-9 place-items-center rounded-xl text-white/45 hover:bg-white/10 hover:text-white"
              onClick={() => {
                deleteReplay(r.id);
                setList(loadReplays());
              }}
            >
              🗑️
            </button>
          </div>
        ))}
      </div>
    </Modal>
  );
}

export function Settings() {
  const overlay = useGame((s) => s.overlay);
  const set = useGame((s) => s.set);
  const prof = useProfile();
  const s = prof.settings;
  const setS = prof.setSetting;
  const [confirmReset, setConfirmReset] = useState(false);
  return (
    <Modal open={overlay === 'settings'} onClose={() => set({ overlay: game.kind === 'play' ? 'pause' : null })} title="Settings" icon="⚙️" testId="settings">
      <SectionTitle>Sound</SectionTitle>
      <Slider label="Master volume" value={s.master} onChange={(v) => setS('master', v)} />
      <Slider label="Sound effects" value={s.sfx} onChange={(v) => setS('sfx', v)} />
      <Slider label="Music volume" value={s.music} onChange={(v) => setS('music', v)} />
      <Toggle label="Background music" desc="Calm generative soundtrack" checked={s.musicOn} onChange={(v) => setS('musicOn', v)} testId="toggle-music" />

      <SectionTitle>Gameplay</SectionTitle>
      <Toggle label="Helpful hints" desc="Show what to do next (always on in Kids mode)" checked={s.hints} onChange={(v) => setS('hints', v)} />
      <Toggle label="Warn before risky take-offs" desc="Pro mode runway conflict check" checked={s.confirmPro} onChange={(v) => setS('confirmPro', v)} />
      <div className="py-2">
        <div className="mb-1.5 text-sm font-semibold">Aircraft labels</div>
        <div className="grid grid-cols-3 gap-1 rounded-2xl bg-white/5 p-1">
          {(['all', 'minimal', 'none'] as const).map((k) => (
            <button key={k} type="button" onClick={() => setS('labels', k)} className={cx('h-9 rounded-xl text-sm font-bold capitalize', s.labels === k ? 'bg-white/16' : 'text-white/55')}>
              {k === 'minimal' ? 'Important' : k}
            </button>
          ))}
        </div>
      </div>

      <SectionTitle>Accessibility</SectionTitle>
      <Slider label="Interface size" value={s.uiScale} min={0.85} max={1.3} step={0.05} onChange={(v) => setS('uiScale', v)} format={(v) => `${Math.round(v * 100)}%`} />
      <Toggle label="Reduce motion" desc="Calmer animations and camera" checked={s.reduceMotion} onChange={(v) => setS('reduceMotion', v)} testId="toggle-motion" />
      <Toggle label="High contrast" desc="Stronger outlines and solid panels" checked={s.highContrast} onChange={(v) => setS('highContrast', v)} />
      <Toggle label="Vibration" desc="Haptic feedback on phones" checked={s.haptics} onChange={(v) => setS('haptics', v)} />

      <SectionTitle>Graphics</SectionTitle>
      <div className="grid grid-cols-4 gap-1 rounded-2xl bg-white/5 p-1">
        {(['auto', 'high', 'medium', 'low'] as const).map((k) => (
          <button key={k} type="button" onClick={() => setS('quality', k)} className={cx('h-9 rounded-xl text-sm font-bold capitalize', s.quality === k ? 'bg-white/16' : 'text-white/55')}>
            {k}
          </button>
        ))}
      </div>
      <p className="mt-1 text-xs text-white/45">Quality changes apply after reloading. Auto lowers quality if the game runs slowly.</p>
      <Toggle label="Ground vehicles" desc="Baggage carts, fuel trucks and buses" checked={s.vehicles} onChange={(v) => setS('vehicles', v)} />

      <SectionTitle>Profile</SectionTitle>
      <div className="py-2">
        <div className="mb-1.5 text-sm font-semibold">Controller name (shown on leaderboards)</div>
        <div className="flex gap-2">
          <select aria-label="Name adjective" value={prof.nickname.split(' ')[0]} onChange={(e) => prof.setNickname(`${e.target.value} ${prof.nickname.split(' ').slice(1).join(' ')}`)} className="h-10 min-w-0 flex-1 rounded-xl bg-white/8 px-2 text-sm font-semibold">
            {NICK_PARTS.ADJ.map((a) => (
              <option key={a} value={a} className="bg-ink-900">
                {a}
              </option>
            ))}
          </select>
          <select aria-label="Name noun" value={prof.nickname.split(' ')[1]} onChange={(e) => {
            const parts = prof.nickname.split(' ');
            prof.setNickname(`${parts[0]} ${e.target.value} ${parts[2] ?? '10'}`);
          }} className="h-10 min-w-0 flex-1 rounded-xl bg-white/8 px-2 text-sm font-semibold">
            {NICK_PARTS.NOUN.map((a) => (
              <option key={a} value={a} className="bg-ink-900">
                {a}
              </option>
            ))}
          </select>
        </div>
        <p className="mt-1 text-xs text-white/45">Names are picked from safe word lists — no typing needed, kid-friendly.</p>
      </div>
      <Button
        variant="secondary"
        className="mt-2 w-full"
        onClick={() => {
          prof.setTutorialDone(false);
          useGame.getState().toast({ kind: 'info', title: 'Tutorial hints re-enabled', icon: '💡' });
        }}
      >
        Replay tutorial hints
      </Button>
      {!confirmReset ? (
        <Button variant="ghost" className="mt-2 w-full text-rose-300" onClick={() => setConfirmReset(true)}>
          Reset all progress…
        </Button>
      ) : (
        <div className="mt-2 rounded-2xl bg-rose-500/12 p-3 text-sm">
          This deletes coins, unlocks, stats and saves on this device.
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button size="sm" onClick={() => setConfirmReset(false)}>
              Keep progress
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                prof.reset();
                game.clearSave();
                setConfirmReset(false);
              }}
            >
              Reset
            </Button>
          </div>
        </div>
      )}
      <p className="mt-4 text-center text-[0.7rem] text-white/35">SKYCOMMAND v1.0 · Keyboard: Tab cycle · L/P/T/B/H/G actions · Space pause · 1-3 speed · U undo</p>
    </Modal>
  );
}

export function Customize() {
  const overlay = useGame((s) => s.overlay);
  const set = useGame((s) => s.set);
  const prof = useProfile();
  const sandbox = game.world?.config.mode === 'sandbox';
  const themes = THEMES.filter((t) => sandbox || prof.unlocks.themes.includes(t.id));
  const decor = DECOR_ITEMS.filter((d) => sandbox || prof.unlocks.decor.includes(d.id));
  return (
    <Modal open={overlay === 'customize'} onClose={() => set({ overlay: game.kind === 'play' ? null : null })} title="Customize airport" subtitle={sandbox ? 'Sandbox: everything is available.' : 'Unlock more locations and decorations in the Hangar.'} icon="🎨" testId="customize">
      <SectionTitle>Location</SectionTitle>
      <div className="grid grid-cols-2 gap-2">
        {themes.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              if (sandbox && !prof.unlocks.themes.includes(t.id)) useProfile.setState({ activeTheme: t.id });
              else prof.setTheme(t.id);
              audio.play('select');
            }}
            className={cx('rounded-2xl p-3 text-left ring-1', prof.activeTheme === t.id ? 'bg-sky-500/20 ring-sky-300/60' : 'bg-white/5 ring-white/8')}
          >
            <div className="mb-2 h-10 rounded-xl" style={{ background: `linear-gradient(135deg, #${t.grass.toString(16).padStart(6, '0')}, #${t.water.toString(16).padStart(6, '0')})` }} />
            <div className="text-sm font-bold leading-tight">{t.name}</div>
          </button>
        ))}
      </div>
      <SectionTitle>Decorations</SectionTitle>
      {decor.length === 0 && <p className="text-sm text-white/50">No decorations yet — find them in the Hangar.</p>}
      <div className="grid grid-cols-2 gap-2">
        {decor.map((d) => {
          const on = prof.activeDecor.includes(d.id);
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => {
                if (sandbox && !prof.unlocks.decor.includes(d.id)) useProfile.setState({ activeDecor: on ? prof.activeDecor.filter((x) => x !== d.id) : [...prof.activeDecor, d.id] });
                else prof.toggleDecor(d.id);
                audio.play('tap');
              }}
              className={cx('flex items-center gap-2 rounded-2xl p-3 text-left ring-1', on ? 'bg-emerald-500/15 ring-emerald-300/50' : 'bg-white/5 ring-white/8')}
            >
              <span className="text-2xl">{d.icon}</span>
              <span className="text-sm font-bold">{d.name}</span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
