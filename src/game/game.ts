// Game state and rules, independent of rendering and input. IWSDK systems
// call these actions and react to the events; tests drive them directly.

import { type StorySave, StoryTracker } from './story.js';
import { Wildlife } from './wildlife.js';
import { freshness, Tracks } from './tracks.js';
import { livingProgress } from './living-quests.js';
import { Environment, type EnvironmentSave } from './environment.js';
import { actionFor } from './actions.js';
import { BENCH_BY_ID, BenchSession, canStart, missingText, type BenchMotion } from './bench.js';
import { bookEntries, findBookSpot, type BookEntry } from './buildbook.js';
import { checkPlace, FAILURE_TEXT, GrabTracker, slabStability, SUPPORT_NAMES, type GuideFailureCode } from './interact.js';
import { HAND_RECIPES, TOOLS } from './tools.js';
import { capacityFor, itemsCount, itemsWeight, moveLimits, PACK_UPGRADES, type MoveLimits, type PackUpgrade } from './backpack.js';
import { FireState, type FireSave, type FireStage } from './fire.js';
import {
  BLUEPRINTS,
  CAMP_RADIUS,
  checkPlacement,
  DEFAULT_SPOT_TOLERANCE,
  isSpotLocked,
  openStage,
  STAGE_NAMES,
  spotWorldPosition,
  STORAGE_SLOTS,
  type PlacedStructure,
  type PlacementResult,
  type StructureKind,
} from './blueprint.js';
import { fitsPouch, ITEM_PHYSICS, ITEMS, itemName, SATCHEL_ORDER, type ItemId, type Material } from './items.js';
import { carrySpeed } from './carry.js';
import { EventLog } from './log.js';
import { observationsForEvent, OBSERVATIONS } from './observations.js';
import { isScienceEvent } from './science-events.js';
import { GuideTracker, isGuideFailure, type GuideSave } from './guides.js';
import { FoodState, type FoodSave } from './food.js';
import { GAME_LEVELS, levelForQuest, migrateQuestIndex, QUESTS_VERSION, type GameLevel } from './levels.js';
import { WaterState, type WaterSave } from './water.js';

/** Interaction failures whose guide wording lives under a different code. */
const GUIDE_CODE_FOR: Partial<Record<GuideFailureCode, string>> = {
  'swing.weak': 'swing.tooWeak',
  'knap.offEdge': 'knap.miss',
  'knap.badAngle': 'knap.angleTooSteep',
  'cord.sameDirection': 'twist.sameDirection',
};
import { ASSIST, needText, openMarks, resolveTarget, snapVerdict, type Candidate } from './assist.js';
import { Adaptive, type AssistSave } from './adaptive.js';
import { frameDone, inside as insideShelter, leakingPanels, RAIN_MAX, roofed, ShelterTest, type ShelterTestSave, stageCount } from './shelter.js';
import { CONTINUOUS, type IntentAction, type IntentTarget, resolveIntent } from './intent.js';
import { ObjectiveTracker, type ObjectivesSave } from './objectives.js';
import { QUESTS, type QuestStep } from './quests.js';
import { LANDMARKS, type Landmark } from './world-layout.js';

export type FlagId =
  | 'cordMade'
  | 'hasDrill'
  | 'fireLayBuilt'
  | 'emberMade'
  | 'fireLit'
  | 'potDry'
  | 'potFired'
  | 'moundBuilt'
  | 'kilnLit'
  | 'charcoalMade'
  | 'waterSafe'
  | 'finale'
  | 'shelterTested'
  | 'shelterRested';

export type ToastKind = 'info' | 'good' | 'bad' | 'note';

export type GameEvent =
  | { type: 'toast'; text: string; kind: ToastKind }
  | { type: 'observation'; id: string }
  | { type: 'xp'; amount: number; total: number }
  | { type: 'levelUp'; level: number }
  | { type: 'satchel' }
  | { type: 'held'; item: ItemId | null }
  | { type: 'structure'; structure: PlacedStructure }
  | { type: 'quest'; index: number }
  | { type: 'objective'; id: string | null }
  /** A part was seated on its mark (for the confirmation pop and sound). */
  | { type: 'placed'; x: number; y: number; z: number }
  /** A hint level was unlocked (a soft chime). */
  | { type: 'hintGiven'; level: number }
  /** A shelter construction stage was completed (save point; StructureView animates it). */
  | { type: 'shelterStage'; stage: number; id: number }
  /** Lashing progress on a joint (0..1) for the wraps on the joint. */
  | { type: 'lash'; id: number; index: number; progress: number }
  | { type: 'objectiveDone'; id: string; message: string }
  | { type: 'questComplete'; index: number; title: string; roadmapNode: string | null }
  | { type: 'levelComplete'; level: number; name: string; next: GameLevel | null }
  | { type: 'discovered'; landmark: Landmark }
  | { type: 'fire'; stage: FireStage }
  | { type: 'arrow'; hit: boolean }
  | { type: 'reach' }
  | { type: 'contact'; a: Material; b: Material; x: number; y: number; z: number; strength: number }
  | { type: 'bench'; state: 'start' | 'progress' | 'step' | 'done' | 'cancel' }
  | { type: 'fx'; name: FxName; strength: number }
  | { type: 'interaction'; code: GuideFailureCode; detail?: string }
  | { type: 'drops' }
  | { type: 'gather'; item: ItemId; tool: ItemId | null }
  | { type: 'action'; id: string; progress: number; done: boolean };

/** XP needed to reach each level (index = level − 1). */
export const LEVELS = [0, 100, 250, 450, 700, 1000, 1400, 99999];
/** While building, refill your hand with the next part only within this distance (m) of the build. */
export const REFILL_RANGE = 4;
/** How close (m) you must stand to a workbench to craft at it. */
export const CRAFT_REACH = 2.5;

export interface Recipe {
  id: 'cord' | 'bowDrill';
  name: string;
  inputs: Partial<Record<ItemId, number>>;
  output: ItemId;
  observation: string;
  flag: FlagId;
}

export const RECIPES: Recipe[] = [
  {
    id: 'cord',
    name: 'Twist cord',
    inputs: { fibers: 3 },
    output: 'cord',
    observation: 'g_cord',
    flag: 'cordMade',
  },
  {
    id: 'bowDrill',
    name: 'Build bow drill',
    inputs: { spindle: 1, board: 1, greenBranch: 1, cord: 1 },
    output: 'bowDrill',
    observation: 'g_bow',
    flag: 'hasDrill',
  },
];

/** Sounds/feedback cues from physical interactions. */
export type FxName = 'creak' | 'crack' | 'snap' | 'chop' | 'glance' | 'bounce' | 'thud' | 'swish' | 'knap' | 'crush' | 'twist' | 'strain' | 'seat' | 'wobble';

export interface WorldDrop {
  id: number;
  item: ItemId;
  x: number;
  z: number;
}

export interface HintResult {
  level: 0 | 1 | 2;
  text: string;
  /** Ground position to mark on the compass (third hint only). */
  target?: { x: number; z: number };
}

/** Finds the nearest place to gather one of `items`, or null. */
export type Locator = (items: ItemId[], from: { x: number; z: number }) => { x: number; z: number } | null;

const DIRECTIONS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];

/** Soft, fibrous things a hand-held flake can cut (the first-cut objective). */
const CUTTABLE: ItemId[] = ['cane', 'fibers', 'vine', 'greenBranch', 'bark', 'dryGrass'];

export class Game {
  time = 0;
  xp = 0;
  level = 1;
  questIndex = 0;
  held: ItemId | null = null;
  readonly player = { x: 0, z: 0 };
  /** Head yaw in radians (0 = towards -Z); set each frame by the UI so directions can say "to your left". Not saved. */
  facingYaw = 0;
  /** Per-player assistance: grows with repeated misses, eases with successes, saved (adaptive.ts). */
  readonly assist = new Adaptive();
  /**
   * While building: after you place a part, if the build still wants it and your bag has more, the next one appears
   * in your hand. Stops with Put away (cancelRefill) or when you walk away from the build. Not saved.
   */
  autoRefill = true;
  /** The Chapter 2 rain test (shelter.ts): saved with the game. */
  readonly shelterTest = new ShelterTest();
  private forcedRain = false;
  private shelterT = 0;
  /** 0..1 how far inside the shelter the player is (smoothed by ShelterSystem; darkens the light, muffles the rain). Not saved. */
  shelterShade = 0;
  /** Game time a shelter part was last set (the rain waits for the builder to finish). */
  private lastBuildAt = -99;
  /** Game time a plan (outline) was last placed from a held key part: that pinch must not also let go of the part. */
  planPlacedAt = -10;
  /**
   * The structure the current lesson wants (set by the tutorial): `undefined` = no lesson says anything,
   * `null` = this lesson builds nothing, so no outline may start. Takes precedence over the objective.
   */
  lessonStructure: StructureKind | null | undefined = undefined;
  readonly satchel = new Map<ItemId, number>();
  readonly gathered = new Map<ItemId, number>();
  readonly notebook: string[] = [];
  /** Science events that have fired (src/game/science-events.ts). */
  readonly events = new Set<string>();
  /** Step-by-step crafting guidance (src/game/guides.ts). Never crafts for you. */
  readonly guide: GuideTracker = new GuideTracker(this);
  readonly structures: PlacedStructure[] = [];
  /** Items dropped on the ground, pickable again. Not counted in carried weight. */
  readonly drops: WorldDrop[] = [];
  /** Time of day and weather (EnvironmentSystem renders it). */
  readonly env = new Environment();
  /** Deer, rabbits and birds (deterministic, not saved). */
  readonly wildlife = new Wildlife();
  readonly tracks = new Tracks();
  /** Ids of finished Phase 3 quests (saved). */
  readonly living = new Set<string>();
  private trackSeen = new Set<number>();
  private trackAges = new Set<string>();
  private trackT = 0;
  private wildSeen = new Set<string>();
  /** Calls and splashes for the ambience system to voice (drained there). */
  readonly wildAudio: import('./wildlife.js').WildEvent[] = [];
  private nextDropId = 1;
  readonly discovered = new Set<string>(LANDMARKS.filter((l) => l.known).map((l) => l.id));
  readonly log: EventLog;
  readonly fire = new FireState(this);
  /** Beginner objectives: one at a time, over the existing quests (objectives.ts). */
  readonly objectives: ObjectiveTracker = new ObjectiveTracker(this, (e) => this.emit(e));
  /** Chapter 1 story beats: once each, saved (story.ts). */
  readonly story: StoryTracker = new StoryTracker(this);
  /** Level 2: pot, charcoal and water purification (water.ts). */
  readonly water = new WaterState(this);
  /** Level 3: fishing, cooking and farming (food.ts). */
  readonly food = new FoodState(this);
  /** Highest game level reached (1-3). */
  levelReached = 1;
  readonly packUpgrades = new Set<string>();
  /** Effort put into the held item's hand action (0..1 of what it needs). */
  actionProgress = 0;
  private heavyTime = 0;
  private lastToolUsed: ItemId | null = null;
  /** Uses left on each tool in the satchel (absent = full). */
  readonly toolUses = new Map<ItemId, number>();
  private flags = new Set<FlagId>();
  private hintLevels = new Map<string, number>();
  private listeners = new Set<(e: GameEvent) => void>();
  private nextStructureId = 1;

  /** Inside a tutorial lesson only the lesson's structure may be started (lessonStructure undefined = not in a lesson). */
  allowsBuild(kind: StructureKind): boolean {
    return this.lessonStructure === undefined || this.lessonStructure === kind;
  }

  constructor() {
    this.log = new EventLog(
      () =>
        `${this.time.toFixed(1)}s [${this.player.x.toFixed(0)},${this.player.z.toFixed(0)}] q=${this.questIndex} held=${this.held ?? '-'}`,
    );
  }

  // ------------------------------------------------------------ events

  on(fn: (e: GameEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(e: GameEvent): void {
    this.objectives?.observe(e);
    this.story?.observe(e);
    for (const l of this.listeners) l(e);
  }

  toast(text: string, kind: ToastKind = 'info'): void {
    this.emit({ type: 'toast', text, kind });
  }

  // ------------------------------------------------------------- backpack

  /** Total carried weight in kg, including what is in your hand. */
  get carriedWeight(): number {
    return itemsWeight(this.satchel) + (this.held ? ITEMS[this.held].weight : 0);
  }

  get carriedCount(): number {
    return itemsCount(this.satchel);
  }

  get capacity(): { pockets: number; load: number } {
    return capacityFor(this.packUpgrades);
  }

  get moveLimits(): MoveLimits {
    const lim = moveLimits(this.carriedWeight, this.capacity.load);
    // Something big in your arms slows you and stops you running, whatever the bag weighs.
    const carry = carrySpeed(this.held);
    if (carry >= 1) return lim;
    return { ...lim, speed: lim.speed * carry, canRun: false };
  }

  /** Two things touched: material sound, particles and positional audio (AudioSystem / ContactFxSystem). */
  contact(a: Material, b: Material, x: number, y: number, z: number, strength = 1): void {
    this.emit({ type: 'contact', a, b, x, y, z, strength });
  }

  /** Hands free to take something big? */
  private handsFreeFor(id: ItemId): boolean {
    if (!this.held) return true;
    this.toast(`Your hands are full - set down the ${itemName(this.held).toLowerCase()} first (G), then take the ${itemName(id).toLowerCase()}.`, 'bad');
    return false;
  }

  /** Craft a pack upgrade (more pockets, higher comfortable load). */
  upgradePack(id: string): boolean {
    const u: PackUpgrade | undefined = PACK_UPGRADES.find((x) => x.id === id);
    if (!u || this.packUpgrades.has(id)) return false;
    if (!Object.entries(u.inputs).every(([k, n]) => this.count(k as ItemId) >= (n ?? 0))) {
      this.toast(`${u.name} needs ${Object.entries(u.inputs).map(([k, n]) => `${n}x ${itemName(k as ItemId).toLowerCase()}`).join(', ')}.`, 'bad');
      return false;
    }
    for (const [k, n] of Object.entries(u.inputs)) this.satchel.set(k as ItemId, this.count(k as ItemId) - (n ?? 0));
    this.packUpgrades.add(id);
    this.toast(`Made: ${u.name}. Your pack holds more.`, 'good');
    if (u.observation) this.observe(u.observation);
    this.emit({ type: 'satchel' });
    return true;
  }

  /** Take one `item` from your hand (preferred) or satchel; null if you have none. */
  private takeFromHolding(item: ItemId): boolean {
    if (this.held === item) {
      this.consumeHeld();
      return true;
    }
    if (this.count(item) <= 0) return false;
    this.satchel.set(item, this.count(item) - 1);
    this.emit({ type: 'satchel' });
    return true;
  }

  /** Drop an item on the ground at (x, z). It stays there (saved) until picked up. */
  dropItem(item: ItemId, x: number, z: number): WorldDrop | null {
    if (!this.takeFromHolding(item)) return null;
    const drop: WorldDrop = { id: this.nextDropId++, item, x, z };
    this.drops.push(drop);
    this.log.add(`dropped ${item} at ${x.toFixed(1)},${z.toFixed(1)}`);
    this.toast(`Dropped ${itemName(item).toLowerCase()}.`);
    this.emit({ type: 'drops' });
    return drop;
  }

  pickUpDrop(id: number): boolean {
    const i = this.drops.findIndex((d) => d.id === id);
    if (i < 0) return false;
    if (fitsPouch(this.drops[i].item) && this.carriedCount >= this.capacity.pockets) {
      this.toast('Your pockets are full.', 'bad');
      return false;
    }
    const big = !fitsPouch(this.drops[i].item);
    if (big && !this.handsFreeFor(this.drops[i].item)) return false;
    const [d] = this.drops.splice(i, 1);
    if (big) {
      this.held = d.item;
      this.emit({ type: 'held', item: d.item });
    } else this.addItem(d.item);
    this.toast(`+1 ${itemName(d.item)}`);
    this.emit({ type: 'drops' });
    return true;
  }

  /** Put one `item` (held or carried) into nearby storage. */
  stashItem(item: ItemId): boolean {
    const box = this.nearbyStorage();
    if (!box) {
      this.toast('No storage basket nearby.', 'bad');
      return false;
    }
    if (this.storedCount(box) >= STORAGE_SLOTS) {
      this.toast('The basket is full.', 'bad');
      return false;
    }
    if (this.held === item && !fitsPouch(item)) {
      // Too big for the bag: it goes straight from your hands into the basket.
      this.consumeHeld();
      box.store ??= {};
      box.store[item] = (box.store[item] ?? 0) + 1;
    } else {
      if (this.held === item) this.stow();
      if (this.stash(item, 1) === 0) return false;
    }
    this.toast(`Stored ${itemName(item).toLowerCase()}.`);
    return true;
  }

  /** A physical attempt failed: tell the player why (guides listen to this too). */
  interactionFailure(code: GuideFailureCode, detail?: string): void {
    this.log.add(`interaction failed: ${code}${detail ? ` (${detail})` : ''}`, 'bad');
    this.toast(detail ? `${FAILURE_TEXT[code]} (${detail})` : FAILURE_TEXT[code], 'bad');
    const guideCode = GUIDE_CODE_FOR[code] ?? code;
    if (isGuideFailure(guideCode)) this.guide.fail(guideCode, detail);
    this.emit({ type: 'interaction', code, detail });
  }

  /** Fire a feedback cue (sound, haptics, camera kick) from a physical interaction. */
  fx(name: FxName, strength = 1): void {
    this.emit({ type: 'fx', name, strength });
  }

  /** Finish the held item's hand action now (the physical motion succeeded). */
  completeAction(): boolean {
    const a = actionFor(this.held);
    if (!a) return false;
    return this.work(a.work * (1 - this.actionProgress) + 1e-6);
  }

  // ----------------------------------------------------------- workbench

  /** The craft in progress at a workbench, if any. */
  bench: BenchSession | null = null;

  /**
   * Choose a recipe at a finished workbench. Nothing is made yet: the parts
   * are taken from your satchel (and hand) and laid on the bench, and the
   * first physical step begins.
   */
  startBench(recipeId: string, structureId: number): boolean {
    const r = BENCH_BY_ID[recipeId];
    const s = this.structures.find((t) => t.id === structureId);
    if (!r || !s || s.kind !== 'workbench' || !s.complete) return false;
    if (this.bench) this.cancelBench();
    if (!canStart(this, r)) {
      this.interactionFailure('bench.missingParts', `need ${missingText(this, r)}`);
      return false;
    }
    for (const [id, n] of Object.entries(r.inputs)) {
      for (let i = 0; i < (n ?? 0); i++) this.takeFromHolding(id as ItemId);
    }
    this.bench = new BenchSession(r, structureId);
    this.log.add(`bench: start ${r.id}`, 'ok');
    this.emit({ type: 'bench', state: 'start' });
    return true;
  }

  /** Effort from a hand motion at the bench. Finishing the last step makes the item. */
  benchWork(motion: BenchMotion, effort: number): void {
    const b = this.bench;
    if (!b) return;
    const ev = b.work(motion, effort);
    if (!ev) return;
    if (ev === 'wrong') {
      this.interactionFailure('bench.wrongMotion', `this step needs: ${b.step?.motion}`);
      return;
    }
    if (ev === 'progress') {
      this.emit({ type: 'bench', state: 'progress' });
      return;
    }
    const finished = b.recipe.steps[b.stepIndex - 1];
    if (finished?.mark) this.guide.mark(finished.mark);
    this.log.add(`bench: ${b.recipe.id} step ${finished?.id} done`, 'ok');
    if (ev === 'step') {
      this.emit({ type: 'bench', state: 'step' });
      return;
    }
    // Done: the parts became the item.
    const r = b.recipe;
    this.bench = null;
    this.addItem(r.output, r.count ?? 1);
    this.toolUses.delete(r.output);
    if (r.flag) this.setFlag(r.flag);
    this.log.add(`bench: made ${r.output}`, 'ok');
    this.toast(`Made: ${itemName(r.output)}`, 'good');
    if (r.observation) this.observe(r.observation);
    for (const ev2 of r.science ?? []) this.science(ev2);
    this.checkQuests();
    this.emit({ type: 'bench', state: 'done' });
  }

  private satchelWithBench(): Partial<Record<ItemId, number>> {
    const out: Partial<Record<ItemId, number>> = Object.fromEntries(this.satchel);
    for (const [id, n] of Object.entries(this.bench?.recipe.inputs ?? {})) out[id as ItemId] = (out[id as ItemId] ?? 0) + (n ?? 0);
    return out;
  }

  /** Stop the craft at the bench: every part goes back to the satchel. */
  cancelBench(): void {
    const b = this.bench;
    if (!b) return;
    this.bench = null;
    for (const [id, n] of Object.entries(b.recipe.inputs)) this.addItem(id as ItemId, n ?? 0);
    this.log.add(`bench: cancelled ${b.recipe.id}`);
    this.emit({ type: 'bench', state: 'cancel' });
  }

  /** Cue for the hands to reach (opening the bag, taking something out). */
  reach(): void {
    this.emit({ type: 'reach' });
  }

  // ---------------------------------------------------------------- tools

  /** Bind a tool in your hands from stone, stick and cord. */
  bind(id: string): boolean {
    const r = HAND_RECIPES.find((x) => x.id === id);
    if (!r) return false;
    if (!Object.entries(r.inputs).every(([k, n]) => this.count(k as ItemId) >= (n ?? 0))) {
      this.toast(`${r.name} needs ${Object.entries(r.inputs).map(([k, n]) => `${n}x ${itemName(k as ItemId).toLowerCase()}`).join(', ')}.`, 'bad');
      return false;
    }
    for (const [k, n] of Object.entries(r.inputs)) this.satchel.set(k as ItemId, this.count(k as ItemId) - (n ?? 0));
    this.addItem(r.output, r.count ?? 1);
    this.toolUses.delete(r.output);
    this.toast(`Made: ${itemName(r.output)}`, 'good');
    if (r.observation) this.observe(r.observation);
    for (const ev of r.science ?? []) this.science(ev);
    this.log.add(`bound ${r.output}`, 'ok');
    this.checkQuests();
    return true;
  }

  /** The tool bonus when gathering `id`: spends one use. Returns extra items. */
  private toolBonus(id: ItemId): number {
    // The first tool you actually carry that helps with this (a knife beats a bare flake).
    const t = TOOLS.find((x) => x.bonus.includes(id) && this.count(x.id) > 0);
    if (!t) return 0;
    const left = (this.toolUses.get(t.id) ?? t.uses) - 1;
    if (left <= 0) {
      this.satchel.set(t.id, this.count(t.id) - 1);
      this.toolUses.delete(t.id);
      this.toast(`Your ${itemName(t.id).toLowerCase()} broke.`, 'bad');
    } else this.toolUses.set(t.id, left);
    this.lastToolUsed = t.id;
    if (t.id === 'knife' || t.id === 'flake') this.science('tool.edge.cut');
    if (t.id === 'axe' && id === 'logs') this.science('tool.wedge.split');
    return 1;
  }

  toolUsesLeft(id: ItemId): number | null {
    const t = TOOLS.find((x) => x.id === id);
    return t && this.count(id) > 0 ? (this.toolUses.get(id) ?? t.uses) : null;
  }

  // ------------------------------------------------------------------ camp

  nearbyStorage(): PlacedStructure | null {
    return (
      this.structures.find((s) => s.kind === 'storage' && s.complete && Math.hypot(s.x - this.player.x, s.z - this.player.z) <= CRAFT_REACH) ?? null
    );
  }

  storedCount(s: PlacedStructure): number {
    return Object.values(s.store ?? {}).reduce((a, n) => a + (n ?? 0), 0);
  }

  stash(id: ItemId, n = 1): number {
    const s = this.nearbyStorage();
    if (!s) return 0;
    const room = STORAGE_SLOTS - this.storedCount(s);
    const moved = Math.min(n, this.count(id), room);
    if (moved <= 0) return 0;
    s.store ??= {};
    s.store[id] = (s.store[id] ?? 0) + moved;
    this.satchel.set(id, this.count(id) - moved);
    this.emit({ type: 'satchel' });
    return moved;
  }

  withdraw(id: ItemId, n = 1): number {
    const s = this.nearbyStorage();
    if (!s?.store) return 0;
    const moved = Math.min(n, s.store[id] ?? 0, Math.max(0, this.capacity.pockets - this.carriedCount));
    if (moved <= 0) return 0;
    s.store[id] = (s.store[id] ?? 0) - moved;
    if (s.store[id] === 0) delete s.store[id];
    this.addItem(id, moved);
    return moved;
  }

  /** Structures that make up your camp: those near the first finished fire pit. */
  camp(): PlacedStructure[] {
    const pit = this.structures.find((s) => s.kind === 'firePit' && s.complete);
    if (!pit) return [];
    return this.structures.filter((s) => s.complete && Math.hypot(s.x - pit.x, s.z - pit.z) <= CAMP_RADIUS);
  }

  /** Everything you can make right now with what you carry (no bench needed). */
  makeList(): Array<{ id: string; label: string; kind: 'bind' | 'pack' | 'store' | 'take' }> {
    const has = (inputs: Partial<Record<ItemId, number>>) => Object.entries(inputs).every(([k, n]) => this.count(k as ItemId) >= (n ?? 0));
    const out: Array<{ id: string; label: string; kind: 'bind' | 'pack' | 'store' | 'take' }> = [];
    const box = this.nearbyStorage();
    if (box) {
      if (this.carriedCount > 0) out.push({ id: 'all', label: `Store all (${this.carriedCount})`, kind: 'store' });
      if (this.storedCount(box) > 0) out.push({ id: 'all', label: `Take all (${this.storedCount(box)})`, kind: 'take' });
    }
    for (const r of HAND_RECIPES) if (has(r.inputs)) out.push({ id: r.id, label: r.name, kind: 'bind' });
    for (const u of PACK_UPGRADES) if (!this.packUpgrades.has(u.id) && has(u.inputs)) out.push({ id: u.id, label: u.name, kind: 'pack' });
    return out;
  }

  /** Loose an arrow: needs the bow in hand and an arrow in the satchel. */
  nockArrow(): boolean {
    if (this.held !== 'bow') return false;
    if (this.count('arrow') <= 0) {
      this.toast('You have no arrows.', 'bad');
      return false;
    }
    this.satchel.set('arrow', this.count('arrow') - 1);
    this.emit({ type: 'satchel' });
    this.emit({ type: 'arrow', hit: false });
    this.science('hunt.arrow.fly');
    return true;
  }

  /** An arrow that hit something solid has a chance to be recovered. */
  recoverArrow(): void {
    this.addItem('arrow');
  }

  // ------------------------------------------------------------ hand actions

  /**
   * Put `effort` into the held item's hand action (bend/rub metres or strikes).
   * Returns true when the action finishes.
   */
  work(effort: number): boolean {
    const a = actionFor(this.held);
    if (!a || effort <= 0) return false;
    if (a.needs?.some((n) => this.count(n) <= 0)) {
      if (this.actionProgress === 0) this.toast(`You need ${a.needs.map((n) => itemName(n).toLowerCase()).join(' and ')} in your satchel.`, 'bad');
      return false;
    }
    this.actionProgress = Math.min(1, this.actionProgress + effort / a.work);
    const done = this.actionProgress >= 1 - 1e-9;
    this.emit({ type: 'action', id: a.id, progress: this.actionProgress, done });
    if (!done) return false;
    this.actionProgress = 0;
    this.consumeHeld();
    for (const [id, n] of Object.entries(a.outputs)) this.addItem(id as ItemId, n);
    this.log.add(`action ${a.id} done`, 'ok');
    this.toast(`${a.name}: you now have ${Object.entries(a.outputs).map(([id, n]) => `${n} ${itemName(id as ItemId).toLowerCase()}`).join(', ')}.`, 'good');
    if (a.observation) this.observe(a.observation);
    if (a.science) this.science(a.science);
    this.checkQuests();
    return true;
  }

  // ------------------------------------------------------------- queries

  flag(id: FlagId): boolean {
    return this.flags.has(id);
  }

  setFlag(id: FlagId): void {
    if (this.flags.has(id)) return;
    this.flags.add(id);
    this.log.add(`flag: ${id}`, 'ok');
  }

  count(id: ItemId): number {
    return this.satchel.get(id) ?? 0;
  }

  /** Lifetime total gathered, so quests don't un-complete when you use items. */
  gatheredCount(id: ItemId): number {
    return this.gathered.get(id) ?? 0;
  }

  hasStructure(kind: StructureKind): boolean {
    return this.structures.some((s) => s.kind === kind && s.complete);
  }

  satchelContents(): Array<{ id: ItemId; count: number }> {
    return SATCHEL_ORDER.filter((id) => this.count(id) > 0).map((id) => ({ id, count: this.count(id) }));
  }

  get quest() {
    return QUESTS[this.questIndex] ?? null;
  }

  /** The game level (1-3) you are playing, from your quest progress. */
  get gameLevel(): GameLevel {
    return levelForQuest(this.questIndex);
  }

  /** XP progress through the current level, 0..1. */
  get levelProgress(): number {
    const lo = LEVELS[this.level - 1];
    const hi = LEVELS[this.level];
    return Math.max(0, Math.min(1, (this.xp - lo) / (hi - lo)));
  }

  // ------------------------------------------------------------- actions

  tick(dt: number): void {
    this.time += dt;
    this.objectives.tick(dt);
    if ((this.shelterT += dt) >= 0.25) {
      this.tickShelter(this.shelterT);
      this.shelterT = 0;
    }
    this.fire.tick(dt);
    this.water.tick(dt);
    this.food.tick(dt);
    this.tickWildlife(dt);
    if (this.moveLimits.encumbrance !== 'light') {
      if ((this.heavyTime += dt) > 30) this.science('body.carry.heavy');
    } else this.heavyTime = 0;
  }

  /** Standing over a print reads it: what animal, how fresh, and a trail once you have read several. */
  private inspectTracks(): void {
    const hit = this.tracks.nearest(this.player.x, this.player.z, 1.8, this.time);
    if (!hit) return;
    this.science('hunt.track.found');
    this.science(hit.print.species === 'deer' ? 'hunt.track.deer' : 'hunt.track.rabbit');
    this.trackAges.add(freshness(hit.age));
    // Telling fresh from old needs two different ages to compare.
    if (this.trackAges.size >= 2) this.science('hunt.track.fresh');
    this.trackSeen.add(hit.index);
    if (this.trackSeen.size >= 5) this.science('hunt.track.followed');
  }

  /** Step the animals and turn what you watch of them into science events. */
  private tickWildlife(dt: number): void {
    const w = this.wildlife;
    w.update(dt, { px: this.player.x, pz: this.player.z, hour: this.env.hour });
    for (const a of w.animals) this.tracks.note(a, this.time);
    if ((this.trackT += dt) >= 0.5) {
      this.trackT = 0;
      this.tracks.expire(this.time);
      this.inspectTracks();
    }
    for (const a of w.animals) {
      if (!a.active || a.hidden) continue;
      const d = Math.hypot(a.x - this.player.x, a.z - this.player.z);
      if (d > 5 && d < 24) {
        const id = `wild.${a.species}.seen`;
        if (!this.wildSeen.has(id)) {
          this.wildSeen.add(id);
          this.science(id);
        }
      }
      if (a.species === 'deer' && d < 14 && w.playerSpeed < 0.6 && a.state !== 'flee' && a.state !== 'run' && !this.wildSeen.has('quiet')) {
        this.wildSeen.add('quiet');
        this.science('wild.quiet.approach');
      }
    }
    for (const e of w.events) {
      if (e.species === 'deer' && e.kind === 'flee') this.science('wild.deer.fled');
      if ((e.kind === 'call' || e.kind === 'startle') && this.wildAudio.length < 8) this.wildAudio.push(e);
    }
    w.events.length = 0;
  }

  setPlayerPosition(x: number, z: number): void {
    this.player.x = x;
    this.player.z = z;
    for (const l of LANDMARKS) {
      if (!this.discovered.has(l.id) && Math.hypot(x - l.x, z - l.z) < l.r) {
        this.discovered.add(l.id);
        this.log.add(`discovered ${l.name}`, 'ok');
        this.addXp(20);
        this.toast(`Discovered: ${l.name}`, 'good');
        this.emit({ type: 'discovered', landmark: l });
      }
    }
  }

  addItem(id: ItemId, n = 1): void {
    this.satchel.set(id, this.count(id) + n);
    this.emit({ type: 'satchel' });
  }

  /** Gather one item from the world into the satchel. */
  gather(id: ItemId, sourceId = 'world'): boolean {
    // Big or heavy things never go in the bag: you carry them in your hands.
    const big = !fitsPouch(id);
    if (big && !this.handsFreeFor(id)) {
      this.log.add(`gather ${id}: hands full`, 'bad');
      return false;
    }
    if (!big && this.carriedCount >= this.capacity.pockets) {
      this.toast('Your pockets are full - drop or use something, or make a bigger pack.', 'bad');
      this.log.add(`gather ${id}: pockets full`, 'bad');
      return false;
    }
    const first = this.gatheredCount(id) === 0;
    this.gathered.set(id, this.gatheredCount(id) + 1);
    if (big) {
      this.held = id;
      this.actionProgress = 0;
      this.emit({ type: 'held', item: id });
    } else this.addItem(id);
    this.lastToolUsed = null;
    // A flake held in the hand cuts soft, fibrous things free: your first cut with an edge.
    if (this.held === 'flake' && CUTTABLE.includes(id) && !this.hasEvent('tool.edge.cut')) {
      this.science('tool.edge.cut');
      this.toast(`You cut the ${itemName(id).toLowerCase()} free with the flake's edge.`, 'good');
    }
    const bonus = big || this.carriedCount < this.capacity.pockets ? this.toolBonus(id) : 0;
    this.emit({ type: 'gather', item: id, tool: this.lastToolUsed });
    if (bonus) {
      // A tool's extra piece of something big is left lying beside you.
      if (big) {
        this.drops.push({ id: this.nextDropId++, item: id, x: this.player.x + 0.5, z: this.player.z });
        this.emit({ type: 'drops' });
      } else this.addItem(id, bonus);
      this.gathered.set(id, this.gatheredCount(id) + bonus);
    }
    this.log.add(`gathered ${id} from ${sourceId}${bonus ? ' (+tool)' : ''}`);
    this.toast(`+1 ${itemName(id)}`);
    const obs = ITEMS[id].firstObservation;
    if (first && obs) this.observe(obs);
    this.checkQuests();
    return true;
  }

  /** Take one item out of the satchel into your hand. Stows anything already held. */
  takeOut(id: ItemId): boolean {
    if (this.count(id) <= 0) {
      this.log.add(`takeOut ${id}: none in satchel`, 'bad');
      return false;
    }
    if (this.held) this.stow();
    if (this.held) return false; // too big to stow: hands stay full
    this.satchel.set(id, this.count(id) - 1);
    this.held = id;
    this.actionProgress = 0;
    this.autoRefill = true; // taking something out by hand starts a fresh run
    this.log.add(`took out ${id}`);
    this.emit({ type: 'satchel' });
    this.emit({ type: 'held', item: id });
    return true;
  }

  /** Put the held item back in the satchel. */
  stow(): void {
    if (!this.held) return;
    if (!fitsPouch(this.held)) {
      this.toast(`Too big for the pouch - carry the ${itemName(this.held).toLowerCase()} in your hands, or set it down (G).`, 'bad');
      return;
    }
    const id = this.held;
    this.held = null;
    this.addItem(id);
    this.log.add(`stowed ${id}`);
    this.emit({ type: 'held', item: null });
  }

  /** Spend one `id` from your hand, else the satchel. */
  useItem(id: ItemId): boolean {
    if (this.held === id) {
      this.consumeHeld();
      return true;
    }
    if (this.count(id) <= 0) return false;
    this.satchel.set(id, this.count(id) - 1);
    this.emit({ type: 'satchel' });
    return true;
  }

  notifyFire(): void {
    this.emit({ type: 'fire', stage: this.fire.stage });
  }

  private consumeHeld(): ItemId | null {
    const id = this.held;
    this.held = null;
    if (id) this.emit({ type: 'held', item: null });
    return id;
  }

  /** Release the held key part over open ground to start a structure. */
  private lastUnfinishedToast = -99;
  /** Game time a part was last seated on a structure (the same pinch must not pick it back up). */
  lastSeatAt = -99;

  /** The closest unfinished structure within `maxD` m of the player, if any. */
  nearestUnfinished(maxD = 6): PlacedStructure | null {
    let best: PlacedStructure | null = null;
    let bd = maxD;
    for (const s of this.structures) {
      if (s.complete) continue;
      const d = Math.hypot(s.x - this.player.x, s.z - this.player.z);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }

  /**
   * Abandon an unfinished plan: the outline goes and every part already on it
   * comes back (small parts to the bag, big ones set down beside it).
   */
  removeStructure(id: number): boolean {
    const s = this.structures.find((t) => t.id === id);
    if (!s || s.complete) return false;
    const def = BLUEPRINTS[s.kind];
    const parts = s.spots.filter((v): v is ItemId => v !== null);
    // A keyLast key part (the slab) stays in your hand until it is set down on the supports.
    if (!s.keyOpen && (!def.keyLast || s.keyPlaced)) parts.push(s.key);
    this.structures.splice(this.structures.indexOf(s), 1);
    let dropped = false;
    parts.forEach((item, i) => {
      if (fitsPouch(item)) this.addItem(item);
      else {
        this.drops.push({ id: this.nextDropId++, item, x: s.x + 0.4 * Math.cos(i), z: s.z + 0.4 * Math.sin(i) });
        dropped = true;
      }
    });
    if (dropped) this.emit({ type: 'drops' });
    this.log.add(`removed ${s.kind}#${s.id} plan, returned ${parts.join(',') || 'nothing'}`);
    this.toast(parts.length ? `Removed the ${def.name.toLowerCase()} plan. Its parts are back with you.` : `Removed the ${def.name.toLowerCase()} plan.`, 'note');
    this.emit({ type: 'structure', structure: s });
    return true;
  }

  placeBlueprint(
    kind: StructureKind,
    x: number,
    z: number,
    rotY = 0,
    /** From the build book: no key part in hand needed; the key is a slot to fill. */
    fromBook = false,
  ): PlacementResult & { structure?: PlacedStructure } {
    const def = BLUEPRINTS[kind];
    if (!this.allowsBuild(kind)) return { ok: false, reason: 'structure', message: `Not now - this lesson is not about the ${def.name.toLowerCase()}.` };
    if (!fromBook && (!this.held || !def.keyAccepts.includes(this.held))) {
      return { ok: false, reason: 'structure', message: `You need ${def.keyAccepts.map(itemName).join(' or ')} in hand.` };
    }
    // One plan at a time: starting a new outline clears any unfinished one of the same kind
    // (its parts come back), so you can simply re-place it somewhere better.
    const stale = this.structures.filter((s) => s.kind === kind && !s.complete);
    const check = checkPlacement(kind, x, z, this.structures.filter((s) => !stale.includes(s)));
    if (check.ok) for (const s of stale) this.removeStructure(s.id);
    if (!check.ok) {
      this.log.add(`place ${kind} rejected: ${check.reason}`, 'bad');
      this.toast(check.message, 'bad');
      return check;
    }
    // A keyLast part (the slab) stays in your hand: the outline is only the plan.
    const key = fromBook ? def.keyAccepts[0] : def.keyLast ? this.held! : this.consumeHeld()!;
    const structure: PlacedStructure = {
      id: this.nextStructureId++,
      kind,
      x,
      z,
      rotY,
      key,
      spots: def.spots.map(() => null),
      complete: false,
      ...(def.keyLast ? { keyPlaced: false } : {}),
      ...(fromBook && !def.keyLast ? { keyOpen: true } : {}),
    };
    this.structures.push(structure);
    this.planPlacedAt = this.time;
    this.log.add(`placed ${kind} #${structure.id} at ${x.toFixed(1)},${z.toFixed(1)} key=${key}`, 'ok');
    this.toast(
      def.keyLast
        ? `${def.name}: set a part on every glowing mark first, then lift the ${itemName(key).toLowerCase()} on top.`
        : fromBook
          ? `${def.name}: fill every glowing mark, including the ${def.keyAccepts.map((k) => itemName(k).toLowerCase()).join(' or ')} at the first.`
          : `${def.name}: fill the glowing spots to finish it.`,
      'note',
    );
    if (kind === 'shelter') this.science('shelter.site.chosen');
    // checkPlacement passed, so the ground is stable enough to build on.
    if (kind === 'workbench') this.guide.mark('workbench.site.ready');
    this.emit({ type: 'structure', structure });
    return { ok: true, structure };
  }

  // ------------------------------------------------------------ build book

  /** Book entries already announced as unlocked (derived from progress, so not saved). */
  private bookKnown: Set<string> | null = null;

  /** The book's entries with have/need counts and lock state (src/game/buildbook.ts). */
  bookEntries(): BookEntry[] {
    return bookEntries(this);
  }

  /**
   * Announce entries that unlocked since the last call on the message line. The
   * first call only records what is already open (a loaded save is not news).
   */
  updateBook(): void {
    const open = bookEntries(this).filter((e) => e.unlocked);
    if (this.bookKnown) {
      for (const e of open) if (!this.bookKnown.has(e.id)) this.toast(`New in the build book: ${e.name}.`, 'good');
    }
    this.bookKnown = new Set(open.map((e) => e.id));
  }

  /**
   * Place a structure's outline from the book, a metre or two ahead (facing
   * `dirX,dirZ`) on the first spot that checkPlacement allows. No part in hand
   * is needed: every part, the key part too, is filled afterwards.
   */
  placeFromBook(id: string, dirX: number, dirZ: number): PlacementResult & { structure?: PlacedStructure } {
    const entry = bookEntries(this).find((e) => e.id === id);
    if (!entry || entry.kind !== 'structure') return { ok: false, reason: 'structure', message: 'That is made at the workbench.' };
    const kind = entry.structure!;
    if (!entry.unlocked) {
      this.toast(entry.hint, 'note');
      return { ok: false, reason: 'structure', message: entry.hint };
    }
    const stale = this.structures.filter((s) => s.kind === kind && !s.complete);
    const others = this.structures.filter((s) => !stale.includes(s));
    const spot = findBookSpot(kind, this.player.x, this.player.z, dirX, dirZ, others);
    if (!spot) {
      const msg = `No room for the ${BLUEPRINTS[kind].name.toLowerCase()} here - step to a clearer spot, away from trees, water and other builds.`;
      this.toast(msg, 'bad');
      this.log.add(`book ${kind}: no room`, 'bad');
      return { ok: false, reason: 'trees', message: msg };
    }
    return this.placeBlueprint(kind, spot.x, spot.z, spot.rotY, true);
  }

  /**
   * Put an item into a snap spot: the held item if it fits, otherwise the
   * first fitting item from the satchel (or `prefer`, when given and present).
   */
  fillSpot(structureId: number, index: number, prefer?: ItemId, at?: { x: number; z: number }): boolean {
    const s = this.structures.find((t) => t.id === structureId);
    if (!s || s.complete || s.spots[index] === undefined || s.spots[index] !== null) return false;
    const def = BLUEPRINTS[s.kind];
    const spot = def.spots[index];
    if (spot.gesture) {
      this.toast('Tie this joint by hand: hold your cord at the joint and twist it tight (mouse: scroll the wheel).', 'note');
      return false;
    }
    if (isSpotLocked(s, index)) {
      const open = openStage(def, s.spots);
      this.toast(s.keyOpen ? 'Set the first pole on its mark first.' : `Not yet: finish the ${STAGE_NAMES[open] ?? 'earlier part'} first.`, 'bad');
      return false;
    }
    const target = spotWorldPosition(s, index);
    const heldBefore = this.held;
    if (at) {
      // Released by hand: it seats only if it landed close enough to the mark.
      const check = checkPlace(at.x, at.z, target.x, target.z, def.spotTolerance ?? DEFAULT_SPOT_TOLERANCE);
      if (!check.ok) {
        this.interactionFailure(def.keyLast ? 'support.tooFar' : 'place.tooFar', `${Math.round(check.error * 100)} cm off`);
        return false;
      }
    }
    let item: ItemId | null = null;
    if (spot.tool) {
      // A tool touched to the mark does the job and is kept (digging a channel segment).
      item = this.held && spot.accepts.includes(this.held) ? this.held : (spot.accepts.find((id) => this.count(id) > 0) ?? null);
    } else if (this.held && spot.accepts.includes(this.held)) {
      item = this.consumeHeld();
    } else {
      const order = prefer ? [prefer, ...spot.accepts] : spot.accepts;
      const found = order.find((id) => spot.accepts.includes(id) && this.count(id) > 0);
      if (found) {
        this.satchel.set(found, this.count(found) - 1);
        this.emit({ type: 'satchel' });
        item = found;
      }
    }
    if (!item) {
      this.toast(`${spot.label}: you need ${spot.accepts.map((id) => itemName(id).toLowerCase()).join(' or ')}.`, 'bad');
      this.log.add(`fill ${s.kind}#${s.id}[${index}]: nothing fits`, 'bad');
      return false;
    }
    s.spots[index] = item;
    s.spotPos ??= def.spots.map(() => null);
    s.spotPos[index] = { x: target.x, z: target.z }; // seated exactly on its mark
    this.log.add(`filled ${s.kind}#${s.id}[${index}] with ${item}`);
    if (s.kind === 'leanTo') this.shelterProgress(s, index);
    if (s.kind === 'drainage') this.toast('You dug a stretch of the channel.', 'good');
    if (at) {
      this.fx('seat', 0.6);
      this.emit({ type: 'placed', x: target.x, y: target.y, z: target.z });
      this.lastSeatAt = this.time;
      this.contact(ITEM_PHYSICS[item].material, def.keyLast ? 'stone' : 'soil', at.x, 0.05, at.z, 1.5);
    }
    if (s.spots.every((v) => v !== null)) {
      if (s.kind === 'workbench') this.guide.mark('workbench.supports.placed');
      if (s.keyOpen) this.toast(`Now the ${def.keyAccepts.map((k) => itemName(k).toLowerCase()).join(' or ')} on the first mark.`, 'note');
      else if (def.keyLast && !s.keyPlaced) this.toast(`Supports set. Now lift the ${itemName(s.key).toLowerCase()} on with both hands.`, 'note');
      else this.completeStructure(s);
    }
    this.emit({ type: 'structure', structure: s });
    // Every seat path (let go, touch, strike, throw caught, hammered home, a ray press) refills the hand the same way.
    if (heldBefore === item && this.held === null) this.refill(item);
    return true;
  }

  /**
   * Where releasing `item` at (x, z) would put it: the nearest open spot that
   * accepts it within `radius` m, or (index -1) the key position of a keyLast
   * structure whose spots are all filled. Null when nothing nearby wants it.
   */
  placementTarget(item: ItemId, x: number, z: number, radius = 0.7): { structure: PlacedStructure; index: number } | null {
    let best: { structure: PlacedStructure; index: number } | null = null;
    let bestD = radius;
    for (const s of this.structures) {
      if (s.complete) continue;
      const def = BLUEPRINTS[s.kind];
      if (def.keyLast && !s.keyPlaced && def.keyAccepts.includes(item) && s.spots.every((v) => v !== null)) {
        const d = Math.hypot(s.x - x, s.z - z);
        if (d < bestD) {
          bestD = d;
          best = { structure: s, index: -1 };
        }
      }
      // A book-placed structure's key part is a slot of its own, filled in any order.
      if (s.keyOpen && def.keyAccepts.includes(item)) {
        const p = spotWorldPosition(s, -1);
        const d = Math.hypot(p.x - x, p.z - z);
        if (d < bestD) {
          bestD = d;
          best = { structure: s, index: -1 };
        }
      }
      if (s.keyPlaced) continue;
      def.spots.forEach((spot, i) => {
        if (s.spots[i] !== null || !spot.accepts.includes(item) || spot.gesture || isSpotLocked(s, i)) return;
        const p = spotWorldPosition(s, i);
        const d = Math.hypot(p.x - x, p.z - z);
        if (d < bestD) {
          bestD = d;
          best = { structure: s, index: i };
        }
      });
    }
    return best;
  }

  /**
   * Which structure a held part may start an outline for right now: the lesson's, else the beginner objective's
   * (null = none: a pinch on open ground must not start an unrelated blueprint), else (undefined) any.
   */
  wantedStructure(): StructureKind | null | undefined {
    if (this.lessonStructure !== undefined) return this.lessonStructure;
    if (this.objectives.done) return undefined;
    return this.objectives.current?.structure ?? null;
  }

  /**
   * Place `item` (held, or in the bag) on the nearest correct open mark within `radius` of (x, z): the one
   * way every gesture (letting go, dropping, touching, a gentle throw, a strike) seats a part. A wrong
   * material or a finished build says why (`say`); otherwise nothing is said. Returns whether it seated.
   */
  seatNear(item: ItemId, x: number, z: number, o: { radius?: number; hands?: number; say?: boolean } = {}): boolean {
    const marks = openMarks(this.structures);
    const v = snapVerdict(this.structures, marks, item, x, z, (o.radius ?? ASSIST.buildArea) * this.assist.scale('place'));
    if (!v.ok) {
      // A real attempt that missed (wrong material, or a mark in range of the hint but not of the snap) widens the help.
      if (o.say && (v.reason === 'wrongMaterial' || v.reason === 'tooFar')) this.assist.fail('place');
      if (o.say && (v.reason === 'wrongMaterial' || v.reason === 'complete')) this.toast(v.message, 'bad');
      return false;
    }
    const m = v.mark;
    const ok = m.index >= 0 ? this.fillSpot(m.structure.id, m.index, item, { x: m.x, z: m.z }) : this.placeKey(m.structure.id, m.x, m.z, o.hands ?? 1);
    if (ok) this.assist.success('place');
    return ok;
  }

  /**
   * The ONE action holding `held` (null = empty hand) at (x, z) would do, from what is near: the fire pit, the
   * stream, a filter, a charcoal mound, a plot, or the ground. Targets are ranked by distance and the table in
   * intent.ts decides; an unrelated target never fires. Placement on marks is separate (`seatNear`).
   */
  intentAt(held: ItemId | null, x: number, z: number, motion: 'touch' | 'release' = 'release'): { action: IntentAction; at: { x: number; z: number }; dist: number } | null {
    const at = { x, z };
    const found: Array<{ action: IntentAction; at: { x: number; z: number }; dist: number }> = [];
    const cands: Candidate[] = [];
    const add = (t: IntentTarget, pos: { x: number; z: number }, reach: number) => {
      const dist = Math.hypot(pos.x - x, pos.z - z);
      if (dist > reach) return;
      const a = resolveIntent(held, t);
      if (!a) return;
      found.push({ action: a, at: pos, dist });
      cands.push({ id: String(found.length - 1), dist, aimed: false, valid: true, matchesHeld: true });
    };
    // Open marks first: a part that fits one is a placement (letting go reaches farther than a touch).
    const markReach = motion === 'touch' ? ASSIST.touchRadius * 2 : ASSIST.buildArea * this.assist.scale('place');
    for (const m of openMarks(this.structures)) add({ kind: 'mark', accepts: m.accepts }, m, markReach);
    const pot = { fired: this.flag('potFired'), dry: this.flag('potDry'), water: this.water.potWater };
    for (const s of this.structures) {
      if (s.kind === 'firePit' && s.complete) {
        const f = this.fire;
        add({ kind: 'firePit', fire: { burning: f.stage === 'burning', embedded: f.embedded, layBuilt: f.layBuilt, stage: f.stage, carrying: f.carrying }, pot }, s, 0.75);
      }
    }
    if (this.water.atStream(at)) add({ kind: 'stream', pot }, at, 0);
    const filter = this.water.filterNear(at);
    if (filter) add({ kind: 'filter', pot }, filter, 1.2);
    const m = this.water.mound;
    if (m) add({ kind: 'mound', mound: { sealed: m.sealed, burning: m.burn >= 0, fireLit: this.fire.stage === 'burning' } }, m, 1.2);
    const plot = this.food.plotNear(at);
    if (plot) add({ kind: 'plot', plot: { hasCrop: !!plot.crop, ripe: !!plot.crop && plot.growth >= 1, moist: plot.moist > 0 }, pot }, plot, 1.2);
    // Digging needs a deliberate set-down, never just carrying the stick over the ground.
    if (!plot && !m && motion === 'release') add({ kind: 'ground', canDig: this.food.canDig(at), canMound: this.count('logs') >= 2 }, at, 0);
    const t = resolveTarget(cands);
    return t ? found[Number(t.id)] : null;
  }

  /** Do what `intentAt` found (one-shot actions only: sawing, knapping, cutting and cooking run in their own systems). */
  runIntent(held: ItemId | null, x: number, z: number, motion: 'touch' | 'release' = 'release'): IntentAction | null {
    const hit = this.intentAt(held, x, z, motion);
    if (!hit || CONTINUOUS.has(hit.action)) return null;
    const at = { x, z };
    let ok = false;
    switch (hit.action) {
      case 'place':
        ok = !!held && this.seatNear(held, x, z, { radius: motion === 'touch' ? ASSIST.touchRadius * 2 : ASSIST.buildArea, hands: 1 });
        break;
      case 'feedFire':
        ok = this.fire.addFuel();
        break;
      case 'carryEmber':
        ok = this.fire.transferEmber();
        break;
      case 'firePot':
      case 'boilPot':
      case 'fillPot':
      case 'pourFilter':
      case 'sealMound':
      case 'lightMound':
      case 'openMound':
      case 'digMound': {
        const id = ({ firePot: 'firePot', boilPot: 'boil', fillPot: 'fillPot', pourFilter: 'pourFilter', sealMound: 'sealMound', lightMound: 'lightMound', openMound: 'openMound', digMound: 'digMound' } as const)[hit.action];
        ok = this.water.perform(id, at);
        break;
      }
      case 'plant':
      case 'waterPlot':
      case 'harvest':
      case 'digPlot': {
        const a = this.food.available(at, held);
        ok = !!a && this.food.perform(a);
        break;
      }
      default:
        break;
    }
    if (ok) this.log.add(`intent ${hit.action} with ${held ?? 'empty hand'}`);
    return ok ? hit.action : null;
  }

  /**
   * Put the next `item` in the hand that just placed one, while the build still wants it, the bag has more and you
   * are still at the build. Big two-hand parts are never refilled (the slab is lifted on purpose).
   */
  private refill(item: ItemId): boolean {
    if (!this.autoRefill || this.held || this.count(item) <= 0 || !fitsPouch(item)) return false;
    const near = openMarks(this.structures).some((m) => m.accepts.includes(item) && Math.hypot(m.x - this.player.x, m.z - this.player.z) <= REFILL_RANGE);
    if (!near) return false;
    const ok = this.takeOut(item);
    if (ok) this.log.add(`auto-refill ${item}`);
    return ok;
  }

  /** Stop refilling (Put away, or the player chose to do something else). Taking an item out by hand starts it again. */
  cancelRefill(): void {
    this.autoRefill = false;
  }

  /**
   * Fill an open mark from the bag with an empty hand (pinch or tap a glowing mark): takes a matching item from
   * the bag (or the hand) and seats it there. Says what is missing when the bag has nothing that fits.
   */
  fillFromBag(structureId: number, index: number): boolean {
    const m = openMarks(this.structures).find((k) => k.structure.id === structureId && k.index === index);
    if (!m) return false;
    const item = this.held && m.accepts.includes(this.held) ? this.held : (m.accepts.find((i) => this.count(i) > 0) ?? null);
    if (!item) {
      this.toast(`This mark needs ${needText(m)}: you have none in your bag.`, 'bad');
      this.assist.fail('place');
      return false;
    }
    if (m.index < 0) {
      // The top of a workbench is lifted on with both hands and pressed: bring it to the hand, the player does the rest.
      if (!m.structure.keyOpen) {
        if (this.held !== item) this.takeOut(item);
        this.toast('Lower it onto the supports with both hands.', 'note');
        return false;
      }
    }
    const ok = m.index >= 0 ? this.fillSpot(structureId, index, item, { x: m.x, z: m.z }) : this.placeKey(structureId, m.x, m.z, 1);
    if (ok) this.assist.success('place');
    return ok;
  }

  /** A thrown part on the ground (a drop) was caught by an open mark: seat it there, or leave it lying if it will not fit. */
  catchDrop(dropId: number, x: number, z: number): boolean {
    const i = this.drops.findIndex((d) => d.id === dropId);
    if (i < 0) return false;
    const [d] = this.drops.splice(i, 1);
    this.addItem(d.item);
    if (this.seatNear(d.item, x, z, { radius: ASSIST.catchRadius, hands: 2 })) {
      this.emit({ type: 'drops' });
      return true;
    }
    this.satchel.set(d.item, this.count(d.item) - 1);
    this.drops.splice(i, 0, d);
    this.emit({ type: 'satchel' });
    return false;
  }

  /** An unfinished structure within `radius` m still wants `item` (a spot or its key part). */
  wantsItem(item: ItemId, x: number, z: number, radius = 6): boolean {
    return this.placementTarget(item, x, z, radius) !== null;
  }

  /**
   * Set the key part (a slab) down on a keyLast structure at (x, z). Heavy
   * parts need both hands. The structure is finished only when the push test
   * passes; otherwise it wobbles and the failure names the bad support.
   */
  placeKey(structureId: number, x: number, z: number, hands: number): boolean {
    const s = this.structures.find((t) => t.id === structureId);
    const def = s ? BLUEPRINTS[s.kind] : null;
    if (s?.keyOpen && def) return this.fillKey(s, x, z);
    if (!s || !def?.keyLast || s.keyPlaced || s.complete) return false;
    if (!this.held || !def.keyAccepts.includes(this.held)) return false;
    // Missing supports first: that is the real problem, not the weight.
    if (s.spots.some((v) => v === null)) {
      this.interactionFailure('slab.beforeSupports', `${s.spots.filter((v) => v === null).length} still to place`);
      return false;
    }
    if (!GrabTracker.canLift(ITEMS[this.held].weight, hands)) {
      this.interactionFailure('grab.tooHeavy');
      return false;
    }
    s.key = this.consumeHeld()!;
    s.keyPlaced = true;
    s.keyPos = { x, z };
    this.fx('seat', 1);
    this.emit({ type: 'placed', x, y: 0.36, z });
    this.lastSeatAt = this.time;
    this.contact(ITEM_PHYSICS[s.key].material, 'stone', x, 0.36, z, 2);
    this.log.add(`set ${s.key} on ${s.kind}#${s.id} at ${x.toFixed(2)},${z.toFixed(2)}`);
    this.emit({ type: 'structure', structure: s });
    if (s.kind === 'workbench') this.guide.mark('workbench.slab.aligned');
    this.pushTest(structureId);
    return true;
  }

  /** Fill the key slot of a book-placed structure (the held part, else one from the bag). */
  private fillKey(s: PlacedStructure, x: number, z: number): boolean {
    const def = BLUEPRINTS[s.kind];
    const target = spotWorldPosition(s, -1);
    const check = checkPlace(x, z, target.x, target.z, def.spotTolerance ?? DEFAULT_SPOT_TOLERANCE);
    if (!check.ok) {
      this.interactionFailure('place.tooFar', `${Math.round(check.error * 100)} cm off`);
      return false;
    }
    const heldBefore = this.held;
    let item: ItemId | null = null;
    if (this.held && def.keyAccepts.includes(this.held)) item = this.consumeHeld();
    else {
      const found = def.keyAccepts.find((id) => this.count(id) > 0);
      if (found) {
        this.satchel.set(found, this.count(found) - 1);
        this.emit({ type: 'satchel' });
        item = found;
      }
    }
    if (!item) {
      this.toast(`You need ${def.keyAccepts.map((k) => itemName(k).toLowerCase()).join(' or ')} for the first mark.`, 'bad');
      return false;
    }
    s.key = item;
    s.keyOpen = false;
    s.keyPos = { x: target.x, z: target.z };
    this.fx('seat', 0.6);
    this.emit({ type: 'placed', x: target.x, y: target.y, z: target.z });
    this.lastSeatAt = this.time;
    this.contact(ITEM_PHYSICS[item].material, 'soil', target.x, 0.05, target.z, 1.5);
    this.log.add(`filled ${s.kind}#${s.id} key with ${item}`);
    if (s.spots.every((v) => v !== null)) this.completeStructure(s);
    this.emit({ type: 'structure', structure: s });
    if (heldBefore === item && this.held === null) this.refill(item);
    return true;
  }

  /** Press down on the slab: is it stable? Finishes the structure when it is. */
  pushTest(structureId: number): boolean {
    const s = this.structures.find((t) => t.id === structureId);
    if (!s || !s.keyPlaced || s.complete || !s.keyPos) return false;
    // Seated supports count as sitting on their marks (placement snaps), so a
    // stone set slightly off in an older save still holds the slab.
    const marks = s.spots.map((v, i) => (v ? spotWorldPosition(s, i) : null));
    const r = slabStability(marks, s.keyPos);
    if (r.stable) {
      if (s.kind === 'workbench') this.guide.mark('workbench.push.stable');
      this.completeStructure(s);
      this.emit({ type: 'structure', structure: s });
      return true;
    }
    this.fx('wobble', 1);
    this.interactionFailure(r.code!, r.support !== null ? `the ${SUPPORT_NAMES[r.support] ?? 'last'} support` : undefined);
    return false;
  }

  /**
   * Pick a part back up off an unfinished structure (index -1 = the key part).
   * The slab must come off before a support can be moved.
   */
  takeBack(structureId: number, index: number): boolean {
    const s = this.structures.find((t) => t.id === structureId);
    if (!s) return false;
    const def = BLUEPRINTS[s.kind];
    if (s.complete && s.kind === 'firePit') {
      this.toast('The fire pit stays where it is.', 'note');
      return false;
    }
    if (s.kind === 'leanTo' || s.kind === 'drainage') {
      this.toast('Poles, lashings and layers stay where you set them.', 'note');
      return false;
    }
    if (this.storedCount(s) > 0) {
      this.toast('Empty the storage first.', 'bad');
      return false;
    }
    let item: ItemId;
    if (index < 0) {
      if (!s.keyPlaced) return false;
      item = s.key;
      s.keyPlaced = false;
      s.keyPos = undefined;
    } else {
      const part = s.spots[index];
      if (!part) return false;
      if (s.keyPlaced) {
        this.toast(`Lift the ${itemName(s.key).toLowerCase()} off first.`, 'note');
        return false;
      }
      item = part;
      s.spots[index] = null;
      if (s.spotPos) s.spotPos[index] = null;
    }
    if (s.complete) {
      s.complete = false;
      this.toast(`${def.name} taken apart.`, 'note');
    }
    if (this.held) this.stow();
    this.held = item;
    this.log.add(`took ${item} back from ${s.kind}#${s.id}`);
    this.emit({ type: 'held', item });
    // Nothing left but the plan: clear it (a non-keyLast key part goes back in the bag).
    if (s.spots.every((v) => v === null) && !s.keyPlaced) {
      this.structures.splice(this.structures.indexOf(s), 1);
      if (!def.keyLast && !s.keyOpen) this.addItem(s.key);
      this.emit({ type: 'structure', structure: s });
      return true;
    }
    this.emit({ type: 'structure', structure: s });
    return true;
  }


  private completeStructure(s: PlacedStructure): void {
    const def = BLUEPRINTS[s.kind];
    s.complete = true;
    if (s.built) {
      this.toast(`${def.name} rebuilt.`, 'good');
      return;
    }
    s.built = true;
    this.log.add(`built ${s.kind} #${s.id}`, 'ok');
    this.toast(`${def.name} built!`, 'good');
    this.addXp(def.xp);
    if (def.completeObservation) this.observe(def.completeObservation);
    if (s.kind === 'workbench') this.science('build.workbench.done');
    if (s.kind === 'shelter') {
      this.science('shelter.frame.built');
      this.science('shelter.roof.covered');
      if (s.spots.includes('dryGrass')) this.science('shelter.bed.insulated');
      this.science('shelter.wind.blocked');
    }
    this.checkQuests();
  }

  // ------------------------------------------------------------ Chapter 2: the shelter

  /** The shelter under construction (or built), if any. */
  leanTo(): PlacedStructure | null {
    return this.structures.find((t) => t.kind === 'leanTo') ?? null;
  }

  /** A stage or milestone of the shelter just happened (called after a part is set). */
  private shelterProgress(s: PlacedStructure, index: number): void {
    const def = BLUEPRINTS.leanTo;
    this.lastBuildAt = this.time;
    const stage = def.spots[index].stage ?? 0;
    const c = stageCount(s, stage);
    if (c.done === c.total && !s.keyOpen) {
      if (stage === 3) {
        this.science('shelter.frame.braced');
        this.toast('The ribs lean in and meet the upright: a triangle. Give the frame a push: it holds.', 'good');
      }
      if (stage === 4) {
        this.science('shelter.load.shared');
        this.toast('Two cross-supports: the load now has more than one way to reach the ground.', 'note');
      }
    }
    if (frameDone(s) && !this.hasEvent('shelter.frame.built')) {
      this.science('shelter.frame.built');
      this.addXp(60);
      this.toast('The frame is complete! Now the roof: bark, leaves, then grass.', 'good');
      this.emit({ type: 'shelterStage', stage: 6, id: s.id });
    } else if (c.done === c.total && stage < 7) this.emit({ type: 'shelterStage', stage, id: s.id });
    if (stage === 7 && roofed(s) && !this.hasEvent('shelter.roof.covered')) {
      this.science('shelter.roof.covered');
      this.addXp(40);
      this.toast('The roof is on. Will it keep the rain out? We are about to find out.', 'good');
      this.emit({ type: 'shelterStage', stage: 7, id: s.id });
    }
    this.checkQuests();
  }

  /** The nearest unfinished lashing joint within `reach` m of a point (the hand), or null. */
  lashTarget(x: number, z: number, y: number, reach = 0.7): { structure: PlacedStructure; index: number; progress: number; x: number; y: number; z: number } | null {
    const s = this.leanTo();
    if (!s) return null;
    const def = BLUEPRINTS.leanTo;
    let best: { structure: PlacedStructure; index: number; progress: number; x: number; y: number; z: number } | null = null;
    let bd = reach;
    def.spots.forEach((sp, i) => {
      if (sp.gesture !== 'lash' || s.spots[i] !== null || isSpotLocked(s, i)) return;
      const p = spotWorldPosition(s, i);
      const d = Math.hypot(p.x - x, p.y - y, p.z - z);
      if (d < bd) {
        bd = d;
        best = { structure: s, index: i, progress: s.work?.[i] ?? 0, x: p.x, y: p.y, z: p.z };
      }
    });
    return best;
  }

  /**
   * Tighten the cord on a joint by `amount` (0..1 of the joint): the hands twist it. Needs cord. At 1 the joint is
   * lashed: the cord is used up, the joint is secured, and the first one teaches why tension holds a frame together.
   */
  lashJoint(structureId: number, index: number, amount: number): number {
    const s = this.structures.find((t) => t.id === structureId);
    if (!s || s.kind !== 'leanTo') return 0;
    const spot = BLUEPRINTS.leanTo.spots[index];
    if (!spot || spot.gesture !== 'lash' || s.spots[index] !== null || isSpotLocked(s, index)) return 0;
    if (this.count('cord') <= 0 && this.held !== 'cord') {
      this.toast('You need cord to lash a joint: twist plant fibres into cord at the workbench.', 'bad');
      return 0;
    }
    s.work ??= {};
    const p = Math.min(1, (s.work[index] ?? 0) + Math.max(0, amount));
    s.work[index] = p;
    this.emit({ type: 'lash', id: s.id, index, progress: p });
    if (p < 1) return p;
    if (this.held === 'cord') this.consumeHeld();
    else {
      this.satchel.set('cord', this.count('cord') - 1);
      this.emit({ type: 'satchel' });
    }
    s.spots[index] = 'cord';
    const at = spotWorldPosition(s, index);
    s.spotPos ??= BLUEPRINTS.leanTo.spots.map(() => null);
    s.spotPos[index] = { x: at.x, z: at.z };
    this.log.add(`lashed leanTo#${s.id}[${index}]`);
    this.fx('seat', 1);
    this.emit({ type: 'placed', x: at.x, y: at.y, z: at.z });
    this.science('shelter.lashing.tight');
    this.toast('Tight. The cord is in tension, and that keeps the poles from spreading.', 'good');
    this.emit({ type: 'structure', structure: s });
    this.shelterProgress(s, index);
    return 1;
  }

  /** Put the drainage plan on the uphill side of the shelter (once), for the rain test. */
  private ensureDrainage(s: PlacedStructure): PlacedStructure {
    const have = this.structures.find((t) => t.kind === 'drainage');
    if (have) return have;
    const def = BLUEPRINTS.drainage;
    const d: PlacedStructure = { id: this.nextStructureId++, kind: 'drainage', x: s.x, z: s.z, rotY: s.rotY, key: 'diggingStick', spots: def.spots.map(() => null), complete: false };
    this.structures.push(d);
    this.emit({ type: 'structure', structure: d });
    return d;
  }

  /** Is the shelter's drainage channel dug? */
  drained(): boolean {
    return this.structures.some((t) => t.kind === 'drainage' && t.complete);
  }

  /** Is a point under the shelter roof? */
  insideShelter(x: number, z: number): boolean {
    const s = this.leanTo();
    return !!s && roofed(s) && insideShelter(s, x, z);
  }

  /** The rain test and resting, a few times a second (called from tick). */
  private tickShelter(dt: number): void {
    const s = this.leanTo();
    const test = this.shelterTest;
    if (!s) {
      if (this.forcedRain) {
        this.env.forceWeather = null;
        this.forcedRain = false;
      }
      return;
    }
    const leaks = leakingPanels(s);
    const readyForRain = roofed(s) && this.time - this.lastBuildAt > 20;
    const ev = test.update(dt, { roofed: readyForRain, leaks: leaks.length, drained: this.drained(), inside: this.insideShelter(this.player.x, this.player.z) });
    if (test.raining && !this.forcedRain) {
      this.env.forceWeather = 'heavyRain';
      this.forcedRain = true;
    } else if (!test.raining && this.forcedRain) {
      this.env.forceWeather = null;
      this.forcedRain = false;
    }
    if (test.raining && RAIN_MAX - test.rainLeft > 8 && leaks.length < 3) this.science('shelter.roof.sheds');
    switch (ev) {
      case 'rainBegan':
        this.science('shelter.rain.begin');
        this.ensureDrainage(s);
        this.toast(leaks.length ? 'Rain! Watch the roof: where does the water get in?' : 'Rain begins to fall. Stay under the roof and watch.', 'note');
        break;
      case 'leakSeen':
        this.science('shelter.leak.found');
        this.toast('Drip! Water is coming through the thin part of the roof. Add the missing layer there.', 'bad');
        break;
      case 'sealed':
        this.science('shelter.layers.sealed');
        this.toast('The drips stopped: layers overlapped like tiles keep each drop moving downhill.', 'good');
        break;
      case 'drained':
        this.science('shelter.drain.dug');
        this.toast('The channel carries the runoff around your shelter.', 'good');
        break;
      case 'rested':
        this.setFlag('shelterRested');
        this.science('shelter.rested');
        this.toast('Dry and out of the wind. You could stay here all night.', 'good');
        break;
      case 'passed':
        this.setFlag('shelterTested');
        this.addXp(80);
        this.toast('The shelter held. You built that, and now you understand why it works.', 'good');
        this.emit({ type: 'shelterStage', stage: 8, id: s.id });
        break;
      case 'rainEased':
        this.toast('The shower eases off. It will come back: finish the roof and the channel.', 'note');
        break;
      default:
        break;
    }
    if (ev) this.checkQuests();
  }

  nearbyWorkbench(): PlacedStructure | null {
    return (
      this.structures.find(
        (s) => s.kind === 'workbench' && s.complete && Math.hypot(s.x - this.player.x, s.z - this.player.z) <= CRAFT_REACH,
      ) ?? null
    );
  }

  canCraft(recipe: Recipe): boolean {
    return Object.entries(recipe.inputs).every(([id, n]) => this.count(id as ItemId) >= (n ?? 0));
  }

  craft(id: Recipe['id']): boolean {
    const recipe = RECIPES.find((r) => r.id === id)!;
    if (!this.nearbyWorkbench()) {
      this.toast('You need a steady surface to work on — build a workbench and stand at it.', 'bad');
      return false;
    }
    if (!this.canCraft(recipe)) {
      const need = Object.entries(recipe.inputs)
        .map(([item, n]) => `${n}× ${itemName(item as ItemId).toLowerCase()}`)
        .join(', ');
      this.toast(`${recipe.name} needs ${need}.`, 'bad');
      return false;
    }
    for (const [item, n] of Object.entries(recipe.inputs)) {
      this.satchel.set(item as ItemId, this.count(item as ItemId) - (n ?? 0));
    }
    this.addItem(recipe.output);
    this.setFlag(recipe.flag);
    this.log.add(`crafted ${recipe.output}`, 'ok');
    this.toast(`Made: ${itemName(recipe.output)}`, 'good');
    this.observe(recipe.observation);
    this.science(recipe.id === 'cord' ? 'craft.cord' : 'craft.bowdrill');
    this.checkQuests();
    return true;
  }

  observe(id: string): boolean {
    if (this.notebook.includes(id)) return false;
    const o = OBSERVATIONS[id];
    if (!o) throw new Error(`Unknown observation ${id}`);
    this.notebook.push(id);
    this.log.add(`observation: ${o.title}`, 'ok');
    this.emit({ type: 'observation', id });
    this.addXp(o.xp ?? 15);
    return true;
  }

  /** Records a science event: notebook entries tied to it are unlocked. */
  science(event: string): void {
    if (!isScienceEvent(event)) throw new Error(`Unknown science event ${event}`);
    if (this.events.has(event)) return;
    this.events.add(event);
    this.log.add(`event: ${event}`, 'ok');
    for (const id of observationsForEvent(event)) this.observe(id);
    this.checkQuests();
    this.checkLiving();
  }

  /** The non-linear Phase 3 quests: judged from state whenever something happens. */
  checkLiving(): void {
    for (const q of livingProgress(this)) {
      this.log.add(`quest complete: ${q.title}`, 'ok');
      this.addXp(100);
      this.toast(`Quest complete: ${q.title}`, 'good');
      if (q.recap) this.toast(q.recap, 'note');
    }
  }

  hasEvent(event: string): boolean {
    return this.events.has(event);
  }

  addXp(amount: number): void {
    this.xp += amount;
    this.emit({ type: 'xp', amount, total: this.xp });
    while (this.level < LEVELS.length - 1 && this.xp >= LEVELS[this.level]) {
      this.level++;
      this.toast(`Level up! You are now level ${this.level}.`, 'good');
      this.emit({ type: 'levelUp', level: this.level });
    }
  }

  // -------------------------------------------------------------- quests

  /** The first unfinished step of the current quest. */
  currentStep(): { step: QuestStep; index: number } | null {
    const q = this.quest;
    if (!q) return null;
    const index = q.steps.findIndex((s) => !s.done(this));
    return index < 0 ? null : { step: q.steps[index], index };
  }

  checkQuests(): void {
    // Chapter 2 opens the moment its first quest is the current one.
    if (this.quest?.title === 'A Place to Call Home') this.science('story.ch2.begin');
    while (this.quest && this.quest.steps.every((s) => s.done(this))) {
      const q = this.quest;
      const index = this.questIndex;
      this.questIndex++;
      this.log.add(`quest complete: ${q.title}`, 'ok');
      this.addXp(100);
      this.toast(
        q.roadmapNode ? `Quest complete: ${q.title} — a node on the Roadmap will light up.` : `Quest complete: ${q.title}. Time for science.`,
        'good',
      );
      if (q.recap) this.toast(q.recap, 'note');
      this.emit({ type: 'questComplete', index, title: q.title, roadmapNode: q.roadmapNode });
      const before = levelForQuest(index);
      // The level's last quest just finished.
      if (q.title === before.quests[before.quests.length - 1]) {
        this.levelReached = Math.max(this.levelReached, Math.min(GAME_LEVELS.length, before.n + 1));
        this.addXp(before.xp);
        this.log.add(`level complete: ${before.name}`, 'ok');
        this.emit({ type: 'levelComplete', level: before.n, name: before.name, next: before.n < GAME_LEVELS.length ? GAME_LEVELS[before.n] : null });
      }
    }
    this.objectives.update();
    this.emit({ type: 'quest', index: this.questIndex });
  }

  /**
   * Hints escalate each time you ask about the same step: the science clue,
   * then the kind of place, then a direction and distance.
   */
  hint(locate: Locator): HintResult | null {
    const cur = this.currentStep();
    if (!cur) return null;
    const key = `${this.questIndex}.${cur.index}`;
    const level = Math.min(2, this.hintLevels.get(key) ?? 0) as 0 | 1 | 2;
    this.hintLevels.set(key, level + 1);
    const { step } = cur;
    let result: HintResult;
    // An active crafting guide supplies the text; the quest's own hints otherwise.
    const guided = this.guide.hintText(level);
    if (guided && guided.level < 2) {
      result = { level: guided.level, text: guided.text };
    } else if (guided) {
      result = { level: 2, text: guided.text, target: this.directionHint(step, locate).target };
    } else if (level === 0 || level === 1) {
      result = { level, text: step.hints[level] };
    } else {
      result = this.directionHint(step, locate);
    }
    this.log.add(`hint ${key} level ${result.level}`);
    this.toast(`💡 ${result.text}`, 'note');
    return result;
  }

  private directionHint(step: QuestStep, locate: Locator): HintResult {
    const t = step.target;
    if ('structure' in t) {
      const built = this.structures.find((s) => s.kind === t.structure);
      if (built) return this.pointTo(built.x, built.z, `your ${BLUEPRINTS[t.structure].name.toLowerCase()}`);
      // Not built yet: if you already carry the key part, advise on ground;
      // otherwise point to where the key part can be found.
      const def = BLUEPRINTS[t.structure];
      const hasKey = def.keyAccepts.some((id) => this.count(id) > 0 || this.held === id);
      if (hasKey || t.items.length === 0) return { level: 2, text: `Build it on ${def.groundAdvice.charAt(0).toLowerCase()}${def.groundAdvice.slice(1)}` };
    }
    const wanted = t.items.filter((id) => !this.isUniqueAndOwned(id));
    const spot = wanted.length ? locate(wanted, this.player) : null;
    if (!spot) return { level: 2, text: step.hints[1] };
    return this.pointTo(spot.x, spot.z, 'what you need');
  }

  private isUniqueAndOwned(id: ItemId): boolean {
    return id === 'lens' && this.gatheredCount('lens') > 0;
  }

  private pointTo(x: number, z: number, what: string): HintResult {
    const dx = x - this.player.x;
    const dz = z - this.player.z;
    const d = Math.hypot(dx, dz);
    if (d < 4) return { level: 2, text: 'It’s right around you — look closely.', target: { x, z } };
    // 0 = north (−z), clockwise.
    const bearing = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
    const dir = DIRECTIONS[Math.round(bearing / 45) % 8];
    return {
      level: 2,
      text: `Try ${dir}, about ${Math.max(5, Math.round(d / 5) * 5)} m — ${what}. (★ on the compass)`,
      target: { x, z },
    };
  }

  // ---------------------------------------------------------- save/load

  snapshot(): SaveData {
    return {
      v: 1,
      time: this.time,
      xp: this.xp,
      level: this.level,
      questIndex: this.questIndex,
      questsVersion: QUESTS_VERSION,
      levelReached: this.levelReached,
      water: this.water.snapshot(),
      food: this.food.snapshot(),
      // Parts lying on the bench mid-craft are saved as if the craft was cancelled.
      satchel: this.satchelWithBench(),
      gathered: Object.fromEntries(this.gathered),
      notebook: [...this.notebook],
      events: [...this.events],
      living: [...this.living],
      guide: this.guide.snapshot(),
      structures: this.structures.map((s) => ({
        ...s,
        spots: [...s.spots],
        spotPos: s.spotPos?.map((p) => (p ? { ...p } : null)),
        keyPos: s.keyPos ? { ...s.keyPos } : undefined,
        store: s.store ? { ...s.store } : undefined,
        work: s.work ? { ...s.work } : undefined,
      })),
      discovered: [...this.discovered],
      flags: [...this.flags],
      player: { ...this.player },
      held: this.held,
      packUpgrades: [...this.packUpgrades],
      drops: this.drops.map((d) => ({ ...d })),
      toolUses: Object.fromEntries(this.toolUses),
      fire: this.fire.snapshot(),
      objectives: this.objectives.snapshot(),
      story: this.story.snapshot(),
      assist: this.assist.snapshot(),
      shelterTest: this.shelterTest.snapshot(),
      env: this.env.snapshot(),
    };
  }

  static restore(data: SaveData): Game {
    const g = new Game();
    g.time = data.time;
    g.xp = data.xp;
    g.level = data.level;
    g.questIndex = migrateQuestIndex(data.questIndex, data.questsVersion);
    g.levelReached = Math.max(data.levelReached ?? 1, g.gameLevel.n);
    if (data.water) g.water.restore(data.water);
    if (data.food) g.food.restore(data.food);
    for (const [k, v] of Object.entries(data.satchel)) g.satchel.set(k as ItemId, v);
    for (const [k, v] of Object.entries(data.gathered)) g.gathered.set(k as ItemId, v);
    g.notebook.push(...data.notebook);
    for (const e of data.events ?? []) g.events.add(e);
    for (const q of data.living ?? []) g.living.add(q);
    if (data.guide) g.guide.restore(data.guide);
    g.structures.push(...data.structures);
    g.nextStructureId = Math.max(0, ...data.structures.map((s) => s.id)) + 1;
    for (const d of data.discovered) g.discovered.add(d);
    for (const f of data.flags) g.flags.add(f);
    g.player.x = data.player.x;
    g.player.z = data.player.z;
    // Older saves have no `held`; a stale id would crash the item meshes.
    for (const [k, v] of Object.entries(data.toolUses ?? {})) g.toolUses.set(k as ItemId, v);
    for (const d of data.drops ?? []) g.drops.push({ ...d });
    g.nextDropId = Math.max(0, ...g.drops.map((d) => d.id)) + 1;
    for (const u of data.packUpgrades ?? []) g.packUpgrades.add(u);
    if (data.fire) g.fire.restore(data.fire);
    g.env.restore(data.env);
    // Saves from before the day/night clock: wake up in the morning, not at whatever hour the play time implies.
    if (!data.env) g.env.hourOffset = -(((g.time / g.env.dayLength) * 24) % 24);
    g.held = data.held && data.held in ITEMS ? data.held : null;
    g.objectives.restore(data.objectives);
    g.assist.restore(data.assist);
    g.shelterTest.restore(data.shelterTest);
    g.story.restore(data.story);
    return g;
  }
}

export interface SaveData {
  v: 1;
  fire?: FireSave;
  /** Beginner objectives; absent in older saves (migrated from the rest of the state). */
  objectives?: ObjectivesSave;
  /** Chapter 1 story; absent in older saves (beats already past are marked seen, story.ts). */
  story?: StorySave;
  /** Adaptive assistance strain per channel; absent in older saves (starts at the default). */
  assist?: AssistSave;
  /** Chapter 2 rain test state; absent in older saves. */
  shelterTest?: ShelterTestSave;
  env?: EnvironmentSave;
  packUpgrades?: string[];
  drops?: WorldDrop[];
  toolUses?: Partial<Record<ItemId, number>>;
  time: number;
  xp: number;
  level: number;
  questIndex: number;
  /** Quest-order version; missing = the order before levels (see levels.ts). */
  questsVersion?: number;
  levelReached?: number;
  water?: WaterSave;
  food?: FoodSave;
  satchel: Partial<Record<ItemId, number>>;
  gathered: Partial<Record<ItemId, number>>;
  notebook: string[];
  events?: string[];
  living?: string[];
  guide?: GuideSave;
  structures: PlacedStructure[];
  discovered: string[];
  flags: FlagId[];
  player: { x: number; z: number };
  held?: ItemId | null;
}
