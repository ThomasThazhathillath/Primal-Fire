// Chapter 1 story layer (docs/STORY_CHAPTER1_SPEC.md, plan in docs/STORY_CHAPTER1_PLAN.md).
// Data + tracker only, no rendering: StorySystem says the lines and draws the
// clues, camp marker and mast glint.
//
// Every beat is triggered by real game state or a real game event (never a
// timer), fires once, and is saved. A save from before the story marks every
// beat whose state is already true as seen, so nothing replays on reload.

import type { Game, GameEvent } from './game.js';
import type { ItemId } from './items.js';
import { LANDMARK_BY_ID, streamDistance } from './world-layout.js';

export type ActId = 'strange' | 'signs' | 'build' | 'fire' | 'camp' | 'mystery' | 'home' | 'frame' | 'roof';

export const ACTS: Record<ActId, { title: string; text: string }> = {
  strange: { title: 'A Strange Place', text: 'You wake in a strange clearing, with nothing.' },
  signs: { title: 'First Signs of Life', text: 'Water is near. Useful things lie all around.' },
  build: { title: 'Something To Build Upon', text: "I can't keep working on the ground. I need a stable surface." },
  fire: { title: 'First Fire', text: 'The temperature is dropping. I need a fire before it gets dark.' },
  camp: { title: 'A Place To Return To', text: 'A fire and a workbench, close together. This could be a camp.' },
  mystery: { title: 'Someone Was Here Before', text: 'The rusted structure in the distance. Tomorrow.' },
  home: { title: 'A Place To Call Home', text: 'You have fire. Now build a shelter.' },
  frame: { title: 'The Frame', text: 'Poles push, cord pulls, and a triangle does not fold.' },
  roof: { title: 'Roof Over Your Head', text: 'Layers overlap like tiles. Then the rain will tell you the truth.' },
};

/** Environmental clues near the waking spot (x, z in metres; StorySystem draws them). */
export const CLUES = {
  oldFire: { x: -4.2, z: -1.2 },
  stoneLine: { x: -1.4, z: -4.7 },
  usedBranch: { x: -4.7, z: 0.1 },
} as const;
export type ClueId = keyof typeof CLUES;
/** Walk this close (m) to a clue to notice it. */
export const CLUE_RANGE = 1.8;
/** Fire pit and workbench within this distance (m) make a camp. */
export const CAMP_RANGE = 8;
/** Within this distance (m) of the stream you notice the water. */
export const STREAM_RANGE = 3.5;
/** The mast top (world x, y, z): the ruins teaser glints here. */
export const MAST_TOP = { x: LANDMARK_BY_ID.ruins.x - 3.6, y: 13, z: LANDMARK_BY_ID.ruins.z - 3.8 };
/** Facing within this angle (rad) of the mast counts as looking at it. */
export const LOOK_CONE = 0.45;

export interface StoryBeat {
  id: string;
  act: ActId;
  lines: string[];
  /** This beat opens the act (its title is announced first). */
  opensAct?: boolean;
  /** Fires on a game event. */
  on?: (e: GameEvent, g: Game) => boolean;
  /** Fires when this becomes true (polled a few times a second). */
  when?: (g: Game, s: StoryTracker) => boolean;
  /** Waits until no thought is being said (lets a moment like the first fire breathe). */
  quiet?: boolean;
  /** Only once this beat has fired. */
  after?: string;
  /** For saves from before the story: already past this beat, mark it seen without speaking. */
  past?: (g: Game) => boolean;
}

const gotOne = (e: GameEvent, ids: ItemId[]): boolean => e.type === 'gather' && ids.includes(e.item);
const kinds = (g: Game): number => {
  let n = 0;
  for (const v of g.gathered.values()) if (v > 0) n++;
  return n;
};
const anyGathered = (g: Game): boolean => kinds(g) > 0;
const benchDone = (g: Game): boolean => g.hasStructure('workbench');
const fireLit = (g: Game): boolean => g.flag('fireLit');
const near = (g: Game, p: { x: number; z: number }, r: number): boolean => Math.hypot(g.player.x - p.x, g.player.z - p.z) < r;
const objIs = (g: Game, ...ids: string[]): boolean => {
  const o = g.objectives.current;
  return !!o && ids.includes(o.id);
};

export const STORY_BEATS: StoryBeat[] = [
  // Act 1: awakening. Fired by StorySystem when a new game starts ("Wake up").
  {
    id: 'awake',
    act: 'strange',
    opensAct: true,
    lines: ["I don't remember how I got here...", 'Where is everyone?', 'Whatever happened... I need to survive.'],
    past: (g) => g.time > 30 || anyGathered(g),
  },
  { id: 'clueFire', act: 'strange', lines: ['Ash and blackened stones.', 'Someone made a fire here. A long time ago.'], when: (g) => near(g, CLUES.oldFire, CLUE_RANGE) },
  { id: 'clueStones', act: 'strange', lines: ['These stones are in a line.', "That doesn't happen by itself."], when: (g) => near(g, CLUES.stoneLine, CLUE_RANGE) },
  { id: 'clueBranch', act: 'strange', lines: ['This stick is worn smooth at one end.', 'Someone used it.'], when: (g) => near(g, CLUES.usedBranch, CLUE_RANGE) },
  // Act 2: the wilderness. Meaningful first discoveries only, not every item.
  { id: 'firstGather', act: 'signs', opensAct: true, lines: ['This could be useful.'], on: (e) => e.type === 'gather', past: anyGathered },
  { id: 'dryGrass', act: 'signs', lines: ['This could catch a spark.'], on: (e) => gotOne(e, ['dryGrass', 'leafLitter']), past: (g) => g.gatheredCount('dryGrass') > 0 },
  { id: 'deadWood', act: 'signs', lines: ['Dead wood. It might burn well.'], on: (e) => gotOne(e, ['branch', 'dryBranch', 'logs', 'twigs']), past: (g) => g.gatheredCount('twigs') > 0 || g.gatheredCount('logs') > 0 },
  { id: 'fibers', act: 'signs', lines: ['These might be useful for tying things together.'], on: (e) => gotOne(e, ['fibers', 'vine', 'bark']), past: (g) => g.gatheredCount('fibers') > 0 },
  { id: 'stream', act: 'signs', lines: ["Water. At least I won't die of thirst today."], when: (g) => streamDistance(g.player.x, g.player.z) < STREAM_RANGE },
  { id: 'meadow', act: 'signs', lines: ['Open ground, full of sun. Everything here grows fast.'], on: (e) => e.type === 'discovered' && e.landmark.id === 'meadow' },
  { id: 'mast', act: 'signs', lines: ['Something tall above the trees.', 'Too straight to be a tree.'], on: (e) => e.type === 'discovered' && e.landmark.id === 'ruins' },
  {
    id: 'daylight',
    act: 'signs',
    lines: ["The light won't last forever.", 'I need somewhere to work, and I need a fire.'],
    when: (g) => kinds(g) >= 4 || objIs(g, 'flatStone', 'workbench'),
    past: benchDone,
  },
  // Act 3: the first workbench (the existing blueprint system builds it).
  {
    id: 'benchIntro',
    act: 'build',
    opensAct: true,
    lines: ["I can't keep working on the ground. I need a stable surface.", 'A flat stone on three others might do.'],
    when: (g) => objIs(g, 'flatStone', 'workbench') || g.structures.some((s) => s.kind === 'workbench'),
    past: benchDone,
  },
  { id: 'benchDone', act: 'build', lines: ["Not much... but it's a start.", 'I can make something useful here.'], when: benchDone, past: (g) => benchDone(g) && (g.time > 60 || fireLit(g)) },
  // Act 4: the first fire (the existing fire-making mechanics).
  {
    id: 'fireIntro',
    act: 'fire',
    opensAct: true,
    lines: ['The temperature is dropping.', 'I need a fire before it gets dark.'],
    when: (g) => benchDone(g) && (objIs(g, 'tinder', 'cord', 'frictionParts', 'bowDrill', 'firePit', 'fireLay', 'ember') || g.hasStructure('firePit')),
    after: 'benchDone',
    past: fireLit,
  },
  { id: 'tinder', act: 'fire', lines: ['Something dry and fine. This should catch.'], on: (e) => gotOne(e, ['dryGrass', 'leafLitter', 'bark']), after: 'fireIntro', past: fireLit },
  { id: 'bowDrill', act: 'fire', lines: ['Friction...', 'Perhaps I can make enough heat with this.'], when: (g) => g.held === 'bowDrill', past: fireLit },
  { id: 'ember', act: 'fire', lines: ["There's an ember! Don't let it die."], when: (g) => g.flag('emberMade'), past: fireLit },
  { id: 'fireLit', act: 'fire', lines: ['Fire.', 'Finally.'], when: fireLit, past: (g) => fireLit(g) && g.time > 120 },
  // Act 5: the first camp, from structures the game supports (fire pit + workbench + your satchel).
  {
    id: 'campFar',
    act: 'camp',
    quiet: true,
    opensAct: true,
    lines: ['My fire and my workbench are far apart.', 'A camp should keep them close, on dry, flat ground near water.'],
    when: (g, s) => fireLit(g) && !s.camp && !campSite(g) && g.hasStructure('firePit') && benchDone(g),
  },
  {
    id: 'camp',
    act: 'camp',
    quiet: true,
    opensAct: true,
    lines: ["It's not much.", "But it's mine.", "Tomorrow, I'll find out what else this place is hiding."],
    when: (g, s) => fireLit(g) && !!s.camp,
  },
  // Teaser: the mast glints once the camp stands; it speaks only when you look that way yourself.
  {
    id: 'ruinsTeaser',
    act: 'mystery',
    quiet: true,
    lines: ['That structure in the distance...', "It doesn't look natural.", 'Someone was here before me.'],
    after: 'camp',
    when: (g) => lookingAt(g, MAST_TOP.x, MAST_TOP.z, LOOK_CONE),
    past: (g) => g.flag('finale'),
  },
  // Chapter 2: the living camp (docs/CHAPTER2_SHELTER_SPEC.md). Evening comes; the camp has a fire and nothing more.
  {
    id: 'ch2Wind',
    act: 'home',
    opensAct: true,
    quiet: true,
    lines: ['The wind is picking up. Leaves and small branches are coming down around the camp.', 'The light is going gold.'],
    when: (g) => g.quest?.title === 'A Place to Call Home',
    past: (g) => g.questIndex > 0 && !!g.leanTo(),
  },
  {
    id: 'ch2Exposed',
    act: 'home',
    quiet: true,
    lines: ['My fire gives warmth, but nothing here keeps off the wind or the rain.', 'I need a shelter. Something long and straight, to begin with.'],
    when: (g) => g.quest?.title === 'A Place to Call Home',
    after: 'ch2Wind',
    past: (g) => g.gatheredCount('pole') > 0,
  },
  { id: 'ch2Pole', act: 'home', lines: ['A pole this long takes both hands. Carry it where the frame will stand.'], on: (e) => gotOne(e, ['pole']), past: (g) => g.gatheredCount('pole') > 0 },
  { id: 'ch2Frame', act: 'frame', opensAct: true, lines: ['Two posts, a ridge and ribs leaning in. Then cord to hold it all.'], when: (g) => g.quest?.title === 'Build the Frame', past: (g) => g.hasEvent('shelter.frame.built') },
  { id: 'ch2Roof', act: 'roof', opensAct: true, lines: ['The frame stands. Now cover it, layer by layer.'], when: (g) => g.quest?.title === 'Roof Over Your Head', past: (g) => g.hasEvent('shelter.roof.covered') },
  { id: 'ch2Rain', act: 'roof', quiet: true, lines: ['Clouds are coming in low.', 'Let us see what the roof can do.'], when: (g) => g.quest?.title === 'Test Your Engineering', past: (g) => g.hasEvent('shelter.rain.begin') },
];

export const BEAT_BY_ID: Record<string, StoryBeat> = Object.fromEntries(STORY_BEATS.map((b) => [b.id, b]));

/** Is the player facing (x, z) within `cone` radians? facingYaw 0 = towards −Z. */
export function lookingAt(g: Game, x: number, z: number, cone: number): boolean {
  const want = Math.atan2(-(x - g.player.x), -(z - g.player.z));
  let d = want - g.facingYaw;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return Math.abs(d) < cone;
}

/** The camp site: a complete fire pit and workbench close together (midpoint), or null. */
export function campSite(g: Game): { x: number; z: number } | null {
  let best: { x: number; z: number } | null = null;
  let bestD = CAMP_RANGE;
  for (const p of g.structures) {
    if (p.kind !== 'firePit' || !p.complete) continue;
    for (const b of g.structures) {
      if (b.kind !== 'workbench' || !b.complete) continue;
      const d = Math.hypot(p.x - b.x, p.z - b.z);
      if (d <= bestD) {
        bestD = d;
        best = { x: (p.x + b.x) / 2, z: (p.z + b.z) / 2 };
      }
    }
  }
  return best;
}

export interface StorySave {
  seen: string[];
  camp?: { x: number; z: number } | null;
  /** Observation id → where/why it was recorded (Lab Notebook context line). */
  notes?: Record<string, string>;
  muted?: boolean;
}

export type StoryEvent = { type: 'thought'; beat: string; lines: string[] } | { type: 'act'; act: ActId };

export class StoryTracker {
  readonly seen = new Set<string>();
  camp: { x: number; z: number } | null = null;
  readonly notes = new Map<string, string>();
  muted = false;
  act: ActId = 'strange';
  private listeners = new Set<(e: StoryEvent) => void>();

  constructor(private g: Game) {}

  on(fn: (e: StoryEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** A new game began ("Wake up"): the awakening beat. */
  wake(): void {
    this.fire(BEAT_BY_ID.awake);
  }

  /** Called for every game event. */
  observe(e: GameEvent): void {
    if (e.type === 'observation' && !this.notes.has(e.id)) this.notes.set(e.id, this.contextNote());
    for (const b of STORY_BEATS) if (b.on && this.ready(b) && b.on(e, this.g)) this.fire(b);
  }

  /** Polled a few times a second: state-driven beats, and the camp. `busy`: a thought is still being said. */
  poll(busy = false): void {
    if (!this.camp && this.g.flag('fireLit')) this.camp = campSite(this.g);
    for (const b of STORY_BEATS) if (b.when && this.ready(b) && !(busy && b.quiet) && b.when(this.g, this)) this.fire(b);
  }

  private ready(b: StoryBeat): boolean {
    return !this.seen.has(b.id) && (!b.after || this.seen.has(b.after));
  }

  private fire(b: StoryBeat): void {
    if (this.seen.has(b.id)) return;
    this.seen.add(b.id);
    this.act = b.act;
    if (b.opensAct) this.emit({ type: 'act', act: b.act });
    this.emit({ type: 'thought', beat: b.id, lines: b.lines });
    this.g.log.add(`story ${b.id}`, 'ok');
  }

  private emit(e: StoryEvent): void {
    for (const l of this.listeners) l(e);
  }

  /** A short "where / why" for a new notebook entry: the place you are and what you were trying to do. */
  contextNote(): string {
    const g = this.g;
    let place = 'in the forest';
    let bestD = Infinity;
    for (const id of ['wake', 'meadow', 'glade', 'bend', 'ruins', 'splitRock']) {
      const l = LANDMARK_BY_ID[id];
      const d = Math.hypot(g.player.x - l.x, g.player.z - l.z);
      if (d < l.r + 4 && d < bestD) {
        bestD = d;
        place = `at ${l.name}`;
      }
    }
    if (this.camp && Math.hypot(g.player.x - this.camp.x, g.player.z - this.camp.z) < CAMP_RANGE) place = 'at your camp';
    else if (bestD === Infinity && streamDistance(g.player.x, g.player.z) < STREAM_RANGE + 2) place = 'by the stream';
    const why = this.seen.has('camp')
      ? ''
      : this.seen.has('fireIntro') || this.seen.has('benchDone')
        ? ', trying to make your first fire'
        : this.seen.has('benchIntro')
          ? ', building your first workbench'
          : ', on your first day';
    return `Recorded ${place}${why}.`;
  }

  /** Marks a beat as already told (no thought). */
  markSeen(id: string): void {
    if (id in BEAT_BY_ID) this.seen.add(id);
  }

  /** Mutes or unmutes thought lines (saved). */
  setMuted(m: boolean): void {
    this.muted = m;
  }

  snapshot(): StorySave {
    return { seen: [...this.seen], camp: this.camp ? { ...this.camp } : null, notes: Object.fromEntries(this.notes), muted: this.muted };
  }

  /** Restores a save; `undefined` = a save from before the story: mark what is already past as seen. */
  restore(s: StorySave | undefined): void {
    this.seen.clear();
    this.notes.clear();
    if (s) {
      for (const id of s.seen ?? []) if (id in BEAT_BY_ID) this.seen.add(id);
      this.camp = s.camp ? { x: s.camp.x, z: s.camp.z } : null;
      for (const [k, v] of Object.entries(s.notes ?? {})) if (typeof v === 'string') this.notes.set(k, v);
      this.muted = !!s.muted;
    } else {
      this.camp = this.g.flag('fireLit') ? campSite(this.g) : null;
      for (const b of STORY_BEATS) if (b.past?.(this.g)) this.seen.add(b.id);
      if (this.camp) for (const id of ['campFar', 'camp']) this.seen.add(id);
    }
    for (const b of STORY_BEATS) if (this.seen.has(b.id)) this.act = b.act;
  }
}
