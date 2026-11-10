// Chapter 1 story (src/game/story.ts): says thought lines one at a time on the
// HUD line (small, in the comfortable view, no panel), and draws the awakening
// fade, the environmental clues, the camp marker and the mast glint.
// Skip: desktop T, or the Story icon (survival only; the opening owns it there).
// The first press drops the lines waiting; a press with nothing waiting mutes
// or unmutes thoughts (saved). Not used in the opening (it has its own story).

import {
  AdditiveBlending,
  BackSide,
  CanvasTexture,
  CylinderGeometry,
  DodecahedronGeometry,
  CircleGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Types,
  Vector3,
  createSystem,
} from '@iwsdk/core';
import { ACTS, CLUES, MAST_TOP, type StoryEvent } from '../game/story.js';
import { mulberry32 } from '../game/rng.js';
import { groundHeight } from '../game/world-layout.js';
import { getGame, getUi } from './shared.js';

const POLL_SECONDS = 0.25;
/** Seconds between thought lines (each stays on the HUD line until the next or its own fade). */
const LINE_GAP = 3.6;
/** The awakening: seconds from dark to the forest. */
const FADE_SECONDS = 3.5;
/** Seconds a game guidance line keeps the HUD before the next thought. */
const GUIDANCE_HOLD = 3;
/** More waiting lines than this and the older ones are dropped. */
const MAX_WAITING = 4;

export class StorySystem extends createSystem({}, { tutorial: { type: Types.Boolean, default: false } }) {
  private lines: string[] = [];
  private lineTimer = 0;
  private poll = 0;
  private fade: Mesh | null = null;
  private fadeT = -1;
  private campMarker: Group | null = null;
  private glint: Sprite | null = null;
  private glintMat: SpriteMaterial | null = null;
  private t = 0;
  private camPos = new Vector3();
  private off = false;
  /** True while this system writes the HUD line (its own toasts must not delay it). */
  private speaking = false;
  /** The HUD line currently shows a thought (not game guidance). */
  private showingThought = false;

  init(): void {
    if (this.config.tutorial.peek()) {
      this.off = true;
      return;
    }
    const game = getGame(this.world);
    const ui = getUi(this.world);
    if (!ui.toggleStory) ui.toggleStory = () => this.skip();
    (window as unknown as { __story?: unknown }).__story = { skip: () => this.skip(), game };
    this.cleanupFuncs.push(
      game.story.on((e) => this.onStory(e)),
      // Game guidance ("An ember! Carry it to the tinder") is never covered by a thought: wait a moment after it.
      game.on((e) => {
        if (e.type === 'toast' && !this.speaking && e.text.trim()) {
          this.lineTimer = Math.max(this.lineTimer, GUIDANCE_HOLD);
          this.showingThought = false;
        }
      }),
    );
    this.buildClues();
    this.buildGlint();
  }

  /** "Wake up" on a new game: a dark fade-in and the first thoughts. */
  awaken(): void {
    if (this.off) return;
    const game = getGame(this.world);
    if (game.story.seen.has('awake')) return;
    if (game.time < 5) this.startFade();
    game.story.wake();
  }

  /** Skips the waiting thoughts; with none waiting, mutes or unmutes them. */
  skip(): void {
    const game = getGame(this.world);
    if (this.lines.length || (this.lineTimer > 0 && this.showingThought)) {
      this.lines.length = 0;
      this.lineTimer = 0;
      if (!this.showingThought) return;
      this.showingThought = false;
      this.speaking = true;
      game.toast(' ', 'info');
      this.speaking = false;
      game.log.add('story: thoughts skipped');
      return;
    }
    game.story.setMuted(!game.story.muted);
    game.toast(game.story.muted ? 'Thoughts off. Press the Story icon (or T) to turn them on.' : 'Thoughts on.', 'info');
  }

  private onStory(e: StoryEvent): void {
    if (getGame(this.world).story.muted) return;
    // Playing fast: stale thoughts are dropped rather than said long after the moment.
    if (this.lines.length > MAX_WAITING) this.lines.length = 0;
    if (e.type === 'act') this.lines.push(`${ACTS[e.act].title.toUpperCase()}. ${ACTS[e.act].text}`);
    else this.lines.push(...e.lines);
  }

  update(delta: number): void {
    if (this.off) return;
    this.t += delta;
    const game = getGame(this.world);
    if ((this.poll += delta) >= POLL_SECONDS) {
      this.poll = 0;
      game.story.poll(this.lines.length > 0 || (this.lineTimer > 0 && this.showingThought));
      if (game.story.camp && !this.campMarker) this.buildCampMarker(game.story.camp.x, game.story.camp.z);
    }
    if (this.lineTimer > 0) this.lineTimer -= delta;
    else if (this.lines.length) {
      this.lineTimer = LINE_GAP;
      this.speaking = true;
      this.showingThought = true;
      game.toast(this.lines.shift()!, 'note');
      this.speaking = false;
    }
    this.updateFade(delta);
    this.updateGlint();
  }

  // ------------------------------------------------------------ awakening

  private startFade(): void {
    if (!this.fade) {
      const m = new MeshBasicMaterial({ color: 0x050403, side: BackSide, transparent: true, depthTest: false, depthWrite: false });
      this.fade = new Mesh(new SphereGeometry(0.4, 16, 12), m);
      this.fade.renderOrder = 10000;
      this.fade.frustumCulled = false;
      this.world.createTransformEntity(this.fade);
    }
    this.fadeT = 0;
    this.fade.visible = true;
  }

  private updateFade(delta: number): void {
    if (!this.fade || this.fadeT < 0) return;
    this.fadeT += delta;
    const k = Math.min(1, this.fadeT / FADE_SECONDS);
    // Slow at first (eyes opening), then the forest.
    (this.fade.material as MeshBasicMaterial).opacity = 1 - k * k * (3 - 2 * k);
    this.camera.getWorldPosition(this.camPos);
    this.fade.position.copy(this.camPos);
    if (k >= 1) {
      this.fade.visible = false;
      this.fadeT = -1;
    }
  }

  // ------------------------------------------------------------ clues (existing low-poly look: flat-shaded stone and wood)

  private buildClues(): void {
    const rng = mulberry32(911);
    const stone = new MeshStandardMaterial({ color: 0x8a8378, roughness: 0.95, flatShading: true });
    const scorched = new MeshStandardMaterial({ color: 0x3b3631, roughness: 1, flatShading: true });
    const coal = new MeshStandardMaterial({ color: 0x1a1817, roughness: 1, flatShading: true });
    const ash = new MeshStandardMaterial({ color: 0x55504a, roughness: 1, transparent: true, opacity: 0.85 });
    const wood = new MeshStandardMaterial({ color: 0x8e7656, roughness: 0.9, flatShading: true });
    const rock = new DodecahedronGeometry(0.1, 0);
    const root = new Group();
    root.name = 'StoryClues';

    // Old fire remains: an ash patch, a broken ring of blackened stones (two missing), charcoal bits.
    const f = CLUES.oldFire;
    const fy = groundHeight(f.x, f.z);
    const patch = new Mesh(new CircleGeometry(0.42, 10), ash);
    patch.rotation.x = -Math.PI / 2;
    patch.position.set(f.x, fy + 0.012, f.z);
    root.add(patch);
    for (let i = 0; i < 8; i++) {
      if (i === 2 || i === 5) continue;
      const a = (i / 8) * Math.PI * 2;
      const s = new Mesh(rock, i % 3 === 0 ? scorched : stone);
      s.scale.setScalar(0.9 + rng() * 0.6);
      s.rotation.set(rng() * 3, rng() * 3, rng() * 3);
      s.position.set(f.x + Math.cos(a) * 0.52, fy + 0.05, f.z + Math.sin(a) * 0.52);
      root.add(s);
    }
    for (let i = 0; i < 5; i++) {
      const c = new Mesh(rock, coal);
      c.scale.set(0.35, 0.25, 0.5);
      c.rotation.y = rng() * 3;
      c.position.set(f.x + (rng() - 0.5) * 0.4, fy + 0.025, f.z + (rng() - 0.5) * 0.4);
      root.add(c);
    }

    // A used branch: stripped, worn at one end, leaning on a stone.
    const b = CLUES.usedBranch;
    const by = groundHeight(b.x, b.z);
    const rest = new Mesh(rock, stone);
    rest.scale.setScalar(1.6);
    rest.position.set(b.x, by + 0.08, b.z);
    root.add(rest);
    const stick = new Mesh(new CylinderGeometry(0.018, 0.028, 1.1, 6), wood);
    stick.position.set(b.x - 0.35, by + 0.13, b.z + 0.05);
    stick.rotation.z = Math.PI / 2 - 0.22;
    root.add(stick);

    // Unnaturally arranged stones: five in a straight line, evenly spaced.
    const l = CLUES.stoneLine;
    for (let i = 0; i < 5; i++) {
      const x = l.x + (i - 2) * 0.42;
      const z = l.z + (i - 2) * 0.12;
      const s = new Mesh(rock, stone);
      s.scale.setScalar(1.1 + rng() * 0.3);
      s.rotation.set(rng() * 3, rng() * 3, rng() * 3);
      s.position.set(x, groundHeight(x, z) + 0.07, z);
      root.add(s);
    }
    this.world.createTransformEntity(root);
  }

  // ------------------------------------------------------------ camp marker

  /** A small cairn with a lashed stick: the camp, as a place you recognise from a distance. */
  private buildCampMarker(x: number, z: number): void {
    const g = new Group();
    g.name = 'CampMarker';
    const stone = new MeshStandardMaterial({ color: 0x9a9284, roughness: 0.95, flatShading: true });
    const wood = new MeshStandardMaterial({ color: 0x7a5f40, roughness: 0.9, flatShading: true });
    const cord = new MeshStandardMaterial({ color: 0xc9b48a, roughness: 1 });
    const y = groundHeight(x, z);
    const sizes = [0.2, 0.16, 0.12];
    let h = 0;
    for (let i = 0; i < sizes.length; i++) {
      const s = new Mesh(new DodecahedronGeometry(sizes[i], 0), stone);
      s.scale.y = 0.6;
      s.rotation.y = i * 1.1;
      h += sizes[i] * (i ? 1.05 : 0.6);
      s.position.set(0, h, 0);
      g.add(s);
    }
    const pole = new Mesh(new CylinderGeometry(0.02, 0.025, 1.5, 6), wood);
    pole.position.set(0.05, 0.75, 0.03);
    pole.rotation.z = -0.06;
    g.add(pole);
    const tie = new Mesh(new CylinderGeometry(0.03, 0.03, 0.06, 6), cord);
    tie.position.set(0.0, 1.35, 0.03);
    g.add(tie);
    // Offset from the midpoint so it never sits inside the fire or the bench.
    g.position.set(x + 1.2, y, z + 0.6);
    this.campMarker = g;
    this.world.createTransformEntity(g);
    getGame(this.world).log.add(`story: camp marker at ${x.toFixed(1)},${z.toFixed(1)}`, 'ok');
  }

  // ------------------------------------------------------------ the mast glint (ruins teaser)

  private buildGlint(): void {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    if (ctx) {
      const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, 'rgba(255,240,210,1)');
      grad.addColorStop(0.25, 'rgba(255,200,140,0.6)');
      grad.addColorStop(1, 'rgba(255,180,120,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 64, 64);
    }
    this.glintMat = new SpriteMaterial({ map: new CanvasTexture(c), blending: AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 });
    this.glint = new Sprite(this.glintMat);
    this.glint.scale.setScalar(1.6);
    this.glint.position.set(MAST_TOP.x, MAST_TOP.y, MAST_TOP.z);
    this.glint.visible = false;
    this.world.createTransformEntity(this.glint);
  }

  /** After the camp: a slow, faint pulse near the mast top, brighter as the light goes. No head turn. */
  private updateGlint(): void {
    if (!this.glint || !this.glintMat) return;
    const s = getGame(this.world).story;
    const on = s.seen.has('camp') && !getGame(this.world).flag('finale');
    this.glint.visible = on;
    if (!on) return;
    const night = getGame(this.world).env.night;
    const pulse = Math.max(0, Math.sin(this.t * 0.9)) ** 6;
    this.glintMat.opacity = (0.25 + 0.75 * pulse) * (0.45 + 0.55 * night);
  }
}
