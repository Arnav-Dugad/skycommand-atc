import { Application, BitmapText, Container, Graphics, Sprite } from 'pixi.js';
import { getType, SIZE_ORDER } from '../sim/aircraft';
import { AIRPORT, RING_N_Y, RING_S_Y, standStopY, TERMINAL_N_FACE, TERMINAL_S_FACE, type RunwayId } from '../sim/airport';
import { approachEntry } from '../sim/engine';
import { pointAt } from '../sim/path';
import type { Aircraft, World } from '../sim/types';
import { nightAmount, clockMinutes, gateFits } from '../sim/world';
import { buildAirportArt, type AirportArt, type StaticLight } from './airportArt';
import { Camera } from './camera';
import { TextureBank } from './textures';
import { THEME_BY_ID, type Theme } from './themes';
import { VehicleSystem } from './vehicles';

export type Quality = 'low' | 'medium' | 'high';

export interface RenderUI {
  selected: string | null;
  pick: null | { kind: 'gate' | 'runway'; ac: string; purpose: 'land' | 'park' | 'taxi' };
  attention: Set<string>;
  hintAc: string | null;
  dragPts: number[] | null;
  dragSnap: string[];
  labels: 'all' | 'minimal' | 'none';
  highContrast: boolean;
  reduceMotion: boolean;
}

interface AcView {
  root: Container;
  sprite: Sprite;
  shadow: Sprite;
  label: Container;
  labelBg: Graphics;
  labelText: BitmapText;
  labelKey: string;
  ring: Sprite;
  navL: Sprite;
  navR: Sprite;
  tailL: Sprite;
  beacon: Sprite;
  strobeL: Sprite;
  strobeR: Sprite;
  landing: Sprite;
  dispH: number;
  seen: boolean;
}

interface CloudView {
  sprite: Sprite;
  shadow: Sprite;
  vx: number;
  vy: number;
}

const LABEL_FONT = 'JetBrains Mono Variable, JetBrains Mono, ui-monospace, monospace';

export class GameRenderer {
  app!: Application;
  bank!: TextureBank;
  camera = new Camera();
  private parent!: HTMLElement;
  private worldLayer = new Container();
  private groundLayer = new Container();
  private highlightLayer = new Container();
  private groundShadowLayer = new Container();
  private vehicleLayer = new Container();
  private groundAcLayer = new Container();
  private upperLayer = new Container();
  private bridgeG = new Graphics();
  private airShadowLayer = new Container();
  private airAcLayer = new Container();
  private cloudLayer = new Container();
  private cloudShadowLayer = new Container();
  private nightOverlay = new Sprite();
  private lightsLayer = new Container();
  private staticLights = new Container();
  private overlayLayer = new Container();
  private routeG = new Graphics();
  private hiG = new Graphics();
  private dragG = new Graphics();
  private screenLayer = new Container();
  private rainLayer = new Container();
  private fogSprite = new Sprite();
  private flashSprite = new Sprite();
  private views = new Map<string, AcView>();
  private clouds: CloudView[] = [];
  private rainDrops: Sprite[] = [];
  private art: AirportArt | null = null;
  private approachLights: { s: Sprite; seq: number }[] = [];
  private bridgeExt: Record<string, number> = {};
  private vehicles!: VehicleSystem;
  private themeId = '';
  private decorKey = '';
  private time = 0;
  private lightningT = 0;
  private gateLabels = new Container();
  private gateLabelMap = new Map<string, BitmapText>();
  quality: Quality = 'high';
  ready = false;
  private fpsAvg = 60;
  private lowFrames = 0;
  onQualityDrop?: (q: Quality) => void;

  async init(parent: HTMLElement, quality: Quality) {
    this.parent = parent;
    this.quality = quality;
    const app = new Application();
    const dpr = Math.min(window.devicePixelRatio || 1, quality === 'high' ? 2 : quality === 'medium' ? 1.5 : 1);
    await app.init({
      resizeTo: parent,
      antialias: quality !== 'low',
      backgroundColor: 0x6fa95a,
      resolution: dpr,
      autoDensity: true,
      preference: 'webgl',
      powerPreference: 'high-performance',
    });
    this.app = app;
    app.canvas.style.display = 'block';
    app.canvas.style.touchAction = 'none';
    app.canvas.setAttribute('aria-label', 'Airport map');
    app.canvas.setAttribute('role', 'img');
    parent.appendChild(app.canvas);
    this.bank = new TextureBank(app.renderer, quality === 'low' ? 0.75 : 1);

    const s = app.stage;
    s.addChild(this.worldLayer);
    this.worldLayer.addChild(
      this.groundLayer,
      this.highlightLayer,
      this.groundShadowLayer,
      this.vehicleLayer,
      this.groundAcLayer,
      this.upperLayer,
      this.bridgeG,
      this.cloudShadowLayer,
      this.airShadowLayer,
      this.airAcLayer,
      this.cloudLayer,
    );
    this.nightOverlay.texture = this.bank.white();
    this.nightOverlay.blendMode = 'multiply';
    s.addChild(this.nightOverlay);
    s.addChild(this.lightsLayer);
    this.lightsLayer.addChild(this.staticLights);
    s.addChild(this.screenLayer);
    this.screenLayer.addChild(this.rainLayer);
    this.fogSprite.texture = this.bank.white();
    this.fogSprite.tint = 0xe9eef3;
    this.fogSprite.alpha = 0;
    this.screenLayer.addChild(this.fogSprite);
    this.flashSprite.texture = this.bank.white();
    this.flashSprite.alpha = 0;
    this.screenLayer.addChild(this.flashSprite);
    s.addChild(this.overlayLayer);
    this.overlayLayer.addChild(this.hiG, this.gateLabels, this.routeG, this.dragG);

    this.vehicles = new VehicleSystem(this.vehicleLayer, this.lightsLayer, this.bank);
    this.makeClouds();
    this.makeRain();
    this.camera.setViewport(parent.clientWidth, parent.clientHeight);
    this.camera.defaultView();
    this.ready = true;
  }

  /** Pre-generate aircraft textures used in the encyclopedia etc. */
  aircraftCanvas(typeId: string, liveryId: string, size = 220): HTMLCanvasElement {
    const tex = this.bank.aircraft(typeId, liveryId);
    const sp = new Sprite(tex);
    sp.anchor.set(0.5);
    const c = new Container();
    c.addChild(sp);
    const scale = size / Math.max(tex.width, tex.height);
    sp.scale.set(scale);
    sp.rotation = -Math.PI / 2;
    sp.position.set(size / 2, size / 2);
    const rt = this.app.renderer.extract.canvas({ target: c, frame: undefined, resolution: 1 }) as HTMLCanvasElement;
    c.destroy({ children: true });
    return rt;
  }

  setScene(themeId: string, decor: string[]) {
    const key = decor.slice().sort().join(',');
    if (themeId === this.themeId && key === this.decorKey && this.art) return;
    this.themeId = themeId;
    this.decorKey = key;
    const theme: Theme = THEME_BY_ID[themeId] ?? THEME_BY_ID['meadow']!;
    this.app.renderer.background.color = theme.background;
    if (this.art) {
      this.art.ground.destroy({ children: true });
      this.art.upper.destroy({ children: true });
    }
    this.staticLights.removeChildren().forEach((c) => c.destroy());
    this.approachLights = [];
    this.art = buildAirportArt(this.bank, theme, decor);
    this.groundLayer.addChild(this.art.ground);
    this.upperLayer.addChild(this.art.upper);
    this.buildStaticLights(this.art.lights);
  }

  private buildStaticLights(lights: StaticLight[]) {
    const glow = this.bank.glow();
    for (const l of lights) {
      const sp = new Sprite(glow);
      sp.anchor.set(0.5);
      sp.blendMode = 'add';
      sp.tint = l.color;
      sp.scale.set(l.size * 0.35);
      sp.position.set(l.x, l.y);
      this.staticLights.addChild(sp);
      if (l.kind === 'approach' && l.seq !== undefined) this.approachLights.push({ s: sp, seq: l.seq });
      if (l.kind === 'apron') sp.alpha = 0.55;
      if (l.kind === 'building') sp.alpha = 0.7;
    }
  }

  private makeClouds() {
    for (let i = 0; i < 14; i++) {
      const tex = this.bank.cloud(i % 4);
      const sp = new Sprite(tex);
      sp.anchor.set(0.5);
      const sc = 3 + (i % 5) * 0.8;
      sp.scale.set(sc);
      sp.position.set(-1500 + ((i * 937) % 6500), -1200 + ((i * 613) % 4600));
      sp.alpha = 0;
      const sh = new Sprite(tex);
      sh.anchor.set(0.5);
      sh.scale.set(sc);
      sh.tint = 0x000000;
      sh.alpha = 0;
      this.cloudLayer.addChild(sp);
      this.cloudShadowLayer.addChild(sh);
      this.clouds.push({ sprite: sp, shadow: sh, vx: 14 + (i % 3) * 5, vy: 3 + (i % 2) * 2 });
    }
  }

  private makeRain() {
    const tex = this.bank.rain();
    const n = this.quality === 'low' ? 70 : 160;
    for (let i = 0; i < n; i++) {
      const sp = new Sprite(tex);
      sp.anchor.set(0.5, 1);
      sp.rotation = 0.25;
      sp.alpha = 0;
      sp.position.set(Math.random() * 2000, Math.random() * 1200);
      sp.scale.set(0.6, 0.4 + Math.random() * 0.5);
      this.rainLayer.addChild(sp);
      this.rainDrops.push(sp);
    }
  }

  resize() {
    if (!this.ready) return;
    this.camera.setViewport(this.parent.clientWidth, this.parent.clientHeight);
  }

  screenToWorld(sx: number, sy: number) {
    return this.camera.screenToWorld(sx, sy);
  }

  worldToScreen(x: number, y: number) {
    return this.camera.worldToScreen(x, y);
  }

  private makeView(ac: Aircraft): AcView {
    const tex = this.bank.aircraft(ac.typeId, ac.liveryId);
    const root = new Container();
    const sprite = new Sprite(tex);
    sprite.anchor.set(0.5);
    root.addChild(sprite);
    const shadow = new Sprite(tex);
    shadow.anchor.set(0.5);
    shadow.tint = 0x000000;
    shadow.alpha = 0.22;
    const glow = this.bank.glow();
    const mk = (tint: number, sc: number) => {
      const s = new Sprite(glow);
      s.anchor.set(0.5);
      s.blendMode = 'add';
      s.tint = tint;
      s.scale.set(sc);
      this.lightsLayer.addChild(s);
      return s;
    };
    const label = new Container();
    const labelBg = new Graphics();
    const labelText = new BitmapText({ text: ac.callsign, style: { fontFamily: LABEL_FONT, fontSize: 26, fill: 0xffffff, fontWeight: '700' } });
    labelText.anchor.set(0.5);
    label.addChild(labelBg, labelText);
    const ring = new Sprite(this.bank.ring());
    ring.anchor.set(0.5);
    ring.visible = false;
    const landing = new Sprite(this.bank.cone());
    landing.anchor.set(0, 0.5);
    landing.blendMode = 'add';
    landing.alpha = 0;
    this.lightsLayer.addChild(landing);
    const v: AcView = {
      root,
      sprite,
      shadow,
      label,
      labelBg,
      labelText,
      labelKey: '',
      ring,
      navL: mk(0xff3b3b, 0.12),
      navR: mk(0x40ff7a, 0.12),
      tailL: mk(0xffffff, 0.1),
      beacon: mk(0xff2d2d, 0.2),
      strobeL: mk(0xffffff, 0.22),
      strobeR: mk(0xffffff, 0.22),
      landing,
      dispH: ac.h,
      seen: true,
    };
    this.overlayLayer.addChildAt(ring, 0);
    this.overlayLayer.addChild(label);
    return v;
  }

  private dropView(id: string, v: AcView) {
    v.root.destroy({ children: true });
    v.shadow.destroy();
    v.label.destroy({ children: true });
    v.ring.destroy();
    for (const s of [v.navL, v.navR, v.tailL, v.beacon, v.strobeL, v.strobeR, v.landing]) s.destroy();
    this.views.delete(id);
  }

  render(world: World, prev: Map<string, { x: number; y: number; h: number; alt: number }> | null, alpha: number, dtReal: number, ui: RenderUI, settings: { theme: string; decor: string[]; vehicles: boolean }) {
    if (!this.ready) return;
    this.time += dtReal;
    this.setScene(settings.theme, settings.decor);
    this.adaptQuality(dtReal);
    const cam = this.camera;
    cam.update(dtReal);
    const W = cam.w;
    const H = cam.h;
    this.worldLayer.scale.set(cam.zoom);
    this.worldLayer.position.set(W / 2 - cam.x * cam.zoom, H / 2 - cam.y * cam.zoom);
    for (const l of [this.lightsLayer, this.overlayLayer]) {
      l.scale.copyFrom(this.worldLayer.scale);
      l.position.copyFrom(this.worldLayer.position);
    }

    const minutes = clockMinutes(world);
    const night = nightAmount(minutes);
    const z = cam.zoom;
    const motion = ui.reduceMotion ? 0.3 : 1;

    // ---------- aircraft ----------
    for (const v of this.views.values()) v.seen = false;
    const order = [...world.aircraft].sort((a, b) => a.alt - b.alt || SIZE_ORDER[getType(a.typeId).cat] - SIZE_ORDER[getType(b.typeId).cat]);
    for (const ac of order) {
      let v = this.views.get(ac.id);
      if (!v) {
        v = this.makeView(ac);
        this.views.set(ac.id, v);
      }
      v.seen = true;
      const t = getType(ac.typeId);
      const p = prev?.get(ac.id);
      let x = ac.x;
      let y = ac.y;
      let h = ac.h;
      let alt = ac.alt;
      if (p) {
        x = p.x + (ac.x - p.x) * alpha;
        y = p.y + (ac.y - p.y) * alpha;
        let dh = ac.h - p.h;
        while (dh > Math.PI) dh -= Math.PI * 2;
        while (dh < -Math.PI) dh += Math.PI * 2;
        h = p.h + dh * alpha;
        alt = p.alt + (ac.alt - p.alt) * alpha;
      }
      // smooth any sim heading discontinuity (route rebuilds) visually
      let dd = h - v.dispH;
      while (dd > Math.PI) dd -= Math.PI * 2;
      while (dd < -Math.PI) dd += Math.PI * 2;
      const maxRate = (alt > 0.01 ? 6 : 3.2) * dtReal;
      v.dispH += Math.abs(dd) < maxRate || Math.abs(dd) < 0.01 ? dd : Math.sign(dd) * maxRate;
      const airborne = alt > 0.005;
      const scale = 1 + alt * 0.45;
      v.root.position.set(x, y);
      v.root.rotation = v.dispH;
      v.root.scale.set(scale);
      v.shadow.position.set(x + 2 + alt * 90, y + 3 + alt * 120);
      v.shadow.rotation = v.dispH;
      v.shadow.scale.set(v.sprite.scale.x * (1 + alt * 0.1));
      v.shadow.alpha = airborne ? Math.max(0.05, 0.2 - alt * 0.12) : 0.22;
      const parentWanted = airborne ? this.airAcLayer : this.groundAcLayer;
      if (v.root.parent !== parentWanted) parentWanted.addChild(v.root);
      const shadowParent = airborne ? this.airShadowLayer : this.groundShadowLayer;
      if (v.shadow.parent !== shadowParent) shadowParent.addChild(v.shadow);

      // lights
      const c = Math.cos(v.dispH);
      const s = Math.sin(v.dispH);
      const wing = (t.span / 2) * scale;
      const fx = (d: number, r: number) => x + c * d - s * r;
      const fy = (d: number, r: number) => y + s * d + c * r;
      const wd = -t.length * 0.08 * scale;
      v.navL.position.set(fx(wd, -wing), fy(wd, -wing));
      v.navR.position.set(fx(wd, wing), fy(wd, wing));
      v.tailL.position.set(fx((-t.length / 2) * scale, 0), fy((-t.length / 2) * scale, 0));
      const engines = !(ac.phase === 'parked') && !(ac.phase === 'pushback' && ac.s < 3);
      const navOn = night > 0.05 || airborne;
      v.navL.visible = v.navR.visible = v.tailL.visible = navOn;
      v.navL.alpha = v.navR.alpha = v.tailL.alpha = Math.max(night, 0.4);
      const beaconOn = engines && Math.floor(this.time * 1.2 + (ac.id.length * 0.37)) % 2 === 0;
      v.beacon.position.set(x, y);
      v.beacon.visible = beaconOn;
      v.beacon.alpha = 0.55 + night * 0.45;
      const strobePhase = (this.time * 1.1 + ac.id.charCodeAt(1) * 0.13) % 1;
      const strobe = (airborne || ac.phase === 'takeoff' || ac.phase === 'lineup' || ac.phase === 'landing') && (strobePhase < 0.06 || (strobePhase > 0.12 && strobePhase < 0.17));
      v.strobeL.visible = v.strobeR.visible = strobe;
      v.strobeL.position.copyFrom(v.navL.position);
      v.strobeR.position.copyFrom(v.navR.position);
      const landLights = ac.phase === 'takeoff' || ac.phase === 'landing' || ac.phase === 'lineup' || (ac.phase === 'approach' && ac.approach?.stage === 'final') || (ac.phase === 'climbOut' && alt < 0.5);
      v.landing.visible = landLights && night > 0.1;
      v.landing.position.set(fx((t.length / 2) * scale, 0), fy((t.length / 2) * scale, 0));
      v.landing.rotation = v.dispH;
      v.landing.scale.set(1.6 * scale, 0.9 * scale);
      v.landing.alpha = night * 0.55;

      // label
      const showLabel =
        ui.labels !== 'none' &&
        (ui.labels === 'all' || ui.selected === ac.id || ui.attention.has(ac.id) || !!ac.emergency) &&
        ac.phase !== 'departed' &&
        !(ac.phase === 'climbOut' && alt > 0.85);
      v.label.visible = showLabel;
      if (showLabel) {
        const attention = ui.attention.has(ac.id);
        const isDep = ['parked', 'pushback', 'readyTaxi', 'taxiOut', 'holdShort', 'lineup', 'takeoff', 'climbOut'].includes(ac.phase);
        const color = ac.emergency ? 0xfa5252 : attention ? 0xfcc419 : isDep ? 0xff922b : 0x339af0;
        const textColor = attention && !ac.emergency ? 0x1a1b1e : 0xffffff;
        const key = `${ac.emergency ? 'E' : ''}${ac.callsign}|${color}|${ui.highContrast}`;
        if (key !== v.labelKey) {
          v.labelKey = key;
          v.labelText.text = ac.emergency ? `! ${ac.callsign}` : ac.callsign;
          v.labelText.tint = textColor;
          const w = v.labelText.width + 22;
          v.labelBg.clear();
          v.labelBg.roundRect(-w / 2, -19, w, 38, 19).fill({ color, alpha: ui.highContrast ? 1 : 0.92 });
          if (ui.highContrast) v.labelBg.roundRect(-w / 2, -19, w, 38, 19).stroke({ width: 3, color: 0x000000 });
        }
        const ls = 0.42 / z;
        v.label.scale.set(Math.min(ls, 2.6));
        const off = (Math.max(t.length, t.span) / 2) * scale + 14 / z;
        v.label.position.set(x, y - off);
      }
      // selection / attention ring
      const sel = ui.selected === ac.id;
      const att = ui.attention.has(ac.id) || ui.hintAc === ac.id;
      v.ring.visible = sel || att;
      if (v.ring.visible) {
        const base = (Math.max(t.length, t.span) / 2) * scale + 10;
        const pulse = sel ? 1 : 1 + Math.sin(this.time * 5 * motion) * 0.08;
        v.ring.position.set(x, y);
        v.ring.scale.set(((base + 6) / 58) * pulse);
        v.ring.tint = sel ? 0xffffff : ui.hintAc === ac.id ? 0x63e6be : 0xfcc419;
        v.ring.alpha = sel ? 0.95 : 0.75;
      }
    }
    for (const [id, v] of this.views) if (!v.seen) this.dropView(id, v);

    // ---------- jet bridges ----------
    this.drawBridges(world, dtReal);

    // ---------- route / highlights ----------
    this.drawRoutes(world, ui);
    this.drawHighlights(world, ui);
    this.drawDrag(ui);

    // ---------- vehicles ----------
    this.vehicles.enabled = settings.vehicles && this.quality !== 'low';
    this.vehicles.update(world, dtReal, this.time, night);

    // ---------- animated scenery ----------
    if (this.art) {
      for (const r of this.art.animated.radar) r.rotation += dtReal * 1.6 * motion;
      for (const r of this.art.animated.turbines) r.rotation += dtReal * 1.1 * motion;
      for (const r of this.art.animated.ferris) r.rotation += dtReal * 0.08 * motion;
      for (const f of this.art.animated.fountains) f.scale.set(1 + Math.sin(this.time * 3) * 0.08 * motion);
      const wind = world.weather === 'storm' ? 1 : world.weather === 'rain' ? 0.7 : 0.4;
      for (const w of this.art.animated.windsocks) {
        w.rotation = 0.3 + Math.sin(this.time * 0.7) * 0.15 * wind;
        w.scale.set(0.6 + wind * 0.5, 1);
      }
    }

    // ---------- lighting ----------
    const nightTint = this.skyTint(minutes);
    this.nightOverlay.tint = nightTint;
    this.nightOverlay.width = W;
    this.nightOverlay.height = H;
    this.nightOverlay.visible = nightTint !== 0xffffff;
    this.staticLights.visible = night > 0.05;
    this.staticLights.alpha = Math.min(1, night * 1.2);
    if (this.staticLights.visible) {
      const rabbit = Math.floor(this.time * 8) % 15;
      for (const a of this.approachLights) a.s.alpha = a.seq === 14 - rabbit ? 1 : 0.35;
    }

    // ---------- weather ----------
    this.updateWeather(world, dtReal, night);
  }

  private skyTint(minutes: number): number {
    const h = minutes / 60;
    const lerpC = (a: number, b: number, t: number) => {
      const ar = (a >> 16) & 255;
      const ag = (a >> 8) & 255;
      const ab = a & 255;
      const br = (b >> 16) & 255;
      const bg = (b >> 8) & 255;
      const bb = b & 255;
      const r = Math.round(ar + (br - ar) * t);
      const g = Math.round(ag + (bg - ag) * t);
      const bl = Math.round(ab + (bb - ab) * t);
      return (r << 16) | (g << 8) | bl;
    };
    const NIGHT = 0x3a4a8a;
    const DUSK = 0xffb48a;
    const DAWN = 0xffd2b0;
    if (h >= 7 && h <= 17.5) return 0xffffff;
    if (h > 17.5 && h <= 19) return lerpC(0xffffff, DUSK, (h - 17.5) / 1.5);
    if (h > 19 && h <= 20.5) return lerpC(DUSK, NIGHT, (h - 19) / 1.5);
    if (h > 20.5 || h < 4.5) return NIGHT;
    if (h >= 4.5 && h < 6) return lerpC(NIGHT, DAWN, (h - 4.5) / 1.5);
    return lerpC(DAWN, 0xffffff, (h - 6) / 1);
  }

  private updateWeather(world: World, dt: number, night: number) {
    const w = world.weather;
    const cloudTarget = w === 'clear' ? 0.12 : w === 'cloudy' ? 0.55 : w === 'rain' ? 0.6 : w === 'storm' ? 0.75 : 0.35;
    const count = w === 'clear' ? 5 : this.clouds.length;
    this.clouds.forEach((c, i) => {
      const target = i < count ? cloudTarget * (w === 'storm' ? 0.85 : 1) : 0;
      c.sprite.alpha += (target - c.sprite.alpha) * Math.min(1, dt * 0.5);
      c.sprite.tint = w === 'storm' ? 0x9aa5b1 : w === 'rain' ? 0xd0d7de : 0xffffff;
      c.shadow.alpha = c.sprite.alpha * 0.22 * (1 - night);
      c.sprite.x += c.vx * dt;
      c.sprite.y += c.vy * dt;
      if (c.sprite.x > 5200) c.sprite.x = -2200;
      if (c.sprite.y > 3800) c.sprite.y = -1800;
      c.shadow.position.set(c.sprite.x + 260, c.sprite.y + 330);
    });
    const W = this.camera.w;
    const H = this.camera.h;
    const rainy = w === 'rain' || w === 'storm';
    const rainAlpha = rainy ? (w === 'storm' ? 0.8 : 0.55) : 0;
    for (const d of this.rainDrops) {
      d.alpha += (rainAlpha - d.alpha) * Math.min(1, dt * 1.5);
      d.visible = d.alpha > 0.02;
      if (!d.visible) continue;
      d.y += (900 + d.scale.y * 400) * dt;
      d.x += 230 * dt;
      if (d.y > H + 40 || d.x > W + 40) {
        d.y = -Math.random() * 200;
        d.x = Math.random() * (W + 300) - 300;
      }
    }
    const fogTarget = w === 'fog' ? 0.42 : w === 'rain' ? 0.08 : w === 'storm' ? 0.12 : 0;
    this.fogSprite.alpha += (fogTarget - this.fogSprite.alpha) * Math.min(1, dt);
    this.fogSprite.width = W;
    this.fogSprite.height = H;
    this.fogSprite.tint = night > 0.5 ? 0x4c5a78 : 0xe9eef3;
    if (w === 'storm') {
      this.lightningT -= dt;
      if (this.lightningT <= 0) this.lightningT = 6 + Math.random() * 9;
      const f = this.lightningT > 5.85 ? (this.lightningT - 5.85) / 0.15 : 0;
      this.flashSprite.alpha = f * 0.5;
    } else this.flashSprite.alpha = 0;
    this.flashSprite.width = W;
    this.flashSprite.height = H;
  }

  private drawBridges(world: World, dt: number) {
    const g = this.bridgeG;
    g.clear();
    const parkedAt = new Map<string, Aircraft>();
    for (const a of world.aircraft) if (a.phase === 'parked' && a.gate) parkedAt.set(a.gate, a);
    for (const gate of AIRPORT.gates) {
      const ac = parkedAt.get(gate.id);
      const target = ac ? 1 : 0;
      const cur = this.bridgeExt[gate.id] ?? 0;
      const next = cur + Math.sign(target - cur) * Math.min(Math.abs(target - cur), dt / 2.5);
      this.bridgeExt[gate.id] = next;
      const dir = gate.side === 'N' ? -1 : 1; // direction from face towards ring
      const sideX = gate.side === 'N' ? 1 : -1; // left side of parked aircraft
      const t = ac ? getType(ac.typeId) : getType('a320');
      const baseX = gate.x + sideX * 44;
      const baseY = gate.faceY + (gate.side === 'N' ? 8 : -8);
      const noseY = gate.faceY + dir * 22;
      const doorX = gate.x + sideX * (t.fuselageWidth / 2 + 1);
      const doorY = noseY + dir * (t.length * 0.12 + 4);
      const restX = gate.x + sideX * 40;
      const restY = gate.faceY + dir * 30;
      const ex = restX + (doorX - restX) * next;
      const ey = restY + (doorY - restY) * next;
      // tunnel
      g.moveTo(baseX, baseY).lineTo(ex + sideX * 5, ey).stroke({ width: 9, color: 0x868e96, cap: 'round' });
      g.moveTo(baseX, baseY).lineTo(ex + sideX * 5, ey).stroke({ width: 6.5, color: 0xdee2e6, cap: 'round' });
      // segment joints
      const mx = (baseX + ex) / 2;
      const my = (baseY + ey) / 2;
      g.circle(mx, my, 2.2).fill({ color: 0xadb5bd });
      // rotunda + cab
      g.circle(baseX, baseY, 7).fill({ color: 0xadb5bd }).circle(baseX, baseY, 7).stroke({ width: 1.2, color: 0x6c757d });
      g.roundRect(ex - 4 + sideX * 2, ey - 5, 8, 10, 2).fill({ color: 0x495057 });
    }
  }

  private routeOf(ac: Aircraft): number[] | null {
    if (ac.path && ['taxiIn', 'taxiOut', 'landing', 'pushback', 'lineup'].includes(ac.phase)) {
      const p = ac.path;
      const pts: number[] = [];
      for (let d = ac.s; d < p.total; d += 14) {
        const pt = pointAt(p, d);
        pts.push(pt.x, pt.y);
      }
      const e = pointAt(p, p.total);
      pts.push(e.x, e.y);
      return pts;
    }
    if (ac.phase === 'approach' && ac.approach) {
      const rw = AIRPORT.runways[ac.approach.runway];
      const pts = [ac.x, ac.y];
      if (ac.approach.stage !== 'final') {
        const e = approachEntry(ac.approach.runway, ac.approach.side);
        pts.push(e.x, e.y);
        pts.push(rw.thresholdX - 2200, rw.y);
      }
      pts.push(rw.touchdownX, rw.y);
      return pts;
    }
    return null;
  }

  private drawRoutes(world: World, ui: RenderUI) {
    const g = this.routeG;
    g.clear();
    const z = this.camera.zoom;
    const phase = (this.time * 40) % 40;
    for (const ac of world.aircraft) {
      const sel = ui.selected === ac.id;
      const moving = ['taxiIn', 'taxiOut', 'pushback'].includes(ac.phase) && ac.v > 1;
      if (!sel && !moving) continue;
      const pts = this.routeOf(ac);
      if (!pts || pts.length < 4) continue;
      const isDep = ['pushback', 'taxiOut', 'lineup'].includes(ac.phase);
      const color = isDep ? 0xff922b : ac.phase === 'approach' ? 0x74c0fc : 0x4dabf7;
      if (sel) {
        // full route: soft wide band + dashed centre
        g.moveTo(pts[0]!, pts[1]!);
        for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i]!, pts[i + 1]!);
        g.stroke({ width: Math.max(6, 10 / z), color, alpha: 0.28, cap: 'round', join: 'round' });
        // destination marker
        const ex = pts[pts.length - 2]!;
        const ey = pts[pts.length - 1]!;
        g.circle(ex, ey, Math.max(8, 12 / z)).fill({ color, alpha: 0.35 });
        g.circle(ex, ey, Math.max(4, 6 / z)).fill({ color: 0xffffff });
      }
      // animated chevrons along the next part of the route
      const maxLen = sel ? 4000 : 240;
      let acc = 0;
      let nextMark = (sel ? phase : phase * 0.6) % 40;
      const size = Math.max(5, 7 / z);
      for (let i = 2; i < pts.length && acc < maxLen; i += 2) {
        const x0 = pts[i - 2]!;
        const y0 = pts[i - 1]!;
        const x1 = pts[i]!;
        const y1 = pts[i + 1]!;
        const L = Math.hypot(x1 - x0, y1 - y0);
        if (L < 0.001) continue;
        const ux = (x1 - x0) / L;
        const uy = (y1 - y0) / L;
        while (nextMark <= acc + L && nextMark < maxLen) {
          const t = nextMark - acc;
          if (nextMark > 30) {
            const cx = x0 + ux * t;
            const cy = y0 + uy * t;
            const fade = sel ? 0.95 : Math.max(0, 1 - nextMark / maxLen);
            g.moveTo(cx - ux * size - uy * size, cy - uy * size + ux * size)
              .lineTo(cx, cy)
              .lineTo(cx - ux * size + uy * size, cy - uy * size - ux * size)
              .stroke({ width: Math.max(1.6, 2.6 / z), color: sel ? 0xffffff : color, alpha: fade, cap: 'round', join: 'round' });
          }
          nextMark += 40;
        }
        acc += L;
      }
    }
  }

  private drawHighlights(world: World, ui: RenderUI) {
    const g = this.hiG;
    g.clear();
    for (const l of this.gateLabelMap.values()) l.visible = false;
    const pick = ui.pick;
    if (!pick) return;
    const ac = world.aircraft.find((a) => a.id === pick.ac);
    if (!ac) return;
    const pulse = 0.55 + Math.sin(this.time * 5) * 0.25;
    const z = this.camera.zoom;
    if (pick.kind === 'gate') {
      for (const gate of AIRPORT.gates) {
        const open = world.config.openGates.includes(gate.id);
        const free = !world.gateRes[gate.id] || world.gateRes[gate.id] === ac.id;
        const fits = gateFits(gate.cat, ac.typeId);
        const ok = open && free && fits;
        const w = { S: 74, M: 92, H: 136, J: 170 }[gate.cat];
        const ringY = gate.side === 'N' ? RING_N_Y : RING_S_Y;
        const y0 = gate.side === 'N' ? ringY + 34 : TERMINAL_S_FACE;
        const y1 = gate.side === 'N' ? TERMINAL_N_FACE : ringY - 34;
        g.roundRect(gate.x - w / 2, y0, w, y1 - y0, 8).fill({ color: ok ? 0x51cf66 : 0x868e96, alpha: ok ? 0.28 * pulse + 0.15 : 0.12 });
        g.roundRect(gate.x - w / 2, y0, w, y1 - y0, 8).stroke({ width: Math.max(2, 3 / z), color: ok ? 0x2f9e44 : 0x868e96, alpha: ok ? 0.95 : 0.4 });
        let lbl = this.gateLabelMap.get(gate.id);
        if (!lbl) {
          lbl = new BitmapText({ text: gate.label, style: { fontFamily: LABEL_FONT, fontSize: 26, fill: 0xffffff, fontWeight: '700' } });
          lbl.anchor.set(0.5);
          this.gateLabels.addChild(lbl);
          this.gateLabelMap.set(gate.id, lbl);
        }
        lbl.visible = true;
        lbl.text = ok ? gate.label : !open ? `${gate.label}
LOCKED` : !free ? `${gate.label}
BUSY` : `${gate.label}
TOO SMALL`;
        lbl.tint = ok ? 0xffffff : 0xced4da;
        lbl.alpha = ok ? 1 : 0.6;
        lbl.scale.set(Math.min(2.4, 0.5 / z));
        lbl.position.set(gate.x, (y0 + y1) / 2);
        if (ok) {
          const stopY = standStopY(gate, getType(ac.typeId).length);
          g.circle(gate.x, stopY, Math.max(5, 8 / z)).fill({ color: 0xffffff, alpha: 0.9 });
        }
      }
    } else {
      for (const rid of ['R1', 'R2'] as RunwayId[]) {
        const r = AIRPORT.runways[rid];
        const open = world.config.runways.includes(rid);
        const busy = !!world.runways[rid].owner;
        g.roundRect(r.x0 - 10, r.y - r.width / 2 - 10, r.x1 - r.x0 + 20, r.width + 20, 16).fill({ color: open ? 0x4dabf7 : 0x868e96, alpha: open ? 0.18 + 0.15 * pulse : 0.1 });
        g.roundRect(r.x0 - 10, r.y - r.width / 2 - 10, r.x1 - r.x0 + 20, r.width + 20, 16).stroke({ width: Math.max(2, 3 / z), color: open ? (busy ? 0xfcc419 : 0x339af0) : 0x868e96, alpha: 0.95 });
        if (pick.purpose === 'taxi') {
          const hp = AIRPORT.nodes[r.holdNode]!;
          g.circle(hp.x, hp.y, Math.max(16, 22 / z)).fill({ color: 0xff922b, alpha: 0.35 * pulse + 0.2 });
          g.circle(hp.x, hp.y, Math.max(6, 8 / z)).fill({ color: 0xffffff });
        } else {
          const e = approachEntry(rid, ac.y < r.y ? -1 : 1);
          g.moveTo(e.x, e.y).lineTo(r.thresholdX - 2200, r.y).lineTo(r.touchdownX, r.y).stroke({ width: Math.max(2, 3 / z), color: 0x74c0fc, alpha: 0.6 });
        }
        let lbl = this.gateLabelMap.get(rid);
        if (!lbl) {
          lbl = new BitmapText({ text: r.name, style: { fontFamily: LABEL_FONT, fontSize: 34, fill: 0xffffff, fontWeight: '700' } });
          lbl.anchor.set(0.5);
          this.gateLabels.addChild(lbl);
          this.gateLabelMap.set(rid, lbl);
        }
        lbl.visible = true;
        lbl.text = open ? `RWY ${r.name}${busy ? ' · BUSY' : ''}` : `RWY ${r.name} · CLOSED`;
        lbl.scale.set(Math.min(3, 0.55 / z));
        lbl.position.set(1550, r.y);
      }
    }
  }

  private drawDrag(ui: RenderUI) {
    const g = this.dragG;
    g.clear();
    if (!ui.dragPts || ui.dragPts.length < 4) return;
    const z = this.camera.zoom;
    const p = ui.dragPts;
    g.moveTo(p[0]!, p[1]!);
    for (let i = 2; i < p.length; i += 2) g.lineTo(p[i]!, p[i + 1]!);
    g.stroke({ width: Math.max(4, 6 / z), color: 0xffffff, alpha: 0.85, cap: 'round', join: 'round' });
    for (const id of ui.dragSnap) {
      const n = AIRPORT.nodes[id];
      if (!n) continue;
      g.circle(n.x, n.y, Math.max(8, 12 / z)).fill({ color: 0x51cf66, alpha: 0.6 });
      g.circle(n.x, n.y, Math.max(8, 12 / z)).stroke({ width: Math.max(2, 2.5 / z), color: 0xffffff });
    }
  }

  private adaptQuality(dt: number) {
    if (dt <= 0 || dt > 0.5) return;
    const fps = 1 / dt;
    this.fpsAvg = this.fpsAvg * 0.95 + fps * 0.05;
    if (this.fpsAvg < 32 && this.quality !== 'low') {
      this.lowFrames++;
      if (this.lowFrames > 240) {
        this.lowFrames = 0;
        this.quality = this.quality === 'high' ? 'medium' : 'low';
        const res = this.quality === 'medium' ? Math.min(1.5, window.devicePixelRatio || 1) : 1;
        this.app.renderer.resolution = res;
        this.resize();
        this.onQualityDrop?.(this.quality);
      }
    } else this.lowFrames = 0;
  }

  /** Aircraft under a screen point (airborne first). */
  pickAircraft(world: World, sx: number, sy: number): Aircraft | null {
    const p = this.camera.screenToWorld(sx, sy);
    const z = this.camera.zoom;
    let best: Aircraft | null = null;
    let bestScore = Infinity;
    for (const ac of world.aircraft) {
      if (ac.phase === 'departed' || ac.phase === 'diverted') continue;
      const t = getType(ac.typeId);
      const scale = 1 + ac.alt * 0.45;
      const v = this.views.get(ac.id);
      const x = v ? v.root.x : ac.x;
      const y = v ? v.root.y : ac.y;
      const r = (Math.max(t.length, t.span) / 2) * scale * 0.75 + 16 / z;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < r) {
        const score = d / r - ac.alt * 0.2;
        if (score < bestScore) {
          bestScore = score;
          best = ac;
        }
      }
    }
    return best;
  }

  pickGate(sx: number, sy: number): string | null {
    const p = this.camera.screenToWorld(sx, sy);
    for (const gate of AIRPORT.gates) {
      const w = { S: 74, M: 92, H: 136, J: 170 }[gate.cat];
      const y0 = gate.side === 'N' ? RING_N_Y : TERMINAL_S_FACE;
      const y1 = gate.side === 'N' ? TERMINAL_N_FACE : RING_S_Y;
      if (p.x >= gate.x - w / 2 && p.x <= gate.x + w / 2 && p.y >= y0 && p.y <= y1) return gate.id;
    }
    return null;
  }

  pickRunway(sx: number, sy: number): RunwayId | null {
    const p = this.camera.screenToWorld(sx, sy);
    for (const r of Object.values(AIRPORT.runways)) {
      const pad = 60 + 20 / this.camera.zoom;
      if (p.x >= r.x0 - 1200 && p.x <= r.x1 && Math.abs(p.y - r.y) < r.width / 2 + pad) return r.id;
      const hp = AIRPORT.nodes[r.holdNode]!;
      if (Math.hypot(p.x - hp.x, p.y - hp.y) < 80) return r.id;
    }
    return null;
  }

  aircraftScreen(id: string): { x: number; y: number } | null {
    const v = this.views.get(id);
    if (!v) return null;
    return this.camera.worldToScreen(v.root.x, v.root.y);
  }

  resetVehicles() {
    this.vehicles?.reset();
  }

  destroy() {
    this.ready = false;
    this.vehicles?.reset();
    this.bank?.destroy();
    this.app?.destroy(true, { children: true });
  }
}
