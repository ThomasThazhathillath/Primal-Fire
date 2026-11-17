// Controller haptics in one place (curriculum Phase 1, C12). Tracked hands have no vibration, so this
// silently does nothing for them; controllers get a short pulse on the chosen hand.

/** Pulse the controller in `hand` (0 = left, 1 = right) at `strength` 0..1 for `ms` milliseconds. */
export function pulse(session: XRSession | null | undefined, hand: 0 | 1, strength: number, ms: number): void {
  if (!session) return;
  const want = hand === 0 ? 'left' : 'right';
  for (const src of session.inputSources) {
    if (src.handedness !== want) continue;
    const act = (src.gamepad as (Gamepad & { hapticActuators?: Array<{ pulse(v: number, d: number): Promise<boolean> }> }) | undefined)?.hapticActuators?.[0];
    act?.pulse(Math.min(1, strength), ms).catch(() => undefined);
  }
}
