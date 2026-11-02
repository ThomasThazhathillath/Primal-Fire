// The opened backpack: a leather sack with a rolled rim, a flap hanging off
// the back, and straps. Items are placed inside by SatchelSystem.

import { CylinderGeometry, Group, Mesh, TorusGeometry } from '@iwsdk/core';
import { lambert } from './materials.js';

export const BAG_RADIUS = 0.2;
export const BAG_HEIGHT = 0.22;

export function buildOpenBag(): Group {
  const g = new Group();
  g.name = 'OpenBag';
  const leather = lambert(0x7a5432);
  const dark = lambert(0x4a3220);
  const body = new Mesh(new CylinderGeometry(BAG_RADIUS, BAG_RADIUS * 0.8, BAG_HEIGHT, 14, 1, true), leather);
  body.position.y = BAG_HEIGHT / 2;
  const floor = new Mesh(new CylinderGeometry(BAG_RADIUS * 0.8, BAG_RADIUS * 0.8, 0.01, 14), dark);
  floor.position.y = 0.005;
  const rim = new Mesh(new TorusGeometry(BAG_RADIUS, 0.014, 6, 18), dark);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = BAG_HEIGHT;
  const flap = new Mesh(new CylinderGeometry(BAG_RADIUS * 0.95, BAG_RADIUS * 0.95, 0.012, 14, 1, false, 0, Math.PI), leather);
  flap.position.set(0, BAG_HEIGHT + 0.02, -BAG_RADIUS * 0.1);
  flap.rotation.x = -0.9;
  flap.position.z = -BAG_RADIUS - 0.04;
  body.material.side = 2; // DoubleSide so the inside is visible
  g.add(floor, body, rim, flap);
  return g;
}
