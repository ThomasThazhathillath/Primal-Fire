// One failing system must not freeze the game. three.js asks for the next frame only after the current one
// finishes, so an exception thrown in any system's update() stops the render loop for good: in the headset the
// view freezes (the play-test log shows fps=0) and it looks like a crash. This wraps every registered system's
// update so a throw is caught, reported once per distinct message, and every other system keeps running.

/** The part of an ECS system this guard needs. */
export interface GuardedSystem {
  update(delta: number, time: number): void;
}

/** Wrap each system's update; `report` gets "<System>: <message>" the first time each distinct error appears. */
export function guardSystems(systems: readonly GuardedSystem[], report: (msg: string, error: unknown) => void): void {
  for (const sys of systems) {
    const update = sys.update.bind(sys);
    const name = sys.constructor.name || 'System';
    const seen = new Set<string>();
    sys.update = (delta: number, time: number) => {
      try {
        update(delta, time);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        // Each distinct error once: a system that throws every frame must not flood the log.
        if (seen.size < 20 && !seen.has(msg)) {
          seen.add(msg);
          report(`${name}: ${msg}`, error);
        }
      }
    };
  }
}
