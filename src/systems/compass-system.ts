// A subtle compass (docs/NPE_PLAN.md, milestone D): a thin heading tape just above eye level in the headset
// (a small strip at the top of the screen on the desktop), with camp and, when the objective is a place or a
// hint pillar is up, the destination marked. Marks beyond the tape sit at its edge with an arrow, so "camp is
// behind you to the left" is always one glance away. Redrawn only when the heading moves a few degrees, you
// move half a metre, or a mark changes: a few times a second at most, never every frame.

import { CanvasTexture, createSystem, Mesh, MeshBasicMaterial, PlaneGeometry, VisibilityState } from '@iwsdk/core';
import { bearingTo, campOf, COMPASS_SPAN, headingOf, tapePos } from '../game/directions.js';
import { LANDMARK_BY_ID } from '../game/world-layout.js';
import { getGame, getUi, headYaw, hintFx, StaticAnchor } from './shared.js';
import { WorldSystem } from './world-system.js';

const W = 512;
const H = 72;
/** On/off from the guidance-visibility setting (settings.ts). */
export const compassCfg = { show: true };
const LETTERS: Array<[number, string]> = [
  [0, 'N'],
  [45, 'NE'],
  [90, 'E'],
  [135, 'SE'],
  [180, 'S'],
  [225, 'SW'],
  [270, 'W'],
  [315, 'NW'],
];

export class CompassSystem extends createSystem({}) {
  private mesh!: Mesh;
  private ctx!: CanvasRenderingContext2D;
  private tex!: CanvasTexture;
  private anchor = new StaticAnchor(0.6, 0, -0.15, 0.9, 1);
  private dom: HTMLDivElement | null = null;
  private lastHead = 999;
  private lastX = 1e9;
  private lastZ = 1e9;
  private lastSig = '';
  private t = 0;
  private vr = false;

  init(): void {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    this.ctx = canvas.getContext('2d')!;
    this.tex = new CanvasTexture(canvas);
    const mat = new MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, depthTest: false });
    this.mesh = new Mesh(new PlaneGeometry(0.4, 0.056), mat);
    this.mesh.name = 'Compass';
    this.mesh.renderOrder = 30;
    this.mesh.visible = false;
    this.world.createTransformEntity(this.mesh);
    // Desktop: a small text strip at the top of the screen.
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;left:50%;top:6px;transform:translateX(-50%);padding:3px 12px;border-radius:12px;background:rgba(20,16,10,.55);color:#f3e6cc;font:600 13px system-ui,sans-serif;letter-spacing:.5px;pointer-events:none;z-index:6;display:none;white-space:nowrap';
    document.body.appendChild(d);
    this.dom = d;
    this.cleanupFuncs.push(
      () => d.remove(),
      this.world.visibilityState.subscribe((v) => {
        this.vr = v !== VisibilityState.NonImmersive;
        this.anchor.reset();
        this.lastSig = '';
      }),
    );
  }

  /** Camp, and the destination when there is one worth pointing at. */
  private marks(): Array<{ label: string; x: number; z: number; color: string }> {
    const g = getGame(this.world);
    const out: Array<{ label: string; x: number; z: number; color: string }> = [];
    const camp = campOf(g);
    out.push({ label: camp.known ? 'Camp' : 'Start', x: camp.x, z: camp.z, color: '#ffb35c' });
    const o = g.objectives.current;
    const l = o?.place ? LANDMARK_BY_ID[o.place] : undefined;
    if (l) out.push({ label: 'Goal', x: l.x, z: l.z, color: '#9fe8ff' });
    else if (hintFx.glow) out.push({ label: 'Goal', x: hintFx.glow.x, z: hintFx.glow.z, color: '#9fe8ff' });
    return out;
  }

  update(delta: number): void {
    const started = this.world.getSystem(WorldSystem)?.started ?? false;
    const ui = getUi(this.world);
    const on = compassCfg.show && started && !ui.titleOpen?.();
    if (!on) {
      if (this.mesh.visible) this.mesh.visible = false;
      if (this.dom && this.dom.style.display !== 'none') this.dom.style.display = 'none';
      return;
    }
    if (this.vr) {
      this.mesh.visible = true;
      this.anchor.update(this.mesh, this.camera);
      if (this.dom && this.dom.style.display !== 'none') this.dom.style.display = 'none';
    } else this.mesh.visible = false;
    if ((this.t += delta) < 0.12) return;
    this.t = 0;
    const g = getGame(this.world);
    const yaw = headYaw(this.camera);
    const head = headingOf(yaw);
    let dh = Math.abs(head - this.lastHead);
    if (dh > 180) dh = 360 - dh;
    const moved = Math.hypot(g.player.x - this.lastX, g.player.z - this.lastZ);
    const marks = this.marks();
    const sig = marks.map((m) => `${m.label}${m.x.toFixed(0)},${m.z.toFixed(0)}`).join('|') + (this.vr ? 'v' : 'd');
    if (dh < 3 && moved < 0.5 && sig === this.lastSig) return;
    this.lastHead = head;
    this.lastX = g.player.x;
    this.lastZ = g.player.z;
    this.lastSig = sig;
    if (this.vr) this.draw(head, yaw, marks);
    else this.drawDom(head, yaw, marks);
  }

  private draw(head: number, yaw: number, marks: Array<{ label: string; x: number; z: number; color: string }>): void {
    const c = this.ctx;
    const g = getGame(this.world);
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(20, 16, 10, 0.45)';
    c.beginPath();
    c.roundRect(4, 14, W - 8, 36, 18);
    c.fill();
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    // Heading letters and ticks inside the span.
    for (let d = 0; d < 360; d += 15) {
      let b = d - head;
      if (b > 180) b -= 360;
      if (b < -180) b += 360;
      if (Math.abs(b) > COMPASS_SPAN) continue;
      const x = W / 2 + (b / COMPASS_SPAN) * (W / 2 - 24);
      const letter = LETTERS.find((l) => l[0] === d)?.[1];
      if (letter) {
        c.fillStyle = letter === 'N' ? '#ff9a6a' : '#f3e6cc';
        c.font = `bold ${letter.length === 1 ? 22 : 16}px sans-serif`;
        c.fillText(letter, x, 32);
      } else {
        c.fillStyle = 'rgba(243, 230, 204, 0.5)';
        c.fillRect(x - 1, 26, 2, 12);
      }
    }
    // Marks: camp and destination, with distance; off-tape ones pinned to the edge with an arrow.
    for (const m of marks) {
      const dx = m.x - g.player.x;
      const dz = m.z - g.player.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 2) continue;
      const p = tapePos(bearingTo(dx, dz, yaw));
      const x = W / 2 + p.x * (W / 2 - 24);
      c.fillStyle = m.color;
      c.beginPath();
      if (p.edge) {
        const dir = p.x > 0 ? 1 : -1;
        c.moveTo(x + dir * 10, 32);
        c.lineTo(x - dir * 4, 22);
        c.lineTo(x - dir * 4, 42);
      } else {
        c.moveTo(x, 50);
        c.lineTo(x - 7, 60);
        c.lineTo(x + 7, 60);
      }
      c.closePath();
      c.fill();
      c.font = 'bold 13px sans-serif';
      c.fillText(`${m.label} ${Math.round(dist)}m`, Math.max(46, Math.min(W - 46, x)), 8);
    }
    this.tex.needsUpdate = true;
  }

  private drawDom(head: number, yaw: number, marks: Array<{ label: string; x: number; z: number; color: string }>): void {
    if (!this.dom) return;
    const g = getGame(this.world);
    const card = LETTERS.reduce((best, l) => {
      let d = Math.abs(l[0] - head);
      if (d > 180) d = 360 - d;
      return d < best.d ? { d, s: l[1] } : best;
    }, { d: 999, s: 'N' }).s;
    const parts = [`${card} ${Math.round(head)}°`];
    for (const m of marks) {
      const dx = m.x - g.player.x;
      const dz = m.z - g.player.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 2) continue;
      const b = bearingTo(dx, dz, yaw);
      const arrow = Math.abs(b) < 20 ? '↑' : Math.abs(b) > 150 ? '↓' : b > 0 ? '→' : '←';
      parts.push(`${m.label} ${arrow} ${Math.round(dist)}m`);
    }
    this.dom.textContent = parts.join('   ');
    this.dom.style.display = 'block';
  }
}
