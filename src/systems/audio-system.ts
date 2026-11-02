// Procedural audio feedback (no asset files): short synthesized cues driven by
// game events, plus a quiet looping wind bed. The AudioContext is created
// lazily and resumed on the first user gesture / XR session start.

import { createSystem } from '@iwsdk/core';
import type { GameEvent } from '../game/game.js';
import { getGame } from './shared.js';

type Wave = OscillatorType;

export class AudioSystem extends createSystem({}) {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private windStarted = false;

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

  private tone(freq: number, dur: number, type: Wave = 'sine', vol = 0.25, delay = 0, slideTo?: number): void {
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
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
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
      default:
        break;
    }
  }
}
