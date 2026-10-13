import { useEffect, useRef } from 'react';
import { audio } from '../audio/audio';
import {
  actionGoAround,
  actionHold,
  actionLand,
  actionPark,
  actionPushback,
  actionTakeoff,
  actionTaxi,
  canDragRoute,
  cycleAircraft,
  finishDrag,
  pickGate,
  pickRunway,
  selectAircraft,
  snapDrag,
} from '../game/actions';
import { game } from '../game/controller';
import { GameRenderer, type RenderUI } from '../render/renderer';
import { availableActions } from '../sim/commands';
import { useGame } from '../store/game';
import { useProfile } from '../store/profile';

const LOAD_STEPS = ['Painting the runways…', 'Polishing the terminal glass…', 'Fuelling the aircraft…', 'Briefing the tower…', 'Ready for departure!'];

export function GameCanvas() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current!;
    let disposed = false;
    const renderer = new GameRenderer();
    const settings = useProfile.getState().settings;
    const quality = settings.quality === 'auto' ? (window.devicePixelRatio > 2.5 || navigator.hardwareConcurrency <= 4 ? 'medium' : 'high') : settings.quality;
    const ui = useGame.getState();
    ui.set({ loadProgress: 0.1, loadText: LOAD_STEPS[0]! });

    let dragState: {
      id: number;
      sx: number;
      sy: number;
      lx: number;
      ly: number;
      moved: boolean;
      mode: 'none' | 'pan' | 'route';
      ac?: string;
      pts: number[];
      t: number;
    } | null = null;
    const pointers = new Map<number, { x: number; y: number }>();
    let pinchDist = 0;
    let renderUI: RenderUI = {
      selected: null,
      pick: null,
      attention: game.attention,
      hintAc: null,
      dragPts: null,
      dragSnap: [],
      labels: 'all',
      highContrast: false,
      reduceMotion: false,
    };

    const local = (e: PointerEvent | WheelEvent) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const onDown = (e: PointerEvent) => {
      audio.unlock();
      const p = local(e);
      pointers.set(e.pointerId, p);
      try {
        (e.target as Element).setPointerCapture?.(e.pointerId);
      } catch {
        /* synthetic or already released pointer */
      }
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchDist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        if (dragState) dragState.mode = 'none';
        renderUI.dragPts = null;
        return;
      }
      dragState = { id: e.pointerId, sx: p.x, sy: p.y, lx: p.x, ly: p.y, moved: false, mode: 'none', pts: [], t: performance.now() };
      // start a route drag when pressing on the selected aircraft
      const w = game.world;
      const sel = useGame.getState().selected;
      if (w && sel && game.kind === 'play') {
        const hit = renderer.pickAircraft(w, p.x, p.y);
        if (hit && hit.id === sel && canDragRoute(hit) && !(useGame.getState().mode === 'kids')) {
          dragState.ac = hit.id;
        }
      }
    };

    const onMove = (e: PointerEvent) => {
      const p = local(e);
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, p);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        if (pinchDist > 0) renderer.camera.zoomAt(d / pinchDist, (a!.x + b!.x) / 2, (a!.y + b!.y) / 2);
        pinchDist = d;
        return;
      }
      if (!dragState || dragState.id !== e.pointerId) return;
      const dx = p.x - dragState.lx;
      const dy = p.y - dragState.ly;
      if (!dragState.moved && Math.hypot(p.x - dragState.sx, p.y - dragState.sy) > 7) {
        dragState.moved = true;
        dragState.mode = dragState.ac ? 'route' : 'pan';
        if (dragState.mode === 'route') {
          const wp = renderer.screenToWorld(dragState.sx, dragState.sy);
          dragState.pts = [wp.x, wp.y];
        }
      }
      if (dragState.mode === 'pan') renderer.camera.pan(dx, dy);
      else if (dragState.mode === 'route') {
        const wp = renderer.screenToWorld(p.x, p.y);
        const pts = dragState.pts;
        if (pts.length < 2 || Math.hypot(pts[pts.length - 2]! - wp.x, pts[pts.length - 1]! - wp.y) > 10 / renderer.camera.zoom) pts.push(wp.x, wp.y);
        renderUI.dragPts = pts;
        renderUI.dragSnap = snapDrag(pts);
        // edge auto-pan while drawing
        const m = 40;
        const W = renderer.camera.w;
        const H = renderer.camera.h;
        const ex = p.x < m ? 8 : p.x > W - m ? -8 : 0;
        const ey = p.y < m ? 8 : p.y > H - m ? -8 : 0;
        if (ex || ey) renderer.camera.pan(ex, ey);
      }
      dragState.lx = p.x;
      dragState.ly = p.y;
    };

    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchDist = 0;
      if (!dragState || dragState.id !== e.pointerId) return;
      const p = local(e);
      const st = dragState;
      dragState = null;
      if (st.mode === 'route' && st.ac) {
        renderUI.dragPts = null;
        renderUI.dragSnap = [];
        const gate = renderer.pickGate(p.x, p.y);
        const rw = renderer.pickRunway(p.x, p.y);
        finishDrag(st.ac, st.pts, gate, rw);
        return;
      }
      if (!st.moved) handleTap(p.x, p.y);
    };

    const handleTap = (x: number, y: number) => {
      const w = game.world;
      if (!w) return;
      const ui = useGame.getState();
      if (game.kind !== 'play' && game.kind !== 'replay') return;
      if (ui.pick && game.kind === 'play') {
        if (ui.pick.kind === 'gate') {
          const g = renderer.pickGate(x, y);
          if (g) return pickGate(g);
        } else {
          const r = renderer.pickRunway(x, y);
          if (r) return pickRunway(r);
        }
        const hit = renderer.pickAircraft(w, x, y);
        if (hit) return selectAircraft(hit.id);
        ui.set({ pick: null });
        audio.play('close');
        return;
      }
      const hit = renderer.pickAircraft(w, x, y);
      if (hit) selectAircraft(hit.id);
      else if (ui.selected) ui.set({ selected: null });
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = local(e);
      if (e.ctrlKey) {
        renderer.camera.zoomAt(Math.exp(-e.deltaY * 0.01), p.x, p.y);
      } else if (Math.abs(e.deltaX) > Math.abs(e.deltaY) * 0.6 && e.deltaMode === 0 && Math.abs(e.deltaX) > 1) {
        renderer.camera.pan(-e.deltaX, -e.deltaY);
      } else {
        const delta = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
        renderer.camera.zoomAt(Math.exp(-delta * 0.0015), p.x, p.y);
      }
    };

    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return;
      const ui = useGame.getState();
      const cam = renderer.camera;
      const k = e.key.toLowerCase();
      const panStep = 60;
      if (k === 'arrowleft' || (k === 'a' && !e.ctrlKey && !ui.selected)) return void cam.pan(panStep, 0);
      if (k === 'arrowright' || (k === 'd' && !ui.selected)) return void cam.pan(-panStep, 0);
      if (k === 'arrowup' || (k === 'w' && !ui.selected)) return void cam.pan(0, panStep);
      if (k === 'arrowdown' || (k === 's' && !ui.selected)) return void cam.pan(0, -panStep);
      if (k === '+' || k === '=') return void cam.zoomAt(1.15, cam.w / 2, cam.h / 2);
      if (k === '-' || k === '_') return void cam.zoomAt(1 / 1.15, cam.w / 2, cam.h / 2);
      if (game.kind !== 'play' && game.kind !== 'replay') return;
      if (ui.overlay || ui.daySummary || ui.gameOver) return;
      if (k === ' ') {
        e.preventDefault();
        return void ui.set({ paused: !ui.paused });
      }
      if (k === '1' || k === '2' || k === '3') return void ui.set({ speed: Number(k) });
      if (k === 'tab') {
        e.preventDefault();
        return void cycleAircraft(e.shiftKey ? -1 : 1);
      }
      if (k === 'escape') {
        if (ui.pick) return void ui.set({ pick: null });
        if (ui.selected) return void ui.set({ selected: null });
        return void ui.set({ overlay: 'pause' });
      }
      if ((k === 'z' && (e.ctrlKey || e.metaKey)) || k === 'u') {
        e.preventDefault();
        return void game.undo();
      }
      if (k === 'f' && ui.selected) {
        const a = game.world?.aircraft.find((x) => x.id === ui.selected);
        if (a) cam.focus(a.x, a.y, Math.max(cam.zoom, 0.6));
        return;
      }
      const id = ui.selected;
      const w = game.world;
      if (!id || !w || game.kind !== 'play') return;
      const a = w.aircraft.find((x) => x.id === id);
      if (!a) return;
      const act = availableActions(w, a);
      if (ui.pick?.kind === 'runway' && (k === 'n' || k === 's')) return void pickRunway(k === 'n' ? 'R1' : 'R2');
      if (k === 'l' && act.land) actionLand(id);
      else if (k === 'p' && act.park) actionPark(id);
      else if (k === 't') {
        if (act.takeoff) actionTakeoff(id);
        else if (act.taxi) actionTaxi(id);
      } else if (k === 'b' && act.pushbackReady) actionPushback(id);
      else if (k === 'h') actionHold(id);
      else if (k === 'g' && act.goAround) actionGoAround(id);
    };

    const onResize = () => renderer.resize();

    (async () => {
      await document.fonts?.ready;
      if (disposed) return;
      await renderer.init(el, quality);
      if (disposed) {
        renderer.destroy();
        return;
      }
      game.renderer = renderer;
      renderer.onQualityDrop = (q) => useGame.getState().toast({ kind: 'info', title: 'Graphics adjusted', text: `Switched to ${q} quality for smoother play`, icon: '⚙️' });
      const prof = useProfile.getState();
      renderer.setScene(prof.activeTheme, prof.activeDecor);
      let i = 1;
      // pre-warm aircraft textures with a progress bar
      const warm = ['a320', 'b737', 'atr72', 'e190', 'a321', 'b787', 'a350', 'b777', 'a380'];
      for (const t of warm) {
        renderer.bank.aircraft(t, 'aurora');
        useGame.getState().set({ loadProgress: 0.15 + (i / warm.length) * 0.6, loadText: LOAD_STEPS[Math.min(3, Math.floor(i / 3))]! });
        i++;
        await new Promise((r) => setTimeout(r, 16));
      }
      game.startMenu();
      useGame.getState().set({ loadProgress: 1, loadText: LOAD_STEPS[4]! });
      await new Promise((r) => setTimeout(r, 350));
      if (useGame.getState().screen === 'loading') useGame.getState().set({ screen: 'menu' });

      el.addEventListener('pointerdown', onDown);
      el.addEventListener('pointermove', onMove);
      el.addEventListener('pointerup', onUp);
      el.addEventListener('pointercancel', onUp);
      el.addEventListener('wheel', onWheel, { passive: false });
      window.addEventListener('keydown', onKey);
      window.addEventListener('resize', onResize);
      const ro = new ResizeObserver(onResize);
      ro.observe(el);

      renderer.app.ticker.add((tk) => {
        const dt = Math.min(0.1, tk.deltaMS / 1000);
        game.frame(dt);
        const w = game.world;
        if (!w) return;
        const ui = useGame.getState();
        const p = useProfile.getState();
        renderUI = {
          ...renderUI,
          selected: ui.selected,
          pick: ui.pick,
          attention: game.kind === 'play' ? game.attention : new Set(),
          hintAc: ui.hint?.ac ?? null,
          labels: game.kind === 'menu' ? 'none' : p.settings.labels,
          highContrast: p.settings.highContrast,
          reduceMotion: p.settings.reduceMotion,
        };
        const free = w.config.mode === 'sandbox';
        const theme = free || p.unlocks.themes.includes(p.activeTheme) ? p.activeTheme : 'meadow';
        const decor = free ? p.activeDecor : p.activeDecor.filter((d) => p.unlocks.decor.includes(d));
        renderer.render(w, game.prev.size ? game.prev : null, game.alpha, dt, renderUI, { theme, decor, vehicles: p.settings.vehicles });
        if (game.kind === 'menu') {
          // gentle cinematic drift over the airport
          const t = performance.now() / 1000;
          renderer.camera.focus(1550 + Math.sin(t * 0.05) * 500, 1100 + Math.cos(t * 0.04) * 260);
        }
      });
      (el as HTMLDivElement & { __ro?: ResizeObserver }).__ro = ro;
    })();

    return () => {
      disposed = true;
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
      (el as HTMLDivElement & { __ro?: ResizeObserver }).__ro?.disconnect();
      if (game.renderer === renderer) game.renderer = null;
      renderer.destroy();
    };
  }, []);

  return <div ref={host} className="absolute inset-0 overflow-hidden" data-testid="game-canvas" />;
}
