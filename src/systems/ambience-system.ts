// Ambient soundscape, all synthesized (no audio files), driven by Game.env:
// - beds: stream babble (positional, follows the nearest point of the stream),
//   rain by intensity, gusting wind, daytime insect buzz;
// - one-shots on randomised timers: morning birds, night crickets, an owl,
//   a splash when something drops into the stream.
// Uses its own small AudioContext so the shared AudioSystem stays untouched.
// Gains are eased with setTargetAtTime a few times a second; nothing allocates
// per frame (one-shots create a handful of WebAudio nodes when they fire).

import { createSystem, Vector3 } from '@iwsdk/core';
import type { GameEvent } from '../game/game.js';
import { STREAM } from '../game/world-layout.js';
import { inStream } from './nature-system.js';
import { getGame } from './shared.js';

/** Stream babble is audible to about this many metres. */
const STREAM_RANGE = 22;

export class AmbienceSystem extends createSystem({}) {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private white: AudioBuffer | null = null;
  private brown: AudioBuffer | null = null;
  private started = false;

  private streamGain!: GainNode;
  private streamPanner!: PannerNode;
  private rainGain!: GainNode;
  private rainLow!: GainNode;
  private windGain!: GainNode;
  private windFilter!: BiquadFilterNode;
  private insectGain!: GainNode;

  private control = 0;
  private birdTimer = 2;
  private cricketTimer = 1;
  private owlTimer = 30;
  private gustPhase = Math.random() * 10;
  private time = 0;
  private head = new Vector3();
  private fwd = new Vector3();
  private lastDropId = 0;

  init(): void {
    const game = getGame(this.world);
    this.lastDropId = game.drops.reduce((m, d) => Math.max(m, d.id), 0);
    const unlock = () => this.ensure();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    this.cleanupFuncs.push(
      () => window.removeEventListener('pointerdown', unlock),
      () => window.removeEventListener('keydown', unlock),
      this.world.visibilityState.subscribe(() => this.ensure()),
      game.on((e: GameEvent) => e.type === 'drops' && this.onDrops()),
      () => void this.ctx?.close(),
    );
  }

  private ensure(): void {
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
        this.out = this.ctx.createGain();
        this.out.gain.value = 0.55;
        this.out.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      if (!this.started && this.ctx.state === 'running') this.startBeds();
    } catch {
      // No audio: the game still plays.
    }
  }

  private noiseBuffers(ctx: AudioContext): void {
    const len = ctx.sampleRate * 4;
    this.white = ctx.createBuffer(1, len, ctx.sampleRate);
    this.brown = ctx.createBuffer(1, len, ctx.sampleRate);
    const w = this.white.getChannelData(0);
    const b = this.brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      w[i] = Math.random() * 2 - 1;
      last = (last + 0.02 * w[i]) / 1.02;
      b[i] = last * 3.5;
    }
  }

  /** A looping noise source started at a random offset (so beds never line up). */
  private loop(buf: AudioBuffer): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    src.start(0, Math.random() * buf.duration);
    return src;
  }

  private gain(v: number): GainNode {
    const g = this.ctx!.createGain();
    g.gain.value = v;
    return g;
  }

  private filter(type: BiquadFilterType, freq: number, q = 1): BiquadFilterNode {
    const f = this.ctx!.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  /** A slow random wobble on an AudioParam, so loops never sound static. */
  private wobble(param: AudioParam, rate: number, depth: number): void {
    const ctx = this.ctx!;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = rate * (0.8 + Math.random() * 0.4);
    const g = this.gain(depth);
    lfo.connect(g).connect(param);
    lfo.start();
  }

  private startBeds(): void {
    const ctx = this.ctx!;
    const out = this.out!;
    this.started = true;
    this.noiseBuffers(ctx);
    const white = this.white!;
    const brown = this.brown!;

    // Stream: two band-passed layers (babble + hiss) through a positional panner.
    this.streamPanner = ctx.createPanner();
    this.streamPanner.panningModel = 'equalpower';
    this.streamPanner.distanceModel = 'inverse';
    this.streamPanner.refDistance = 2;
    this.streamPanner.rolloffFactor = 1.2;
    this.streamGain = this.gain(0);
    const babble = this.filter('bandpass', 700, 0.8);
    this.wobble(babble.frequency, 0.7, 250);
    const babble2 = this.filter('bandpass', 1900, 1.5);
    this.wobble(babble2.frequency, 1.3, 500);
    this.loop(brown).connect(babble).connect(this.streamGain);
    this.loop(white).connect(babble2).connect(this.gain(0.25)).connect(this.streamGain);
    this.streamGain.connect(this.streamPanner).connect(out);

    // Rain: hiss + a soft low patter for heavy rain.
    this.rainGain = this.gain(0);
    this.loop(white).connect(this.filter('highpass', 1800, 0.5)).connect(this.rainGain).connect(out);
    this.rainLow = this.gain(0);
    this.loop(brown).connect(this.filter('lowpass', 500)).connect(this.rainLow).connect(out);

    // Wind: brown noise through a moving low-pass; gusts drive gain and cutoff.
    this.windGain = this.gain(0);
    this.windFilter = this.filter('lowpass', 400, 0.7);
    this.loop(brown).connect(this.windFilter).connect(this.windGain).connect(out);

    // Daytime insects: a narrow high band, amplitude-modulated at a buzz rate.
    this.insectGain = this.gain(0);
    const buzz = this.gain(0.5);
    const am = ctx.createOscillator();
    am.frequency.value = 28;
    am.connect(this.gain(0.5)).connect(buzz.gain);
    am.start();
    const band = this.filter('bandpass', 5200, 8);
    this.wobble(band.frequency, 0.05, 600);
    this.loop(white).connect(band).connect(buzz).connect(this.insectGain).connect(out);
  }

  // ----------------------------------------------------------- one-shots

  /** Panner at a random spot around the listener, `r` m away. */
  private around(r: number): AudioNode {
    const p = this.ctx!.createPanner();
    p.panningModel = 'equalpower';
    p.refDistance = 3;
    const a = Math.random() * Math.PI * 2;
    p.positionX.value = this.head.x + Math.cos(a) * r;
    p.positionY.value = this.head.y + 2 + Math.random() * 6;
    p.positionZ.value = this.head.z + Math.sin(a) * r;
    p.connect(this.out!);
    return p;
  }

  private chirp(dest: AudioNode, t0: number, f0: number, f1: number, dur: number, vol: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + dur * 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(dest);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  /** A bird phrase: a few rising/falling whistles with a per-bird voice. */
  private bird(): void {
    const ctx = this.ctx!;
    const dest = this.around(6 + Math.random() * 14);
    const base = 2200 + Math.random() * 2200;
    const notes = 2 + Math.floor(Math.random() * 5);
    const style = Math.random();
    let t = ctx.currentTime + 0.05;
    for (let i = 0; i < notes; i++) {
      const dur = 0.06 + Math.random() * 0.14;
      const f0 = base * (0.85 + Math.random() * 0.3);
      const f1 = style < 0.5 ? f0 * (1.2 + Math.random() * 0.4) : f0 * (0.6 + Math.random() * 0.2);
      this.chirp(dest, t, f0, f1, dur, 0.05 + Math.random() * 0.05);
      t += dur + 0.03 + Math.random() * 0.12;
    }
  }

  private cricket(): void {
    const ctx = this.ctx!;
    const dest = this.around(4 + Math.random() * 10);
    const f = 4000 + Math.random() * 900;
    let t = ctx.currentTime + 0.02;
    const pulses = 3 + Math.floor(Math.random() * 3);
    const trains = 2 + Math.floor(Math.random() * 4);
    for (let k = 0; k < trains; k++) {
      for (let i = 0; i < pulses; i++) {
        this.chirp(dest, t, f, f * 0.98, 0.025, 0.03);
        t += 0.045;
      }
      t += 0.25 + Math.random() * 0.2;
    }
  }

  private owl(): void {
    const ctx = this.ctx!;
    const dest = this.around(18 + Math.random() * 15);
    const lp = this.filter('lowpass', 900);
    lp.connect(dest);
    let t = ctx.currentTime + 0.05;
    const f = 340 + Math.random() * 60;
    // Hoo ... hoo-hoo
    this.chirp(lp, t, f, f * 0.92, 0.5, 0.12);
    t += 0.9;
    this.chirp(lp, t, f * 1.02, f * 0.95, 0.25, 0.09);
    t += 0.35;
    this.chirp(lp, t, f, f * 0.9, 0.45, 0.1);
  }

  private splash(x: number, z: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.started || ctx.state !== 'running') return;
    const p = ctx.createPanner();
    p.panningModel = 'equalpower';
    p.positionX.value = x;
    p.positionY.value = 0;
    p.positionZ.value = z;
    p.connect(this.out!);
    const src = ctx.createBufferSource();
    src.buffer = this.white;
    const f = this.filter('bandpass', 1400, 0.7);
    f.frequency.setValueAtTime(2200, ctx.currentTime);
    f.frequency.exponentialRampToValueAtTime(500, ctx.currentTime + 0.35);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
    src.connect(f).connect(g).connect(p);
    src.start(ctx.currentTime, Math.random() * 2, 0.5);
    this.chirp(p, ctx.currentTime + 0.05, 500, 1300, 0.12, 0.08); // the "plop"
  }

  private onDrops(): void {
    for (const d of getGame(this.world).drops) {
      if (d.id <= this.lastDropId) continue;
      this.lastDropId = d.id;
      if (inStream(d.x, d.z)) this.splash(d.x, d.z);
    }
  }

  // ----------------------------------------------------------- per frame

  /** Nearest point on the stream polyline to the listener → panner position. */
  private placeStream(): number {
    let best = Infinity;
    let bx = 0;
    let bz = 0;
    for (let i = 0; i < STREAM.length - 1; i++) {
      const [ax, az] = STREAM[i];
      const [cx, cz] = STREAM[i + 1];
      const dx = cx - ax;
      const dz = cz - az;
      const t = Math.max(0, Math.min(1, ((this.head.x - ax) * dx + (this.head.z - az) * dz) / (dx * dx + dz * dz || 1)));
      const px = ax + dx * t;
      const pz = az + dz * t;
      const d = Math.hypot(this.head.x - px, this.head.z - pz);
      if (d < best) {
        best = d;
        bx = px;
        bz = pz;
      }
    }
    const t = this.ctx!.currentTime;
    this.streamPanner.positionX.setTargetAtTime(bx, t, 0.3);
    this.streamPanner.positionY.setTargetAtTime(0, t, 0.3);
    this.streamPanner.positionZ.setTargetAtTime(bz, t, 0.3);
    return best;
  }

  update(delta: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.started || ctx.state !== 'running') return;
    this.time += delta;

    // Listener follows the head.
    this.camera.getWorldPosition(this.head);
    this.camera.getWorldDirection(this.fwd);
    const L = ctx.listener;
    if (L.positionX) {
      L.positionX.value = this.head.x;
      L.positionY.value = this.head.y;
      L.positionZ.value = this.head.z;
      L.forwardX.value = this.fwd.x;
      L.forwardY.value = this.fwd.y;
      L.forwardZ.value = this.fwd.z;
      L.upX.value = 0;
      L.upY.value = 1;
      L.upZ.value = 0;
    }

    const env = getGame(this.world).env;
    const h = env.hour;
    const day = 1 - env.night;
    const calm = 1 - Math.min(1, env.rain * 1.5);

    // ---- beds, eased a few times a second
    if ((this.control -= delta) <= 0) {
      this.control = 0.25;
      const t = ctx.currentTime;
      const dist = this.placeStream();
      this.streamGain.gain.setTargetAtTime(dist < STREAM_RANGE ? 0.6 * (1 - dist / STREAM_RANGE) + 0.05 : 0, t, 0.5);
      // Under a roof the hiss softens and the low patter of drops on leaves and wood takes over.
      const shade = getGame(this.world).shelterShade;
      this.rainGain.gain.setTargetAtTime(env.rain * 0.28 * (1 - 0.6 * shade), t, 1);
      this.rainLow.gain.setTargetAtTime((Math.max(0, env.rain - 0.5) * 0.35) + env.rain * 0.3 * shade, t, 1);
      // Gusts: two slow sines multiplied, so peaks come irregularly.
      this.gustPhase += 0.25;
      const g = Math.max(0, Math.sin(this.gustPhase * 0.29) * Math.sin(this.gustPhase * 0.113 + 2));
      const wind = 0.03 + env.windStrength * (0.1 + 0.25 * g);
      this.windGain.gain.setTargetAtTime(wind, t, 0.8);
      this.windFilter.frequency.setTargetAtTime(300 + env.windStrength * 300 + g * 700, t, 0.8);
      const insects = h > 9 && h < 18.5 ? Math.min(1, (h - 9) / 1.5, (18.5 - h) / 1.5) : 0;
      this.insectGain.gain.setTargetAtTime(insects * calm * 0.035, t, 2);
    }

    // ---- one-shots
    const dawn = h > 4.8 && h < 10 ? 1 : 0;
    if ((this.birdTimer -= delta) <= 0) {
      // Dawn chorus: frequent; daytime: occasional; none at night or in heavy rain.
      const rate = (dawn ? 1 : 0.25) * day * calm;
      this.birdTimer = rate > 0.05 ? (1.5 + Math.random() * 5) / rate : 4;
      if (rate > 0.05) this.bird();
    }
    if ((this.cricketTimer -= delta) <= 0) {
      this.cricketTimer = 0.6 + Math.random() * 2.5;
      if (env.night > 0.6 && env.rain < 0.3) this.cricket();
    }
    if ((this.owlTimer -= delta) <= 0) {
      this.owlTimer = 25 + Math.random() * 50;
      if (env.night > 0.8 && env.rain < 0.3) this.owl();
    }
  }
}
