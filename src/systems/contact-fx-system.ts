// Small particles where two materials meet (src/game/contact.ts): wood chips,
// dust, flint sparks, leaf bits, water splash. One pooled Points object with
// per-particle colours; nothing is allocated per frame.

import { roundPoints } from './round-points.js';
import { BufferAttribute, BufferGeometry, createSystem, Points, PointsMaterial } from '@iwsdk/core';
import { contactProfile, type ContactParticle } from '../game/contact.js';
import type { GameEvent } from '../game/game.js';
import { getGame } from './shared.js';

const POOL = 64;

interface Look {
  colors: number[];
  count: number;
  speed: number;
  up: number;
  gravity: number;
  life: number;
}

const LOOKS: Record<Exclude<ContactParticle, 'none'>, Look> = {
  chips: { colors: [0xd8b07a, 0xb08850, 0x8a6a45], count: 10, speed: 1.6, up: 1.4, gravity: 9.8, life: 0.6 },
  dust: { colors: [0x9a8a72, 0x7d705e, 0xb0a28a], count: 8, speed: 0.6, up: 0.5, gravity: 1.5, life: 0.7 },
  sparks: { colors: [0xffe08a, 0xffb547, 0xffffff], count: 10, speed: 2.4, up: 1.2, gravity: 6, life: 0.3 },
  leaves: { colors: [0x7a9a42, 0xa8793a, 0x5e7a30], count: 8, speed: 0.8, up: 1.0, gravity: 2, life: 0.9 },
  splash: { colors: [0xcfe8ff, 0x9cc8ee, 0xffffff], count: 12, speed: 1.2, up: 2.0, gravity: 9.8, life: 0.5 },
};

export class ContactFxSystem extends createSystem({}) {
  private points!: Points;
  private pos = new Float32Array(POOL * 3);
  private col = new Float32Array(POOL * 3);
  private vel = new Float32Array(POOL * 3);
  private life = new Float32Array(POOL);
  private grav = new Float32Array(POOL);
  private next = 0;

  init(): void {
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new BufferAttribute(this.col, 3));
    this.points = new Points(geo, roundPoints(new PointsMaterial({ size: 0.022, vertexColors: true, transparent: true, depthWrite: false })));
    this.points.frustumCulled = false;
    this.points.name = 'ContactFx';
    for (let i = 0; i < POOL; i++) this.pos[i * 3 + 1] = -50;
    this.world.createTransformEntity(this.points);
    this.cleanupFuncs.push(
      getGame(this.world).on((e: GameEvent) => {
        if (e.type === 'contact') this.burst(contactProfile(e.a, e.b).particle, e.x, e.y, e.z, e.strength);
      }),
    );
  }

  private burst(kind: ContactParticle, x: number, y: number, z: number, strength: number): void {
    if (kind === 'none') return;
    const look = LOOKS[kind];
    const n = Math.max(2, Math.round(look.count * Math.min(1, 0.3 + strength / 3)));
    for (let k = 0; k < n; k++) {
      // Round-robin over the pool: the oldest particles are reused first.
      const i = this.next;
      this.next = (this.next + 1) % POOL;
      const o = i * 3;
      this.pos[o] = x;
      this.pos[o + 1] = y + 0.02;
      this.pos[o + 2] = z;
      const a = Math.random() * Math.PI * 2;
      const sp = look.speed * (0.4 + Math.random() * 0.6);
      this.vel[o] = Math.cos(a) * sp;
      this.vel[o + 1] = look.up * (0.5 + Math.random() * 0.5);
      this.vel[o + 2] = Math.sin(a) * sp;
      const c = look.colors[k % look.colors.length];
      this.col[o] = ((c >> 16) & 255) / 255;
      this.col[o + 1] = ((c >> 8) & 255) / 255;
      this.col[o + 2] = (c & 255) / 255;
      this.life[i] = look.life * (0.6 + Math.random() * 0.4);
      this.grav[i] = look.gravity;
    }
    this.points.geometry.attributes.color.needsUpdate = true;
  }

  update(delta: number): void {
    const dt = Math.min(delta, 0.05);
    let any = false;
    for (let i = 0; i < POOL; i++) {
      if (this.life[i] <= 0) continue;
      any = true;
      const o = i * 3;
      this.life[i] -= dt;
      this.vel[o + 1] -= this.grav[i] * dt;
      this.pos[o] += this.vel[o] * dt;
      this.pos[o + 1] += this.vel[o + 1] * dt;
      this.pos[o + 2] += this.vel[o + 2] * dt;
      if (this.pos[o + 1] < 0.005) {
        this.pos[o + 1] = 0.005;
        this.vel[o] *= 0.5;
        this.vel[o + 2] *= 0.5;
        this.vel[o + 1] = 0;
      }
      if (this.life[i] <= 0) this.pos[o + 1] = -50;
    }
    if (any) this.points.geometry.attributes.position.needsUpdate = true;
  }
}
