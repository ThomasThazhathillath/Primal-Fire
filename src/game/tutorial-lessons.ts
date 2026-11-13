// "THE FIRST STEPS": seven one-instruction steps and the runner
// that watches the REAL game for each one. Nothing here gathers, builds or
// crafts for you: the runner only listens to Game events and reads Game state.
// A lesson's setup may hand the (tutorial-only) Game a few starting items so
// any lesson can be replayed on its own and none can strand you.
//
// Pure TypeScript: the TutorialSystem renders it, tests drive it directly.

import type { Game, GameEvent } from './game.js';
import { fitsPouch, type ItemId } from './items.js';
import type { StructureKind } from './blueprint.js';
import { gazeStats } from './gaze.js';
import { openMarks } from './assist.js';
import { tutorialSpots } from './tutorial-layout.js';

/** The seven first steps (NPE simplicity round): one short instruction each, verb first. */
export type LessonId = 'stone' | 'ring' | 'marks' | 'slab' | 'top' | 'bag' | 'bench';

/** What the runner has seen since the current lesson started. */
export interface LessonCtx {
  picks: number;
  /** Every pickup: gathered from the world or lifted off the ground (not taken out of the satchel). */
  pickups: number;
  puts: number;
  heldKinds: Set<ItemId>;
  gathered: Set<ItemId>;
  tookOut: number;
  putBack: number;
  moved: number;
  turned: number;
  drops: number;
  newStructures: Set<string>;
  failures: number;
  cordMade: boolean;
  drillMade: boolean;
  burning: boolean;
  mistakes: Set<string>;
  hintLevel: number;
  notebookOpened: boolean;
  /** The bag (satchel card) was opened during this step. */
  bagOpened: boolean;
  /** The workbench's recipe card was opened during this step. */
  benchOpened: boolean;
}

/** UI facts the runner cannot read from the Game (set by the TutorialSystem each poll). */
export interface UiFacts {
  hintLevel: number;
  notebookOpen: boolean;
  bagOpen?: boolean;
  benchOpen?: boolean;
}

/** Things a player can show they know, wherever in the tutorial they do it (NPE B). */
export type Skill = 'teleport' | 'turn' | 'pickup' | 'takeOut' | 'putBack' | 'gazePick' | 'gazeRelease' | 'gazePlace' | 'holdBig' | 'drop2' | 'bagOpen';

export interface Task {
  text: string;
  done(c: LessonCtx, g: Game): boolean;
}

export interface Lesson {
  id: LessonId;
  title: string;
  /** One short line from the guide, shown above the tasks. */
  say: string;
  /** Optional extra tip, shown smaller (e.g. desktop keys). */
  tip: string;
  /** The science behind what you just did: said after the step is done. */
  science: string;
  /** Notebook entry recorded with it (if not already noted). */
  note?: string;
  tasks: Task[];
  /** The one structure this lesson lets you start (absent = none). Keeps stray outlines out of other lessons. */
  builds?: StructureKind;
  /**
   * What the lesson teaches, as skills the runner can see the player demonstrate anywhere (NPE B). A lesson whose
   * skills are all already shown is passed with a short "you already know this" instead of being explained again.
   */
  skills?: readonly Skill[];
  /** The exact thing to act on now (one arrow and ring over it), or null when the step is not about a place. */
  target?(g: Game): { id: string; x: number; z: number } | null;
  /** Prepare the tutorial Game so the lesson can always be finished. */
  setup?(g: Game): void;
  /** Tidy up when the lesson is done or skipped (e.g. a practice outline). */
  teardown?(g: Game): void;
}

const has = (g: Game, id: ItemId) => g.count(id) + (g.held === id ? 1 : 0);

/** Give items so the satchel holds at least `n` of each. */
function ensure(g: Game, items: Partial<Record<ItemId, number>>): void {
  for (const [id, n] of Object.entries(items) as Array<[ItemId, number]>) {
    const missing = n - has(g, id);
    if (missing > 0) g.addItem(id, missing);
  }
}

/** Set down anything too big for the satchel, so the lesson starts with free hands. */
function freeHands(g: Game): void {
  if (g.held && !fitsPouch(g.held)) g.dropItem(g.held, g.player.x + 0.4, g.player.z - 0.4);
  else if (g.held) g.stow();
}


/** Where the walking step sends you, and where the practice workbench outline stands (just beyond it). */
export const RING = { x: 0, z: -2.4 };
export const BENCH_SITE = { x: 0.3, z: -3.5 };

/** A camp spot of `look` that still has something to take (its saved state, else full). */
function liveCampSpot(g: Game, look: string): { id: string; x: number; z: number } | null {
  for (const s of tutorialSpots()) {
    if (s.look !== look) continue;
    const st = g.spotState.get(s.id);
    if (!st || st.c > 0) return { id: s.id, x: s.x, z: s.z };
  }
  return null;
}

const bench = (g: Game) => g.structures.find((s) => s.kind === 'workbench');

/** The practice workbench outline, placed by the marks step (kept if one is already there). */
function benchOutline(g: Game): void {
  if (bench(g)) return;
  for (const [dx, dz] of [[0, 0], [0.8, 0], [-0.8, 0], [0, -0.8], [1.2, 0.6]]) {
    if (g.placeBlueprint('workbench', BENCH_SITE.x + dx, BENCH_SITE.z + dz, 0, true).ok) return;
  }
}

/**
 * A replayed later step finds what the earlier steps would have built (so no step can strand you): the outline
 * with its stone supports, and with `top` also the slab on it. Normal play arrives with these already done.
 */
function benchReady(g: Game, top: boolean): void {
  benchOutline(g);
  const b = bench(g);
  if (!b) return;
  b.spots.forEach((v, i) => {
    if (v !== null) return;
    ensure(g, { dryStone: 1 });
    g.fillFromBag(b.id, i);
  });
  if (top && !b.complete) {
    ensure(g, { slab: 1 });
    if (g.held !== 'slab') g.takeOut('slab');
    g.placeKey(b.id, b.x, b.z, 2);
  }
}

/** The first open mark of the practice workbench (the stone supports, then the top). */
function nextMark(g: Game, top: boolean): { id: string; x: number; z: number } | null {
  for (const m of openMarks(g.structures)) {
    if (m.structure.kind !== 'workbench' || (m.index === -1) !== top) continue;
    return { id: `mark_${m.structure.id}_${m.index}`, x: m.x, z: m.z };
  }
  return null;
}

export const LESSONS: Lesson[] = [
  {
    id: 'stone',
    setup: freeHands,
    title: 'Pinch the glowing stone',
    say: 'Pinch the glowing stone.',
    science: 'Your thumb can press against each finger: that grip is your first tool.',
    tip: 'Look at it or point at it, then press thumb and finger together. It goes into the pouch at your hip. Desktop: click it.',
    skills: ['pickup'],
    target: (g) => liveCampSpot(g, 'stone'),
    tasks: [{ text: 'Pinch the glowing stone', done: (c) => c.pickups >= 1 }],
  },
  {
    id: 'ring',
    title: 'Walk into the glowing ring',
    say: 'Walk into the glowing ring.',
    science: 'Short hops are easier on your body than gliding: your eyes and ears agree.',
    tip: 'Tap your thumb on the side of your index finger to jump. Or pinch, aim at the ring, let go. Desktop: W A S D.',
    skills: ['teleport'],
    target: () => ({ id: 'ring', x: RING.x, z: RING.z }),
    tasks: [{ text: 'Walk into the glowing ring', done: (_c, g) => Math.hypot(g.player.x - RING.x, g.player.z - RING.z) < 0.9 }],
  },
  {
    id: 'marks',
    builds: 'workbench',
    title: 'Pinch each glowing mark',
    say: 'Pinch each glowing mark.',
    science: 'Three legs always touch the ground together: a tripod never wobbles.',
    note: 'b_tripod',
    tip: 'Each pinch puts a stone from your pouch on the mark. Three marks, three stones.',
    setup: (g) => {
      freeHands(g);
      ensure(g, { dryStone: 3 });
      benchOutline(g);
    },
    target: (g) => nextMark(g, false),
    tasks: [{ text: 'Pinch each glowing mark', done: (_c, g) => !!bench(g) && bench(g)!.spots.every((v) => v !== null) }],
  },
  {
    id: 'slab',
    builds: 'workbench',
    title: 'Pinch the flat stone',
    say: 'Pinch the flat stone.',
    science: 'A flat, heavy top spreads the load over all three legs.',
    tip: 'It is heavy: it stays in your hand, not in the pouch.',
    setup: freeHands,
    target: (g) => (has(g, 'slab') > 0 ? null : liveCampSpot(g, 'slab')),
    // In hand, or in the bag (the easy-carry build bags even heavy things).
    tasks: [{ text: 'Pinch the flat stone', done: (c, g) => c.heldKinds.has('slab') || c.gathered.has('slab') || has(g, 'slab') > 0 || !!bench(g)?.complete }],
  },
  {
    id: 'top',
    builds: 'workbench',
    title: 'Put it on top',
    say: 'Put it on top.',
    science: 'Now you have a steady surface to work on.',
    tip: 'Carry it over the glowing top and open your hand. Or pinch the top.',
    setup: (g) => {
      benchReady(g, false);
      if (g.held !== 'slab' && !bench(g)?.complete) ensure(g, { slab: 1 });
    },
    target: (g) => nextMark(g, true),
    tasks: [{ text: 'Put it on top', done: (_c, g) => !!bench(g)?.complete }],
  },
  {
    id: 'bag',
    title: 'Tap the bag',
    say: 'Tap the bag.',
    science: 'Everything you gather waits in your pouch until you need it.',
    tip: 'The bag button is in the menu up and to your left. Point and poke it, or pinch it.',
    skills: ['bagOpen'],
    tasks: [{ text: 'Tap the bag', done: (c) => c.bagOpened }],
  },
  {
    id: 'bench',
    builds: 'workbench',
    title: 'Pinch your workbench',
    say: 'Pinch your workbench.',
    science: 'Tools are made at the bench, one step at a time, with your hands.',
    tip: 'It shows what you can make. You are ready: the next goals will guide you.',
    setup: (g) => benchReady(g, true),
    target: (g) => {
      const b = bench(g);
      return b ? { id: `bench_${b.id}`, x: b.x, z: b.z } : null;
    },
    tasks: [{ text: 'Pinch your workbench', done: (c) => c.benchOpened }],
  },
];


export const LESSON_IDS = LESSONS.map((l) => l.id);

/**
 * Gradual reveal of the HUD during the guided opening (NPE B): the menu once the bag is taught, the objective
 * card once the first discovery is made. Before that the lesson card is the only guide on screen.
 */
export function guidedReveal(current: number, done: ReadonlySet<LessonId>, finished: boolean): { menu: boolean; objective: boolean } {
  if (finished) return { menu: true, objective: true };
  const bag = LESSON_IDS.indexOf('bag');
  return { menu: current >= bag || done.has('bag'), objective: false };
}

/** Lesson ids from before the seven-step rework: a save that names one resumes at the first step. */
export const OLD_ORDER: readonly string[] = ['hands', 'look', 'gather', 'satchel', 'glide', 'move', 'place', 'build', 'craft', 'fire', 'hints', 'notebook', 'final'];

/** The saved open step as an index into today's LESSONS (by id); anything older or unknown starts at step 1. */
export function savedLessonIndex(save: Pick<TutorialSave, 'current' | 'currentId'>): number {
  const i = save.currentId ? LESSON_IDS.indexOf(save.currentId) : -1;
  return i >= 0 ? i : 0;
}

export interface TutorialSave {
  done: LessonId[];
  /** Index into LESSONS when saved. Saves before the NPE reorder used OLD_ORDER (see `currentId`). */
  current: number;
  /** The open lesson by id (NPE B; absent in older saves). */
  currentId?: LessonId;
  /** Skills shown so far (NPE B; absent in older saves). */
  skills?: Skill[];
  finished: boolean;
  /** Ticked tasks of the open lesson (kept across a reload). */
  ticks?: boolean[];
}

function freshCtx(): LessonCtx {
  return {
    picks: 0,
    pickups: 0,
    puts: 0,
    heldKinds: new Set(),
    gathered: new Set(),
    tookOut: 0,
    putBack: 0,
    moved: 0,
    turned: 0,
    drops: 0,
    newStructures: new Set(),
    failures: 0,
    cordMade: false,
    drillMade: false,
    burning: false,
    mistakes: new Set(),
    hintLevel: 0,
    notebookOpened: false,
    bagOpened: false,
    benchOpened: false,
  };
}

export type TutorialEvent =
  | { type: 'lesson'; index: number }
  | { type: 'task'; index: number; task: number }
  | { type: 'lessonDone'; index: number }
  /** A lesson passed because the player already showed everything it teaches (NPE B). */
  | { type: 'known'; index: number }
  /** The science line after a step is done (its notebook entry, if any, is already recorded). */
  | { type: 'science'; index: number; text: string }
  | { type: 'finished' };

/**
 * Watches one Game and moves through LESSONS. Call `poll(ui)` a few times a
 * second; events are handled as they come.
 */
export class TutorialRunner {
  readonly done = new Set<LessonId>();
  /** Skills the player has shown anywhere in the tutorial (NPE B): a lesson made only of these is not explained again. */
  readonly skills = new Set<Skill>();
  current = 0;
  finished = false;
  ctx: LessonCtx = freshCtx();
  /** Per task of the current lesson: latched once true (a task never un-ticks). */
  ticks: boolean[] = [];
  private startX = 0;
  private startZ = 0;
  private lastYaw = 0;
  private prevHeld: ItemId | null = null;
  private heldFromSatchel = false;
  private satchelSnap = new Map<ItemId, number>();
  private dropCount = 0;
  private knownComplete = new Set<number>();
  private cordSeen = 0;
  private drillSeen = 0;
  private listeners = new Set<(e: TutorialEvent) => void>();
  private off: () => void;

  constructor(
    readonly game: Game,
    save?: TutorialSave | null,
  ) {
    if (save) {
      for (const id of save.done) if (LESSON_IDS.includes(id)) this.done.add(id);
      this.current = savedLessonIndex(save);
      this.finished = !!save.finished;
      for (const k of save.skills ?? []) this.skills.add(k);
    }
    this.off = game.on((e) => this.onEvent(e));
    // A restored lesson keeps the saved world as it is: its setup ran when the lesson first opened.
    this.begin(this.current, true, !save);
    if (save?.ticks && save.ticks.length === this.ticks.length) this.ticks = save.ticks.map(Boolean);
  }

  dispose(): void {
    this.game.lessonStructure = undefined;
    this.off();
    this.listeners.clear();
  }

  on(fn: (e: TutorialEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(e: TutorialEvent): void {
    for (const fn of this.listeners) fn(e);
  }

  get lesson(): Lesson {
    return LESSONS[this.current];
  }

  snapshot(): TutorialSave {
    return { done: [...this.done], current: this.current, currentId: LESSONS[this.current].id, finished: this.finished, ticks: [...this.ticks], skills: [...this.skills] };
  }

  /** Open lesson `index` (replay or jump). Runs its setup, clears what was seen. */
  begin(index: number, quiet = false, runSetup = true): void {
    this.current = Math.max(0, Math.min(LESSONS.length - 1, index));
    const g = this.game;
    const builds = LESSONS[this.current].builds;
    g.lessonStructure = this.finished ? undefined : (builds ?? null);
    if (runSetup) LESSONS[this.current].setup?.(g);
    this.ctx = freshCtx();
    this.ticks = LESSONS[this.current].tasks.map(() => false);
    this.startX = g.player.x;
    this.startZ = g.player.z;
    this.lastYaw = g.facingYaw;
    this.prevHeld = g.held;
    this.heldFromSatchel = false;
    this.snapSatchel();
    this.dropCount = g.drops.length;
    this.knownComplete.clear();
    for (const s of g.structures) if (s.complete) this.knownComplete.add(s.id);
    this.cordSeen = has(g, 'cord');
    this.drillSeen = has(g, 'bowDrill');
    if (!quiet) this.emit({ type: 'lesson', index: this.current });
  }

  /** Skip the current lesson (counts as seen, so a stuck player can always go on). */
  skipLesson(): void {
    this.complete();
  }

  /** Skip the rest of the tutorial. */
  skipAll(): void {
    for (const id of LESSON_IDS) this.done.add(id);
    this.finished = true;
    this.game.lessonStructure = undefined;
    this.emit({ type: 'finished' });
  }

  private snapSatchel(): void {
    this.satchelSnap.clear();
    for (const [id, n] of this.game.satchel) this.satchelSnap.set(id, n);
  }

  private onEvent(e: GameEvent): void {
    const c = this.ctx;
    const g = this.game;
    switch (e.type) {
      case 'held':
        if (e.item) {
          c.picks++;
          c.heldKinds.add(e.item);
          // Taken from the satchel when its count dropped just before (takeOut emits 'satchel' first).
          this.heldFromSatchel = (this.satchelSnap.get(e.item) ?? 0) > g.count(e.item);
          if (this.heldFromSatchel) c.tookOut++;
        } else if (this.prevHeld) {
          c.puts++;
          if (g.count(this.prevHeld) > (this.satchelSnap.get(this.prevHeld) ?? 0)) c.putBack++;
        }
        this.prevHeld = e.item;
        this.snapSatchel();
        break;
      case 'satchel':
        // takeOut: the count drops before 'held' arrives; keep the old snapshot for that check.
        if (g.held === null && this.prevHeld === null) this.snapSatchel();
        this.checkCrafted();
        break;
      case 'gather':
        c.gathered.add(e.item);
        c.pickups++;
        break;
      case 'drops':
        if (g.drops.length > this.dropCount) c.drops += g.drops.length - this.dropCount;
        else if (g.drops.length < this.dropCount) c.pickups += this.dropCount - g.drops.length; // picked back up off the ground
        this.dropCount = g.drops.length;
        break;
      case 'structure':
        // Only a finished build counts (an outline is just the plan).
        if (e.structure.complete && !this.knownComplete.has(e.structure.id)) {
          this.knownComplete.add(e.structure.id);
          c.newStructures.add(`${e.structure.kind}#${e.structure.id}`);
        }
        break;
      case 'interaction':
        c.failures++;
        break;
      case 'fire':
        if (e.stage === 'burning') c.burning = true;
        break;
      case 'toast':
        if (e.kind === 'bad') {
          if (/damp/i.test(e.text)) c.mistakes.add('damp');
          if (/smother/i.test(e.text)) c.mistakes.add('smother');
          if (/fan|faded|died/i.test(e.text)) c.mistakes.add('air');
        }
        break;
      default:
        break;
    }
    this.evaluate();
  }

  private checkCrafted(): void {
    const g = this.game;
    const cord = has(g, 'cord');
    if (cord > this.cordSeen) this.ctx.cordMade = true;
    this.cordSeen = cord;
    const drill = has(g, 'bowDrill');
    if (drill > this.drillSeen) this.ctx.drillMade = true;
    this.drillSeen = drill;
  }

  /** Read polled state (movement, UI) and re-check the tasks. */
  poll(ui: UiFacts): void {
    const g = this.game;
    const c = this.ctx;
    c.moved = Math.max(c.moved, Math.hypot(g.player.x - this.startX, g.player.z - this.startZ));
    let dy = g.facingYaw - this.lastYaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    c.turned += Math.abs(dy);
    this.lastYaw = g.facingYaw;
    c.hintLevel = Math.max(c.hintLevel, ui.hintLevel);
    if (ui.notebookOpen) c.notebookOpened = true;
    if (ui.bagOpen) c.bagOpened = true;
    if (ui.benchOpen) c.benchOpened = true;
    for (const s of g.structures) {
      if (s.complete && !this.knownComplete.has(s.id)) {
        this.knownComplete.add(s.id);
        c.newStructures.add(`${s.kind}#${s.id}`);
      }
    }
    this.checkCrafted();
    this.evaluate();
  }

  /** Record what the player has shown, wherever they showed it (NPE B). */
  private learnSkills(): void {
    const c = this.ctx;
    const k = this.skills;
    if (c.moved >= 1.2) k.add('teleport');
    if (c.turned >= 0.7) k.add('turn');
    if (c.pickups >= 1) k.add('pickup');
    if (c.tookOut >= 1) k.add('takeOut');
    if (c.putBack >= 1) k.add('putBack');
    if (gazeStats.picks >= 1) k.add('gazePick');
    if (gazeStats.releases >= 1) k.add('gazeRelease');
    if (gazeStats.placed >= 1) k.add('gazePlace');
    if (c.heldKinds.has('logs') || c.heldKinds.has('slab')) k.add('holdBig');
    if (c.drops >= 2) k.add('drop2');
    if (c.bagOpened) k.add('bagOpen');
  }

  /** Does the player already know everything lesson `i` teaches (and it teaches only skills)? */
  knows(i: number): boolean {
    const sk = LESSONS[i]?.skills;
    return !!sk && sk.length > 0 && sk.every((x) => this.skills.has(x));
  }

  private evaluate(): void {
    this.learnSkills();
    if (this.ticks.every(Boolean)) return;
    const tasks = this.lesson.tasks;
    for (let i = 0; i < tasks.length; i++) {
      if (this.ticks[i]) continue;
      // Any order: a task ticks the moment it is done (the card still marks the first open one as next).
      if (tasks[i].done(this.ctx, this.game)) {
        this.ticks[i] = true;
        this.emit({ type: 'task', index: this.current, task: i });
      }
    }
    if (this.ticks.every(Boolean)) this.complete();
  }

  private complete(): void {
    const index = this.current;
    const wasDone = this.done.has(this.lesson.id);
    this.done.add(this.lesson.id);
    this.ticks = this.ticks.map(() => true);
    this.emit({ type: 'lessonDone', index });
    const l = LESSONS[index];
    if (l.note && !this.game.notebook.includes(l.note)) this.game.observe(l.note);
    l.teardown?.(this.game);
    this.emit({ type: 'science', index, text: l.science });
    if (index === LESSONS.length - 1) {
      if (!this.finished || !wasDone) {
        this.finished = true;
        this.game.lessonStructure = undefined;
        this.emit({ type: 'finished' });
      }
      return;
    }
    // Go on to the first lesson not yet done after this one (or simply the next). A lesson whose skills the player
    // has already shown is passed with a word instead of being explained again (NPE B).
    let next = -1;
    for (let i = index + 1; i < LESSONS.length; i++) {
      if (this.done.has(LESSONS[i].id)) continue;
      if (this.knows(i) && i < LESSONS.length - 1) {
        this.done.add(LESSONS[i].id);
        this.emit({ type: 'known', index: i });
        continue;
      }
      next = i;
      break;
    }
    if (next < 0) {
      // Everything after this one is done or known: the last lesson closes the tutorial.
      next = LESSONS.length - 1;
      if (this.done.has(LESSONS[next].id)) next = Math.min(index + 1, LESSONS.length - 1);
    }
    this.begin(next);
  }

  /** Index of the next unticked task, or -1. */
  nextTask(): number {
    return this.ticks.indexOf(false);
  }
}

/** Opening narration, a line or two per beat, before the first step. */
export const OPENING: string[] = ['You wake in a wild forest. Find what you need.'];

/** The closing lines when the last step is done; survival carries the story on from here. */
export const CLOSING: string[] = ['Well done. Now the forest is yours.'];

/** The hour each step plays at: early afternoon at waking, dusk by the fire, night falling at the end. */
export const STEP_HOURS: Record<LessonId, number> = {
  stone: 13,
  ring: 13.5,
  marks: 14.5,
  slab: 15.5,
  top: 16.5,
  bag: 17.5,
  bench: 18.5,
};
/** After the last step: night. */
export const NIGHT_HOUR = 19.8;

/** Hour of the first day for the open step (or night once the opening is finished). */
export function storyHour(step: LessonId | null): number {
  return step === null ? NIGHT_HOUR : STEP_HOURS[step];
}
