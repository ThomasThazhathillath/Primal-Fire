// Workbench crafting. Picking a recipe never crafts: it reserves the parts on
// the bench and starts a sequence of physical steps (scrape a notch, wrap a
// lashing, strike a flake ...). The input layer reports effort for the motion
// you make; only the motion the step asks for counts. Finishing the last step
// makes the item; cancelling gives every part back. All data, so recipes and
// steps can be extended without touching the systems.

import type { FlagId, Game } from './game.js';
import type { GuideMark } from './guides.js';
import type { GuideFailureCode } from './interact.js';
import { itemName, type ItemId } from './items.js';
import type { ScienceEventId } from './science-events.js';

/**
 * Motions the bench understands (see BenchSystem for how hands / mouse map to them):
 *   scrape - short strokes back and forth with an edge (carve a notch, shave a limb)
 *   wrap   - circle one hand around the work (lash, string, bind)
 *   strike - sharp downward blows (knap, tap a head into its split)
 *   twist  - wrists rolling in opposite directions (cordage)
 *   saw    - long fast strokes back and forth (test a bow drill)
 *   press  - push down firmly (seat a part, fit a spindle)
 */
export type BenchMotion = 'scrape' | 'wrap' | 'strike' | 'twist' | 'saw' | 'press';

export interface BenchStep {
  id: string;
  /** Short verb instruction for the panel. */
  title: string;
  motion: BenchMotion;
  /** Effort needed (metres of stroke / radians of wrap or twist / strikes / metres pressed). */
  work: number;
  /** One line on what you are doing and why. */
  hint: string;
  /** Guide sub-step this completes (src/game/guides.ts). */
  mark?: GuideMark;
}

export interface BenchRecipe {
  id: string;
  name: string;
  output: ItemId;
  count?: number;
  inputs: Partial<Record<ItemId, number>>;
  steps: BenchStep[];
  observation?: string;
  science?: ScienceEventId[];
  flag?: FlagId;
}

export const BENCH_RECIPES: BenchRecipe[] = [
  {
    id: 'bowDrill',
    name: 'Bow drill (friction fire tool)',
    output: 'bowDrill',
    inputs: { board: 1, spindle: 1, greenBranch: 1, cord: 1 },
    observation: 'g_bow',
    science: ['craft.bowdrill'],
    flag: 'hasDrill',
    steps: [
      { id: 'board', title: 'Press the hearth board flat on the bench', motion: 'press', work: 0.12, mark: 'bowdrill.board.set', hint: 'A board that rocks will not hold the spindle still.' },
      { id: 'notch', title: 'Carve a notch at the board edge', motion: 'scrape', work: 1.2, hint: 'Scrape a small pit and a V-cut beside it: hot dust collects in the V.', mark: 'bowdrill.notched' },
      { id: 'spindle', title: 'Fit the spindle into the pit', motion: 'press', work: 0.1, hint: 'Press the straight stick down into the pit so it sits upright.', mark: 'bowdrill.spindle.fitted' },
      { id: 'string', title: 'String the bow: wrap the cord round both ends', motion: 'wrap', work: Math.PI * 4, hint: 'Leave the cord a little slack so it can loop once around the spindle.', mark: 'bowdrill.strung' },
      { id: 'saw', title: 'Test it: saw the bow back and forth', motion: 'saw', work: 2.5, hint: 'Long, fast strokes spin the spindle; you should smell hot wood.', mark: 'bowdrill.tested' },
    ],
  },
  {
    id: 'cord',
    name: 'Cord',
    output: 'cord',
    inputs: { fibers: 3 },
    observation: 'g_cord',
    science: ['craft.cord'],
    flag: 'cordMade',
    steps: [
      { id: 'strands', title: 'Pull the fibres into strands', motion: 'scrape', work: 0.6, hint: 'Comb the stems apart against the bench edge.', mark: 'cord.strands' },
      { id: 'twist', title: 'Twist the strands, wrists in opposite directions', motion: 'twist', work: Math.PI * 4, hint: 'Each strand twists one way; together they lock the other way.', mark: 'cord.twisted' },
    ],
  },
  {
    id: 'knife',
    name: 'Flint knife',
    output: 'knife',
    inputs: { flake: 1, spindle: 1, cord: 1 },
    science: ['tool.edge.cut'],
    steps: [
      { id: 'split', title: 'Split the end of the handle', motion: 'strike', work: 2, hint: 'Tap the flake into the stick end to open a short split.', mark: 'knife.split' },
      { id: 'seat', title: 'Press the flake into the split', motion: 'press', work: 0.1, hint: 'The wood springs back and grips the stone.', mark: 'knife.seated' },
      { id: 'lash', title: 'Lash it: wrap the cord tight', motion: 'wrap', work: Math.PI * 5, hint: 'Tight wraps stop the split opening further.', mark: 'knife.lashed' },
    ],
  },
  {
    id: 'axe',
    name: 'Stone axe',
    output: 'axe',
    inputs: { dryStone: 1, spindle: 1, cord: 2 },
    science: ['tool.axe.made', 'tool.lash.hold'],
    steps: [
      { id: 'split', title: 'Split the top of the handle', motion: 'strike', work: 3, hint: 'Short sharp blows; the split only needs to be a hand long.' },
      { id: 'seat', title: 'Seat the stone head in the split', motion: 'press', work: 0.15, hint: 'Push it in until it stops moving.', mark: 'axe.head.seated' },
      { id: 'lash', title: 'Lash it crosswise, pulling each wrap tight', motion: 'wrap', work: Math.PI * 8, hint: 'Crossed wraps stop the head twisting.', mark: 'axe.lashed' },
    ],
  },
  {
    id: 'hammer',
    name: 'Stone hammer',
    output: 'hammer',
    inputs: { dryStone: 1, spindle: 1, cord: 1 },
    steps: [
      { id: 'seat', title: 'Set the stone against the handle', motion: 'press', work: 0.12, hint: 'The flattest face goes against the wood.' },
      { id: 'lash', title: 'Lash it on', motion: 'wrap', work: Math.PI * 6, hint: 'Wrap over and under the stone so it cannot slide off.' },
    ],
  },
  {
    id: 'diggingStick',
    name: 'Digging stick',
    output: 'diggingStick',
    inputs: { spindle: 1, flake: 1 },
    steps: [{ id: 'point', title: 'Shave one end to a point', motion: 'scrape', work: 1.5, hint: 'Shave away from you, turning the stick as you go.' }],
  },
  {
    id: 'bow',
    name: 'Hunting bow',
    output: 'bow',
    inputs: { greenBranch: 1, cord: 1 },
    steps: [
      { id: 'shave', title: 'Shave the limbs so both bend evenly', motion: 'scrape', work: 1.6, hint: 'Take wood off the stiffer limb until both curve the same.', mark: 'bow.shaped' },
      { id: 'string', title: 'Bend it and tie the string on', motion: 'wrap', work: Math.PI * 4, hint: 'Brace one tip on the bench, bend, and loop the cord over the other.', mark: 'bow.strung' },
    ],
  },
  {
    id: 'arrows',
    name: 'Two arrows',
    output: 'arrow',
    count: 2,
    inputs: { spindle: 2, flake: 1, feather: 2 },
    science: ['hunt.arrow.made', 'hunt.fletch.made'],
    steps: [
      { id: 'nock', title: 'Cut a notch in each shaft end', motion: 'scrape', work: 1, hint: 'A nock holds the string; a slit at the front holds the head.' },
      { id: 'head', title: 'Seat the flake head', motion: 'press', work: 0.1, hint: 'Wedge it into the front slit.' },
      { id: 'fletch', title: 'Bind the feathers on', motion: 'wrap', work: Math.PI * 4, hint: 'Feathers at the back keep the arrow flying straight.' },
    ],
  },
  {
    id: 'pot',
    name: 'Clay pot',
    output: 'pot',
    inputs: { clay: 2, sand: 1 },
    steps: [
      { id: 'knead', title: 'Knead sand into the clay', motion: 'press', work: 0.6, hint: 'Sand (temper) stops the pot cracking as it dries.', mark: 'pot.clay.tempered' },
      { id: 'coil', title: 'Roll coils and build the walls', motion: 'twist', work: Math.PI * 4, hint: 'Even coils make even walls.' },
      { id: 'smooth', title: 'Smooth the walls', motion: 'scrape', work: 1, hint: 'Thin, even walls dry without cracking.', mark: 'pot.shaped' },
    ],
  },
  // FOOD (Level 3, Science session): see src/game/food.ts.
  {
    id: 'fishingSpear',
    name: 'Fishing spear',
    output: 'fishingSpear',
    inputs: { spindle: 1, flake: 1, cord: 1 },
    steps: [
      { id: 'split', title: 'Split the tip into prongs', motion: 'strike', work: 2, hint: 'Several prongs give more chances to pin a slippery fish.' },
      { id: 'sharpen', title: 'Sharpen each prong', motion: 'scrape', work: 1, hint: 'A thin point concentrates force: high pressure pierces scales.' },
      { id: 'bind', title: 'Bind below the split', motion: 'wrap', work: Math.PI * 4, hint: 'The lashing stops the split running down the shaft.' },
    ],
  },
];

export const BENCH_BY_ID: Record<string, BenchRecipe> = Object.fromEntries(BENCH_RECIPES.map((r) => [r.id, r]));

export type BenchEvent = 'progress' | 'step' | 'done' | 'wrong' | null;

/** How much wrong-motion effort is tolerated before telling the player. */
const WRONG_LIMIT: Record<BenchMotion, number> = { scrape: 0.4, wrap: 3, strike: 2, twist: 4, saw: 0.8, press: 0.2 };

/**
 * One craft in progress at a bench. Parts are taken out of the satchel when
 * it starts (they lie on the bench) and returned on cancel.
 */
export class BenchSession {
  stepIndex = 0;
  /** 0..1 within the current step. */
  progress = 0;
  done = false;
  private wrong = 0;

  constructor(
    readonly recipe: BenchRecipe,
    readonly structureId: number,
  ) {}

  get step(): BenchStep | null {
    return this.recipe.steps[this.stepIndex] ?? null;
  }

  /** 0..1 over all steps. */
  get total(): number {
    return (this.stepIndex + this.progress) / this.recipe.steps.length;
  }

  /**
   * Effort from a motion. Only the step's motion advances it; enough of the
   * wrong one returns 'wrong' (once) so the player can be told.
   */
  work(motion: BenchMotion, effort: number): BenchEvent {
    const step = this.step;
    if (!step || this.done || effort <= 0) return null;
    if (motion !== step.motion) {
      this.wrong += effort;
      if (this.wrong >= WRONG_LIMIT[motion]) {
        this.wrong = 0;
        return 'wrong';
      }
      return null;
    }
    this.wrong = 0;
    this.progress = Math.min(1, this.progress + effort / step.work);
    if (this.progress < 1 - 1e-9) return 'progress';
    this.progress = 0;
    this.stepIndex++;
    if (this.stepIndex >= this.recipe.steps.length) {
      this.done = true;
      return 'done';
    }
    return 'step';
  }
}

/** What you have vs need for a recipe: for the panel. */
export function partsStatus(g: Game, r: BenchRecipe): Array<{ id: ItemId; have: number; need: number }> {
  return Object.entries(r.inputs).map(([id, need]) => ({
    id: id as ItemId,
    have: g.count(id as ItemId) + (g.held === id ? 1 : 0),
    need: need ?? 0,
  }));
}

export function canStart(g: Game, r: BenchRecipe): boolean {
  return partsStatus(g, r).every((p) => p.have >= p.need);
}

export function missingText(g: Game, r: BenchRecipe): string {
  return partsStatus(g, r)
    .filter((p) => p.have < p.need)
    .map((p) => `${p.need - p.have} ${itemName(p.id).toLowerCase()}`)
    .join(', ');
}

/** Failure codes the bench reports (declared in interact.ts). */
export const BENCH_FAILURES: GuideFailureCode[] = ['bench.wrongMotion', 'bench.missingParts'];
