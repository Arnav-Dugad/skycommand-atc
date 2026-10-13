/**
 * Procedural audio: every sound effect and the ambient soundtrack are synthesised
 * with the WebAudio API, so there are no audio assets to license or download.
 */

type Sfx =
  | 'tap'
  | 'select'
  | 'confirm'
  | 'error'
  | 'coin'
  | 'touchdown'
  | 'takeoff'
  | 'radio'
  | 'achievement'
  | 'warning'
  | 'dayEnd'
  | 'open'
  | 'close'
  | 'pushback';

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private reverb!: ConvolverNode;
  private noise!: AudioBuffer;
  private musicTimer: number | null = null;
  private musicStep = 0;
  private nextNoteTime = 0;
  private chordIdx = 0;
  private padVoices: { osc: OscillatorNode[]; gain: GainNode }[] = [];
  volumes = { master: 0.8, sfx: 0.8, music: 0.35 };
  musicOn = true;
  private lastPlayed: Record<string, number> = {};

  /** Must be called from a user gesture. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.musicBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus.connect(this.master);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(2.6, 2.2);
    const rv = ctx.createGain();
    rv.gain.value = 0.35;
    this.reverb.connect(rv);
    rv.connect(this.master);
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.applyVolumes();
    if (this.musicOn) this.startMusic();
  }

  private impulse(seconds: number, decay: number) {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const ch = buf.getChannelData(c);
      for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  setVolumes(master: number, sfx: number, music: number, musicOn: boolean) {
    this.volumes = { master, sfx, music };
    const wasOn = this.musicOn;
    this.musicOn = musicOn;
    this.applyVolumes();
    if (this.ctx) {
      if (musicOn && !wasOn) this.startMusic();
      if (!musicOn && wasOn) this.stopMusic();
    }
  }

  private applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.volumes.master, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.volumes.sfx, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.musicOn ? this.volumes.music * 0.5 : 0, t, 0.3);
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, when = 0, glide?: number, send = 0.2) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (glide) o.frequency.exponentialRampToValueAtTime(glide, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.sfxBus);
    if (send > 0) {
      const s = ctx.createGain();
      s.gain.value = send;
      g.connect(s);
      s.connect(this.reverb);
    }
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private whoosh(dur: number, from: number, to: number, vol: number, when = 0) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 0.8;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.sfxBus);
    src.start(t);
    src.stop(t + dur + 0.1);
  }

  play(name: Sfx) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = performance.now();
    if (now - (this.lastPlayed[name] ?? 0) < 60) return;
    this.lastPlayed[name] = now;
    switch (name) {
      case 'tap':
        this.tone(880, 0.06, 'sine', 0.08, 0, 1100, 0);
        break;
      case 'select':
        this.tone(660, 0.08, 'triangle', 0.12);
        this.tone(990, 0.1, 'sine', 0.08, 0.05);
        break;
      case 'open':
        this.tone(520, 0.12, 'sine', 0.08, 0, 780, 0.1);
        break;
      case 'close':
        this.tone(700, 0.1, 'sine', 0.07, 0, 460, 0.1);
        break;
      case 'confirm':
        this.tone(523.25, 0.12, 'triangle', 0.14);
        this.tone(659.25, 0.12, 'triangle', 0.12, 0.07);
        this.tone(783.99, 0.22, 'triangle', 0.12, 0.14);
        break;
      case 'error':
        this.tone(220, 0.16, 'square', 0.06, 0, 170, 0);
        this.tone(196, 0.2, 'square', 0.05, 0.1, 150, 0);
        break;
      case 'coin':
        this.tone(1318.5, 0.08, 'square', 0.05, 0, undefined, 0.1);
        this.tone(1760, 0.25, 'square', 0.05, 0.07, undefined, 0.2);
        break;
      case 'touchdown':
        this.whoosh(0.9, 300, 120, 0.25);
        this.tone(90, 0.18, 'sine', 0.2, 0.02, 60, 0);
        break;
      case 'takeoff':
        this.whoosh(3.2, 200, 1600, 0.22);
        this.whoosh(3.6, 120, 500, 0.16, 0.2);
        break;
      case 'pushback':
        this.tone(140, 0.4, 'sawtooth', 0.03, 0, 160, 0);
        break;
      case 'radio': {
        this.whoosh(0.08, 3000, 2500, 0.06);
        this.tone(1400, 0.05, 'square', 0.03, 0.02, undefined, 0);
        break;
      }
      case 'warning':
        this.tone(880, 0.14, 'square', 0.06, 0, undefined, 0);
        this.tone(880, 0.14, 'square', 0.06, 0.22, undefined, 0);
        break;
      case 'achievement':
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.12, i * 0.09, undefined, 0.35));
        this.tone(1318.5, 0.6, 'sine', 0.08, 0.38, undefined, 0.5);
        break;
      case 'dayEnd':
        [392, 493.88, 587.33, 783.99, 987.77].forEach((f, i) => this.tone(f, 0.6, 'sine', 0.1, i * 0.12, undefined, 0.5));
        break;
    }
  }

  // ---------------- generative ambient music ----------------
  private chords = [
    [261.63, 329.63, 392.0, 493.88], // Cmaj7
    [220.0, 261.63, 329.63, 392.0], // Am7
    [174.61, 220.0, 261.63, 329.63], // Fmaj7
    [196.0, 246.94, 293.66, 392.0], // G6/add
  ];
  private scale = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66];

  private startMusic() {
    if (!this.ctx || this.musicTimer !== null) return;
    this.nextNoteTime = this.ctx.currentTime + 0.2;
    this.musicStep = 0;
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 120);
  }

  private stopMusic() {
    if (this.musicTimer !== null) window.clearInterval(this.musicTimer);
    this.musicTimer = null;
    const t = this.ctx?.currentTime ?? 0;
    for (const v of this.padVoices) {
      v.gain.gain.setTargetAtTime(0.0001, t, 0.4);
      v.osc.forEach((o) => o.stop(t + 2));
    }
    this.padVoices = [];
  }

  private pad(freqs: number[], when: number, dur: number) {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(0.05, when + dur * 0.35);
    g.gain.linearRampToValueAtTime(0.0001, when + dur);
    const oscs: OscillatorNode[] = [];
    for (const f of freqs) {
      for (const det of [-6, 6]) {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = f / 2;
        o.detune.value = det;
        o.connect(lp);
        o.start(when);
        o.stop(when + dur + 0.1);
        oscs.push(o);
      }
    }
    lp.connect(g);
    g.connect(this.musicBus);
    const s = ctx.createGain();
    s.gain.value = 0.6;
    g.connect(s);
    s.connect(this.reverb);
    this.padVoices.push({ osc: oscs, gain: g });
    if (this.padVoices.length > 3) this.padVoices.shift();
  }

  private pluck(freq: number, when: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.045, when + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 1.4);
    o.connect(g);
    g.connect(this.musicBus);
    const s = ctx.createGain();
    s.gain.value = 0.8;
    g.connect(s);
    s.connect(this.reverb);
    o.start(when);
    o.stop(when + 1.5);
  }

  private scheduleMusic() {
    const ctx = this.ctx;
    if (!ctx) return;
    const beat = 0.6;
    while (this.nextNoteTime < ctx.currentTime + 0.5) {
      const t = this.nextNoteTime;
      if (this.musicStep % 16 === 0) {
        const ch = this.chords[this.chordIdx % this.chords.length]!;
        this.pad(ch, t, beat * 16 + 1);
        this.chordIdx++;
      }
      const r = Math.random();
      if (r < (this.musicStep % 4 === 0 ? 0.55 : 0.22)) {
        const note = this.scale[Math.floor(Math.random() * this.scale.length)]!;
        this.pluck(note, t);
      }
      this.musicStep++;
      this.nextNoteTime += beat;
    }
  }
}

export const audio = new AudioEngine();

export function haptic(ms = 12) {
  try {
    if ('vibrate' in navigator) navigator.vibrate(ms);
  } catch {
    /* ignore */
  }
}
