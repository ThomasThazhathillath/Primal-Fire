// Progressive contextual assistance (docs/NPE_PLAN.md, milestone C). Notices when the player is visibly
// struggling and helps in three steps, each only once and only after a configurable delay:
//   1. a cue: the thing pulses softly, or the hand sign for the motion appears,
//   2. a short instruction on the objective card (a toast while the card is not shown yet),
//   3. an explicit how-to with the hand sign (and, for an unused workbench, the sky pillar over it).
// The help ends the moment the player succeeds. Nothing is ever done for them.
// The rules live in game/adaptive.ts (StruggleTracker); this system feeds it four times a second and shows
// the result through the existing channels (highlight pulse, hand sign, card line, pillar).

import { createSystem } from '@iwsdk/core';
import { failHelp, FAIL_SIGN, type Help, MOTION_SIGN } from '../game/adaptive.js';
import type { GameEvent } from '../game/game.js';
import { itemName } from '../game/items.js';
import { nextStepLine } from '../game/objectives.js';
import { groundHeight } from '../game/world-layout.js';
import { GazeTargetSystem } from './gaze-target-system.js';
import { ResourceSystem } from './resource-system.js';
import { assistFx, getGame, getUi, reveal } from './shared.js';
import { WorldSystem } from './world-system.js';

const TICK = 0.25;
/** How long a hand sign from help stays up (s). */
const SIGN_SECONDS = 8;

export class AssistanceSystem extends createSystem({}) {
  private t = 0;
  /** The detail of the last failure per code ("this step needs: saw"). */
  private details = new Map<string, string | undefined>();
  private lookKey = '';
  private beaconOn = false;
  /** Help given this session (debug and tests). */
  readonly given: Help[] = [];

  init(): void {
    const game = getGame(this.world);
    const off = game.on((e) => this.onEvent(e));
    this.cleanupFuncs.push(off);
    (window as unknown as { __assist?: unknown }).__assist = { given: this.given, tracker: game.struggle, fx: assistFx };
  }

  private onEvent(e: GameEvent): void {
    const s = getGame(this.world).struggle;
    switch (e.type) {
      case 'interaction':
        s.fail(`fail:${e.code}`);
        this.details.set(e.code, e.detail);
        s.succeed('idle');
        break;
      case 'gather':
      case 'held':
        s.succeed('look');
        s.succeed('fail:grab');
        s.succeed('fail:drag');
        s.succeed('idle');
        this.clearFx();
        break;
      case 'bench':
        if (e.state === 'start') s.succeed('bench');
        if (e.state === 'step' || e.state === 'done') {
          s.succeed('fail:bench');
          this.clearFx();
        }
        s.succeed('idle');
        break;
      case 'structure':
        s.succeed('fail:place');
        s.succeed('idle');
        break;
      case 'objective':
      case 'objectiveDone':
        s.succeed('idle');
        break;
      case 'satchel':
        // Something new went into the bag (a struck flake, a made tool): knapping worked.
        s.succeed('fail:knap');
        break;
      default:
        break;
    }
  }

  private clearFx(): void {
    assistFx.pulse = null;
    assistFx.sign = null;
    assistFx.signFor = 0;
    if (this.beaconOn) {
      this.beaconOn = false;
      getUi(this.world).setBeacon?.(null);
    }
  }

  update(delta: number): void {
    if ((this.t += delta) < TICK) return;
    const dt = this.t;
    this.t = 0;
    const game = getGame(this.world);
    const started = this.world.getSystem(WorldSystem)?.started ?? false;
    const ui = getUi(this.world);
    if (!started || ui.paused?.() || ui.titleOpen?.()) return;
    const s = game.struggle;

    // Looking (or pointing) at something takeable without taking it.
    const look = this.world.getSystem(GazeTargetSystem)?.lookTarget;
    // Only the gaze counts: a resting hand's ray lies on things for minutes without meaning anything.
    const key = look && (look.kind === 'resource' || look.kind === 'drop') && !game.held ? `look:${look.key}` : '';
    if (key !== this.lookKey) {
      if (this.lookKey) s.succeed(this.lookKey); // looked away: that one starts over
      this.lookKey = key;
    }
    if (key && !game.held) s.grow(key, 'look', dt);

    // No progress at all for a long while.
    s.grow('idle', 'idle', dt);

    // Every part for a recipe in the bag, but the workbench not used.
    if (!game.bench && nextStepLine(game)) s.grow('bench', 'bench', dt);
    else s.succeed('bench');

    const help = s.due();
    if (help) this.show(help);
  }

  /** Say something: on the objective card when it is up, else as a toast. */
  private say(key: string, text: string): void {
    const game = getGame(this.world);
    if (reveal.objective && !game.objectives.done) game.objectives.gate.say(game.time, `assist_${key}`, text, true);
    else game.toast(text, 'note');
  }

  private sign(clip: string | undefined): void {
    if (!clip) return;
    assistFx.sign = clip;
    assistFx.signFor = SIGN_SECONDS;
  }

  private show(h: Help): void {
    const game = getGame(this.world);
    this.given.push(h);
    if (this.given.length > 40) this.given.shift();
    game.log.add(`assist ${h.key} level ${h.level}`);
    switch (h.kind) {
      case 'look': {
        const id = h.key.slice('look:'.length);
        const res = this.world.getSystem(ResourceSystem);
        const spot = res?.spot(id.replace(/^r:/, ''));
        if (h.level === 1 && spot) assistFx.pulse = { id: spot.id, x: spot.x, y: groundHeight(spot.x, spot.z), z: spot.z };
        const name = spot ? itemName(spot.itemId).toLowerCase() : 'it';
        if (h.level === 2) this.say(h.key, `Pinch your thumb and finger together to pick up the ${name}.`);
        if (h.level === 3) {
          this.say(h.key, `Look at the ${name} (or point at it), then pinch thumb and index firmly together and hold. Watch the hand sign.`);
          this.sign('pinch');
        }
        return;
      }
      case 'fail': {
        const code = h.key.slice('fail:'.length);
        const detail = this.details.get(code);
        const motion = /needs: (\w+)/.exec(detail ?? '')?.[1];
        const clip = motion ? MOTION_SIGN[motion] : FAIL_SIGN[code];
        this.sign(clip);
        if (h.level >= 2) this.say(h.key, failHelp(code, detail, h.level));
        // Placement: bring the existing direction arrow in sooner (adaptive.ts indicator).
        if (code.startsWith('place.') && h.level >= 2) game.assist.fail('place');
        return;
      }
      case 'idle': {
        const o = game.objectives.current;
        if (h.level === 1) this.say(h.key, 'Not sure what to do next? The card shows your goal. Tap the bulb for a hint.');
        if (h.level === 2 && o) this.say(h.key, o.hint.levels[0]);
        if (h.level === 3 && o) this.say(h.key, o.hint.levels[1]);
        return;
      }
      case 'bench': {
        const bench = game.structures.find((x) => x.kind === 'workbench' && x.complete);
        if (h.level === 1 && bench) assistFx.pulse = { id: `bench_${bench.id}`, x: bench.x, y: groundHeight(bench.x, bench.z) + 0.6, z: bench.z };
        const line = nextStepLine(game);
        if (h.level >= 2 && line) this.say(h.key, line);
        if (h.level === 3 && bench && game.objectives.hintFxLevel() < 3) {
          this.beaconOn = true;
          getUi(this.world).setBeacon?.({ x: bench.x, z: bench.z });
        }
        return;
      }
    }
  }
}
