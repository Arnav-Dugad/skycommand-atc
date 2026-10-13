import { Container, Graphics, Texture, type Renderer } from 'pixi.js';
import { getType, LIVERY_BY_ID } from '../sim/aircraft';
import { drawAircraft, vehicleArt } from './aircraftArt';
import type { Theme } from './themes';

/**
 * Texture cache. Aircraft textures are generated lazily per (type, livery) pair and
 * re-used by every sprite; canvas textures are created once.
 */
export class TextureBank {
  private renderer: Renderer;
  private cache = new Map<string, Texture>();
  quality: number;

  constructor(renderer: Renderer, quality: number) {
    this.renderer = renderer;
    this.quality = quality;
  }

  private gen(key: string, draw: (g: Graphics) => void, resolution: number): Texture {
    const hit = this.cache.get(key);
    if (hit) return hit;
    const g = new Graphics();
    draw(g);
    const c = new Container();
    c.addChild(g);
    const tex = this.renderer.generateTexture({ target: c, resolution, antialias: true });
    tex.source.scaleMode = 'linear';
    g.destroy();
    c.destroy();
    this.cache.set(key, tex);
    return tex;
  }

  aircraft(typeId: string, liveryId: string): Texture {
    const t = getType(typeId);
    const liv = LIVERY_BY_ID[liveryId] ?? LIVERY_BY_ID['aurora']!;
    return this.gen(`ac:${typeId}:${liveryId}`, (g) => drawAircraft(g, t, liv), 2.4 * this.quality);
  }

  vehicle(kind: string, color?: number): Texture {
    return this.gen(`veh:${kind}:${color ?? ''}`, (g) => vehicleArt(g, kind, color), 3 * this.quality);
  }

  canvas(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): Texture {
    const hit = this.cache.get(key);
    if (hit) return hit;
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext('2d')!;
    draw(ctx);
    const tex = Texture.from(cv);
    this.cache.set(key, tex);
    return tex;
  }

  glow(): Texture {
    return this.canvas('glow', 64, 64, (ctx) => {
      const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.18, 'rgba(255,255,255,0.85)');
      g.addColorStop(0.45, 'rgba(255,255,255,0.25)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
    });
  }

  cone(): Texture {
    return this.canvas('cone', 128, 64, (ctx) => {
      const g = ctx.createLinearGradient(0, 0, 128, 0);
      g.addColorStop(0, 'rgba(255,255,240,0.9)');
      g.addColorStop(1, 'rgba(255,255,240,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, 30);
      ctx.lineTo(128, 0);
      ctx.lineTo(128, 64);
      ctx.lineTo(0, 34);
      ctx.closePath();
      ctx.fill();
    });
  }

  white(): Texture {
    return Texture.WHITE;
  }

  cloud(variant: number): Texture {
    return this.canvas(`cloud${variant}`, 256, 160, (ctx) => {
      let seed = 1234 + variant * 977;
      const rnd = () => {
        seed = (seed * 16807) % 2147483647;
        return seed / 2147483647;
      };
      for (let i = 0; i < 16; i++) {
        const x = 60 + rnd() * 136;
        const y = 50 + rnd() * 60;
        const r = 26 + rnd() * 34;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(255,255,255,0.55)');
        g.addColorStop(0.6, 'rgba(255,255,255,0.28)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  grass(theme: Theme): Texture {
    return this.canvas(`grass:${theme.id}`, 256, 256, (ctx) => {
      const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
      ctx.fillStyle = hex(theme.grass);
      ctx.fillRect(0, 0, 256, 256);
      // mowing stripes
      ctx.fillStyle = hex(theme.grassLight);
      ctx.globalAlpha = 0.45;
      ctx.fillRect(0, 0, 256, 64);
      ctx.fillRect(0, 128, 256, 64);
      ctx.globalAlpha = 1;
      let seed = 99;
      const rnd = () => {
        seed = (seed * 16807) % 2147483647;
        return seed / 2147483647;
      };
      for (let i = 0; i < 900; i++) {
        ctx.fillStyle = rnd() > 0.5 ? hex(theme.grassDark) : hex(theme.grassLight);
        ctx.globalAlpha = 0.25 + rnd() * 0.3;
        const x = rnd() * 256;
        const y = rnd() * 256;
        ctx.fillRect(x, y, 1.5 + rnd() * 2, 1.5 + rnd() * 2);
      }
      if (theme.snow) {
        for (let i = 0; i < 200; i++) {
          ctx.fillStyle = '#ffffff';
          ctx.globalAlpha = 0.6;
          ctx.fillRect(rnd() * 256, rnd() * 256, 2, 2);
        }
      }
      ctx.globalAlpha = 1;
    });
  }

  concrete(): Texture {
    return this.canvas('concrete', 128, 128, (ctx) => {
      ctx.fillStyle = '#808080';
      ctx.fillRect(0, 0, 128, 128);
      let seed = 7;
      const rnd = () => {
        seed = (seed * 16807) % 2147483647;
        return seed / 2147483647;
      };
      for (let i = 0; i < 700; i++) {
        const v = 110 + Math.floor(rnd() * 40);
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.globalAlpha = 0.25;
        ctx.fillRect(rnd() * 128, rnd() * 128, 1 + rnd() * 2, 1 + rnd() * 2);
      }
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = '#6c6c6c';
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, 127, 127);
      ctx.beginPath();
      ctx.moveTo(64, 0);
      ctx.lineTo(64, 128);
      ctx.moveTo(0, 64);
      ctx.lineTo(128, 64);
      ctx.stroke();
      ctx.globalAlpha = 1;
    });
  }

  tree(color: number, dark: number, light: number, snow = false): Texture {
    return this.canvas(`tree:${color}:${snow}`, 64, 64, (ctx) => {
      const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
      const g = ctx.createRadialGradient(26, 26, 2, 32, 32, 30);
      g.addColorStop(0, hex(light));
      g.addColorStop(0.55, hex(color));
      g.addColorStop(1, hex(dark));
      ctx.fillStyle = g;
      ctx.beginPath();
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        ctx.arc(32 + Math.cos(a) * 14, 32 + Math.sin(a) * 14, 15, 0, Math.PI * 2);
      }
      ctx.fill();
      if (snow) {
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2 + 0.6;
          ctx.beginPath();
          ctx.arc(30 + Math.cos(a) * 10, 28 + Math.sin(a) * 10, 5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    });
  }

  rain(): Texture {
    return this.canvas('rain', 4, 64, (ctx) => {
      const g = ctx.createLinearGradient(0, 0, 0, 64);
      g.addColorStop(0, 'rgba(220,235,255,0)');
      g.addColorStop(1, 'rgba(220,235,255,0.75)');
      ctx.fillStyle = g;
      ctx.fillRect(1, 0, 2, 64);
    });
  }

  ring(): Texture {
    return this.canvas('ring', 128, 128, (ctx) => {
      ctx.strokeStyle = 'rgba(255,255,255,1)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(64, 64, 58, 0, Math.PI * 2);
      ctx.stroke();
    });
  }

  destroy() {
    for (const t of this.cache.values()) t.destroy(true);
    this.cache.clear();
  }
}
