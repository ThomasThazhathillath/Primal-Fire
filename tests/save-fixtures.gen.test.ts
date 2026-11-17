// Generates the frozen survival-save fixtures in tests/fixtures/saves/.
//
// The fixtures are snapshots of real save states written by the game as it was
// BEFORE the five-lesson curriculum (version 1 saves). They are committed and
// never regenerated after the curriculum lands: tests/save-compat.test.ts loads
// them to prove old players' progress survives every later change.
//
// Regenerate only on purpose:  GEN_SAVE_FIXTURES=1 npx vitest run tests/save-fixtures.gen.test.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { BLUEPRINTS, type PlacedStructure, type StructureKind } from '../src/game/blueprint.js';
import { Game, type FlagId } from '../src/game/game.js';
import type { ItemId } from '../src/game/items.js';
import { OBJECTIVES } from '../src/game/objectives.js';
import { QUESTS } from '../src/game/quests.js';

const OUT = 'tests/fixtures/saves';
const run = process.env.GEN_SAVE_FIXTURES === '1';

let nextId = 100;
/** A finished structure, as a save holds it (the parts each mark accepts first). */
function built(g: Game, kind: StructureKind, x: number, z: number, fill?: (ItemId | null)[]): PlacedStructure {
  const def = BLUEPRINTS[kind];
  const s: PlacedStructure = {
    id: nextId++,
    kind,
    x,
    z,
    rotY: 0,
    key: def.keyAccepts[0],
    spots: fill ?? def.spots.map((sp) => sp.accepts[0]),
    complete: !fill || fill.every((v) => v !== null),
    built: !fill || fill.every((v) => v !== null),
    ...(def.keyLast ? { keyPlaced: true } : {}),
  };
  g.structures.push(s);
  return s;
}

function gathered(g: Game, items: Partial<Record<ItemId, number>>): void {
  for (const [id, n] of Object.entries(items)) g.gathered.set(id as ItemId, (g.gathered.get(id as ItemId) ?? 0) + n!);
}

function flags(g: Game, ids: FlagId[]): void {
  for (const f of ids) g.setFlag(f);
}

function events(g: Game, ids: string[]): void {
  for (const e of ids) g.science(e);
}

const questAt = (title: string): number => {
  const i = QUESTS.findIndex((q) => q.title === title);
  if (i < 0) throw new Error(`no quest ${title}`);
  return i;
};

/** Objectives finished, as a long-time player's save shows them. */
function objectivesDone(snap: Record<string, unknown>): void {
  snap.objectives = { v: 1, index: OBJECTIVES.length, completed: OBJECTIVES.map((o) => o.id), bases: {}, learned: ['grab', 'place', 'build', 'bench', 'tool', 'fire'], hints: {}, done: true, closed: false };
}

/** Everything up to the moment the bow drill is held over a laid fire. */
function toEmber(g: Game): void {
  gathered(g, { dryStone: 8, slab: 1, flint: 1, flake: 1, twigs: 5, logs: 3, dryGrass: 3, fibers: 3, spindle: 1, board: 1, greenBranch: 1, cane: 1 });
  built(g, 'workbench', 3, -4);
  built(g, 'firePit', -2, -3);
  g.objectives.learn('bench');
  events(g, ['build.workbench.done', 'tool.knap.flake', 'tool.edge.cut', 'craft.cord', 'craft.bowdrill']);
  flags(g, ['cordMade', 'hasDrill', 'fireLayBuilt']);
  g.addItem('bowDrill');
  g.questIndex = questAt('First Fire');
}

/** Fire, pottery, charcoal and clean water done: the camp quest is next. */
function toCamp(g: Game): void {
  toEmber(g);
  gathered(g, { clay: 2, sand: 1, gravel: 1, forkedStick: 1, diggingStick: 1 });
  flags(g, ['emberMade', 'fireLit', 'potDry', 'potFired', 'moundBuilt', 'kilnLit', 'charcoalMade', 'waterSafe']);
  events(g, ['fire.drill.ember', 'fire.lit', 'pottery.fired', 'charcoal.done', 'water.filter.poured', 'water.boil.done']);
  built(g, 'filter', 1, 4);
  g.questIndex = questAt('Make Camp');
}

const STATES: Record<string, () => Record<string, unknown>> = {
  fresh: () => new Game().snapshot() as unknown as Record<string, unknown>,
  'mid-stones': () => {
    const g = new Game();
    g.gather('dryStone');
    g.gather('dryStone');
    return g.snapshot() as unknown as Record<string, unknown>;
  },
  'mid-workbench': () => {
    const g = new Game();
    for (let i = 0; i < 4; i++) g.gather('dryStone');
    gathered(g, { slab: 1 });
    g.addItem('slab');
    g.takeOut('slab');
    let s: PlacedStructure | undefined;
    for (const [x, z] of [[3, -4], [2, -2], [-2, 2], [1.5, 2.5], [-3, -1], [4, 1]]) if (!s) s = g.placeBlueprint('workbench', x, z).structure;
    if (!s) throw new Error('no open ground for the workbench');
    g.fillSpot(s.id, 0);
    g.fillSpot(s.id, 1);
    return g.snapshot() as unknown as Record<string, unknown>;
  },
  'at-ember': () => {
    const g = new Game();
    toEmber(g);
    g.checkQuests();
    return g.snapshot() as unknown as Record<string, unknown>;
  },
  'make-camp': () => {
    const g = new Game();
    toCamp(g);
    g.checkQuests();
    return g.snapshot() as unknown as Record<string, unknown>;
  },
  'ch2-mid-frame': () => {
    const g = new Game();
    toCamp(g);
    built(g, 'shelter', -1, 3);
    built(g, 'storage', -3, -2);
    events(g, ['shelter.site.chosen', 'shelter.frame.built', 'shelter.roof.covered', 'shelter.wind.blocked']);
    gathered(g, { pole: 3, greenBranch: 5, twigs: 7, fibers: 9 });
    const fill = BLUEPRINTS.leanTo.spots.map((sp, i) => (i < 2 ? sp.accepts[0] : null));
    built(g, 'leanTo', 4, 4, fill);
    g.questIndex = questAt('Build the Frame');
    const snap = g.snapshot() as unknown as Record<string, unknown>;
    objectivesDone(snap);
    return snap;
  },
  'rain-tested': () => {
    const g = new Game();
    toCamp(g);
    built(g, 'storage', -3, -2);
    gathered(g, { pole: 3, greenBranch: 5, twigs: 7, fibers: 9, bark: 3, leafLitter: 3, dryGrass: 5 });
    built(g, 'leanTo', 4, 4);
    built(g, 'drainage', 4, 4);
    events(g, ['shelter.frame.braced', 'shelter.load.shared', 'shelter.frame.built', 'shelter.roof.covered', 'shelter.rain.begin', 'shelter.roof.sheds']);
    flags(g, ['shelterTested', 'finale']);
    g.questIndex = QUESTS.length;
    const snap = g.snapshot() as unknown as Record<string, unknown>;
    objectivesDone(snap);
    return snap;
  },
  'pre-objectives': () => {
    const snap = STATES['mid-workbench']();
    for (const k of ['objectives', 'story', 'assist', 'shelterTest', 'env', 'fire', 'water', 'food', 'guide', 'drops', 'packUpgrades', 'toolUses', 'held', 'living', 'events', 'resources']) delete snap[k];
    return snap;
  },
  'pre-quests-version': () => {
    const snap = STATES['make-camp']();
    delete snap.questsVersion;
    snap.questIndex = 2;
    return snap;
  },
};

describe.skipIf(!run)('generate v1 save fixtures', () => {
  it('writes every fixture', () => {
    mkdirSync(OUT, { recursive: true });
    for (const [name, make] of Object.entries(STATES)) {
      const snap = make();
      // Fixed numbers so the files do not churn if someone regenerates them.
      snap.time = 600;
      writeFileSync(`${OUT}/${name}.json`, `${JSON.stringify(snap, null, 1)}\n`);
    }
  });
});
