// Game state and rules, independent of rendering and input. IWSDK systems
// call these actions and react to the events; tests drive them directly.

import { actionFor } from './actions.js';
import { FAILURE_TEXT, type GuideFailureCode } from './interact.js';
import { HAND_RECIPES, TOOLS, toolFor } from './tools.js';
import { capacityFor, itemsCount, itemsWeight, moveLimits, PACK_UPGRADES, type MoveLimits, type PackUpgrade } from './backpack.js';
import { FireState, type FireSave, type FireStage } from './fire.js';
import {
  BLUEPRINTS,
  CAMP_RADIUS,
  checkPlacement,
  STORAGE_SLOTS,
  type PlacedStructure,
  type PlacementResult,
  type StructureKind,
} from './blueprint.js';
import { ITEMS, itemName, SATCHEL_ORDER, type ItemId } from './items.js';
import { EventLog } from './log.js';
import { observationsForEvent, OBSERVATIONS } from './observations.js';
import { isScienceEvent } from './science-events.js';
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
  | { type: 'discovered'; landmark: Landmark }
  | { type: 'fire'; stage: FireStage }
  | { type: 'arrow'; hit: boolean }
  | { type: 'reach' }
  | { type: 'fx'; name: FxName; strength: number }
  | { type: 'interaction'; code: GuideFailureCode; detail?: string }
  | { type: 'drops' }
  | { type: 'gather'; item: ItemId; tool: ItemId | null }
  | { type: 'action'; id: string; progress: number; done: boolean };

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
  /** Science events that have fired (src/game/science-events.ts). */
  readonly events = new Set<string>();
  readonly structures: PlacedStructure[] = [];
  /** Items dropped on the ground, pickable again. Not counted in carried weight. */
  readonly drops: WorldDrop[] = [];
  private nextDropId = 1;
  readonly discovered = new Set<string>(LANDMARKS.filter((l) => l.known).map((l) => l.id));
  readonly log: EventLog;
  readonly fire = new FireState(this);
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
    return moveLimits(this.carriedWeight, this.capacity.load);
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
    if (this.carriedCount >= this.capacity.pockets) {
      this.toast('Your pockets are full.', 'bad');
      return false;
    }
    const [d] = this.drops.splice(i, 1);
    this.addItem(d.item);
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
    if (this.held === item) this.stow();
    if (this.stash(item, 1) === 0) return false;
    this.toast(`Stored ${itemName(item).toLowerCase()}.`);
    return true;
  }

  /** A physical attempt failed: tell the player why (guides listen to this too). */
  interactionFailure(code: GuideFailureCode, detail?: string): void {
    this.log.add(`interaction failed: ${code}${detail ? ` (${detail})` : ''}`, 'bad');
    this.toast(detail ? `${FAILURE_TEXT[code]} (${detail})` : FAILURE_TEXT[code], 'bad');
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
    const t = toolFor(id);
    if (!t || this.count(t.id) <= 0) return 0;
    const left = (this.toolUses.get(t.id) ?? t.uses) - 1;
    if (left <= 0) {
      this.satchel.set(t.id, this.count(t.id) - 1);
      this.toolUses.delete(t.id);
      this.toast(`Your ${itemName(t.id).toLowerCase()} broke.`, 'bad');
    } else this.toolUses.set(t.id, left);
    this.lastToolUsed = t.id;
    if (t.id === 'knife') this.science('tool.edge.cut');
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

  /** XP progress through the current level, 0..1. */
  get levelProgress(): number {
    const lo = LEVELS[this.level - 1];
    const hi = LEVELS[this.level];
    return Math.max(0, Math.min(1, (this.xp - lo) / (hi - lo)));
  }

  // ------------------------------------------------------------- actions

  tick(dt: number): void {
    this.time += dt;
    this.fire.tick(dt);
    if (this.moveLimits.encumbrance !== 'light') {
      if ((this.heavyTime += dt) > 30) this.science('body.carry.heavy');
    } else this.heavyTime = 0;
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
    if (this.carriedCount >= this.capacity.pockets) {
      this.toast('Your pockets are full - drop or use something, or make a bigger pack.', 'bad');
      this.log.add(`gather ${id}: pockets full`, 'bad');
      return false;
    }
    const first = this.gatheredCount(id) === 0;
    this.gathered.set(id, this.gatheredCount(id) + 1);
    this.addItem(id);
    this.lastToolUsed = null;
    const bonus = this.carriedCount < this.capacity.pockets ? this.toolBonus(id) : 0;
    this.emit({ type: 'gather', item: id, tool: this.lastToolUsed });
    if (bonus) {
      this.addItem(id, bonus);
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
    this.satchel.set(id, this.count(id) - 1);
    this.held = id;
    this.actionProgress = 0;
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
    if (kind === 'shelter') this.science('shelter.site.chosen');
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
    if (s.kind === 'workbench') this.science('build.workbench.done');
    if (s.kind === 'shelter') {
      this.science('shelter.frame.built');
      this.science('shelter.roof.covered');
      if (s.spots.includes('dryGrass')) this.science('shelter.bed.insulated');
      this.science('shelter.wind.blocked');
    }
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
      events: [...this.events],
      structures: this.structures.map((s) => ({ ...s, spots: [...s.spots], store: s.store ? { ...s.store } : undefined })),
      discovered: [...this.discovered],
      flags: [...this.flags],
      player: { ...this.player },
      held: this.held,
      packUpgrades: [...this.packUpgrades],
      drops: this.drops.map((d) => ({ ...d })),
      toolUses: Object.fromEntries(this.toolUses),
      fire: this.fire.snapshot(),
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
    for (const e of data.events ?? []) g.events.add(e);
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
    g.held = data.held && data.held in ITEMS ? data.held : null;
    return g;
  }
}

export interface SaveData {
  v: 1;
  fire?: FireSave;
  packUpgrades?: string[];
  drops?: WorldDrop[];
  toolUses?: Partial<Record<ItemId, number>>;
  time: number;
  xp: number;
  level: number;
  questIndex: number;
  satchel: Partial<Record<ItemId, number>>;
  gathered: Partial<Record<ItemId, number>>;
  notebook: string[];
  events?: string[];
  structures: PlacedStructure[];
  discovered: string[];
  flags: FlagId[];
  player: { x: number; z: number };
  held?: ItemId | null;
}
