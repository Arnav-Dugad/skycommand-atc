export class Camera {
  x = 1550;
  y = 1100;
  zoom = 0.4;
  w = 1;
  h = 1;
  minZoom = 0.12;
  maxZoom = 3;
  private tx: number | null = null;
  private ty: number | null = null;
  private tz: number | null = null;
  follow: (() => { x: number; y: number } | null) | null = null;
  bounds = { x0: -1600, y0: -1500, x1: 4800, y1: 3600 };

  setViewport(w: number, h: number) {
    this.w = Math.max(1, w);
    this.h = Math.max(1, h);
    // keep at least most of the field visible when fully zoomed out
    this.minZoom = Math.max(0.08, Math.min(this.w / 6200, this.h / 4800));
    this.clamp();
  }

  stop() {
    this.tx = this.ty = this.tz = null;
    this.follow = null;
  }

  fitAirport() {
    this.stop();
    const z = Math.min(this.w / 3600, this.h / 2500);
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, z));
    this.x = 1550;
    this.y = 1100;
    this.clamp();
  }

  /** zoom so that a sensible part of the airport is visible on small screens */
  defaultView() {
    this.stop();
    const portrait = this.h > this.w;
    const z = portrait ? Math.min(this.w / 1500, this.h / 2200) : Math.min(this.w / 3300, this.h / 2400);
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, z));
    this.x = portrait ? 1400 : 1550;
    this.y = 1100;
    this.clamp();
  }

  screenToWorld(sx: number, sy: number) {
    return { x: this.x + (sx - this.w / 2) / this.zoom, y: this.y + (sy - this.h / 2) / this.zoom };
  }

  worldToScreen(wx: number, wy: number) {
    return { x: (wx - this.x) * this.zoom + this.w / 2, y: (wy - this.y) * this.zoom + this.h / 2 };
  }

  pan(dsx: number, dsy: number) {
    this.follow = null;
    this.tx = this.ty = null;
    this.x -= dsx / this.zoom;
    this.y -= dsy / this.zoom;
    this.clamp();
  }

  zoomAt(factor: number, sx: number, sy: number) {
    this.tz = null;
    const before = this.screenToWorld(sx, sy);
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * factor));
    const after = this.screenToWorld(sx, sy);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
    this.clamp();
  }

  focus(x: number, y: number, zoom?: number) {
    this.tx = x;
    this.ty = y;
    if (zoom !== undefined) this.tz = Math.max(this.minZoom, Math.min(this.maxZoom, zoom));
  }

  update(dt: number, instant = false) {
    const k = instant ? 1 : 1 - Math.exp(-dt * 6);
    if (this.follow) {
      const p = this.follow();
      if (p) {
        this.tx = p.x;
        this.ty = p.y;
      } else this.follow = null;
    }
    if (this.tx !== null && this.ty !== null) {
      this.x += (this.tx - this.x) * k;
      this.y += (this.ty - this.y) * k;
      if (!this.follow && Math.abs(this.tx - this.x) < 0.5 && Math.abs(this.ty - this.y) < 0.5) this.tx = this.ty = null;
    }
    if (this.tz !== null) {
      this.zoom += (this.tz - this.zoom) * k;
      if (Math.abs(this.tz - this.zoom) < 0.002) this.tz = null;
    }
    this.clamp();
  }

  clamp() {
    const halfW = this.w / 2 / this.zoom;
    const halfH = this.h / 2 / this.zoom;
    const b = this.bounds;
    if (b.x1 - b.x0 < halfW * 2) this.x = (b.x0 + b.x1) / 2;
    else this.x = Math.max(b.x0 + halfW, Math.min(b.x1 - halfW, this.x));
    if (b.y1 - b.y0 < halfH * 2) this.y = (b.y0 + b.y1) / 2;
    else this.y = Math.max(b.y0 + halfH, Math.min(b.y1 - halfH, this.y));
  }
}
