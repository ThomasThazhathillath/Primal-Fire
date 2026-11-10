// "THE FIRST STEPS — Learning to Survive": the eleven lessons and the runner
// that watches the REAL game for each one. Nothing here gathers, builds or
// crafts for you: the runner only listens to Game events and reads Game state.
// A lesson's setup may hand the (tutorial-only) Game a few starting items so
// any lesson can be replayed on its own and none can strand you.
//
// Pure TypeScript: the TutorialSystem renders it, tests drive it directly.

import type { Game, GameEvent } from './game.js';
import { fitsPouch, type ItemId } from './items.js';
import type { StructureKind } from './blueprint.js';

export type LessonId =
  | 'hands'
  | 'gather'
  | 'satchel'
  | 'move'
  | 'place'
  | 'build'
  | 'craft'
  | 'fire'
  | 'hints'
  | 'notebook'
  | 'final';

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
}

/** UI facts the runner cannot read from the Game (set by the TutorialSystem each poll). */
export interface UiFacts {
  hintLevel: number;
  notebookOpen: boolean;
}

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
  tasks: Task[];
  /** The one structure this lesson lets you start (absent = none). Keeps stray outlines out of other lessons. */
  builds?: StructureKind;
  /** Prepare the tutorial Game so the lesson can always be finished. */
  setup?(g: Game): void;
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

/** Clear finished or half-built structures of a kind, so a lesson can build it again. */
function clearKind(g: Game, kind: string): void {
  for (const s of [...g.structures]) {
    if (s.kind !== kind) continue;
    s.complete = false;
    g.removeStructure(s.id);
  }
}

export const LESSONS: Lesson[] = [
  {
    id: 'hands',
    setup: freeHands,
    title: '1. Your hands',
    say: 'Things you can use glow softly when your hand is near.',
    tip: 'Pinch thumb and finger together to grab. Open your hand to let go. Desktop: click.',
    tasks: [
      { text: 'Pinch a stone or the slab to pick it up', done: (c) => c.pickups >= 1 },
      { text: 'Pick up one more thing (anything)', done: (c) => c.pickups >= 2 },
    ],
  },
  {
    id: 'gather',
    title: '2. Gathering',
    say: 'Point at a plant or stone and pinch. It flies into your satchel.',
    tip: 'You can reach about two steps away. Desktop: aim and click.',
    tasks: [
      { text: 'Gather dry grass', done: (c) => c.gathered.has('dryGrass') },
      { text: 'Gather twigs', done: (c) => c.gathered.has('twigs') },
      { text: 'Gather plant fibres', done: (c) => c.gathered.has('fibers') },
      { text: 'Gather a stone', done: (c) => c.gathered.has('dryStone') },
    ],
  },
  {
    id: 'satchel',
    title: '3. Your satchel',
    say: 'The pouch hangs at your right hip. Everything you gather is in there.',
    tip: 'Reach down to the pouch, or tap Menu > Bag. Desktop: Tab.',
    setup: (g) => {
      freeHands(g);
      ensure(g, { dryStone: 1 });
    },
    tasks: [
      { text: 'Take a stone out of the satchel', done: (c) => c.tookOut >= 1 },
      { text: 'Put it back in the satchel', done: (c) => c.putBack >= 1 },
    ],
  },
  {
    id: 'move',
    title: '4. Moving',
    say: 'Pinch and hold, aim at the ground, let go to jump there.',
    tip: 'Flick your thumb sideways to turn. Desktop: WASD to walk, Q / E to turn.',
    tasks: [
      { text: 'Move to a new spot', done: (c) => c.moved >= 1.2 },
      { text: 'Turn to face another way', done: (c) => c.turned >= 0.7 },
    ],
  },
  {
    id: 'place',
    title: '5. Hold, place, throw',
    say: 'Big things stay in your hand. Set them down, or toss them.',
    tip: 'Open your hand low to place. Fling and open to throw. Desktop: G drops, Shift+G throws.',
    setup: (g) => {
      freeHands(g);
      ensure(g, { dryStone: 2, logs: 1 });
    },
    tasks: [
      { text: 'Take a log or the slab out of the satchel to hold it', done: (c) => c.heldKinds.has('logs') || c.heldKinds.has('slab') },
      { text: 'Set something down on the ground', done: (c) => c.drops >= 1 },
      { text: 'Throw something (or set down a second)', done: (c) => c.drops >= 2 },
    ],
  },
  {
    id: 'build',
    builds: 'workbench',
    title: '6. Build a workbench',
    say: 'Hold the stone slab over open ground. A ghost shows where it goes.',
    tip: 'Red ghost = bad ground. Fill each glowing spot with a stone leg, then lay the slab on top.',
    setup: (g) => {
      clearKind(g, 'workbench');
      ensure(g, { dryStone: 3 });
    },
    tasks: [
      { text: 'Pick up the slab and place the plan', done: (c, g) => c.newStructures.size > 0 || g.structures.some((s) => s.kind === 'workbench') },
      { text: 'Set three stone legs in the glowing spots', done: (c, g) => g.structures.some((s) => s.kind === 'workbench' && s.spots.every((v) => v !== null)) },
      { text: 'Lay the slab on top to finish', done: (c, g) => g.structures.some((s) => s.kind === 'workbench' && s.complete) },
    ],
  },
  {
    id: 'craft',
    builds: 'workbench',
    title: '7. Crafting',
    say: 'Stand at the workbench. Its card shows what you can make.',
    tip: 'Twist fibres into cord with both hands. Then bind spindle, board, branch and cord.',
    setup: (g) => {
      if (!g.structures.some((s) => s.kind === 'workbench' && s.complete)) ensure(g, { dryStone: 3 });
      ensure(g, { fibers: 3, spindle: 1, board: 1, greenBranch: 1 });
    },
    tasks: [
      { text: 'Have a finished workbench', done: (c, g) => g.structures.some((s) => s.kind === 'workbench' && s.complete) },
      { text: 'Twist three fibres into cord', done: (c) => c.cordMade },
      { text: 'Make the bow drill', done: (c) => c.drillMade },
    ],
  },
  {
    id: 'fire',
    builds: 'firePit',
    title: '8. Fire',
    say: 'Ring of stones, then tinder, twigs, logs. Drill an ember. Fan it.',
    tip: 'Try damp moss, or logs first, to see what goes wrong. Fan with an open palm.',
    setup: (g) => {
      ensure(g, { dryStone: 4, dryGrass: 2, twigs: 3, logs: 2, dampMoss: 1 });
      if (!has(g, 'bowDrill')) g.addItem('bowDrill');
    },
    tasks: [
      { text: 'Build a fire pit from four stones', done: (c, g) => g.structures.some((s) => s.kind === 'firePit' && s.complete) },
      { text: 'Lay tinder and twigs in the pit', done: (c, g) => g.flag('fireLayBuilt') },
      { text: 'Drill an ember and fan it into flame', done: (c, g) => c.burning || g.fire.stage === 'burning' },
    ],
  },
  {
    id: 'hints',
    title: '9. Hints and goals',
    say: 'The card at the top is your goal. Hints are optional.',
    tip: 'Tap the bulb on the card for a hint. Tap "More help" for a clearer one.',
    tasks: [
      { text: 'Open a hint on the goal card', done: (c) => c.hintLevel >= 1 },
      { text: 'Ask for more help', done: (c) => c.hintLevel >= 2 },
    ],
  },
  {
    id: 'notebook',
    title: '10. Lab notebook',
    say: 'What you notice becomes science: Observation, Principle, Real limit.',
    tip: 'Menu > Notebook. Desktop: N. New discoveries open new goals.',
    setup: (g) => {
      if (g.notebook.length === 0) g.observe('g_cord');
    },
    tasks: [{ text: 'Open the notebook and read an entry', done: (c) => c.notebookOpened }],
  },
  {
    id: 'final',
    builds: 'firePit',
    title: '11. On your own',
    say: 'No steps this time. Show what you learned.',
    tip: 'Stuck? The goal card has hints.',
    setup: (g) => {
      // Fresh start for the challenge: use what is in the camp.
      for (const id of ['fibers', 'cord'] as ItemId[]) g.satchel.set(id, 0);
      clearKind(g, 'storage');
    },
    tasks: [
      { text: 'Gather fibres yourself', done: (c) => c.gathered.has('fibers') },
      { text: 'Take something out of the satchel', done: (c) => c.tookOut >= 1 },
      { text: 'Build a fire pit of your own', done: (c) => [...c.newStructures].some((k) => k.startsWith('firePit')) },
      { text: 'Craft cord', done: (c) => c.cordMade },
    ],
  },
];

export const LESSON_IDS = LESSONS.map((l) => l.id);

export interface TutorialSave {
  done: LessonId[];
  current: number;
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
  };
}

export type TutorialEvent =
  | { type: 'lesson'; index: number }
  | { type: 'task'; index: number; task: number }
  | { type: 'lessonDone'; index: number }
  | { type: 'finished' };

/**
 * Watches one Game and moves through LESSONS. Call `poll(ui)` a few times a
 * second; events are handled as they come.
 */
export class TutorialRunner {
  readonly done = new Set<LessonId>();
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
      this.current = Math.max(0, Math.min(LESSONS.length - 1, save.current | 0));
      this.finished = !!save.finished;
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
    return { done: [...this.done], current: this.current, finished: this.finished, ticks: [...this.ticks] };
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
    for (const s of g.structures) {
      if (s.complete && !this.knownComplete.has(s.id)) {
        this.knownComplete.add(s.id);
        c.newStructures.add(`${s.kind}#${s.id}`);
      }
    }
    this.checkCrafted();
    this.evaluate();
  }

  private evaluate(): void {
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
    if (index === LESSONS.length - 1) {
      if (!this.finished || !wasDone) {
        this.finished = true;
        this.game.lessonStructure = undefined;
        this.emit({ type: 'finished' });
      }
      return;
    }
    // Go on to the first lesson not yet done after this one (or simply the next).
    let next = index + 1;
    for (let i = index + 1; i < LESSONS.length; i++) {
      if (!this.done.has(LESSONS[i].id)) {
        next = i;
        break;
      }
    }
    this.begin(next);
  }

  /** Index of the next unticked task, or -1. */
  nextTask(): number {
    return this.ticks.indexOf(false);
  }
}
