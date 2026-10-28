// Game state and rules, independent of rendering and input. IWSDK systems
// call these actions and react to the events; tests drive them directly.

import {
  BLUEPRINTS,
  checkPlacement,
  type PlacedStructure,
  type PlacementResult,
  type StructureKind,
} from './blueprint.js';
import { ITEMS, itemName, SATCHEL_ORDER, type ItemId } from './items.js';
import { EventLog } from './log.js';
import { OBSERVATIONS } from './observations.js';
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
  | 'finale';

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
  | { type: 'questComplete'; index: number; title: string; roadmapNode: string | null }
  | { type: 'discovered'; landmark: Landmark };

/** XP needed to reach each level (index = level − 1). */
export const LEVELS = [0, 100, 250, 450, 700, 1000, 1400, 99999];
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

export interface HintResult {
  level: 0 | 1 | 2;
  text: string;
  /** Ground position to mark on the compass (third hint only). */
  target?: { x: number; z: number };
}

/** Finds the nearest place to gather one of `items`, or null. */
export type Locator = (items: ItemId[], from: { x: number; z: number }) => { x: number; z: number } | null;

const DIRECTIONS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];

export class Game {
  time = 0;
  xp = 0;
  level = 1;
  questIndex = 0;
  held: ItemId | null = null;
  readonly player = { x: 0, z: 0 };
  readonly satchel = new Map<ItemId, number>();
  readonly gathered = new Map<ItemId, number>();
  readonly notebook: string[] = [];
  readonly structures: PlacedStructure[] = [];
  readonly discovered = new Set<string>(LANDMARKS.filter((l) => l.known).map((l) => l.id));
  readonly log: EventLog;
  private flags = new Set<FlagId>();
  private hintLevels = new Map<string, number>();
  private listeners = new Set<(e: GameEvent) => void>();
  private nextStructureId = 1;

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
    for (const l of this.listeners) l(e);
  }

  toast(text: string, kind: ToastKind = 'info'): void {
    this.emit({ type: 'toast', text, kind });
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

  /** XP progress through the current level, 0..1. */
  get levelProgress(): number {
    const lo = LEVELS[this.level - 1];
    const hi = LEVELS[this.level];
    return Math.max(0, Math.min(1, (this.xp - lo) / (hi - lo)));
  }

  // ------------------------------------------------------------- actions

  tick(dt: number): void {
    this.time += dt;
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
  gather(id: ItemId, sourceId = 'world'): void {
    const first = this.gatheredCount(id) === 0;
    this.gathered.set(id, this.gatheredCount(id) + 1);
    this.addItem(id);
    this.log.add(`gathered ${id} from ${sourceId}`);
    this.toast(`+1 ${itemName(id)}`);
    const obs = ITEMS[id].firstObservation;
    if (first && obs) this.observe(obs);
    this.checkQuests();
  }

  /** Take one item out of the satchel into your hand. Stows anything already held. */
  takeOut(id: ItemId): boolean {
    if (this.count(id) <= 0) {
      this.log.add(`takeOut ${id}: none in satchel`, 'bad');
      return false;
    }
    if (this.held) this.stow();
    this.satchel.set(id, this.count(id) - 1);
    this.held = id;
    this.log.add(`took out ${id}`);
    this.emit({ type: 'satchel' });
    this.emit({ type: 'held', item: id });
    return true;
  }

  /** Put the held item back in the satchel. */
  stow(): void {
    if (!this.held) return;
    const id = this.held;
    this.held = null;
    this.addItem(id);
    this.log.add(`stowed ${id}`);
    this.emit({ type: 'held', item: null });
  }

  private consumeHeld(): ItemId | null {
    const id = this.held;
    this.held = null;
    if (id) this.emit({ type: 'held', item: null });
    return id;
  }

  /** Release the held key part over open ground to start a structure. */
  placeBlueprint(kind: StructureKind, x: number, z: number, rotY = 0): PlacementResult & { structure?: PlacedStructure } {
    const def = BLUEPRINTS[kind];
    if (!this.held || !def.keyAccepts.includes(this.held)) {
      return { ok: false, reason: 'structure', message: `You need ${def.keyAccepts.map(itemName).join(' or ')} in hand.` };
    }
    const check = checkPlacement(kind, x, z, this.structures);
    if (!check.ok) {
      this.log.add(`place ${kind} rejected: ${check.reason}`, 'bad');
      this.toast(check.message, 'bad');
      return check;
    }
    const key = this.consumeHeld()!;
    const structure: PlacedStructure = {
      id: this.nextStructureId++,
      kind,
      x,
      z,
      rotY,
      key,
      spots: def.spots.map(() => null),
      complete: false,
    };
    this.structures.push(structure);
    this.log.add(`placed ${kind} #${structure.id} at ${x.toFixed(1)},${z.toFixed(1)} key=${key}`, 'ok');
    this.toast(`${def.name}: fill the glowing spots to finish it.`, 'note');
    this.emit({ type: 'structure', structure });
    return { ok: true, structure };
  }

  /**
   * Put an item into a snap spot: the held item if it fits, otherwise the
   * first fitting item from the satchel (or `prefer`, when given and present).
   */
  fillSpot(structureId: number, index: number, prefer?: ItemId): boolean {
    const s = this.structures.find((t) => t.id === structureId);
    if (!s || s.complete || s.spots[index] === undefined || s.spots[index] !== null) return false;
    const spot = BLUEPRINTS[s.kind].spots[index];
    let item: ItemId | null = null;
    if (this.held && spot.accepts.includes(this.held)) {
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
    this.log.add(`filled ${s.kind}#${s.id}[${index}] with ${item}`);
    if (s.spots.every((v) => v !== null)) this.completeStructure(s);
    this.emit({ type: 'structure', structure: s });
    return true;
  }

  private completeStructure(s: PlacedStructure): void {
    const def = BLUEPRINTS[s.kind];
    s.complete = true;
    this.log.add(`built ${s.kind} #${s.id}`, 'ok');
    this.toast(`${def.name} built!`, 'good');
    this.addXp(def.xp);
    if (def.completeObservation) this.observe(def.completeObservation);
    this.checkQuests();
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
      this.emit({ type: 'questComplete', index, title: q.title, roadmapNode: q.roadmapNode });
    }
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
    if (level === 0 || level === 1) {
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
      satchel: Object.fromEntries(this.satchel),
      gathered: Object.fromEntries(this.gathered),
      notebook: [...this.notebook],
      structures: this.structures.map((s) => ({ ...s, spots: [...s.spots] })),
      discovered: [...this.discovered],
      flags: [...this.flags],
      player: { ...this.player },
    };
  }

  static restore(data: SaveData): Game {
    const g = new Game();
    g.time = data.time;
    g.xp = data.xp;
    g.level = data.level;
    g.questIndex = data.questIndex;
    for (const [k, v] of Object.entries(data.satchel)) g.satchel.set(k as ItemId, v);
    for (const [k, v] of Object.entries(data.gathered)) g.gathered.set(k as ItemId, v);
    g.notebook.push(...data.notebook);
    g.structures.push(...data.structures);
    g.nextStructureId = Math.max(0, ...data.structures.map((s) => s.id)) + 1;
    for (const d of data.discovered) g.discovered.add(d);
    for (const f of data.flags) g.flags.add(f);
    g.player.x = data.player.x;
    g.player.z = data.player.z;
    return g;
  }
}

export interface SaveData {
  v: 1;
  time: number;
  xp: number;
  level: number;
  questIndex: number;
  satchel: Partial<Record<ItemId, number>>;
  gathered: Partial<Record<ItemId, number>>;
  notebook: string[];
  structures: PlacedStructure[];
  discovered: string[];
  flags: FlagId[];
  player: { x: number; z: number };
}
