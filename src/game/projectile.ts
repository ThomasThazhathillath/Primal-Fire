// Arrow flight: simple ballistic motion with gravity and a ground plane.
// Pure so it can be tested; BowSystem owns the meshes.

export const GRAVITY = 9.8;
/** Hand draw distance (m) range and the arrow speed it maps to (m/s). */
export const MIN_DRAW = 0.2;
export const MAX_DRAW = 0.65;
export const MAX_SPEED = 32;

export interface Vec { x: number; y: number; z: number }

/** Launch speed for a draw length; 0 when under the minimum draw. */
export function drawSpeed(draw: number): number {
  if (draw < MIN_DRAW) return 0;
  const t = Math.min(1, (draw - MIN_DRAW) / (MAX_DRAW - MIN_DRAW));
  return 8 + t * (MAX_SPEED - 8);
}

export interface Arrow extends Vec {
  vx: number;
  vy: number;
  vz: number;
  alive: boolean;
}

export function launch(a: Arrow, from: Vec, dir: Vec, speed: number): void {
  const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
  a.x = from.x;
  a.y = from.y;
  a.z = from.z;
  a.vx = (dir.x / len) * speed;
  a.vy = (dir.y / len) * speed;
  a.vz = (dir.z / len) * speed;
  a.alive = true;
}

export type Impact = 'none' | 'ground' | 'target';

export interface Target extends Vec {
  r: number;
}

/** Advances one arrow by dt; returns what it struck, if anything. */
export function step(a: Arrow, dt: number, targets: readonly Target[]): Impact {
  if (!a.alive) return 'none';
  a.vy -= GRAVITY * dt;
  const nx = a.x + a.vx * dt;
  const ny = a.y + a.vy * dt;
  const nz = a.z + a.vz * dt;
  for (const t of targets) {
    // Closest point on the segment to the target centre.
    const dx = nx - a.x;
    const dy = ny - a.y;
    const dz = nz - a.z;
    const l2 = dx * dx + dy * dy + dz * dz || 1;
    const u = Math.max(0, Math.min(1, ((t.x - a.x) * dx + (t.y - a.y) * dy + (t.z - a.z) * dz) / l2));
    const px = a.x + dx * u - t.x;
    const py = a.y + dy * u - t.y;
    const pz = a.z + dz * u - t.z;
    if (px * px + py * py + pz * pz <= t.r * t.r) {
      a.alive = false;
      return 'target';
    }
  }
  a.x = nx;
  a.y = ny;
  a.z = nz;
  if (ny <= 0) {
    a.y = 0;
    a.alive = false;
    return 'ground';
  }
  return 'none';
}
