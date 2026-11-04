// Helpers shared by the game systems: access to the Game instance, the
// player's head/hip, and placing panels in front of the player.

import { AdditiveBlending, MeshBasicMaterial, type Object3D, Quaternion, Vector3, type World } from '@iwsdk/core';
import type { Game } from '../game/game.js';
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
  toggleSatchel(): void;
  /** Open or close the build book. */
  toggleBook(): void;
  openNotebook(): void;
  showHint(): void;
  /** Open the image-hint panel for an objective (part B); the card's hint icon calls it. */
  openHint(objectiveId: string): void;
  /** True while the hint panel is open; the objective card hides meanwhile so the two never overlap. */
  hintOpen?(): boolean;
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

export class StaticAnchor {
  private placedYaw = 0;
  private placedX = 0;
  private placedZ = 0;
  private placedY = 0;
  private placed = false;
  private head = new Vector3();

  constructor(
    private distance: number,
    private side: number,
    private down: number,
    /** Re-place when the head has turned this far from where the panel was put (rad). */
    private maxTurn = 1.05,
    /** ...or moved this far (m), e.g. a teleport. */
    private maxMove = 1.2,
  ) {}

  reset(): void {
    this.placed = false;
  }

  update(panel: Object3D, camera: Object3D): void {
    camera.getWorldPosition(this.head);
    const yaw = headYaw(camera);
    let turn = Math.abs(yaw - this.placedYaw) % (Math.PI * 2);
    if (turn > Math.PI) turn = Math.PI * 2 - turn;
    const moved = Math.hypot(this.head.x - this.placedX, this.head.z - this.placedZ);
    // Sitting down, standing up, or a head height that was not settled when the panel was put
    // (entering VR) also re-places it, so it never ends up level with or above your eyes.
    const rose = Math.abs(this.head.y - this.placedY);
    if (this.placed && turn < this.maxTurn && moved < this.maxMove && rose < MAX_RISE) return;
    placeInFront(panel, camera, this.distance, this.side, this.down);
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
export const handClaims = {
  /** Fingertip is on / just tapped a UI icon: that pinch or poke is not a grab. */
  uiNear: [false, false],
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
