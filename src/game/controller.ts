/**
 * Game controller: owns the deterministic world, runs the fixed-timestep loop,
 * records commands (for replays + server verification) and turns simulation
 * events into UI feedback, rewards, missions and achievements.
 */

import { audio, haptic } from '../audio/audio';
import type { GameRenderer } from '../render/renderer';
import { getType, SIZE_ORDER } from '../sim/aircraft';
import { AIRPORT } from '../sim/airport';
import { autopilotCommands, suggest } from '../sim/autopilot';
import { issue as issueCmd, validate } from '../sim/commands';
import { drainEvents, step } from '../sim/engine';
import { replayStep, runReplay, startReplay, type Replay, type ReplayRunner } from '../sim/replay';
import { DT, TICK_HZ, type Aircraft, type Command, type CommandResult, type GameMode, type LoggedCommand, type ModeRules, type SimEvent, type World, type WorldConfig } from '../sim/types';
import { clockMinutes, createWorld, dailyConfig, nightAmount, SIM_VERSION } from '../sim/world';
import { useGame } from '../store/game';
import { useProfile } from '../store/profile';
import { ACH_BY_ID } from './achievements';
import { trackMissions } from './missions';
import { careerConfig, levelFor, menuConfig } from './progression';

const SAVE_KEY = 'skycommand.save.v1';
const REPLAYS_KEY = 'skycommand.replays.v1';

export interface SaveGame {
  version: number;
  savedAt: number;
  world: World;
  config: WorldConfig;
  rules?: Partial<ModeRules>;
  commands: LoggedCommand[];
  dateKey?: string;
}

export interface StoredReplay extends Replay {
  id: string;
  points: number;
  flights: number;
  mode: GameMode;
}

type Prev = Map<string, { x: number; y: number; h: number; alt: number }>;

function fmtTime(world: World) {
  const m = Math.floor(clockMinutes(world));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function needsAttention(world: World, ac: Aircraft): string | null {
  switch (ac.phase) {
    case 'holding':
    case 'inbound':
      return 'Needs landing clearance';
    case 'vacated':
      return ac.gate ? null : 'Needs a gate';
    case 'parked':
      return ac.turn?.stage === 'ready' && !ac.pushbackRequested ? 'Ready for pushback' : null;
    case 'readyTaxi':
      return ac.pendingTaxiRunway ? null : 'Needs taxi to a runway';
    case 'holdShort':
      return ac.takeoffCleared ? null : 'Ready for take-off';
    case 'goAround':
      return ac.phaseTime > 8 ? 'Needs landing clearance' : null;
    default:
      return null;
  }
  void world;
}

class GameController {
  world: World | null = null;
  config: WorldConfig | null = null;
  rules: Partial<ModeRules> | undefined;
  commands: LoggedCommand[] = [];
  prev: Prev = new Map();
  acc = 0;
  alpha = 0;
  kind: 'menu' | 'play' | 'replay' = 'menu';
  replay: { data: Replay; runner: ReplayRunner } | null = null;
  renderer: GameRenderer | null = null;
  attention = new Set<string>();
  private uiTimer = 0;
  private saveTimer = 0;
  private menuTimer = 0;
  private hintTimer = 0;
  private creditedCoins = 0;
  private creditedXp = 0;
  private sessionStartTick = 0;
  dateKey: string | undefined;
  private finished = false;
  private lastLevel = 1;

  // ------------------------------------------------------------------ lifecycle
  startMenu() {
    this.kind = 'menu';
    this.config = menuConfig(Math.floor(Math.random() * 1e9));
    this.rules = undefined;
    this.world = createWorld(this.config);
    this.commands = [];
    this.prev.clear();
    this.replay = null;
    this.renderer?.resetVehicles();
    // warm up so the menu airport is already busy
    for (let i = 0; i < 20 * 60; i++) {
      if (this.world.tick % 20 === 0) for (const c of autopilotCommands(this.world)) issueCmd(this.world, c);
      step(this.world);
    }
    drainEvents(this.world);
    useGame.getState().set({ mode: 'menu', selected: null, pick: null, undo: [], hint: null, replaying: false, paused: false, speed: 1, daySummary: null, gameOver: null });
    this.renderer?.camera.defaultView();
  }

  startGame(mode: GameMode, opts: { dateKey?: string; seed?: number } = {}) {
    const p = useProfile.getState();
    const level = levelFor(p.xp);
    const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
    if (mode === 'daily') {
      this.dateKey = opts.dateKey ?? new Date().toISOString().slice(0, 10);
      this.config = dailyConfig(this.dateKey);
    } else {
      this.dateKey = undefined;
      this.config = careerConfig(mode, p.unlocks, level, seed);
    }
    this.rules = undefined;
    this.world = createWorld(this.config, this.rules);
    this.begin(mode);
    this.commands = [];
    useProfile.getState().updateStats((s) => (s.sessions += 1));
    this.save();
  }

  private begin(mode: GameMode) {
    this.kind = 'play';
    this.prev.clear();
    this.acc = 0;
    this.replay = null;
    this.finished = false;
    this.creditedCoins = this.world!.score.coins;
    this.creditedXp = this.world!.score.xp;
    this.sessionStartTick = this.world!.tick;
    this.lastLevel = levelFor(useProfile.getState().xp);
    this.renderer?.resetVehicles();
    useGame.getState().set({
      screen: 'game',
      overlay: null,
      mode,
      selected: null,
      pick: null,
      undo: [],
      hint: null,
      radio: [],
      speed: 1,
      paused: false,
      daySummary: null,
      gameOver: null,
      replaying: false,
    });
    this.renderer?.camera.defaultView();
    useGame.getState().pushRadio({ time: fmtTime(this.world!), text: mode === 'kids' ? 'Welcome, Captain! Planes are on their way. 😊' : 'Tower is open. Good luck, controller!', kind: 'system' });
  }

  hasSave(): SaveGame | null {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw) as SaveGame;
      if (s.version !== SIM_VERSION || !s.world || s.world.over) return null;
      return s;
    } catch {
      return null;
    }
  }

  resume(): boolean {
    const s = this.hasSave();
    if (!s) return false;
    this.config = s.config;
    this.rules = s.rules;
    this.world = s.world;
    this.commands = s.commands;
    this.dateKey = s.dateKey;
    this.begin(s.config.mode);
    return true;
  }

  save() {
    if (this.kind !== 'play' || !this.world || !this.config) return;
    try {
      if (this.world.over) {
        localStorage.removeItem(SAVE_KEY);
        return;
      }
      const data: SaveGame = {
        version: SIM_VERSION,
        savedAt: Date.now(),
        world: this.world,
        config: this.config,
        rules: this.rules,
        commands: this.commands,
        dateKey: this.dateKey,
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch {
      /* storage full or unavailable */
    }
  }

  clearSave() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      /* ignore */
    }
  }

  quitToMenu(saveReplay = true) {
    if (this.kind === 'play') {
      this.save();
      if (saveReplay) this.storeReplay();
    }
    this.startMenu();
    useGame.getState().set({ screen: 'menu', overlay: null });
  }

  // ------------------------------------------------------------------ replays
  currentReplay(): Replay | null {
    if (!this.config || !this.world) return null;
    return { version: SIM_VERSION, config: this.config, rules: this.rules, commands: this.commands.slice(), endTick: this.world.tick };
  }

  storeReplay(label?: string) {
    const r = this.currentReplay();
    if (!r || !this.world || r.endTick < 20 * 30) return;
    const list = loadReplays();
    const entry: StoredReplay = {
      ...r,
      id: `${Date.now()}`,
      label: label ?? `${modeName(r.config.mode)} · ${new Date().toLocaleString()}`,
      createdAt: Date.now(),
      points: this.world.score.points,
      flights: this.world.score.arrivals + this.world.score.departures,
      mode: r.config.mode,
    };
    const next = [entry, ...list].slice(0, 6);
    try {
      localStorage.setItem(REPLAYS_KEY, JSON.stringify(next));
    } catch {
      try {
        localStorage.setItem(REPLAYS_KEY, JSON.stringify(next.slice(0, 2)));
      } catch {
        /* ignore */
      }
    }
  }

  playReplay(data: Replay) {
    this.kind = 'replay';
    this.replay = { data, runner: startReplay(data) };
    this.world = this.replay.runner.world;
    this.config = data.config;
    this.prev.clear();
    this.acc = 0;
    this.renderer?.resetVehicles();
    useGame.getState().set({ screen: 'game', overlay: null, mode: data.config.mode, replaying: true, selected: null, pick: null, undo: [], hint: null, speed: 2, paused: false, gameOver: null, daySummary: null, radio: [] });
    this.renderer?.camera.defaultView();
  }

  seekReplay(tick: number) {
    if (!this.replay) return;
    const r = runReplay(this.replay.data, Math.max(0, Math.min(tick, this.replay.data.endTick)));
    this.replay.runner = r;
    this.world = r.world;
    this.prev.clear();
    this.renderer?.resetVehicles();
    useGame.getState().bump();
  }

  // ------------------------------------------------------------------ commands
  issue(cmd: Command, label?: string): CommandResult {
    const w = this.world;
    if (!w || this.kind !== 'play') return { ok: false, reason: 'Not available' };
    const tick = w.tick;
    const res = issueCmd(w, cmd);
    if (res.ok) {
      this.commands.push({ tick, cmd: JSON.parse(JSON.stringify(cmd)) });
      const ui = useGame.getState();
      if (res.cmdId && 'ac' in cmd && cmd.t !== 'cancel') {
        ui.set({ undo: [...ui.undo.slice(-9), { ac: cmd.ac, cmdId: res.cmdId, label: label ?? cmd.t }] });
      }
      this.handleEvents(drainEvents(w));
      useGame.getState().bump();
    }
    return res;
  }

  canIssue(cmd: Command) {
    if (!this.world || this.kind !== 'play') return { ok: false as const, reason: 'Not available' };
    return validate(this.world, cmd);
  }

  undo() {
    const ui = useGame.getState();
    const w = this.world;
    if (!w) return false;
    const stack = [...ui.undo];
    while (stack.length) {
      const e = stack.pop()!;
      const ac = w.aircraft.find((a) => a.id === e.ac);
      const last = ac?.pendingList?.[ac.pendingList.length - 1];
      if (ac && last && last.cmdId === e.cmdId) {
        const r = this.issue({ t: 'cancel', ac: ac.id });
        ui.set({ undo: stack });
        if (r.ok) {
          ui.toast({ kind: 'info', title: 'Undone', text: `${ac.callsign}: ${e.label}`, icon: '↩️' });
          audio.play('close');
        }
        return r.ok;
      }
    }
    ui.set({ undo: [] });
    return false;
  }

  pruneUndo() {
    const ui = useGame.getState();
    const w = this.world;
    if (!w || !ui.undo.length) return;
    const valid = ui.undo.filter((e) => {
      const ac = w.aircraft.find((a) => a.id === e.ac);
      return !!ac?.pendingList?.some((p) => p.cmdId === e.cmdId);
    });
    if (valid.length !== ui.undo.length) ui.set({ undo: valid });
  }

  // ------------------------------------------------------------------ main loop
  frame(dtReal: number) {
    const w = this.world;
    if (!w) return;
    const ui = useGame.getState();
    const blocked = ui.paused || !!ui.daySummary || !!ui.gameOver || (ui.overlay !== null && ui.overlay !== 'customize' && this.kind !== 'menu') || ui.introOpen;
    const speed = this.kind === 'menu' ? 1 : ui.speed;
    if (!blocked) {
      this.acc += Math.min(dtReal, 0.25) * speed;
      let steps = 0;
      while (this.acc >= DT && steps < 16) {
        this.acc -= DT;
        steps++;
        this.capturePrev(w);
        if (this.kind === 'menu') {
          if (w.tick % 20 === 0) for (const c of autopilotCommands(w)) issueCmd(w, c);
          step(w);
          drainEvents(w);
        } else if (this.kind === 'replay' && this.replay) {
          if (w.tick >= this.replay.data.endTick || w.over) {
            ui.set({ paused: true });
            break;
          }
          replayStep(this.replay.runner, this.replay.data);
        } else {
          step(w);
          this.handleEvents(drainEvents(w));
        }
      }
      if (steps === 16) this.acc = 0;
    }
    this.alpha = blocked ? 1 : Math.max(0, Math.min(1, this.acc / DT));

    if (this.kind === 'play') {
      this.creditProgress();
      if (!blocked) useProfile.getState().updateStats((s) => (s.playSeconds += dtReal));
      this.saveTimer += dtReal;
      if (this.saveTimer > 15) {
        this.saveTimer = 0;
        this.save();
      }
    }

    this.uiTimer += dtReal;
    if (this.uiTimer > 0.12) {
      this.uiTimer = 0;
      this.attention.clear();
      if (this.kind === 'play') {
        for (const ac of w.aircraft) if (needsAttention(w, ac)) this.attention.add(ac.id);
        this.pruneUndo();
      }
      ui.bump();
    }
    this.hintTimer += dtReal;
    if (this.hintTimer > 0.6 && this.kind === 'play') {
      this.hintTimer = 0;
      const p = useProfile.getState();
      const wantHints = p.settings.hints && (ui.mode === 'kids' || !p.tutorialDone);
      if (wantHints) {
        const s = suggest(w);
        const cur = ui.hint;
        if (!s) {
          if (cur) ui.set({ hint: null });
        } else if (!cur || cur.ac !== s.ac.id || cur.text !== s.text) ui.set({ hint: { text: s.text, ac: s.ac.id } });
      } else if (ui.hint) ui.set({ hint: null });
    }
    this.menuTimer += dtReal;
  }

  private capturePrev(w: World) {
    const m = this.prev;
    const seen = new Set<string>();
    for (const a of w.aircraft) {
      seen.add(a.id);
      const e = m.get(a.id);
      if (e) {
        e.x = a.x;
        e.y = a.y;
        e.h = a.h;
        e.alt = a.alt;
      } else m.set(a.id, { x: a.x, y: a.y, h: a.h, alt: a.alt });
    }
    if (m.size > seen.size) for (const k of [...m.keys()]) if (!seen.has(k)) m.delete(k);
  }

  private creditProgress() {
    const w = this.world!;
    const mode = w.config.mode;
    if (mode === 'sandbox' || mode === 'daily') {
      this.creditedCoins = w.score.coins;
      this.creditedXp = w.score.xp;
      return;
    }
    const dc = w.score.coins - this.creditedCoins;
    const dx = w.score.xp - this.creditedXp;
    if (dc > 0) useProfile.getState().addCoins(dc);
    if (dx > 0) useProfile.getState().addXp(dx);
    this.creditedCoins = w.score.coins;
    this.creditedXp = w.score.xp;
    const lvl = levelFor(useProfile.getState().xp);
    if (lvl > this.lastLevel) {
      this.lastLevel = lvl;
      useGame.getState().toast({ kind: 'achievement', title: `Level ${lvl}!`, text: 'New upgrades are available in the Hangar.', icon: '🎉', ttl: 4500 });
      audio.play('achievement');
    }
  }

  // ------------------------------------------------------------------ events
  private achieve(id: string) {
    const prof = useProfile.getState();
    if (prof.achievements[id]) return;
    if (this.world?.config.mode === 'sandbox' && id !== 'sandbox_architect') return;
    if (prof.unlockAchievement(id)) {
      const a = ACH_BY_ID[id];
      if (a) useGame.getState().toast({ kind: 'achievement', title: a.name, text: `${a.desc} +${a.coins} coins`, icon: a.icon, ttl: 4500 });
      audio.play('achievement');
    }
  }

  checkAchievement(id: string) {
    this.achieve(id);
  }

  handleEvents(events: SimEvent[]) {
    if (!events.length || !this.world) return;
    const w = this.world;
    const ui = useGame.getState();
    const prof = useProfile.getState();
    const time = fmtTime(w);
    const career = w.config.mode !== 'sandbox' && w.config.mode !== 'daily';
    const kids = w.config.mode === 'kids';
    for (const e of events) {
      switch (e.t) {
        case 'requestLand': {
          const ac = w.aircraft.find((a) => a.id === e.ac);
          const t = ac ? getType(ac.typeId) : null;
          ui.pushRadio({ time, callsign: e.callsign, text: kids ? `Hello tower! May I land? (${t?.name ?? ''})` : `Inbound ${t?.name ?? ''}, requesting landing.`, kind: 'pilot' });
          audio.play('radio');
          break;
        }
        case 'cleared':
          ui.pushRadio({ time, callsign: e.callsign, text: `Cleared ${e.what}.`, kind: 'tower' });
          break;
        case 'touchdown':
          ui.pushRadio({ time, callsign: e.callsign, text: kids ? 'We landed! Thank you! 🎉' : `Touchdown runway ${AIRPORT.runways[e.runway].name}.`, kind: 'pilot' });
          audio.play('touchdown');
          if (career) {
            prof.updateStats((s) => (s.arrivals += 1));
            this.achieve('first_landing');
            if (w.weather === 'rain' || w.weather === 'storm') this.achieve('rain_maker');
            if (w.weather === 'storm') this.achieve('storm_chaser');
          }
          break;
        case 'vacated':
          break;
        case 'parked':
          ui.pushRadio({ time, callsign: e.callsign, text: `On stand ${AIRPORT.gateById[e.gate]?.label ?? e.gate}. Passengers disembarking.`, kind: 'pilot' });
          break;
        case 'readyPushback':
          ui.pushRadio({ time, callsign: e.callsign, text: kids ? 'Everyone is on board! Ready to push back! 🧳' : 'Boarding complete, ready for pushback.', kind: 'pilot' });
          audio.play('radio');
          break;
        case 'readyTaxi':
          ui.pushRadio({ time, callsign: e.callsign, text: 'Pushback complete, ready to taxi.', kind: 'pilot' });
          break;
        case 'holdingShort':
          ui.pushRadio({ time, callsign: e.callsign, text: `Holding short runway ${AIRPORT.runways[e.runway].name}, ready for departure.`, kind: 'pilot' });
          audio.play('radio');
          break;
        case 'takeoffRoll':
          audio.play('takeoff');
          break;
        case 'departed': {
          const coins = e.coins;
          ui.pushRadio({ time, callsign: e.callsign, text: e.onTime ? 'Airborne on time — thanks, tower! 👋' : 'Airborne. Good day!', kind: 'pilot' });
          ui.toast({ kind: 'reward', title: `${e.callsign} departed${e.onTime ? ' on time' : ''}`, text: `+${coins} coins`, icon: '🛫' });
          audio.play('coin');
          if (career) {
            prof.updateStats((s) => {
              s.departures += 1;
              if (e.onTime) s.onTime += 1;
              if (SIZE_ORDER[getType(e.typeId).cat] >= 2) s.heavy += 1;
            });
            const st = useProfile.getState().stats;
            if (st.departures >= 3 && !useProfile.getState().tutorialDone) useProfile.getState().setTutorialDone(true);
            this.achieve('first_departure');
            if (st.departures >= 10) this.achieve('ten_flights');
            if (st.departures >= 50) this.achieve('fifty_flights');
            if (st.departures >= 100) this.achieve('century');
            if (SIZE_ORDER[getType(e.typeId).cat] >= 2) this.achieve('heavy_metal');
            if (e.typeId === 'a380') this.achieve('superjumbo');
            if (getType(e.typeId).special) this.achieve('special_guest');
            if (nightAmount(clockMinutes(w)) > 0.5) this.achieve('night_owl');
          }
          break;
        }
        case 'goAround':
          ui.pushRadio({ time, callsign: e.callsign, text: `Going around — ${e.reason.toLowerCase()}.`, kind: 'alert' });
          ui.toast({ kind: 'warning', title: `${e.callsign} go-around`, text: e.reason, icon: '🔄' });
          audio.play('warning');
          if (career) prof.updateStats((s) => (s.goArounds += 1));
          break;
        case 'diverted':
          ui.pushRadio({ time, callsign: e.callsign, text: 'Diverting to another airport.', kind: 'alert' });
          ui.toast({ kind: 'error', title: `${e.callsign} diverted`, text: 'Passengers are unhappy', icon: '↗️' });
          audio.play('error');
          if (career) prof.updateStats((s) => (s.diversions += 1));
          break;
        case 'emergency':
          ui.pushRadio({ time, callsign: e.callsign, text: `MAYDAY — ${e.kind} emergency, request priority landing!`, kind: 'alert' });
          ui.toast({ kind: 'error', title: `Emergency: ${e.callsign}`, text: 'Give it priority to land!', icon: '🚨', ttl: 5000 });
          audio.play('warning');
          haptic(40);
          break;
        case 'lowFuel':
          ui.pushRadio({ time, callsign: e.callsign, text: 'Minimum fuel — need to land soon!', kind: 'alert' });
          ui.toast({ kind: 'warning', title: `${e.callsign} low on fuel`, icon: '⛽' });
          audio.play('warning');
          break;
        case 'weather': {
          const names = { clear: 'Clear skies', cloudy: 'Clouds rolling in', rain: 'Rain showers', storm: 'Thunderstorm!', fog: 'Fog bank' } as const;
          ui.pushRadio({ time, text: `Weather update: ${names[e.weather]}.`, kind: 'system' });
          ui.toast({ kind: 'info', title: names[e.weather], icon: e.weather === 'clear' ? '☀️' : e.weather === 'cloudy' ? '⛅' : e.weather === 'rain' ? '🌧️' : e.weather === 'storm' ? '⛈️' : '🌫️' });
          break;
        }
        case 'reward':
          if (e.reason.startsWith('Emergency') && career) {
            prof.updateStats((s) => (s.emergencies += 1));
            this.achieve('emergency_hero');
          }
          break;
        case 'dayEnd': {
          audio.play('dayEnd');
          if (career) {
            useProfile.getState().addStars(e.stars);
            prof.updateStats((s) => {
              s.daysCompleted += 1;
              s.bestDayStars = Math.max(s.bestDayStars, e.stars);
            });
            if (e.stars >= 3) this.achieve('perfect_day');
            if (w.config.mode === 'kids') this.achieve('zen_master');
            if (w.config.mode === 'pro' && e.stars >= 2) this.achieve('pro_controller');
          }
          ui.set({ daySummary: { day: e.day, stars: e.stars, flights: e.flights, happiness: e.happiness, coins: w.score.coins } });
          this.storeReplay(`${modeName(w.config.mode)} · Day ${e.day}`);
          break;
        }
        case 'gameOver':
          this.finish(e.reason);
          break;
        default:
          break;
      }
    }
    if (career) {
      const ms = useProfile.getState().missions.map((m) => ({ ...m }));
      if (trackMissions(ms, events, w, w.config.mode)) {
        const before = useProfile.getState().missions;
        useProfile.getState().setMissions(ms);
        for (const m of ms) {
          const b = before.find((x) => x.id === m.id);
          if (b && b.progress < b.target && m.progress >= m.target) {
            ui.toast({ kind: 'success', title: 'Mission complete!', text: `${m.title} — claim your reward`, icon: '🎯', ttl: 4500 });
            audio.play('confirm');
          }
        }
      }
    }
    const st = useProfile.getState().stats;
    if (career && w.score.maxSimultaneous > st.maxSimultaneous) prof.updateStats((s) => (s.maxSimultaneous = w.score.maxSimultaneous));
  }

  private finish(reason: string) {
    if (this.finished || !this.world) return;
    this.finished = true;
    const w = this.world;
    const daily = w.config.mode === 'daily';
    if (daily) {
      this.achieve('daily_challenger');
      const prof = useProfile.getState();
      const prevBest = prof.daily && prof.daily.date === this.dateKey ? prof.daily.best : 0;
      const rewarded = prof.daily && prof.daily.date === this.dateKey ? prof.daily.rewarded : false;
      if (!rewarded) prof.addCoins(150);
      const sameDay = prof.daily && prof.daily.date === this.dateKey ? prof.daily : null;
      prof.setDaily({ date: this.dateKey!, best: Math.max(prevBest, w.score.points), submitted: sameDay ? sameDay.submitted : false, rewarded: true });
    }
    useProfile.getState().updateStats((s) => (s.bestSessionPoints = Math.max(s.bestSessionPoints, w.score.points)));
    this.storeReplay(daily ? `Daily challenge ${this.dateKey}` : undefined);
    this.clearSave();
    useGame.getState().set({
      gameOver: { reason, points: w.score.points, arrivals: w.score.arrivals, departures: w.score.departures, happiness: Math.round(w.score.happiness), daily, dateKey: this.dateKey },
    });
  }

  dailyReplay(): Replay | null {
    if (!this.world || this.world.config.mode !== 'daily') return null;
    return this.currentReplay();
  }

  /** Fast-forward the live simulation (used by automated tests and the replay seeker). */
  advance(seconds: number) {
    const w = this.world;
    if (!w || this.kind !== 'play') return;
    const n = Math.round(seconds * TICK_HZ);
    for (let i = 0; i < n && !w.over; i++) {
      this.capturePrev(w);
      step(w);
      this.handleEvents(drainEvents(w));
    }
    useGame.getState().bump();
  }

  sessionSeconds() {
    return this.world ? (this.world.tick - this.sessionStartTick) / TICK_HZ : 0;
  }
}

export function modeName(m: GameMode) {
  return { kids: 'Kids', casual: 'Casual', pro: 'Pro ATC', sandbox: 'Sandbox', daily: 'Daily Challenge', menu: 'Menu' }[m];
}

export function loadReplays(): StoredReplay[] {
  try {
    const raw = localStorage.getItem(REPLAYS_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as StoredReplay[];
    return Array.isArray(list) ? list.filter((r) => r.version === SIM_VERSION) : [];
  } catch {
    return [];
  }
}

export function deleteReplay(id: string) {
  const list = loadReplays().filter((r) => r.id !== id);
  try {
    localStorage.setItem(REPLAYS_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

export const game = new GameController();
(globalThis as unknown as { __sky?: GameController }).__sky = game;
