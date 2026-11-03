// Helpers shared by the game systems: access to the Game instance, the
// player's head/hip, and placing panels in front of the player.

import { AdditiveBlending, MeshBasicMaterial, type Object3D, Vector3, type World } from '@iwsdk/core';
import type { Game } from '../game/game.js';

export interface UiHooks {
  dropHeld(item: import('../game/items.js').ItemId): void;
  /** Hide the item shown in your hand while an interaction draws its own model. */
  setHeldVisible(visible: boolean): void;
  /** Would a left press right now start a hand interaction (so it must not turn the view)? */
  capturesPointer(): boolean;
  /** Open the recipe panel of workbench `structureId`. */
  openBench(structureId: number): void;
  toggleSatchel(): void;
  openNotebook(): void;
  showHint(): void;
  toggleGuide(): void;
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
