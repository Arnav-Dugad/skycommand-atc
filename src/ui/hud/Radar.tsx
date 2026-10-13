import { motion } from 'motion/react';
import { useEffect, useRef } from 'react';
import { game } from '../../game/controller';
import { AIRPORT } from '../../sim/airport';
import { useGame } from '../../store/game';
import { isDeparture } from '../format';

const B = { x0: -1700, y0: -1500, x1: 4900, y1: 3700 };

export function Radar() {
  const open = useGame((s) => s.radarOpen);
  const set = useGame((s) => s.set);
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!open) return;
    let raf = 0;
    let sweep = 0;
    let last = performance.now();
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const cv = ref.current;
      const w = game.world;
      if (!cv || !w) return;
      const now = performance.now();
      sweep += ((now - last) / 1000) * 1.6;
      last = now;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = cv.clientWidth;
      const H = cv.clientHeight;
      if (cv.width !== W * dpr) {
        cv.width = W * dpr;
        cv.height = H * dpr;
      }
      const ctx = cv.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const sx = W / (B.x1 - B.x0);
      const sy = H / (B.y1 - B.y0);
      const s = Math.min(sx, sy);
      const ox = (W - (B.x1 - B.x0) * s) / 2;
      const oy = (H - (B.y1 - B.y0) * s) / 2;
      const X = (x: number) => ox + (x - B.x0) * s;
      const Y = (y: number) => oy + (y - B.y0) * s;
      // background
      const g = ctx.createRadialGradient(W / 2, H / 2, 4, W / 2, H / 2, Math.max(W, H) * 0.7);
      g.addColorStop(0, 'rgba(32,201,151,0.16)');
      g.addColorStop(1, 'rgba(5,15,25,0.0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      // range rings
      ctx.strokeStyle = 'rgba(99,230,190,0.18)';
      ctx.lineWidth = 1;
      for (let r = 1; r <= 3; r++) {
        ctx.beginPath();
        ctx.arc(X(1550), Y(1100), r * 1100 * s, 0, Math.PI * 2);
        ctx.stroke();
      }
      // sweep
      ctx.save();
      ctx.translate(X(1550), Y(1100));
      ctx.rotate(sweep);
      const sg = ctx.createLinearGradient(0, 0, 3300 * s, 0);
      sg.addColorStop(0, 'rgba(99,230,190,0.35)');
      sg.addColorStop(1, 'rgba(99,230,190,0)');
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, 3300 * s, -0.35, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      // runways
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = Math.max(2, 70 * s);
      ctx.lineCap = 'round';
      for (const r of Object.values(AIRPORT.runways)) {
        ctx.globalAlpha = w.config.runways.includes(r.id) ? 1 : 0.3;
        ctx.beginPath();
        ctx.moveTo(X(r.x0), Y(r.y));
        ctx.lineTo(X(r.x1), Y(r.y));
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // terminal
      ctx.fillStyle = 'rgba(180,200,230,0.55)';
      ctx.fillRect(X(760), Y(990), (2560 - 760) * s, 220 * s);
      // aircraft
      for (const a of w.aircraft) {
        if (a.phase === 'departed') continue;
        const dep = isDeparture(a);
        const col = a.emergency ? '#ff6b6b' : game.attention.has(a.id) ? '#fcc419' : dep ? '#ff922b' : '#4dabf7';
        const x = X(a.x);
        const y = Y(a.y);
        if (x < -4 || y < -4 || x > W + 4 || y > H + 4) continue;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(x, y, a.alt > 0.01 ? 3.2 : 2.4, 0, Math.PI * 2);
        ctx.fill();
        if (a.alt > 0.01) {
          ctx.strokeStyle = col;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + Math.cos(a.h) * 9, y + Math.sin(a.h) * 9);
          ctx.stroke();
        }
        if (useGame.getState().selected === a.id) {
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(x, y, 6, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      // viewport
      const r = game.renderer;
      if (r) {
        const tl = r.camera.screenToWorld(0, 0);
        const br = r.camera.screenToWorld(r.camera.w, r.camera.h);
        ctx.strokeStyle = 'rgba(255,255,255,0.75)';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(X(tl.x), Y(tl.y), (br.x - tl.x) * s, (br.y - tl.y) * s);
      }
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [open]);

  const onTap = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const cv = ref.current;
    const r = game.renderer;
    if (!cv || !r) return;
    const rect = cv.getBoundingClientRect();
    const W = rect.width;
    const H = rect.height;
    const s = Math.min(W / (B.x1 - B.x0), H / (B.y1 - B.y0));
    const ox = (W - (B.x1 - B.x0) * s) / 2;
    const oy = (H - (B.y1 - B.y0) * s) / 2;
    const wx = (e.clientX - rect.left - ox) / s + B.x0;
    const wy = (e.clientY - rect.top - oy) / s + B.y0;
    r.camera.follow = null;
    r.camera.focus(wx, wy);
  };

  if (!open)
    return (
      <button type="button" onClick={() => set({ radarOpen: true })} className="glass pointer-events-auto absolute bottom-3 left-2 z-20 hidden h-11 items-center gap-2 rounded-2xl px-3 text-sm font-bold sm:left-3 sm:flex safe-bottom" aria-label="Show radar">
        📡 <span className="hidden sm:inline">Radar</span>
      </button>
    );
  return (
    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="glass pointer-events-auto absolute bottom-3 left-2 z-20 hidden overflow-hidden rounded-2xl sm:left-3 sm:block" data-testid="radar">
      <div className="flex items-center justify-between px-2.5 pt-1.5 text-[0.64rem] font-extrabold uppercase tracking-[0.16em] text-emerald-200/70">
        <span>Radar</span>
        <button type="button" onClick={() => set({ radarOpen: false })} className="rounded px-1 text-white/50 hover:text-white" aria-label="Hide radar">
          ✕
        </button>
      </div>
      <canvas ref={ref} onPointerDown={onTap} className="block h-[9.5rem] w-[13rem] cursor-crosshair lg:h-[11rem] lg:w-[15rem]" aria-label="Radar overview: tap to move the camera" />
    </motion.div>
  );
}
