// One input model for physical interactions. Each frame this fills `hands`
// (position, velocity, rotation, wrist roll, grip) from the XR grip spaces of
// tracked hands or controllers, and `mouse` from the desktop pointer. Grip
// comes from WebXR select (trigger / hand pinch) and squeeze (grip button)
// events, so the same code works for controllers and hand tracking.
// Everything is preallocated: nothing is created per frame.

import { createSystem, type Object3D, Quaternion, Vector3, VisibilityState } from '@iwsdk/core';

export interface HandFrame {
  readonly pos: Vector3;
  readonly vel: Vector3;
  readonly quat: Quaternion;
  /** Rotation speed (rad/s). */
  angSpeed: number;
  /** Wrist roll about the hand's pointing axis this frame (rad, signed). */
  roll: number;
  /** Trigger/pinch or squeeze held. */
  grip: boolean;
  /** Grip closed this frame / opened this frame. */
  gripDown: boolean;
  gripUp: boolean;
  /** Squeeze (grip button / closed fist) held, and released this frame: what holds and lets go of carried things. */
  squeeze: boolean;
  squeezeUp: boolean;
  tracked: boolean;
}

function frame(): HandFrame {
  return {
    pos: new Vector3(),
    vel: new Vector3(),
    quat: new Quaternion(),
    angSpeed: 0,
    roll: 0,
    grip: false,
    gripDown: false,
    gripUp: false,
    squeeze: false,
    squeezeUp: false,
    tracked: false,
  };
}

/** [left, right]. Valid in VR only (`tracked`). */
export const hands: [HandFrame, HandFrame] = [frame(), frame()];

/** Desktop pointer gesture state (CSS pixels). */
export const mouse = {
  down: false,
  /** Pressed / released this frame. */
  pressed: false,
  released: false,
  x: 0,
  y: 0,
  /** Drag since press. */
  dragX: 0,
  dragY: 0,
  /** Smoothed pointer velocity (px/s). */
  vx: 0,
  vy: 0,
  /** Wheel delta this frame. */
  wheel: 0,
  /** Shift held: "use both hands" for heavy things. */
  shift: false,
  /** Shift was held at any moment since the press (survives letting go just before release). */
  bothHands: false,
  /** Seconds since press. */
  heldFor: 0,
};

/** Short vibration on the controller in `hand` (no-op for tracked hands). */
export function pulse(session: XRSession | null | undefined, hand: 0 | 1, strength: number, ms: number): void {
  if (!session) return;
  const want = hand === 0 ? 'left' : 'right';
  for (const src of session.inputSources) {
    if (src.handedness !== want) continue;
    const act = (src.gamepad as (Gamepad & { hapticActuators?: Array<{ pulse(v: number, d: number): Promise<boolean> }> }) | undefined)
      ?.hapticActuators?.[0];
    act?.pulse(Math.min(1, strength), ms).catch(() => undefined);
  }
}

export class HandInputSystem extends createSystem({}) {
  private prevPos = [new Vector3(), new Vector3()];
  private prevQuat = [new Quaternion(), new Quaternion()];
  private delta = new Quaternion();
  private had = [false, false];
  private select = [false, false];
  private squeeze = [false, false];
  private gripWas = [false, false];
  private squeezeWas = [false, false];
  private lastX = 0;
  private lastY = 0;
  private moved = false;
  private pendingWheel = 0;
  private pendingPress = false;
  private pendingRelease = false;
  private attached: XRSession | null = null;
  private attach: () => void = () => undefined;

  init(): void {
    const set = (ev: XRInputSourceEvent, which: boolean[], v: boolean) => {
      const h = ev.inputSource.handedness;
      if (h === 'left') which[0] = v;
      else if (h === 'right') which[1] = v;
    };
    const onSelS = (e: XRInputSourceEvent) => set(e, this.select, true);
    const onSelE = (e: XRInputSourceEvent) => set(e, this.select, false);
    const onSqS = (e: XRInputSourceEvent) => set(e, this.squeeze, true);
    const onSqE = (e: XRInputSourceEvent) => set(e, this.squeeze, false);
    // Attach to each XR session once, whenever it appears (checked every frame:
    // the renderer's sessionstart event is not reliable for sessions started elsewhere).
    this.attach = () => {
      const s = this.renderer.xr.getSession();
      if (!s || s === this.attached) return;
      this.attached = s;
      this.select[0] = this.select[1] = this.squeeze[0] = this.squeeze[1] = false;
      s.addEventListener('selectstart', onSelS);
      s.addEventListener('selectend', onSelE);
      s.addEventListener('squeezestart', onSqS);
      s.addEventListener('squeezeend', onSqE);
    };

    const canvas = this.renderer.domElement;
    const onDown = (e: PointerEvent) => {
      mouse.shift = e.shiftKey;
      if (e.button !== 0) return;
      mouse.bothHands = e.shiftKey;
      mouse.down = true;
      this.pendingPress = true;
      mouse.dragX = mouse.dragY = 0;
      mouse.heldFor = 0;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    };
    const onUp = (e: PointerEvent) => {
      mouse.shift = e.shiftKey;
      if (e.shiftKey) mouse.bothHands = true;
      if (e.button !== 0 || !mouse.down) return;
      mouse.down = false;
      this.pendingRelease = true;
    };
    const onMove = (e: PointerEvent) => {
      mouse.shift = e.shiftKey;
      if (mouse.down && e.shiftKey) mouse.bothHands = true;
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      this.moved = true;
    };
    const onWheel = (e: WheelEvent) => {
      this.pendingWheel += e.deltaY;
    };
    const onKey = (e: KeyboardEvent) => {
      mouse.shift = e.shiftKey;
      if (mouse.down && e.shiftKey) mouse.bothHands = true;
    };
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointermove', onMove);
    canvas.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    this.cleanupFuncs.push(() => {
      const s = this.attached;
      s?.removeEventListener('selectstart', onSelS);
      s?.removeEventListener('selectend', onSelE);
      s?.removeEventListener('squeezestart', onSqS);
      s?.removeEventListener('squeezeend', onSqE);
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
    });
  }

  update(delta: number): void {
    const dt = Math.max(delta, 1e-4);
    this.attach();
    // Desktop pointer.
    mouse.pressed = this.pendingPress;
    mouse.released = this.pendingRelease;
    this.pendingPress = this.pendingRelease = false;
    mouse.wheel = this.pendingWheel;
    this.pendingWheel = 0;
    const dx = mouse.x - this.lastX;
    const dy = mouse.y - this.lastY;
    this.lastX = mouse.x;
    this.lastY = mouse.y;
    if (mouse.down) {
      mouse.dragX += dx;
      mouse.dragY += dy;
      mouse.heldFor += delta;
    }
    // Exponential smoothing keeps flick speed readable without a buffer.
    const k = Math.min(1, dt * 20);
    mouse.vx += (dx / dt - mouse.vx) * k;
    mouse.vy += (dy / dt - mouse.vy) * k;
    this.moved = false;

    // XR hands / controllers.
    const vr = this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
    const spaces: Array<Object3D | undefined> = [this.player.gripSpaces.left, this.player.gripSpaces.right];
    for (let i = 0; i < 2; i++) {
      const h = hands[i];
      const sp = vr ? spaces[i] : undefined;
      h.tracked = !!sp;
      const grip = this.select[i] || this.squeeze[i];
      h.squeeze = this.squeeze[i];
      h.squeezeUp = !this.squeeze[i] && this.squeezeWas[i];
      this.squeezeWas[i] = this.squeeze[i];
      h.gripDown = grip && !this.gripWas[i];
      h.gripUp = !grip && this.gripWas[i];
      h.grip = grip;
      this.gripWas[i] = grip;
      if (!sp) {
        this.had[i] = false;
        h.vel.set(0, 0, 0);
        h.angSpeed = 0;
        h.roll = 0;
        continue;
      }
      sp.getWorldPosition(h.pos);
      sp.getWorldQuaternion(h.quat);
      if (this.had[i]) {
        h.vel.subVectors(h.pos, this.prevPos[i]).divideScalar(dt);
        // Relative rotation this frame, in the hand's own frame.
        this.delta.copy(this.prevQuat[i]).invert().multiply(h.quat);
        const w = Math.min(1, Math.abs(this.delta.w));
        h.angSpeed = (2 * Math.acos(w)) / dt;
        // Twist about the pointing axis (local Z): angle of the swing-twist decomposition.
        h.roll = 2 * Math.atan2(this.delta.z, this.delta.w);
        if (h.roll > Math.PI) h.roll -= Math.PI * 2;
        if (h.roll < -Math.PI) h.roll += Math.PI * 2;
      } else {
        h.vel.set(0, 0, 0);
        h.angSpeed = 0;
        h.roll = 0;
      }
      this.prevPos[i].copy(h.pos);
      this.prevQuat[i].copy(h.quat);
      this.had[i] = true;
    }
  }
}
