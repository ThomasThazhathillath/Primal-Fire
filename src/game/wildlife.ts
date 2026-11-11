// The living forest (docs/PHASE3_LIVING_WORLD_SPEC.md, milestone A): three species with tiny state
// machines. No pathfinding: an animal walks toward a goal point, turns at a limited rate, and is
// pushed out of trunks and rocks by the collision grid (collision.ts); the stream is only entered
// at the bank to drink. Everything is deterministic from a seed and the clock (positions are not
// saved: an animal that was far away is simply put back near its home when you return), and only
// animals within ACTIVE range of the player are simulated at all.
//
//   deer   (a small herd): graze in clearings, wander between graze spots, drink at the stream,
//          sleep at night near a rest spot; alert when you approach, flee (then run on) when you
//          get close or move noisily; the herd flees together.
//   rabbit (burrows near undergrowth): hop and pause, freeze when you move nearby, bolt for the
//          burrow and hide for a while; asleep in the burrow around midday.
//   bird   (perched in trees): sing by day (more at dawn), turn their heads when you come near,
//          fly to another tree when startled, asleep at night.
//
// Update allocates nothing per call except the rare event record.

import { nudgeOut } from './collision.js';
import { mulberry32 } from './rng.js';
import { groundHeight, inClearing, LANDMARK_BY_ID, nearestTreeDistance, STREAM, STREAM_BANK, streamDistance, TREES, WORLD_RADIUS } from './world-layout.js';

export type Species = 'deer' | 'rabbit' | 'bird';
export type AState = 'idle' | 'graze' | 'walk' | 'run' | 'drink' | 'sleep' | 'alert' | 'flee' | 'perch' | 'fly';

export const WILD = {
  /** Only animals this close (m) to the player are simulated; they park again beyond `parkRange` (hysteresis). */
  activeRange: 38,
  parkRange: 46,
  deer: { walk: 0.9, graze: 0.25, run: 6.5, turn: 2.6, alert: 17, flee: 8.5, radius: 0.45 },
  rabbit: { hop: 2.4, run: 6, turn: 7, alert: 9, flee: 5, radius: 0.15 },
  bird: { fly: 5.2, turn: 5, alert: 14, flee: 7 },
  /** The player counts as this much louder per m/s of walking speed (noticed from further away). */
  noisePerSpeed: 0.55,
  noiseMax: 2.2,
  counts: { deer: 3, rabbit: 5, bird: 6 },
};

export interface Animal {
  id: number;
  species: Species;
  x: number;
  y: number;
  z: number;
  heading: number;
  state: AState;
  /** Seconds in this state. */
  t: number;
  /** How long this state lasts (0 = until something changes it). */
  dur: number;
  gx: number;
  gz: number;
  hx: number;
  hz: number;
  /** Body size multiplier (0.9 .. 1.1). */
  size: number;
  seed: number;
  k: number;
  hidden: boolean;
  active: boolean;
  parkedFor: number;
  /** Herd: id of the leader (-1 = this one leads). */
  leader: number;
  /** Bird: index into TREES it is perched in, and the height it perches at. */
  tree: number;
  perchY: number;
  /** Bird flight: start point and height for the arc. */
  fx: number;
  fy: number;
  fz: number;
  fT: number;
  callT: number;
  /** Which way the head is turned (rad), for drawing. */
  look: number;
}

export interface WildEvent {
  kind: 'alert' | 'flee' | 'drink' | 'call' | 'hide' | 'startle' | 'graze' | 'perch';
  species: Species;
  id: number;
  x: number;
  z: number;
}

export interface WildContext {
  px: number;
  pz: number;
  /** Hour of day 0..24. */
  hour: number;
  /** Mist / fog 0..1: animals see you later, so you can come closer. */
  mist?: number;
}

const rand = (a: Animal): number => {
  // A fresh deterministic draw from (seed, counter): same sequence for the same animal every run.
  a.k++;
  let t = (a.seed * 7919 + a.k * 104729 + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), 1 | t);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const between = (a: Animal, lo: number, hi: number): number => lo + rand(a) * (hi - lo);

const isNight = (h: number): boolean => h >= 20.5 || h < 5;
/** Rabbits keep to the burrow in the middle of the day and at night. */
const rabbitAsleep = (h: number): boolean => (h >= 11 && h < 15) || isNight(h);
const dawn = (h: number): number => (h >= 4.5 && h < 8 ? 3 : h >= 8 && h < 18 ? 1 : 0.3);

export class Wildlife {
  readonly animals: Animal[] = [];
  readonly events: WildEvent[] = [];
  /** Smoothed player speed (m/s), for how loud you are. */
  playerSpeed = 0;
  private lastPx = NaN;
  private lastPz = NaN;
  /** Rest spots for the herd and graze centres, fixed at construction. */
  readonly rest: Array<{ x: number; z: number }> = [];
  readonly graze: Array<{ x: number; z: number }> = [];

  constructor(seed = 2026) {
    const rng = mulberry32(seed);
    let id = 0;
    const base = (species: Species, x: number, z: number): Animal => ({
      id: id++,
      species,
      x,
      y: groundHeight(x, z),
      z,
      heading: rng() * Math.PI * 2,
      state: 'idle',
      t: 0,
      dur: 2 + rng() * 4,
      gx: x,
      gz: z,
      hx: x,
      hz: z,
      size: 0.92 + rng() * 0.16,
      seed: Math.floor(rng() * 1e9),
      k: 0,
      hidden: false,
      active: false,
      parkedFor: 99,
      leader: -1,
      tree: -1,
      perchY: 0,
      fx: x,
      fy: 0,
      fz: z,
      fT: 0,
      callT: 3 + rng() * 10,
      look: 0,
    });
    // Graze centres: the open clearings. Rest spots: just inside the trees beside them.
    const meadow = LANDMARK_BY_ID.meadow;
    const glade = LANDMARK_BY_ID.glade;
    this.graze.push({ x: meadow.x, z: meadow.z }, { x: glade.x, z: glade.z }, { x: meadow.x - 5, z: meadow.z + 6 });
    this.rest.push(...this.freeNear(meadow.x + 9, meadow.z + 8, rng), ...this.freeNear(glade.x - 9, glade.z + 6, rng));
    // Deer: one herd of three near the meadow.
    for (let i = 0; i < WILD.counts.deer; i++) {
      const [x, z] = this.openSpot(meadow.x + (i - 1) * 2, meadow.z + 1.5, rng);
      const d = base('deer', x, z);
      d.leader = i === 0 ? -1 : 0;
      this.animals.push(d);
    }
    // Rabbits: burrows at the edge of the undergrowth, ring 12-36 m out, near a tree but off the stream.
    for (let i = 0; i < WILD.counts.rabbit; i++) {
      let x = 14;
      let z = 0;
      for (let tries = 0; tries < 80; tries++) {
        const a = rng() * Math.PI * 2;
        const r = 12 + rng() * 24;
        x = Math.cos(a) * r;
        z = Math.sin(a) * r;
        const td = nearestTreeDistance(x, z, 4);
        if (streamDistance(x, z) > STREAM_BANK + 2 && td > 1 && td < 3.2 && !inClearing(x, z, 0)) break;
      }
      this.animals.push(base('rabbit', x, z));
    }
    // Birds: perched in the taller trees within the playable ring.
    const tall = TREES.filter((t) => t.kind !== 2 && t.scale * t.height > 0.95 && Math.hypot(t.x, t.z) < 36 && Math.hypot(t.x, t.z) > 6);
    for (let i = 0; i < WILD.counts.bird && tall.length; i++) {
      const ti = TREES.indexOf(tall[Math.floor(rng() * tall.length)]);
      const t = TREES[ti];
      const b = base('bird', t.x, t.z);
      b.tree = ti;
      b.perchY = perchHeight(ti);
      b.y = b.perchY;
      b.state = 'perch';
      this.animals.push(b);
    }
  }

  private freeNear(x: number, z: number, rng: () => number): Array<{ x: number; z: number }> {
    const [fx, fz] = this.openSpot(x, z, rng);
    return [{ x: fx, z: fz }];
  }

  /** A point near (x, z) that is clear of trunks and the stream. */
  private openSpot(x: number, z: number, rng: () => number): [number, number] {
    for (let i = 0; i < 40; i++) {
      const px = x + (rng() - 0.5) * 4 * (1 + i / 10);
      const pz = z + (rng() - 0.5) * 4 * (1 + i / 10);
      if (nearestTreeDistance(px, pz, 2) > 1.2 && streamDistance(px, pz) > STREAM_BANK) return [px, pz];
    }
    return [x, z];
  }

  // ------------------------------------------------------------------ update

  /** Advance everything `dt` seconds. */
  update(dt: number, ctx: WildContext): void {
    if (dt <= 0) return;
    if (!Number.isNaN(this.lastPx)) {
      const sp = Math.hypot(ctx.px - this.lastPx, ctx.pz - this.lastPz) / dt;
      this.playerSpeed += (Math.min(sp, 6) - this.playerSpeed) * Math.min(1, dt * 2);
    }
    this.lastPx = ctx.px;
    this.lastPz = ctx.pz;
    // In mist they see and hear you less far away, so the same distance counts as further.
    const noise = Math.min(WILD.noiseMax, 1 + this.playerSpeed * WILD.noisePerSpeed) * (1 - 0.35 * Math.min(1, ctx.mist ?? 0));
    for (const a of this.animals) {
      const dist = Math.hypot(a.x - ctx.px, a.z - ctx.pz);
      const was = a.active;
      a.active = was ? dist < WILD.parkRange : dist < WILD.activeRange;
      if (!a.active) {
        a.parkedFor += dt;
        continue;
      }
      if (!was && a.parkedFor > 25) this.reset(a, ctx.hour);
      a.parkedFor = 0;
      a.t += dt;
      if (a.species === 'deer') this.deer(a, dt, dist, noise, ctx);
      else if (a.species === 'rabbit') this.rabbit(a, dt, dist, noise, ctx);
      else this.bird(a, dt, dist, noise, ctx);
    }
  }

  /** Put an animal that has been out of range back where it lives, resting or about. */
  private reset(a: Animal, hour: number): void {
    a.x = a.hx + (rand(a) - 0.5) * 3;
    a.z = a.hz + (rand(a) - 0.5) * 3;
    a.hidden = false;
    if (a.species === 'bird') {
      a.x = TREES[a.tree].x;
      a.z = TREES[a.tree].z;
      a.y = a.perchY;
      this.enter(a, isNight(hour) ? 'sleep' : 'perch', between(a, 6, 20));
    } else if (a.species === 'rabbit' && rabbitAsleep(hour)) {
      a.x = a.hx;
      a.z = a.hz;
      a.hidden = true;
      this.enter(a, 'sleep', 0);
    } else if (a.species === 'deer' && isNight(hour)) {
      const r = this.rest[a.id % this.rest.length];
      a.x = r.x + (a.id - 1) * 1.2;
      a.z = r.z;
      this.enter(a, 'sleep', 0);
    } else this.enter(a, 'idle', between(a, 2, 6));
    a.y = a.species === 'bird' ? a.perchY : groundHeight(a.x, a.z);
  }

  private enter(a: Animal, s: AState, dur: number): void {
    a.state = s;
    a.t = 0;
    a.dur = dur;
  }

  private emit(kind: WildEvent['kind'], a: Animal): void {
    if (this.events.length > 24) this.events.shift();
    this.events.push({ kind, species: a.species, id: a.id, x: a.x, z: a.z });
  }

  /** Walk toward (tx, tz) at `speed`, turning at `turn` rad/s; true on arrival. Slides off trunks and away from the water. */
  private move(a: Animal, tx: number, tz: number, speed: number, turn: number, radius: number, dt: number): boolean {
    const dx = tx - a.x;
    const dz = tz - a.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.35) return true;
    const want = Math.atan2(dx, dz);
    let diff = want - a.heading;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    a.heading += Math.max(-turn * dt, Math.min(turn * dt, diff));
    const step = Math.min(d, speed * dt);
    const nx = a.x + Math.sin(a.heading) * step;
    const nz = a.z + Math.cos(a.heading) * step;
    // The water is only entered at the bank to drink; stay out of the world's edge.
    if (streamDistance(nx, nz) < 0.9 && a.state !== 'drink') {
      a.heading += 1.2 * dt * 4;
      return false;
    }
    if (Math.hypot(nx, nz) > WORLD_RADIUS - 3) {
      a.heading += 1.2 * dt * 4;
      return false;
    }
    const free = nudgeOut(nx, nz, radius);
    if (free.x !== nx || free.z !== nz) a.heading += 0.9; // turned away by a trunk or rock
    a.x = free.x;
    a.z = free.z;
    a.y = groundHeight(a.x, a.z);
    return false;
  }

  /** Face (x, z) (slowly, for alert animals). */
  private face(a: Animal, x: number, z: number, dt: number, rate = 4): void {
    let diff = Math.atan2(x - a.x, z - a.z) - a.heading;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    a.heading += Math.max(-rate * dt, Math.min(rate * dt, diff));
  }

  private awayGoal(a: Animal, px: number, pz: number, far: number): void {
    const dx = a.x - px;
    const dz = a.z - pz;
    const d = Math.hypot(dx, dz) || 1;
    a.gx = a.x + (dx / d) * far;
    a.gz = a.z + (dz / d) * far;
  }

  // -------------------------------------------------------------------- deer

  private deer(a: Animal, dt: number, dist: number, noise: number, ctx: WildContext): void {
    const P = WILD.deer;
    const threat = dist / noise;
    const herd = a.leader >= 0 ? this.animals[a.leader] : a;
    // The herd bolts together: if the leader is running, so does everyone.
    if (a.leader >= 0 && (herd.state === 'flee' || herd.state === 'run') && a.state !== 'flee' && a.state !== 'run') {
      this.awayGoal(a, ctx.px, ctx.pz, 18);
      this.enter(a, 'flee', 2.5);
    }
    if (a.state !== 'flee' && a.state !== 'run') {
      const sleepy = a.state === 'sleep';
      // An alert deer still bolts once you come close (alert used to skip this check and never fled).
      if (threat < (sleepy ? P.flee * 0.6 : P.flee)) {
        this.awayGoal(a, ctx.px, ctx.pz, 22);
        this.enter(a, 'flee', 2.5);
        this.emit('flee', a);
      } else if (a.state !== 'alert' && threat < (sleepy ? P.alert * 0.4 : P.alert)) {
        this.enter(a, 'alert', 0);
        this.emit('alert', a);
      }
    }
    switch (a.state) {
      case 'idle':
        if (a.t >= a.dur) this.deerNext(a, ctx.hour);
        break;
      case 'graze':
        this.move(a, a.gx, a.gz, P.graze, P.turn, P.radius, dt);
        if (a.t >= a.dur) this.enter(a, 'idle', between(a, 2, 6));
        break;
      case 'walk':
        if (this.move(a, a.gx, a.gz, P.walk, P.turn, P.radius, dt)) {
          if (isNight(ctx.hour)) this.enter(a, 'sleep', 0);
          else if (streamDistance(a.x, a.z) < STREAM_BANK + 1.2) {
            this.enter(a, 'drink', between(a, 5, 9));
            this.emit('drink', a);
          } else this.enter(a, 'graze', between(a, 7, 15));
        } else if (a.t > 40) this.enter(a, 'idle', 3);
        break;
      case 'drink':
        if (a.t >= a.dur) this.enter(a, 'idle', between(a, 3, 6));
        break;
      case 'sleep':
        if (!isNight(ctx.hour) && a.t > 4 + a.id) this.enter(a, 'idle', between(a, 2, 5));
        break;
      case 'alert':
        this.face(a, ctx.px, ctx.pz, dt);
        a.look = 0;
        if (threat > P.alert * 1.3 && a.t > 3) this.enter(a, 'idle', between(a, 2, 5));
        break;
      case 'flee': {
        this.move(a, a.gx, a.gz, P.run, P.turn * 2, P.radius, dt);
        if (a.t >= a.dur) this.enter(a, 'run', 0);
        break;
      }
      case 'run': {
        const arrived = this.move(a, a.gx, a.gz, P.run * 0.8, P.turn * 2, P.radius, dt);
        if (arrived || dist > 28 || a.t > 8) {
          // Once out of sight the herd settles and looks back.
          this.enter(a, 'alert', 0);
        }
        break;
      }
      default:
        this.enter(a, 'idle', 3);
    }
  }

  /** What a calm deer does next, by time of day. */
  private deerNext(a: Animal, hour: number): void {
    const r = rand(a);
    if (isNight(hour) || (hour >= 19 && hour < 20.5 && r < 0.7)) {
      // Evening: drift toward the resting spot and lie down for the night.
      const spot = this.rest[a.id % this.rest.length];
      a.gx = spot.x + (a.id - 1) * 1.2;
      a.gz = spot.z;
      this.enter(a, 'walk', 0);
      return;
    }
    if (r < 0.45) {
      const c = this.graze[Math.floor(rand(a) * this.graze.length)];
      a.gx = c.x + (rand(a) - 0.5) * 7;
      a.gz = c.z + (rand(a) - 0.5) * 7;
      this.enter(a, 'graze', between(a, 8, 16));
    } else if (r < 0.7) {
      const c = this.graze[Math.floor(rand(a) * this.graze.length)];
      a.gx = c.x + (rand(a) - 0.5) * 12;
      a.gz = c.z + (rand(a) - 0.5) * 12;
      this.enter(a, 'walk', 0);
    } else if (r < 0.85 && hour >= 6) {
      // Water: the nearest stream point.
      let bx = STREAM[0][0];
      let bz = STREAM[0][1];
      let bd = Infinity;
      for (let i = 0; i < STREAM.length - 1; i++) {
        for (let k = 0; k <= 6; k++) {
          const px = STREAM[i][0] + (STREAM[i + 1][0] - STREAM[i][0]) * (k / 6);
          const pz = STREAM[i][1] + (STREAM[i + 1][1] - STREAM[i][1]) * (k / 6);
          const d = Math.hypot(px - a.x, pz - a.z);
          if (d < bd) {
            bd = d;
            bx = px;
            bz = pz;
          }
        }
      }
      a.gx = bx + (a.x < bx ? -1.5 : 1.5);
      a.gz = bz;
      this.enter(a, 'walk', 0);
    } else this.enter(a, 'idle', between(a, 3, 7));
  }

  // ------------------------------------------------------------------ rabbit

  private rabbit(a: Animal, dt: number, dist: number, noise: number, ctx: WildContext): void {
    const P = WILD.rabbit;
    const threat = dist / noise;
    if (a.hidden) {
      // Underground: come out when it is time, and not while you stand right at the burrow.
      if (a.t >= a.dur && !rabbitAsleep(ctx.hour) && dist > 3) {
        a.hidden = false;
        this.enter(a, 'idle', between(a, 1, 3));
      } else if (a.state === 'sleep' && !rabbitAsleep(ctx.hour) && dist > 3) {
        a.hidden = false;
        this.enter(a, 'idle', between(a, 1, 3));
      }
      return;
    }
    if (a.state !== 'flee') {
      if (threat < P.flee) {
        a.gx = a.hx;
        a.gz = a.hz;
        this.enter(a, 'flee', 0);
        this.emit('flee', a);
      } else if (threat < P.alert && a.state !== 'alert') {
        this.enter(a, 'alert', between(a, 1.2, 2.5));
        this.emit('alert', a);
      }
    }
    switch (a.state) {
      case 'idle':
        if (rabbitAsleep(ctx.hour) && a.t > 2) {
          a.gx = a.hx;
          a.gz = a.hz;
          this.enter(a, 'walk', 0);
        } else if (a.t >= a.dur) {
          a.gx = a.hx + (rand(a) - 0.5) * 9;
          a.gz = a.hz + (rand(a) - 0.5) * 9;
          this.enter(a, 'walk', 0);
        }
        break;
      case 'walk': {
        // Hop and pause: a hop for 0.35 s, still for 0.55 s.
        const phase = a.t % 0.9;
        const arrived = phase < 0.35 ? this.move(a, a.gx, a.gz, P.hop, P.turn, P.radius, dt) : false;
        if (arrived || a.t > 12) {
          if (arrived && Math.hypot(a.x - a.hx, a.z - a.hz) < 1 && rabbitAsleep(ctx.hour)) {
            a.hidden = true;
            this.enter(a, 'sleep', 0);
            this.emit('hide', a);
          } else this.enter(a, 'idle', between(a, 1.5, 4));
        }
        break;
      }
      case 'alert':
        this.face(a, ctx.px, ctx.pz, dt, 8);
        if (a.t >= a.dur) this.enter(a, threat < P.alert ? 'alert' : 'idle', between(a, 1.5, 3));
        break;
      case 'flee':
        if (this.move(a, a.gx, a.gz, P.run, P.turn * 2, P.radius, dt) || a.t > 6) {
          a.hidden = true;
          this.enter(a, 'sleep', between(a, 10, 25));
          this.emit('hide', a);
        }
        break;
      default:
        this.enter(a, 'idle', 2);
    }
  }

  // -------------------------------------------------------------------- bird

  private bird(a: Animal, dt: number, dist: number, noise: number, ctx: WildContext): void {
    const P = WILD.bird;
    const threat = dist / noise;
    if (a.state === 'fly') {
      const tree = TREES[a.tree];
      const d = Math.hypot(tree.x - a.x, tree.z - a.z);
      const total = Math.max(1, Math.hypot(tree.x - a.fx, tree.z - a.fz));
      a.fT = Math.min(1, 1 - d / total);
      a.heading = Math.atan2(tree.x - a.x, tree.z - a.z);
      const step = Math.min(d, P.fly * dt);
      a.x += Math.sin(a.heading) * step;
      a.z += Math.cos(a.heading) * step;
      // An arc: up and over, then down onto the branch.
      a.y = a.fy + (a.perchY - a.fy) * a.fT + Math.sin(a.fT * Math.PI) * 2.2;
      if (d < 0.4) {
        a.x = tree.x;
        a.z = tree.z;
        a.y = a.perchY;
        this.enter(a, isNight(ctx.hour) ? 'sleep' : 'perch', between(a, 8, 25));
        this.emit('perch', a);
      }
      return;
    }
    if (a.state === 'sleep') {
      if (!isNight(ctx.hour)) this.enter(a, 'perch', between(a, 4, 12));
      else if (threat < P.flee * 0.5) this.startle(a, ctx);
      return;
    }
    if (isNight(ctx.hour)) {
      this.enter(a, 'sleep', 0);
      return;
    }
    if (threat < P.flee) {
      this.startle(a, ctx);
      return;
    }
    // Perched: turn the head toward you when you come near, sing otherwise.
    if (threat < P.alert) {
      a.state = 'alert';
      this.face(a, ctx.px, ctx.pz, dt, 6);
      a.look = Math.sin(a.t * 3) * 0.4;
    } else if (a.state === 'alert') this.enter(a, 'perch', between(a, 6, 16));
    a.callT -= dt * dawn(ctx.hour) * (a.state === 'perch' ? 1 : 0.2);
    if (a.callT <= 0) {
      a.callT = between(a, 6, 20);
      this.emit('call', a);
    }
    if (a.state === 'perch' && a.t >= a.dur) {
      // Hop to a nearby tree now and then.
      if (rand(a) < 0.5) this.takeOff(a);
      else this.enter(a, 'perch', between(a, 8, 25));
    }
  }

  private startle(a: Animal, ctx: WildContext): void {
    this.emit('startle', a);
    this.takeOff(a, ctx.px, ctx.pz);
  }

  /** Fly to another tree a few metres away (away from the player when startled). */
  private takeOff(a: Animal, px?: number, pz?: number): void {
    let best = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < 12; i++) {
      const ti = Math.floor(rand(a) * TREES.length);
      const t = TREES[ti];
      const d = Math.hypot(t.x - a.x, t.z - a.z);
      if (ti === a.tree || d < 6 || d > 22 || t.kind === 2 || Math.hypot(t.x, t.z) > 38) continue;
      const away = px === undefined ? 0 : Math.hypot(t.x - px, t.z - pz!);
      const score = away - d * 0.2 + rand(a);
      if (score > bestScore) {
        bestScore = score;
        best = ti;
      }
    }
    if (best < 0) {
      this.enter(a, 'perch', 8);
      return;
    }
    a.fx = a.x;
    a.fy = a.y;
    a.fz = a.z;
    a.tree = best;
    a.perchY = perchHeight(best);
    a.fT = 0;
    this.enter(a, 'fly', 0);
  }

  /** Counts of animals in each state (debug and tests). */
  summary(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const a of this.animals) {
      const k = `${a.species}.${a.hidden ? 'hidden' : a.state}`;
      out[k] = (out[k] ?? 0) + 1;
    }
    return out;
  }
}

/** Height a bird perches at in tree `i` (m above the ground at its trunk). */
export function perchHeight(i: number): number {
  const t = TREES[i];
  return groundHeight(t.x, t.z) + Math.max(3.5, Math.min(9, 3.2 + 3 * t.scale * t.height));
}
