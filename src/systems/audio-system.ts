// Procedural audio feedback (no asset files): short synthesized cues driven by
// game events, plus a quiet looping wind bed. The AudioContext is created
// lazily and resumed on the first user gesture / XR session start.

import { createSystem, Vector3 } from '@iwsdk/core';
import { contactGain, contactProfile } from '../game/contact.js';
import type { Material } from '../game/items.js';
import type { GameEvent } from '../game/game.js';
import { getGame } from './shared.js';

type Wave = OscillatorType;

export class AudioSystem extends createSystem({}) {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private windStarted = false;
  private noise: AudioBuffer | null = null;
  private crackleTimer = 0;
  private lastHeat = 0;
  private lastStage = '';
  private ear = new Vector3();
  private fwd = new Vector3();

  init(): void {
    const game = getGame(this.world);
    const unlock = () => this.ensure();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    this.cleanupFuncs.push(
      () => window.removeEventListener('pointerdown', unlock),
      () => window.removeEventListener('keydown', unlock),
      this.world.visibilityState.subscribe(() => this.ensure()),
      game.on((e: GameEvent) => this.onEvent(e)),
    );
  }

  private ensure(): AudioContext | null {
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return null;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.5;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      if (!this.windStarted && this.ctx.state === 'running') this.startWind();
    } catch {
      return null;
    }
    return this.ctx;
  }

  private startWind(): void {
    const ctx = this.ctx!;
    this.windStarted = true;
    const len = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; // brown noise
      d[i] = last * 3.5;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    const gain = ctx.createGain();
    gain.gain.value = 0.18;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.11;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 180;
    lfo.connect(lfoGain).connect(filter.frequency);
    src.connect(filter).connect(gain).connect(this.master!);
    src.start();
    lfo.start();
  }

  private tone(freq: number, dur: number, type: Wave = 'sine', vol = 0.25, delay = 0, slideTo?: number, out?: AudioNode): void {
    const ctx = this.ensure();
    if (!ctx || !this.master || ctx.state !== 'running') return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(out ?? this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /** A short filtered noise burst: crackle (high, quiet) or saw scrape (mid). */
  private burst(freq: number, dur: number, vol: number, out?: AudioNode, delay = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || ctx.state !== 'running') return;
    if (!this.noise) {
      this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    const g = ctx.createGain();
    const t0 = ctx.currentTime + delay;
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(out ?? this.master);
    src.start(t0, Math.random() * 0.5, dur + 0.02);
  }

  /**
   * Two materials meeting at (x, y, z): the sound comes from that point
   * (PannerNode), with randomised pitch so repeated hits never sound identical.
   */
  private contact(a: Material, b: Material, x: number, y: number, z: number, strength: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || ctx.state !== 'running') return;
    const prof = contactProfile(a, b);
    const vol = contactGain(prof, strength);
    if (vol < 0.02) return;
    const pan = ctx.createPanner();
    pan.panningModel = 'equalpower';
    pan.distanceModel = 'inverse';
    pan.refDistance = 1;
    pan.rolloffFactor = 1.2;
    pan.positionX.value = x;
    pan.positionY.value = y;
    pan.positionZ.value = z;
    pan.connect(this.master);
    const p = prof.pitch * (0.85 + Math.random() * 0.3);
    switch (prof.sound) {
      case 'click':
        this.burst(p, 0.035, vol, pan);
        this.tone(p * 0.6, 0.04, 'triangle', vol * 0.3, 0, undefined, pan);
        break;
      case 'crack':
        this.burst(p, 0.07, vol, pan);
        this.burst(p * 0.4, 0.12, vol * 0.6, pan);
        break;
      case 'knap':
        this.burst(p, 0.03, vol, pan);
        this.tone(p * 0.55, 0.06, 'triangle', vol * 0.35, 0, p * 0.4, pan);
        break;
      case 'thud':
        this.tone(p, 0.14, 'sine', vol, 0, p * 0.6, pan);
        this.burst(p * 3, 0.08, vol * 0.4, pan);
        break;
      case 'chop':
        this.burst(p * 1.7, 0.09, vol, pan);
        this.tone(p * 0.5, 0.08, 'square', vol * 0.3, 0, p * 0.3, pan);
        break;
      case 'knock':
        this.tone(p, 0.07, 'triangle', vol * 0.6, 0, p * 0.8, pan);
        this.tone(p * 1.5, 0.05, 'triangle', vol * 0.3, 0.012, undefined, pan);
        break;
      case 'rustle':
        for (let i = 0; i < 4; i++) this.burst(p * (0.8 + Math.random() * 0.5), 0.05, vol * (0.5 + Math.random() * 0.5), pan, i * 0.045);
        break;
      case 'squish':
        this.burst(p, 0.16, vol, pan);
        this.tone(p * 0.5, 0.12, 'sine', vol * 0.3, 0, p * 0.3, pan);
        break;
      case 'splash':
        this.burst(p, 0.3, vol, pan);
        this.burst(p * 2.5, 0.18, vol * 0.5, pan, 0.03);
        break;
      case 'scrape':
        this.burst(p, 0.18, vol * 0.7, pan);
        break;
      case 'clink':
        this.tone(p, 0.12, 'sine', vol * 0.5, 0, p * 0.97, pan);
        break;
      default:
        break;
    }
  }

  /** Keep the audio listener at your head so contact sounds come from where they happen. */
  private updateListener(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.camera.getWorldPosition(this.ear);
    this.camera.getWorldDirection(this.fwd);
    const l = ctx.listener;
    if (l.positionX) {
      l.positionX.value = this.ear.x;
      l.positionY.value = this.ear.y;
      l.positionZ.value = this.ear.z;
      l.forwardX.value = this.fwd.x;
      l.forwardY.value = this.fwd.y;
      l.forwardZ.value = this.fwd.z;
      l.upX.value = 0;
      l.upY.value = 1;
      l.upZ.value = 0;
    }
  }

  update(delta: number): void {
    this.updateListener();
    const fire = getGame(this.world).fire;
    if (fire.heat > this.lastHeat + 0.004) this.burst(900 + fire.heat * 900, 0.07, 0.12);
    this.lastHeat = fire.heat;
    if (fire.stage === 'burning' && (this.crackleTimer -= delta) <= 0) {
      this.crackleTimer = 0.08 + Math.random() * 0.4;
      this.burst(2200 + Math.random() * 2500, 0.04, 0.08 + 0.1 * fire.intensity);
    }
  }

  /** Physical-interaction sounds: all synthesized, short, and scaled by strength. */
  private fx(name: string, k: number): void {
    switch (name) {
      case 'creak':
        this.tone(70 + k * 60, 0.25, 'sawtooth', 0.05 + k * 0.08, 0, 55 + k * 40);
        break;
      case 'crack':
        this.burst(2600, 0.06, 0.35);
        this.burst(900, 0.1, 0.2);
        break;
      case 'snap':
        this.burst(3000, 0.08, 0.5);
        this.burst(600, 0.18, 0.35);
        this.tone(160, 0.12, 'square', 0.15, 0, 70);
        break;
      case 'chop':
        this.burst(450, 0.1, 0.25 + k * 0.25);
        this.tone(120, 0.08, 'square', 0.1 + k * 0.1, 0, 70);
        break;
      case 'glance':
        this.burst(2200, 0.12, 0.15);
        this.tone(900, 0.15, 'triangle', 0.06, 0, 500);
        break;
      case 'bounce':
        this.tone(1400, 0.25, 'triangle', 0.15, 0, 1100);
        this.burst(4000, 0.05, 0.3);
        break;
      case 'thud':
        this.tone(80, 0.15, 'sine', 0.25, 0, 50);
        break;
      case 'swish':
        this.burst(1200, 0.12, 0.05 + k * 0.08);
        break;
      case 'knap':
        this.burst(5000, 0.04, 0.35);
        this.tone(2400, 0.05, 'triangle', 0.1, 0, 1800);
        break;
      case 'crush':
        this.burst(1500, 0.12, 0.3);
        break;
      case 'twist':
        this.burst(700 + k * 600, 0.05, 0.05);
        break;
      case 'strain':
        this.tone(90, 0.2, 'sawtooth', 0.04 + k * 0.06, 0, 75);
        break;
      case 'seat':
        this.tone(140, 0.12, 'sine', 0.25, 0, 90);
        this.burst(800, 0.06, 0.15);
        break;
      case 'wobble':
        this.tone(200, 0.08, 'square', 0.1);
        this.tone(160, 0.08, 'square', 0.1, 0.1);
        break;
      default:
        break;
    }
  }

  private onEvent(e: GameEvent): void {
    switch (e.type) {
      case 'toast':
        if (e.kind === 'bad') this.tone(180, 0.18, 'square', 0.12, 0, 120);
        else if (e.kind === 'good') this.tone(660, 0.14, 'triangle', 0.18);
        else this.tone(520, 0.08, 'sine', 0.12); // pickup blip
        break;
      case 'held':
        this.tone(300, 0.07, 'triangle', 0.15, 0, 420);
        break;
      case 'structure':
        this.tone(110, 0.22, 'sawtooth', 0.2, 0, 70);
        this.tone(220, 0.1, 'square', 0.1, 0.05);
        break;
      case 'xp':
        this.tone(880, 0.08, 'sine', 0.1);
        break;
      case 'levelUp':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.2, i * 0.1));
        break;
      case 'questComplete':
        [392, 523, 659, 784].forEach((f, i) => this.tone(f, 0.35, 'sine', 0.22, i * 0.12));
        break;
      case 'discovered':
        this.tone(440, 0.3, 'sine', 0.18);
        this.tone(660, 0.4, 'sine', 0.15, 0.12);
        break;
      case 'contact':
        this.contact(e.a, e.b, e.x, e.y, e.z, e.strength);
        break;
      case 'fx':
        this.fx(e.name, e.strength);
        break;
      case 'gather':
        if (e.tool === 'axe' || e.tool === 'hammer') {
          this.burst(300, 0.12, 0.3);
          this.tone(110, 0.1, 'square', 0.2, 0, 60);
        } else this.burst(1800, 0.06, 0.1);
        break;
      case 'arrow':
        this.tone(e.hit ? 140 : 900, 0.12, 'triangle', 0.15, 0, e.hit ? 90 : 300);
        break;
      case 'action':
        if (e.done) this.tone(330, 0.15, 'square', 0.15, 0, 660);
        else this.burst(1200 + e.progress * 1500, 0.05, 0.1);
        break;
      case 'fire':
        if (e.stage !== this.lastStage) {
          if (e.stage === 'burning') [196, 262, 330].forEach((f, i) => this.tone(f, 0.5, 'triangle', 0.18, i * 0.08));
          if (e.stage === 'out') this.burst(500, 0.6, 0.15);
          this.lastStage = e.stage;
        } else {
          this.tone(740, 0.06, 'sine', 0.1); // fuel added / ember moved
        }
        break;
      default:
        break;
    }
  }
}
