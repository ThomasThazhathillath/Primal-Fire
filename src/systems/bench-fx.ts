// The workbench parts MOVE with your hands (docs/CORE_GAMEPLAY_SPEC.md): the
// stick slides under the edge as you scrape, the spindle sinks as you press,
// the cord winds ring by ring as you lash, the strands spiral as you twist, the
// flint hops and throws chips as you strike. Every number comes from the work
// the hands actually did this frame (game/stepfx.ts), so no hand motion, no
// movement. Three instanced meshes (cord rings, strands, chips) are built once;
// nothing allocates per frame.

import { BoxGeometry, CylinderGeometry, Group, InstancedMesh, MeshBasicMaterial, Object3D, TorusGeometry, Vector3 } from '@iwsdk/core';
import type { BenchMotion } from '../game/bench.js';
import { pressSink, ringsWound, strandOffset, strokeOffset, strokePhase, wrapAngle } from '../game/stepfx.js';

const RINGS = 14;
const STRANDS = 2;
const SEGMENTS = 8;
const CHIPS = 14;
const GRAVITY = -3.2;

export class BenchFx {
  private rings: InstancedMesh;
  private strands: InstancedMesh;
  private chips: InstancedMesh;
  private dummy = new Object3D();
  private phase = 0;
  private twist = 0;
  private wrapped = 0;
  private hop = 0;
  private chipT = 0;
  private lastRings = -1;
  private chipPos = new Float32Array(CHIPS * 3);
  private chipVel = new Float32Array(CHIPS * 3);
  private chipLife = new Float32Array(CHIPS);
  private nextChip = 0;
  private off = { y: 0, z: 0 };
  private parts: Object3D[] = [];
  private base: number[] = [];
  private top = new Vector3();

  constructor(parent: Group) {
    const cord = new MeshBasicMaterial({ color: 0xe8dcc0 });
    const strand = new MeshBasicMaterial({ color: 0xb8a074 });
    const chip = new MeshBasicMaterial({ color: 0xc9a46a });
    this.rings = new InstancedMesh(new TorusGeometry(0.03, 0.005, 4, 10), cord, RINGS);
    this.strands = new InstancedMesh(new CylinderGeometry(0.007, 0.007, 0.045, 5), strand, STRANDS * SEGMENTS);
    this.chips = new InstancedMesh(new BoxGeometry(0.008, 0.004, 0.006), chip, CHIPS);
    for (const m of [this.rings, this.strands, this.chips]) {
      m.frustumCulled = false;
      m.visible = false;
      parent.add(m);
    }
    this.rings.count = 0;
  }

  /** The effect meshes (so the layout rebuild does not remove them). */
  get objects(): Object3D[] {
    return [this.rings, this.strands, this.chips];
  }

  /** Call when the layout is rebuilt: the parts and where the slab top is. */
  setParts(parts: Object3D[], top: Vector3): void {
    this.parts = parts;
    this.top.copy(top);
    this.base.length = 0;
    for (const p of parts) this.base.push(p.position.x, p.position.y, p.position.z);
    this.phase = this.twist = this.wrapped = this.hop = 0;
    this.lastRings = -1;
    this.chipLife.fill(0);
    this.rings.visible = this.strands.visible = false;
  }

  /** The step changed or the craft ended: put everything back. */
  rest(): void {
    this.restoreParts();
    this.rings.visible = this.strands.visible = false;
    this.lastRings = -1;
  }

  private restoreParts(): void {
    for (let i = 0; i < this.parts.length; i++) {
      const p = this.parts[i];
      p.position.set(this.base[i * 3], this.base[i * 3 + 1], this.base[i * 3 + 2]);
    }
  }

  private spawnChip(x: number, y: number, z: number, vx: number, vy: number, vz: number): void {
    const i = this.nextChip;
    this.nextChip = (i + 1) % CHIPS;
    this.chipPos[i * 3] = x;
    this.chipPos[i * 3 + 1] = y;
    this.chipPos[i * 3 + 2] = z;
    this.chipVel[i * 3] = vx;
    this.chipVel[i * 3 + 1] = vy;
    this.chipVel[i * 3 + 2] = vz;
    this.chipLife[i] = 0.7;
  }

  /**
   * @param motion the current step's motion (null when idle)
   * @param progress 0..1 within the step
   * @param added progress gained this frame (0 when the hands did nothing useful)
   * @param strokeLen the step's effort per unit progress, used to turn work into stroke length (m)
   */
  update(dt: number, motion: BenchMotion | null, progress: number, added: number, strokeLen: number): void {
    this.restoreParts();
    const a = this.parts[0];
    const b = this.parts[1] ?? this.parts[0];
    if (motion && a) {
      switch (motion) {
        case 'scrape':
        case 'saw': {
          this.phase = strokePhase(this.phase, added * strokeLen, motion === 'saw' ? 0.3 : 0.12);
          a.position.x = this.base[0] + strokeOffset(this.phase, motion === 'saw' ? 0.1 : 0.05);
          a.position.y = this.base[1] + 0.02;
          // Shavings or dust come off while the part is being worked.
          this.chipT -= dt;
          if (added > 0 && this.chipT <= 0) {
            this.chipT = 0.05;
            this.spawnChip(a.position.x, a.position.y, a.position.z, (Math.random() - 0.5) * 0.25, 0.25 + Math.random() * 0.2, (Math.random() - 0.5) * 0.25);
          }
          break;
        }
        case 'press': {
          const k = this.parts.length > 1 ? 1 : 0;
          const p = this.parts[k];
          p.position.y = this.base[k * 3 + 1] + 0.05 - pressSink(progress, 0.05);
          break;
        }
        case 'strike': {
          if (added > 0) {
            this.hop = 1;
            for (let c = 0; c < 3; c++) this.spawnChip(a.position.x, a.position.y + 0.01, a.position.z, (Math.random() - 0.5) * 0.6, 0.5 + Math.random() * 0.5, (Math.random() - 0.5) * 0.6);
          }
          this.hop = Math.max(0, this.hop - dt * 7);
          a.position.y = this.base[1] + 0.06 * this.hop;
          a.rotation.z = -0.5 * this.hop;
          break;
        }
        case 'wrap': {
          this.wrapped += added;
          this.windRings(b, progress);
          break;
        }
        case 'twist': {
          this.twist += added * 120;
          this.spiral(progress);
          break;
        }
        default:
          break;
      }
    }
    if (motion !== 'wrap') {
      this.rings.visible = false;
      this.lastRings = -1;
    }
    if (motion !== 'twist') this.strands.visible = false;
    this.stepChips(dt);
  }

  /** Cord rings appear one by one around the target part, slightly slanted like a real lashing. */
  private windRings(target: Object3D, progress: number): void {
    const n = ringsWound(progress, RINGS);
    this.rings.visible = n > 0;
    if (n === this.lastRings) return;
    this.lastRings = n;
    this.rings.count = n;
    for (let i = 0; i < n; i++) {
      const d = this.dummy;
      d.position.set(target.position.x - 0.05 + i * 0.0075, target.position.y + 0.012, target.position.z);
      d.rotation.set(0.25 * (i % 2 ? 1 : -1), Math.PI / 2, 0);
      d.scale.setScalar(1);
      d.updateMatrix();
      this.rings.setMatrixAt(i, d.matrix);
    }
    this.rings.instanceMatrix.needsUpdate = true;
  }

  /** Strands spiral round each other and tighten as the cord is twisted. */
  private spiral(progress: number): void {
    this.strands.visible = true;
    const radius = 0.024 - 0.012 * progress;
    const cx = this.top.x;
    const cy = this.top.y + 0.09;
    const cz = this.top.z;
    const d = this.dummy;
    for (let k = 0; k < STRANDS; k++) {
      for (let s = 0; s < SEGMENTS; s++) {
        strandOffset(this.off, k, STRANDS, s, SEGMENTS, this.twist, radius);
        d.position.set(cx - 0.14 + s * 0.04, cy + this.off.y, cz + this.off.z);
        d.rotation.set(0, 0, Math.PI / 2);
        d.scale.setScalar(1);
        d.updateMatrix();
        this.strands.setMatrixAt(k * SEGMENTS + s, d.matrix);
      }
    }
    this.strands.instanceMatrix.needsUpdate = true;
  }

  private stepChips(dt: number): void {
    let alive = false;
    const d = this.dummy;
    for (let i = 0; i < CHIPS; i++) {
      if (this.chipLife[i] > 0) {
        this.chipLife[i] -= dt;
        this.chipVel[i * 3 + 1] += GRAVITY * dt;
        this.chipPos[i * 3] += this.chipVel[i * 3] * dt;
        this.chipPos[i * 3 + 1] = Math.max(this.top.y, this.chipPos[i * 3 + 1] + this.chipVel[i * 3 + 1] * dt);
        this.chipPos[i * 3 + 2] += this.chipVel[i * 3 + 2] * dt;
        alive = true;
      }
      const live = this.chipLife[i] > 0;
      d.position.set(this.chipPos[i * 3], live ? this.chipPos[i * 3 + 1] : -10, this.chipPos[i * 3 + 2]);
      d.rotation.set(i, i * 2, 0);
      d.scale.setScalar(live ? Math.min(1, this.chipLife[i] * 3) : 0);
      d.updateMatrix();
      this.chips.setMatrixAt(i, d.matrix);
    }
    this.chips.visible = alive;
    if (alive) this.chips.instanceMatrix.needsUpdate = true;
  }

  /** Total turns of wrap so far (for tests / debugging). */
  get wrapAngle(): number {
    return wrapAngle(this.wrapped);
  }
}

