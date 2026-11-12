// "THE FIRST STEPS — Learning to Survive": the lessons and the runner
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

export type LessonId =
  | 'hands'
  | 'look'
  | 'gather'
  | 'satchel'
  | 'glide'
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
  /** The science behind what you just did: said after the step is done. */
  science: string;
  /** Notebook entry recorded with it (if not already noted). */
  note?: string;
  tasks: Task[];
  /** The one structure this lesson lets you start (absent = none). Keeps stray outlines out of other lessons. */
  builds?: StructureKind;
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

/** Clear finished or half-built structures of a kind, so a lesson can build it again. */
function clearKind(g: Game, kind: string): void {
  for (const s of [...g.structures]) {
    if (s.kind !== kind) continue;
    s.complete = false;
    g.removeStructure(s.id);
  }
}

/** A fire-pit outline a few steps ahead, so the lesson has a mark to look at (kept if one is already there). */
function lookLessonOutline(g: Game): void {
  if (g.structures.some((s) => s.kind === 'firePit' && !s.complete)) return;
  const fx = -Math.sin(g.facingYaw);
  const fz = -Math.cos(g.facingYaw);
  for (const [f, side] of [[2.6, 0], [2.6, 1.4], [2.6, -1.4], [3.4, 0], [-2.6, 0]]) {
    const x = g.player.x + fx * f + fz * side;
    const z = g.player.z + fz * f - fx * side;
    if (g.placeBlueprint('firePit', x, z, 0, true).ok) return;
  }
}

/** Marks of the practice fire pit already filled when the look lesson began. */
let lookBase = 0;
const filledPitMarks = (g: Game): number => g.structures.reduce((n, s) => n + (s.kind === 'firePit' ? s.spots.filter((x) => x).length : 0), 0);

export const LESSONS: Lesson[] = [
  {
    id: 'hands',
    setup: freeHands,
    title: 'Waking',
    say: 'You wake on cold ground with nothing. Things within reach glow softly.',
    science: 'An opposable thumb lets a hand grip what no paw can: your first tool.',
    tip: 'Pinch thumb and finger together to grab. Open your hand to let go. Desktop: click.',
    tasks: [
      { text: 'Pinch something within reach to pick it up', done: (c) => c.pickups >= 1 },
      { text: 'Pick up one more thing (anything)', done: (c) => c.pickups >= 2 },
    ],
  },
  // LOOK AND PINCH (docs/GAZE_PINCH_90FPS_SPEC.md): far things by gaze. Kept as one self-contained block.
  {
    id: 'look',
    builds: 'firePit',
    title: 'Look and pinch',
    say: 'Look at a glowing stone. Pinch.',
    science: 'Your eyes move before your hand: you aim where you look.',
    tip: 'No need to reach: look, then pinch either hand. Desktop: hover and click.',
    setup: (g) => {
      freeHands(g);
      ensure(g, { dryStone: 2 });
      gazeStats.reset();
      lookLessonOutline(g);
      lookBase = filledPitMarks(g);
    },
    // The practice outline goes (its stones come back); the fire lesson builds the real pit.
    teardown: (g) => clearKind(g, 'firePit'),
    tasks: [
      { text: 'Look at a stone and pinch', done: () => gazeStats.picks >= 1 },
      { text: 'Move your hand, then open it', done: () => gazeStats.releases >= 1 },
      // A quick pinch that picks the stone and lets go over the outline seats it through the release path (not gazeStats.placed): that counts too.
      { text: 'Look at a mark and pinch', done: (_c, g) => gazeStats.placed >= 1 || filledPitMarks(g) > lookBase },
    ],
  },
  {
    id: 'gather',
    title: 'What the clearing offers',
    say: 'Dusk will come. Fire needs tinder, kindling and stones. Point and pinch to gather.',
    science: 'Dry, dead wood snaps cleanly: no water left inside to fight the flame.',
    note: 'g_dead',
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
    title: 'The pouch at your hip',
    say: 'Everything you gather goes into the pouch at your right hip.',
    science: 'Carry only what you need: every extra stone is weight you pay for in effort.',
    tip: 'Reach down to the pouch, or tap Menu > Bag. Desktop: Tab.',
    setup: (g) => {
      freeHands(g);
      ensure(g, { dryStone: 1 });
    },
    tasks: [
      { text: 'Take a stone out of the pouch', done: (c) => c.tookOut >= 1 },
      { text: 'Put it back', done: (c) => c.putBack >= 1 },
    ],
  },
  // VR MOVEMENT: the thumb-over-index micro-gesture. Detected the same way as any movement (the player's position and yaw).
  {
    id: 'glide',
    title: 'Thumb moves',
    say: 'No sticks needed. Your thumb moves you: rest it over your index finger.',
    science: 'Small, well-practised motions are easier to repeat than big ones: that is why fine tools use the thumb.',
    tip: 'Tap the side of your index finger with your thumb to teleport. Swipe the thumb left or right along it to turn. Or pinch and hold, aim at the ground, let go. Desktop: WASD and Q / E.',
    tasks: [
      { text: 'Teleport: tap thumb on index', done: (c) => c.moved >= 1.2 },
      { text: 'Turn: swipe thumb left or right', done: (c) => c.turned >= 0.7 },
    ],
  },
  {
    id: 'move',
    title: 'Bearings',
    say: 'Far off, a rusted mast leans over old ruins. Not yet. Get your bearings first.',
    science: 'The sun sinks in the west; its height above the trees tells you how long until dark.',
    tip: 'Pinch and hold, aim at the ground, let go to move there. Flick your thumb sideways to turn. Desktop: WASD to walk, Q / E to turn.',
    tasks: [
      { text: 'Move to a new spot', done: (c) => c.moved >= 1.2 },
      { text: 'Turn to face another way', done: (c) => c.turned >= 0.7 },
    ],
  },
  {
    id: 'place',
    title: 'Hands full',
    say: 'Big things stay in your hands. Set them down, or toss them aside.',
    science: 'A thrown stone keeps moving until the ground stops it: momentum.',
    tip: 'Open your hand low to place. Fling and open to throw. Desktop: G drops, Shift+G throws.',
    setup: (g) => {
      freeHands(g);
      ensure(g, { dryStone: 2, logs: 1 });
    },
    tasks: [
      { text: 'Hold a log or the stone slab', done: (c) => c.heldKinds.has('logs') || c.heldKinds.has('slab') },
      { text: 'Set something down on the ground', done: (c) => c.drops >= 1 },
      { text: 'Toss something (or set down another)', done: (c) => c.drops >= 2 },
    ],
  },
  {
    id: 'build',
    builds: 'workbench',
    title: 'A steady surface',
    say: 'Every machine is gone. The science is not. To make anything, you need a steady work surface.',
    tip: 'Hold the slab over open ground; a red outline means bad ground. Then pinch an empty glowing mark: a stone from your pouch fills it, and the next one comes to your hand.',
    science: 'Three legs always touch the ground together: a tripod never wobbles.',
    note: 'b_tripod',
    setup: (g) => {
      clearKind(g, 'workbench');
      ensure(g, { dryStone: 3 });
    },
    tasks: [
      { text: 'Hold the stone slab over open ground and place the plan', done: (c, g) => c.newStructures.size > 0 || g.structures.some((s) => s.kind === 'workbench') },
      { text: 'Fill each glowing mark with a stone', done: (c, g) => g.structures.some((s) => s.kind === 'workbench' && s.spots.every((v) => v !== null)) },
      { text: 'Lay the slab on top', done: (c, g) => g.structures.some((s) => s.kind === 'workbench' && s.complete) },
    ],
  },
  {
    id: 'craft',
    builds: 'workbench',
    title: 'Cord',
    say: 'Fire needs a bow drill, and a bow drill needs cord. Stand at the bench.',
    science: 'Twisted fibres squeeze each other: friction locks them into one strong cord.',
    note: 'g_cord',
    tip: 'Twist fibres into cord with both hands. Then bind spindle, board, branch and cord.',
    setup: (g) => {
      if (!g.structures.some((s) => s.kind === 'workbench' && s.complete)) ensure(g, { dryStone: 3 });
      ensure(g, { fibers: 3, spindle: 1, board: 1, greenBranch: 1 });
    },
    tasks: [
      { text: 'Stand at your workbench', done: (c, g) => g.structures.some((s) => s.kind === 'workbench' && s.complete) },
      { text: 'Twist three fibres into cord', done: (c) => c.cordMade },
      { text: 'Make the bow drill', done: (c) => c.drillMade },
    ],
  },
  {
    id: 'fire',
    builds: 'firePit',
    title: 'Fire before nightfall',
    say: 'The light is going. A ring of stones, then tinder, twigs, logs. Then make an ember.',
    science: 'Fire needs heat, fuel and air. Take any one away and it dies.',
    note: 'f_success',
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
    title: 'When you are stuck',
    say: 'The card above shows what to do next. It can give hints, if you want them.',
    science: 'Every discovery starts the same way: a question, then a test.',
    tip: 'Tap the bulb on the card for a hint. Tap "More help" for a clearer one.',
    tasks: [
      { text: 'Ask the card for a hint', done: (c) => c.hintLevel >= 1 },
      { text: 'Ask for more help', done: (c) => c.hintLevel >= 2 },
    ],
  },
  {
    id: 'notebook',
    title: 'What you have learned',
    say: 'Everything you notice is written down: what you saw, why, and where it stops working.',
    science: 'Observation, principle, real-world limit: the steps every scientist uses.',
    tip: 'Menu > Notebook. Desktop: N. New discoveries open new goals.',
    setup: (g) => {
      if (g.notebook.length === 0) g.observe('g_cord');
    },
    tasks: [{ text: 'Open the notebook and read an entry', done: (c) => c.notebookOpened }],
  },
  {
    id: 'final',
    builds: 'firePit',
    title: 'Night is coming',
    say: 'The last light is going. Show what you know.',
    science: 'You made fire from wood, stone and understanding. That is all you will ever have out here.',
    tip: 'Stuck? The goal card has hints.',
    setup: (g) => {
      // Fresh start for the challenge: use what is in the camp.
      for (const id of ['fibers', 'cord'] as ItemId[]) g.satchel.set(id, 0);
      clearKind(g, 'storage');
    },
    tasks: [
      { text: 'Gather fibres', done: (c) => c.gathered.has('fibers') },
      { text: 'Take something out of the pouch', done: (c) => c.tookOut >= 1 },
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
  /** The science line after a step is done (its notebook entry, if any, is already recorded). */
  | { type: 'science'; index: number; text: string }
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

/** Opening narration, a line or two per beat, before the first step. */
export const OPENING: string[] = [
  'You wake on the forest floor. Cold. Nothing in your hands.',
  'Through the trees, a rusted mast leans over ruins on the horizon.',
  'Every machine is gone. The science is not.',
];

/** The closing lines when the last step is done; survival carries the story on from here. */
export const CLOSING: string[] = [
  'Darkness settles. Your fire holds it back.',
  'Out past the trees, the rusted mast catches the last of the light.',
];

/** The hour each step plays at: early afternoon at waking, dusk by the fire, night falling at the end. */
export const STEP_HOURS: Record<LessonId, number> = {
  hands: 13,
  look: 13.2,
  gather: 13.5,
  satchel: 14,
  glide: 14.25,
  move: 14.5,
  place: 15,
  build: 15.5,
  craft: 16.5,
  fire: 18.2,
  hints: 18.6,
  notebook: 18.9,
  final: 19.2,
};
/** After the last step: night. */
export const NIGHT_HOUR = 19.8;

/** Hour of the first day for the open step (or night once the opening is finished). */
export function storyHour(step: LessonId | null): number {
  return step === null ? NIGHT_HOUR : STEP_HOURS[step];
}
