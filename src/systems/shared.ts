// Helpers shared by the game systems: access to the Game instance, the
// player's head/hip, and placing panels in front of the player.

import { AdditiveBlending, Box3, MeshBasicMaterial, type Object3D, Quaternion, Vector3, type World } from '@iwsdk/core';
import type { Game } from '../game/game.js';
import { MenuStack } from '../game/menu.js';
import type { HandBusy } from '../game/priority.js';

export interface UiHooks {
  dropHeld(item: import('../game/items.js').ItemId): void;
  /** Throw what you hold (desktop Shift+G). */
  throwHeld(): void;
  /** Hide the item shown in your hand while an interaction draws its own model. */
  setHeldVisible(visible: boolean): void;
  /** Would a left press right now start a hand interaction (so it must not turn the view)? */
  capturesPointer(): boolean;
  /** Open the recipe panel of workbench `structureId`. */
  openBench(structureId: number): void;
  /** Open the recipe panel of the finished workbench you are standing at, if any. */
  openNearestBench(): void;
  toggleSatchel(): void;
  /** Open or close the build book. */
  toggleBook(): void;
  openNotebook(): void;
  showHint(): void;
  /** Put the sky light pillar over a world point (null clears it). The hint level-3 effect. */
  setBeacon(at: { x: number; z: number } | null): void;
  /** Open the image-hint panel for an objective (part B); the card's hint icon calls it. */
  openHint(objectiveId: string): void;
  /** True while the hint panel is open; the objective card hides meanwhile so the two never overlap. */
  hintOpen?(): boolean;
  /** True while the notebook card is open; the objective card hides meanwhile. */
  notebookOpen?(): boolean;
  toggleGuide(): void;
  /** Fold the quest details open or closed on the status strip. */
  toggleQuest(): void;
  questOpen(): boolean;
  /** Notebook entries recorded since it was last opened. */
  newNotes(): number;
  /** Snap-turn the view by `deg` degrees (positive = left), pivoting on your head. */
  snapTurn(deg: number): void;
  /** Write the save now (before a reload). */
  saveNow(): void;
  /** Guided opening only: open or fold the story card's steps and replay / skip controls. */
  toggleStory?(): void;
  /** Title menu: the Tutorial button (set by TutorialSystem: start the guided steps, or leave them). */
  titleTutorial?(): void;
  /** Title menu: Play / Continue was pressed (TutorialSystem records the skip choice). */
  titlePlay?(): void;
  /** True while the title menu is up (other cards stay out of its way). */
  titleOpen?(): boolean;
  /** True while the pause card is up or the game is paused. */
  paused?(): boolean;
}

export function getGame(world: World): Game {
  return (world.globals as { game: Game }).game;
}

export function getUi(world: World): Partial<UiHooks> {
  const g = world.globals as { ui?: Partial<UiHooks> };
  return (g.ui ??= {});
}

const tmpPos = new Vector3();
const tmpDir = new Vector3();

/** Head yaw in radians (0 = looking towards −Z), from the camera's world matrix. */
export function headYaw(camera: Object3D): number {
  camera.getWorldDirection(tmpDir);
  return Math.atan2(-tmpDir.x, -tmpDir.z);
}

/** Where the satchel hangs: low and to the right of the head, yaw-aligned. */
export function hipPosition(camera: Object3D, out: Vector3): Vector3 {
  camera.getWorldPosition(out);
  const yaw = headYaw(camera);
  const right = 0.24;
  const forward = 0.12;
  out.x += Math.cos(yaw) * right - Math.sin(yaw) * forward;
  out.z += -Math.sin(yaw) * right - Math.cos(yaw) * forward;
  out.y = Math.max(0.35, out.y - 0.6);
  return out;
}

/**
 * Puts a panel `distance` m in front of the head, offset sideways/down, and
 * turns it to face the head (panels face +Z).
 */
export function placeInFront(panel: Object3D, camera: Object3D, distance: number, side = 0, down = 0.15): void {
  camera.getWorldPosition(tmpPos);
  const yaw = headYaw(camera);
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  panel.position.set(
    tmpPos.x + fx * distance + Math.cos(yaw) * side,
    tmpPos.y - down,
    tmpPos.z + fz * distance - Math.sin(yaw) * side,
  );
  // Yaw to face the head, then tilt back so a panel below eye level looks up at you.
  panel.rotation.set(-Math.atan2(down, distance), Math.atan2(tmpPos.x - panel.position.x, tmpPos.z - panel.position.z), 0, 'YXZ');
}

/** Moves an interactive panel out of the way (and out of ray reach) when closed. */
export function hidePanel(panel: Object3D): void {
  panel.visible = false;
  panel.position.set(0, -50, 0);
}

/** Plain-ASCII copy for UI text: the bundled font only covers basic glyphs. */
export function uiText(s: string): string {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/—|–/g, ' - ')
    .replace(/≠/g, '!=')
    .replace(/✓/g, '[x]')
    .replace(/·/g, '[ ]')
    .replace(/→/g, '->')
    .replace(/×/g, 'x')
    .replace(/₂/g, '2')
    .replace(/★/g, '*')
    .replace(/°/g, ' deg')
    .replace(/…/g, '...')
    .replace(/[\u{1F300}-\u{1FAFF}]\s?/gu, '')
    .replace(/ {2,}/g, ' ');
}

/** Things arrows can hit (animals, practice targets). Other systems push/remove entries. */
export interface ArrowTarget {
  x: number;
  y: number;
  z: number;
  r: number;
  onHit?: () => void;
}
export const arrowTargets: ArrowTarget[] = [];

/** Brief camera pitch kick (radians) from impacts; DesktopControlsSystem adds it and decays it. */
export const camNudge = { pitch: 0 };

/** Soft ground glow under every pickable thing. One shared material, pulsed once a frame by ResourceSystem. */
export const glowMaterial = new MeshBasicMaterial({
  color: 0xfff1a8,
  transparent: true,
  opacity: 0.3,
  depthWrite: false,
  blending: AdditiveBlending,
});
/** Brighter version for what you are aiming at. */
// Not a flat disc: a soft pool with a faint ring at its edge (the circle geometry is 0.22 m across its radius), so pickups read as a gentle halo.
glowMaterial.onBeforeCompile = (sh) => {
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vLp;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvLp = position.xy;');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec2 vLp;')
    .replace('#include <color_fragment>', '#include <color_fragment>\n{ float gr = length(vLp) / 0.22; float ring = smoothstep(0.5, 0.82, gr) * smoothstep(1.0, 0.86, gr); diffuseColor.a *= 0.22 * (1.0 - smoothstep(0.0, 1.0, gr)) + 0.95 * ring; }');
};
glowMaterial.customProgramCacheKey = () => 'soft-glow';
export const glowMaterialHot = glowMaterial.clone();
glowMaterialHot.color.setHex(0x40ff70);
glowMaterialHot.opacity = 0.7;

/**
 * What the desktop arms should act out, driven every frame by InteractionSystem
 * (not canned clips): `mode` picks the pose, `amount` 0..1 its progress,
 * `x`/`y` small hand offsets in metres.
 */
export const handPose = { mode: 'free' as 'free' | 'bend' | 'swing' | 'knap' | 'twist' | 'drag' | 'place', amount: 0, x: 0, y: 0 };

/**
 * The pose and velocity of something just let go, handed from CarrySystem to
 * DropSystem so the dropped object starts where your hand released it.
 */
export const pendingRelease = {
  valid: false,
  item: '' as string,
  pos: new Vector3(),
  vel: new Vector3(),
  quat: new Quaternion(),
  /** Set down gently on a surface: DropSystem rests it there with no fall (hands-only placement). */
  place: false,
  set(item: string, x: number, y: number, z: number, vx: number, vy: number, vz: number): void {
    this.valid = true;
    this.place = false;
    this.item = item;
    this.pos.set(x, y, z);
    this.vel.set(vx, vy, vz);
    this.quat.identity();
  },
};

/** Where the last gathered thing was, so a pickup can animate from there to the hand. */
export const pickupFrom = { valid: false, pos: new Vector3(), time: 0 };

/**
 * A VR panel that stays put. It is placed once in front of you and only
 * re-placed (instantly, no gliding) after you teleport or turn well away, so
 * nothing drifts around in view. Call update() every frame with the panel.
 */
/** A head-height change (m) that re-places a static panel. */
const MAX_RISE = 0.15;

/** Where the hands are, set once by HandInputSystem (shared.ts must not import it: it imports this file). */
export const handSource: { frames: Array<{ tracked: boolean; grip: boolean; gripDown: boolean; gripUp: boolean; pinchPos: Vector3 }> | null } = { frames: null };

/** A user-chosen spot for a card: sideways, down and distance from the head (yaw-aligned), remembered between sessions. */
export interface PanelSpot {
  side: number;
  down: number;
  distance: number;
}

const spotKey = (k: string) => `primal.panel.${k}`;
function loadSpot(k: string): PanelSpot | null {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(spotKey(k));
    const v = raw ? (JSON.parse(raw) as PanelSpot) : null;
    return v && Number.isFinite(v.side) && Number.isFinite(v.down) && Number.isFinite(v.distance) ? v : null;
  } catch {
    return null;
  }
}
function saveSpot(k: string, v: PanelSpot): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(spotKey(k), JSON.stringify(v));
  } catch {
    /* private mode: the card just returns to its default spot next time */
  }
}
/** Forget every remembered card spot (the Restart / reset path). */
export function clearPanelSpots(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith('primal.panel.')) localStorage.removeItem(k);
    }
  } catch {
    /* nothing to clear */
  }
}

/** Keeps the card where the player last left it, within comfortable bounds (distance 0.32-0.9 m, down 0.02-0.4 m, side +-0.6 m). */
export const clampSpot = (v: PanelSpot): PanelSpot => ({
  side: Math.max(-0.6, Math.min(0.6, v.side)),
  down: Math.max(0.02, Math.min(0.4, v.down)),
  distance: Math.max(0.32, Math.min(0.9, v.distance)),
});

/** Movable cards by key (debug and tests: where each one hangs now). */
export const cards: Record<string, Object3D> = {};

/** What the ghost hand should demonstrate right now (null = nothing), and next to which card. Set by the teaching cards. */
export const ghost: { clip: string | null; card: string | null; how: string | null } = { clip: null, card: null, how: null };

/**
 * Scroll a paged list: the mouse wheel (flat view) or a pinch-drag up/down anywhere on the card body (VR; the header strip
 * stays the move handle). Calls `step(+1)` for "later" (drag up / wheel down) and `step(-1)` for "earlier".
 */
export class SwipePager {
  private hand = -1;
  private startY = 0;
  private local = new Vector3();
  constructor(
    private step: (d: number) => void,
    private widthUnits: number,
    private heightUnits: number,
    private headerUnits = 90,
  ) {}

  /** Mouse wheel; call once from init and register the returned remover in cleanupFuncs. */
  listenWheel(isOpen: () => boolean): () => void {
    let acc = 0;
    const on = (e: WheelEvent): void => {
      if (!isOpen()) return;
      acc += e.deltaY;
      if (Math.abs(acc) >= 60) {
        this.step(acc > 0 ? 1 : -1);
        acc = 0;
      }
    };
    window.addEventListener('wheel', on, { passive: true });
    return () => window.removeEventListener('wheel', on);
  }

  /** VR pinch-drag; call every frame while the card is open. */
  update(panel: Object3D): void {
    const frames = handSource.frames;
    if (!frames) return;
    if (this.hand < 0) {
      for (let h = 0; h < frames.length; h++) {
        const f = frames[h];
        if (!f.tracked || !f.gripDown) continue;
        panel.updateWorldMatrix(true, false);
        this.local.copy(f.pinchPos);
        panel.worldToLocal(this.local);
        const sy = panel.scale.y || 1;
        const hw = this.widthUnits * 0.005;
        const hh = this.heightUnits * 0.005;
        if (Math.abs(this.local.x) <= hw && Math.abs(this.local.z) <= 0.06 / sy && this.local.y <= hh - this.headerUnits * 0.01 && this.local.y >= -hh) {
          this.hand = h;
          this.startY = f.pinchPos.y;
          break;
        }
      }
      return;
    }
    const f = frames[this.hand];
    if (!f.tracked || !f.grip || f.gripUp) {
      this.hand = -1;
      return;
    }
    const dy = f.pinchPos.y - this.startY;
    if (Math.abs(dy) > 0.05) {
      this.step(dy > 0 ? 1 : -1); // dragging the card up (hand moves up) shows later rows, like a phone
      this.startY = f.pinchPos.y;
    }
  }
}

export class StaticAnchor {
  private placedYaw = 0;
  private placedX = 0;
  private placedZ = 0;
  private placedY = 0;
  private placed = false;
  private head = new Vector3();
  /** User-moved spot (overrides the default), and the drag in progress. */
  private spot: PanelSpot | null = null;
  private dragHand = -1;
  private grabOffset = new Vector3();
  private tmp = new Vector3();
  private key = '';
  private local = new Vector3();

  constructor(
    private distance: number,
    private side: number,
    private down: number,
    /** Re-place when the head has turned this far from where the panel was put (rad). */
    private maxTurn = 1.05,
    /** ...or moved this far (m), e.g. a teleport. */
    private maxMove = 1.2,
  ) {}

  /**
   * Let the player move this card by pinching its header strip and dragging (VR). `widthUnits` x `heightUnits` is the card in its own
   * units and `headerUnits` the height of the grab strip along its top edge. The spot is remembered under `key`.
   */
  movable(key: string, widthUnits: number, heightUnits: number, headerUnits = 90): this {
    this.key = key;
    this.wUnits = widthUnits;
    this.hUnits = heightUnits;
    this.headerUnits = headerUnits;
    this.spot = loadSpot(key);
    return this;
  }
  private headerUnits = 90;
  private wUnits = 400;
  private hUnits = 300;

  reset(): void {
    this.placed = false;
  }

  /** True while a hand is dragging this card. */
  get dragging(): boolean {
    return this.dragHand >= 0;
  }

  /** Change how far below eye level the panel hangs (it is re-placed on the next update). */
  setDown(down: number): void {
    if (Math.abs(down - this.down) < 1e-4) return;
    this.down = down;
    this.placed = false;
  }

  /** Put the card back at its default spot. */
  home(): void {
    this.spot = null;
    this.placed = false;
    if (this.key) {
      try {
        localStorage.removeItem(spotKey(this.key));
      } catch {
        /* ignore */
      }
    }
  }

  private drag(panel: Object3D, camera: Object3D): boolean {
    const frames = handSource.frames;
    if (!this.key || !frames) return false;
    if (this.dragHand < 0) {
      for (let h = 0; h < frames.length; h++) {
        const f = frames[h];
        if (!f.tracked || !f.gripDown) continue;
        // Is the pinch inside the card's header strip (card-local units, a little in front of or behind the surface)?
        // The strip along the card's top edge (measured from its real bounds, so cards of any height work), a little generous around it.
        panel.updateWorldMatrix(true, false);
        this.local.copy(f.pinchPos);
        panel.worldToLocal(this.local);
        const sx = panel.scale.x || 1;
        const sy = panel.scale.y || 1;
        // Panel units are 1 cm in the object's own (scaled) space.
        const hw = (this.wUnits * 0.005 + 0.03 / sx);
        const topY = this.hUnits * 0.005;
        if (Math.abs(this.local.x) <= hw && Math.abs(this.local.z) <= 0.06 / sx && this.local.y <= topY + 0.03 / sy && this.local.y >= topY - this.headerUnits * 0.01 - 0.03 / sy) {
          this.dragHand = h;
          this.grabOffset.copy(panel.position).sub(f.pinchPos);
          break;
        }
      }
      if (this.dragHand < 0) return false;
    }
    const f = frames[this.dragHand];
    if (!f.tracked || !f.grip || f.gripUp) {
      // Let go: remember where the card is, relative to the head.
      camera.getWorldPosition(this.head);
      const yaw = headYaw(camera);
      const dx = panel.position.x - this.head.x;
      const dz = panel.position.z - this.head.z;
      const fwd = dx * -Math.sin(yaw) + dz * -Math.cos(yaw);
      const side = dx * Math.cos(yaw) + dz * -Math.sin(yaw);
      this.spot = clampSpot({ side, down: this.head.y - panel.position.y, distance: fwd });
      saveSpot(this.key, this.spot);
      this.dragHand = -1;
      this.placed = false;
      return false;
    }
    panel.position.copy(f.pinchPos).add(this.grabOffset);
    // Keep it facing you while it moves.
    camera.getWorldPosition(this.head);
    const dd = this.head.y - panel.position.y;
    const dist = Math.hypot(this.head.x - panel.position.x, this.head.z - panel.position.z) || 0.01;
    panel.rotation.set(-Math.atan2(dd, dist), Math.atan2(this.head.x - panel.position.x, this.head.z - panel.position.z), 0, 'YXZ');
    return true;
  }

  update(panel: Object3D, camera: Object3D): void {
    if (this.key) cards[this.key] = panel;
    if (this.drag(panel, camera)) return;
    camera.getWorldPosition(this.head);
    const yaw = headYaw(camera);
    let turn = Math.abs(yaw - this.placedYaw) % (Math.PI * 2);
    if (turn > Math.PI) turn = Math.PI * 2 - turn;
    const moved = Math.hypot(this.head.x - this.placedX, this.head.z - this.placedZ);
    // Sitting down, standing up, or a head height that was not settled when the panel was put
    // (entering VR) also re-places it, so it never ends up level with or above your eyes.
    const rose = Math.abs(this.head.y - this.placedY);
    if (this.placed && turn < this.maxTurn && moved < this.maxMove && rose < MAX_RISE) return;
    if (this.spot) placeInFront(panel, camera, this.spot.distance, this.spot.side, this.spot.down);
    else placeInFront(panel, camera, this.distance, this.side, this.down);
    this.placed = true;
    this.placedYaw = yaw;
    this.placedX = this.head.x;
    this.placedZ = this.head.z;
    this.placedY = this.head.y;
  }
}

/**
 * Who is using a pinch right now, so the hand actions do not trip over each
 * other (priority: held object > UI tap > grab > movement).
 */
/**
 * Hint effects other systems want drawn, written by HintFxSystem and drawn by HighlightSystem so every
 * highlight shares one budget: pulsing nearby resources (level 2) and the one exact target (level 4).
 */
export const hintFx = {
  pulse: [] as Array<{ id: string; x: number; y: number; z: number }>,
  exact: null as { id: string; x: number; y: number; z: number } | null,
  /** The soft pool on the ground under the sky pillar, so the exact spot is easy to find once you reach it. */
  glow: null as { x: number; y: number; z: number } | null,
};

export const handClaims = {
  /** Fingertip is on / just tapped a UI icon: that pinch or poke is not a grab. */
  uiNear: [false, false],
  /** When (s) a fingertip was last near a panel; uiNear is recomputed from it each frame (HandInputSystem). */
  uiNearAt: [-10, -10],
  uiTapAt: [-10, -10],
  /** This hand's current pinch grabbed (or is holding) something: it must not start a teleport. */
  grabbing: [false, false],
  /** This hand's pinch is a teleport aim in progress. */
  moving: [false, false],
  /** Hand that holds the carried object, and when the last direct grab / pickup happened. */
  holdHand: 1 as 0 | 1,
  grabAt: -10,
  /** Tilt (degrees from upright) and world position of the carried object, written by CarrySystem each frame. */
  heldTilt: 0,
  heldPos: new Vector3(),
};

/** What hand `h` is busy with, for the one priority order (src/game/priority.ts). */
export function handBusy(world: World, h: 0 | 1): HandBusy {
  const now = performance.now() / 1000;
  return {
    held: !!getGame(world).held && handClaims.holdHand === h && handClaims.grabbing[h],
    ui: handClaims.uiNear[h] || now - handClaims.uiTapAt[h] < 0.5,
    grab: false,
    move: handClaims.moving[h],
  };
}

/** Which one fingertip panel is open and whether the icon grid is unfolded (src/game/menu.ts). */
export const menu = new MenuStack();

/** Where an open fingertip panel hangs (m): in comfortable seated reach, a little below the eyes, facing you. */
export const PANEL_DISTANCE = 0.45;
export const PANEL_DOWN = 0.1;

// ---------------------------------------------------------------- gaze selection of UI
/** Something that can run a UI element chosen by gaze + pinch (a PanelTouch panel, the objective card). */
export interface GazeUiOwner {
  /** Run element `id` (an index the owner gave in collectGaze) as its fingertip tap does. */
  gazeActivate(id: number): void;
  /** Light (or clear) the gaze highlight on element `id`. */
  gazeHover(id: number, on: boolean): void;
}
export type GazeUiAdd = (prefix: string, key: string, x: number, y: number, z: number, r: number, owner: GazeUiOwner, id: number) => void;
/** Every on-screen panel that can offer UI elements as gaze targets (registered once at creation). */
export const gazeUi: Array<{ collectGaze(add: GazeUiAdd): void }> = [];
