// Step-by-step crafting guidance (docs/SCIENCE.md, plan part C).
//
// A Guide is a list of steps the PLAYER performs; the guide never crafts,
// places or consumes anything itself. Each step is an explicit state: it is
// complete when `validate` passes, and a reported failure can send the guide
// back to an earlier step (e.g. a wobbling support → reposition supports).
//
// Physical interaction systems talk to the guide through two small calls on
// `game.guide` (a GuideTracker):
//   mark('workbench.supports.placed')         a physical sub-step happened
//   fail('support.unstable', 'the left one')  a specific mistake happened
// Before any mark arrives for a guide, steps fall back to the plain game
// state (structures, satchel, events), so the guide works with the current
// pinch-to-fill building too.

import { BLUEPRINTS, type StructureKind } from './blueprint.js';
import type { Game } from './game.js';
import type { ItemId } from './items.js';
import type { ScienceEventId } from './science-events.js';

// ------------------------------------------------------------- failures

/** Every specific mistake an interaction can report, with its correction. */
export const GUIDE_FAILURES = {
  'site.uneven': 'The ground here is uneven. Find a flat, open patch.',
  'site.onBank': 'This is the soft stream bank. Move back onto firm, dry ground.',
  'site.crowded': 'Too close to trees or another structure. Give it room.',
  'site.overhang': 'Branches hang over this spot. Fire needs open sky above it.',
  'site.litter': 'Dry leaves lie around this spot. Clear the ground to bare earth first.',
  'site.lowGround': 'This hollow collects cold air and rainwater. Pick slightly higher ground.',
  'site.deadBranches': 'Dead branches hang overhead. Never sleep under them.',
  'support.tooFar': 'That support is too far out; the slab will not reach it. Move it closer to the others.',
  'support.tooClose': 'Two supports are too close together. Spread them into a wide triangle.',
  'support.notTriangle': 'The supports are in a line. Set them as a triangle so the slab cannot tip.',
  'support.unstable': 'A support wobbles under the slab. Reseat it on firm ground or move it under the slab.',
  'slab.notOnSupports': 'The slab is not resting on all three supports.',
  'slab.offCentre': 'The slab is off-centre: its middle is outside the triangle of supports.',
  'slab.tilted': 'The slab tilts. Lower the high side or swap a support for a shorter one.',
  'stone.wet': 'That stone is from the stream. Trapped water can make it burst in a fire. Use a dry one.',
  'ring.gap': 'The ring has a gap. Close it so embers cannot roll out.',
  'opening.wrongWay': 'The opening faces away from the breeze. Turn it towards the wind so air reaches the base.',
  'tinder.damp': 'That tinder is damp. It will soak up the ember’s heat. Use bone-dry, fluffy material.',
  'fuel.tooBig': 'Logs that big will smother a young flame. Start with thin twigs.',
  'fuel.tooTight': 'The fuel is packed too tight. Leave gaps so air can get in.',
  'tripod.splayed': 'The legs are spread too wide and will slide out. Bring the feet closer.',
  'tripod.unstable': 'The tripod sways. Push the legs into the ground and cross them at the top.',
  'cord.tooLoose': 'The cord is loose. Pull each wrap tight before the next.',
  'cord.tooTight': 'The string is too tight; the bow is bent too far before you draw. Let it out a little.',
  'filter.noSupport': 'There is nothing under the sand. Put the cloth screen in first, at the bottom.',
  'filter.layersWrongOrder': 'The layers are in the wrong order. Bottom to top: cloth, charcoal, sand, gravel.',
  'water.notBoiled': 'Filtered water looks clear but can still carry microbes. Boil it before you drink.',
  'frame.tooFlat': 'The roof is too flat. Rain will soak in. Lean the ribs more steeply.',
  'roof.layersReversed': 'The cover is layered upside down. Start at the bottom and overlap each layer from above.',
  'bed.tooThin': 'The bed is too thin to stop the ground stealing your heat. Pile it thicker.',
  'opening.intoWind': 'The opening faces into the wind. Turn your back wall to it.',
  'clay.tooDry': 'The clay is too dry and cracks as you work it. Add a little water.',
  'clay.stones': 'There are pebbles in the clay. Pick them out, or the pot will crack around them.',
  'clay.noTemper': 'Pure clay shrinks and cracks as it dries. Knead in some sand first.',
  'pot.wallsUneven': 'The walls are uneven. Thin parts dry first and crack. Even them out.',
  'pot.stillWet': 'The pot is still damp. In the fire, that water turns to steam and bursts it. Let it dry longer.',
  'pot.cracked': 'The pot cracked in the fire. Did it dry fully, and was there enough sand in it?',
  'branch.dead': 'That branch is dead and dry. It will snap, not bend. Choose a living, green one.',
  'bow.uneven': 'One limb is thicker than the other and will bend unevenly. Shave the stiff side.',
  'bow.overdrawn': 'You drew too far. Wood can only bend so much before it breaks.',
  'twist.sameDirection': 'Both hands twist the same way, so the cord just spins. Roll them in opposite directions.',
  'cord.unravels': 'The cord unravels. Twist each strand one way, then wrap the strands the other way.',
  'knap.crushed': 'The edge crushed instead of flaking. Strike closer to the edge, at a glancing angle.',
  'knap.miss': 'You missed the edge. Aim for a spot right at the rim of the stone.',
  'knap.angleTooSteep': 'The edge is too blunt to flake. Find a spot where the angle is sharper than a right angle.',
  'knap.coarseStone': 'This coarse, grainy stone crumbles. Look for dark, smooth, glassy stone.',
  'axe.headLoose': 'The head slips in the handle. Seat it tighter in the split before you lash it.',
  'swing.glancing': 'The blow glanced off. Hit with the edge square to the wood.',
  'swing.tooWeak': 'Too gentle to bite. Swing faster; speed matters more than force.',
  'bench.wrongMotion': 'That is not the motion this step needs. Watch the hand cue on the bench.',
  'bench.missingParts': 'Some parts are missing. The bench panel shows what you still need.',
} as const;

export type GuideFailureCode = keyof typeof GUIDE_FAILURES;

export const isGuideFailure = (code: string): code is GuideFailureCode => code in GUIDE_FAILURES;

// -------------------------------------------------------------- marks

/** Physical sub-steps the interaction systems report with `game.guide.mark()`. */
export const GUIDE_MARKS = [
  'workbench.site.ready',
  'workbench.supports.placed',
  'workbench.slab.aligned',
  'workbench.push.stable',
  'firepit.site.ready',
  'firepit.ring.closed',
  'firepit.opening.set',
  'firepit.tinder.placed',
  'firepit.kindling.placed',
  'firepit.fuel.placed',
  'filter.tripod.standing',
  'filter.tripod.lashed',
  'shelter.ribs.set',
  'pot.clay.kneaded',
  'pot.clay.tempered',
  'pot.shaped',
  'bow.shaped',
  'bow.strung',
  'bow.braced',
  'cord.strands',
  'cord.twisted',
  'knap.platform',
  'axe.head.seated',
  'axe.lashed',
  'bowdrill.board.set',
  'bowdrill.notched',
  'bowdrill.spindle.fitted',
  'bowdrill.strung',
  'bowdrill.tested',
  'knife.split',
  'knife.seated',
  'knife.lashed',
] as const;

export type GuideMark = (typeof GUIDE_MARKS)[number];

// ------------------------------------------------------------- shapes

export type GuideAction =
  | 'gather'
  | 'choose'
  | 'place'
  | 'lift'
  | 'push'
  | 'layer'
  | 'twist'
  | 'bend'
  | 'strike'
  | 'lash'
  | 'swing'
  | 'shape'
  | 'wait'
  | 'fire'
  | 'draw'
  | 'craft';

export type HandDiagram = 'twoHandLift' | 'push' | 'twist' | 'strike' | 'wrap' | 'bend' | 'draw' | 'place' | 'swing';

export interface GuideVisual {
  /** Show the blueprint ghost for this structure. */
  ghost?: StructureKind;
  /** Snap-spot indices to highlight on that structure. */
  highlightSpots?: number[];
  handDiagram?: HandDiagram;
}

export interface GuideContext {
  game: Game;
  marks: ReadonlySet<string>;
  /** True once any mark has been reported for this guide: legacy fallbacks stop applying. */
  physical: boolean;
}

export interface GuideStep {
  id: string;
  /** Short verb sentence for the card. */
  title: string;
  /** What you need on hand for this step (shown as chips; never consumed by the guide). */
  materials: Partial<Record<ItemId, number>>;
  action: GuideAction;
  /** The direct instruction: hint level 3. */
  instruction: string;
  /** The science behind the step: hint level 1, and the card's science line. */
  science: string;
  /** Where or what to look for: hint level 2. */
  place: string;
  /** Set when the science line is a rule of thumb rather than settled fact. */
  uncertain?: string;
  scienceEvent?: ScienceEventId;
  /** The mark that completes this step physically, if any. */
  mark?: GuideMark;
  validate: (c: GuideContext) => boolean;
  success: string;
  /** Mistakes likely at this step; `goTo` sends the guide back to that step id. */
  failures: Array<{ code: GuideFailureCode; goTo?: string }>;
  visual?: GuideVisual;
  /** Cues for the UI when this step completes. */
  onComplete?: { sound?: 'complete'; notebook?: boolean; roadmap?: boolean };
}

export interface Guide {
  id: string;
  name: string;
  goal: { structure?: StructureKind; item?: ItemId };
  /** Holding one of these suggests this guide. */
  keyItems: ItemId[];
  steps: GuideStep[];
}

// ------------------------------------------------------------ helpers

const STONES: ItemId[] = ['dryStone', 'wetStone', 'flint'];
const have = (g: Game, id: ItemId): number => g.count(id) + (g.held === id ? 1 : 0);
const haveAny = (g: Game, ids: ItemId[]): number => ids.reduce((n, id) => n + have(g, id), 0);
const ever = (g: Game, id: ItemId): boolean => g.gatheredCount(id) > 0 || have(g, id) > 0;
const site = (g: Game, kind: StructureKind) => g.structures.find((s) => s.kind === kind);
const filled = (g: Game, kind: StructureKind, idx: number[]): boolean =>
  g.structures.some((s) => s.kind === kind && idx.every((i) => s.spots[i] != null));
const built = (g: Game, kind: StructureKind): boolean => g.hasStructure(kind);

/** Done by the physical mark, or (before any mark arrived) by the legacy game state. */
const either =
  (mark: GuideMark, legacy: (g: Game) => boolean) =>
  (c: GuideContext): boolean =>
    c.marks.has(mark) || (!c.physical && legacy(c.game));

// ------------------------------------------------------------- guides

const SITE_FAILS: GuideStep['failures'] = [{ code: 'site.uneven' }, { code: 'site.onBank' }, { code: 'site.crowded' }];

export const GUIDES: Guide[] = [
  {
    id: 'workbench',
    name: 'Workbench',
    goal: { structure: 'workbench' },
    keyItems: ['slab', 'board'],
    steps: [
      {
        id: 'gather',
        title: 'Gather a flat top and three supports',
        materials: { slab: 1, dryStone: 3 },
        action: 'gather',
        instruction: 'Collect one flat slab (or board) and three stones or forked sticks as supports.',
        science: 'A table needs a flat, rigid top and supports that carry its weight down to the ground.',
        place: 'Flat stone slabs break off on rocky ridges; stones lie in sunny clearings.',
        validate: (c) =>
          built(c.game, 'workbench') ||
          !!site(c.game, 'workbench') ||
          (haveAny(c.game, ['slab', 'board']) >= 1 && haveAny(c.game, [...STONES, 'forkedStick']) >= 3),
        success: 'You have a top and three supports.',
        failures: [],
      },
      {
        id: 'site',
        title: 'Choose a firm, open spot',
        materials: {},
        action: 'choose',
        mark: 'workbench.site.ready',
        instruction: 'Pick flat, dry ground away from the stream and trees, near where you will make fire.',
        science: 'Soft or sloping ground lets supports sink or slide, so a load shifts over time.',
        place: BLUEPRINTS.workbench.groundAdvice,
        validate: either('workbench.site.ready', (g) => !!site(g, 'workbench')),
        success: 'Good ground: flat and firm.',
        failures: SITE_FAILS,
        visual: { ghost: 'workbench' },
      },
      {
        id: 'supports',
        title: 'Set three supports in a triangle',
        materials: { dryStone: 3 },
        action: 'place',
        mark: 'workbench.supports.placed',
        instruction: 'Place the three supports in a wide triangle, a little closer together than the slab is wide.',
        science: 'Three points always lie on one plane, so three supports can never rock. Four can.',
        place: 'Use the glowing spots: one at each corner of the triangle.',
        scienceEvent: 'build.workbench.done',
        validate: either('workbench.supports.placed', (g) => filled(g, 'workbench', [0, 1, 2]) || built(g, 'workbench')),
        success: 'Three supports, evenly spread.',
        failures: [{ code: 'support.tooFar' }, { code: 'support.tooClose' }, { code: 'support.notTriangle' }],
        visual: { ghost: 'workbench', highlightSpots: [0, 1, 2], handDiagram: 'place' },
      },
      {
        id: 'slab',
        title: 'Lift the slab and lay it on top',
        materials: { slab: 1 },
        action: 'lift',
        mark: 'workbench.slab.aligned',
        instruction: 'Lift the slab with both hands, line it up with the ghost, and lower it onto all three supports.',
        science: 'The slab stays put when its centre of mass sits inside the triangle the supports make.',
        place: 'Line the slab up with the ghost outline above the supports.',
        validate: either('workbench.slab.aligned', (g) => built(g, 'workbench')),
        success: 'The slab sits on all three supports.',
        failures: [{ code: 'slab.notOnSupports' }, { code: 'slab.offCentre' }, { code: 'slab.tilted' }],
        visual: { ghost: 'workbench', handDiagram: 'twoHandLift' },
      },
      {
        id: 'push',
        title: 'Push down on the edges to test it',
        materials: {},
        action: 'push',
        mark: 'workbench.push.stable',
        instruction: 'Press down on each edge of the slab. If it rocks, the guide will tell you which support to fix.',
        science: 'Pushing an edge moves the load towards that side. If the force falls outside the support triangle, it tips.',
        place: 'Push near each corner, over each support in turn.',
        scienceEvent: 'build.workbench.stable',
        validate: either('workbench.push.stable', (g) => built(g, 'workbench')),
        success: 'Rock solid. Nothing moves.',
        failures: [
          { code: 'support.unstable', goTo: 'supports' },
          { code: 'slab.offCentre', goTo: 'slab' },
        ],
        visual: { handDiagram: 'push' },
      },
      {
        id: 'done',
        title: 'Workbench finished',
        materials: {},
        action: 'craft',
        instruction: 'Your workbench is ready. Stand at it to twist cord and build tools.',
        science: 'A stable base turns shaky handwork into precise craft: the bench takes the force, not your hands.',
        place: 'Stand within reach of the bench to craft.',
        validate: (c) => built(c.game, 'workbench'),
        success: 'Workbench complete! A new entry is in your notebook.',
        failures: [],
        onComplete: { sound: 'complete', notebook: true, roadmap: true },
      },
    ],
  },
  {
    id: 'firePit',
    name: 'Fire pit and fire lay',
    goal: { structure: 'firePit' },
    keyItems: ['dryStone', 'flint'],
    steps: [
      {
        id: 'gather',
        title: 'Collect four dry stones',
        materials: { dryStone: 4 },
        action: 'gather',
        instruction: 'Pick up four dry, sun-warmed stones. Leave the dark, wet stream stones alone.',
        science: 'Stones from water hold moisture in their pores; heated fast, it turns to steam and can crack them.',
        place: 'Dry stones lie in sunny clearings, away from the stream bed.',
        validate: (c) => !!site(c.game, 'firePit') || haveAny(c.game, ['dryStone', 'flint']) >= 4,
        success: 'Four dry stones.',
        failures: [{ code: 'stone.wet' }],
      },
      {
        id: 'site',
        title: 'Find bare ground with open sky',
        materials: {},
        action: 'choose',
        mark: 'firepit.site.ready',
        instruction: 'Choose open ground with no branches overhead. Scrape away dry leaves to bare earth.',
        science: 'Anything flammable nearby can reach its ignition temperature from radiant heat or a stray spark.',
        place: BLUEPRINTS.firePit.groundAdvice,
        scienceEvent: 'build.firepit.litter',
        validate: either('firepit.site.ready', (g) => !!site(g, 'firePit')),
        success: 'Clear ground, open sky.',
        failures: [...SITE_FAILS, { code: 'site.overhang' }, { code: 'site.litter' }],
        visual: { ghost: 'firePit' },
      },
      {
        id: 'ring',
        title: 'Close a ring of stones',
        materials: { dryStone: 3 },
        action: 'place',
        mark: 'firepit.ring.closed',
        instruction: 'Set the stones in a tight ring with no gaps.',
        science: 'The ring contains embers and blocks wind at ground level, so the fire burns where you want it.',
        place: 'Fill the glowing spots around the first stone.',
        validate: either('firepit.ring.closed', (g) => built(g, 'firePit')),
        success: 'The ring is closed.',
        failures: [{ code: 'ring.gap' }, { code: 'stone.wet' }],
        visual: { ghost: 'firePit', highlightSpots: [0, 1, 2], handDiagram: 'place' },
      },
      {
        id: 'opening',
        title: 'Leave an air gap towards the wind',
        materials: {},
        action: 'place',
        mark: 'firepit.opening.set',
        instruction: 'Leave a small gap in the lay on the side the breeze comes from.',
        science: 'Fire needs oxygen. A gap facing the breeze lets fresh air reach the base of the fire.',
        place: 'Feel which way the wind blows, or watch which way smoke drifts.',
        uncertain: 'Which side to leave open is a rule of thumb; in strong wind, shelter the fire instead.',
        validate: either('firepit.opening.set', (g) => built(g, 'firePit')),
        success: 'Air can reach the base.',
        failures: [{ code: 'opening.wrongWay' }],
      },
      {
        id: 'tinder',
        title: 'Make a tinder nest',
        materials: { dryGrass: 2 },
        action: 'place',
        mark: 'firepit.tinder.placed',
        instruction: 'Fluff dry grass into a loose nest in the middle of the ring.',
        science: 'Fine, dry fibres have a huge surface for their mass, so a tiny ember heats them to ignition quickly.',
        place: 'Dry grass grows where sun reaches the ground: open meadows.',
        scienceEvent: 'fire.ember.damp',
        validate: either('firepit.tinder.placed', (g) => g.flag('fireLayBuilt') || g.flag('fireLit')),
        success: 'A dry, airy nest.',
        failures: [{ code: 'tinder.damp' }],
        visual: { handDiagram: 'place' },
      },
      {
        id: 'kindling',
        title: 'Lean twigs around it in a cone',
        materials: { twigs: 3 },
        action: 'place',
        mark: 'firepit.kindling.placed',
        instruction: 'Lean thin twigs around the nest like a teepee, with gaps between them.',
        science: 'Fire climbs a ladder of fuel: each size heats the next. Thin twigs catch from the tinder flame.',
        place: 'Fallen grey twigs lie under the trees.',
        scienceEvent: 'fire.fuel.toobig',
        validate: either('firepit.kindling.placed', (g) => g.flag('fireLayBuilt') || g.flag('fireLit')),
        success: 'Kindling ready.',
        failures: [{ code: 'fuel.tooBig' }, { code: 'fuel.tooTight' }],
      },
      {
        id: 'fuel',
        title: 'Add logs outside, loosely',
        materials: { logs: 2 },
        action: 'place',
        mark: 'firepit.fuel.placed',
        instruction: 'Lean logs outside the twigs, leaving gaps for air.',
        science: 'Big fuel burns longest but needs a strong fire under it and air between the pieces.',
        place: 'Fallen trunks give dry logs.',
        scienceEvent: 'fire.fuel.none',
        validate: either('firepit.fuel.placed', (g) => g.flag('fireLayBuilt') || g.flag('fireLit')),
        success: 'Your fire lay is ready for an ember.',
        failures: [{ code: 'fuel.tooTight' }],
        onComplete: { sound: 'complete' },
      },
    ],
  },
  {
    id: 'filter',
    name: 'Water filter',
    goal: { structure: 'filter' },
    keyItems: ['forkedStick'],
    steps: [
      {
        id: 'gather',
        title: 'Gather the filter parts',
        materials: { forkedStick: 3, cord: 1, cane: 1, cloth: 1, charcoal: 1, sand: 1, gravel: 1 },
        action: 'gather',
        instruction: 'Collect three forked sticks, cord, a hollow cane, cloth, charcoal, sand and gravel.',
        science: 'Each layer catches particles of a different size, so a filter needs several materials.',
        place: 'Forked sticks at the Lightning Glade; sand, gravel and canes at the stream bend; cloth in the ruins.',
        validate: (c) =>
          !!site(c.game, 'filter') ||
          (have(c.game, 'forkedStick') >= 3 &&
            ['cane', 'cloth', 'charcoal', 'sand', 'gravel'].every((id) => have(c.game, id as ItemId) > 0)),
        success: 'Everything for the filter.',
        failures: [],
      },
      {
        id: 'tripod',
        title: 'Stand three forked sticks as a tripod',
        materials: { forkedStick: 3 },
        action: 'place',
        mark: 'filter.tripod.standing',
        instruction: 'Push three forked sticks into the ground and cross their forks at the top.',
        science: 'A tripod is stable on any ground for the same reason as the workbench: three points make one plane.',
        place: 'Firm ground near the stream, but off the soft bank.',
        validate: either('filter.tripod.standing', (g) => filled(g, 'filter', [0, 1]) || built(g, 'filter')),
        success: 'The tripod stands.',
        failures: [{ code: 'tripod.splayed' }, { code: 'tripod.unstable' }, ...SITE_FAILS],
        visual: { ghost: 'filter', highlightSpots: [0, 1], handDiagram: 'place' },
      },
      {
        id: 'lash',
        title: 'Lash the top with cord',
        materials: { cord: 1 },
        action: 'lash',
        mark: 'filter.tripod.lashed',
        instruction: 'Wrap cord tightly around the crossed forks several times.',
        science: 'Each wrap adds friction between cord and wood, so many tight wraps hold far more than one.',
        place: 'Wrap where the three forks cross.',
        scienceEvent: 'tool.lash.hold',
        validate: either('filter.tripod.lashed', (g) => filled(g, 'filter', [0, 1]) || built(g, 'filter')),
        success: 'Tight and firm.',
        failures: [{ code: 'cord.tooLoose' }],
        visual: { handDiagram: 'wrap' },
      },
      {
        id: 'spout',
        title: 'Hang the cane as a spout',
        materials: { cane: 1 },
        action: 'place',
        instruction: 'Hang the hollow cane under the tripod so water can run out of its bottom.',
        science: 'A hollow tube channels water where you want it; gravity does the pumping.',
        place: 'Canes grow by the water at the stream bend.',
        validate: (c) => filled(c.game, 'filter', [2]) || built(c.game, 'filter'),
        success: 'The spout hangs below.',
        failures: [],
        visual: { ghost: 'filter', highlightSpots: [2] },
      },
      {
        id: 'cloth',
        title: 'Put the cloth screen in first',
        materials: { cloth: 1 },
        action: 'layer',
        instruction: 'Lay the cloth at the bottom of the filter, over the spout.',
        science: 'Every layer needs support. The cloth holds the grains above it in place.',
        place: 'Woven cloth only survives where people once lived: the ruins.',
        scienceEvent: 'water.filter.washout',
        validate: (c) => filled(c.game, 'filter', [3]) || built(c.game, 'filter'),
        success: 'The screen is in.',
        failures: [{ code: 'filter.noSupport' }],
        visual: { ghost: 'filter', highlightSpots: [3], handDiagram: 'place' },
      },
      {
        id: 'layers',
        title: 'Layer charcoal, then sand, then gravel',
        materials: { charcoal: 1, sand: 1, gravel: 1 },
        action: 'layer',
        instruction: 'Add charcoal on the cloth, sand on the charcoal, and gravel on top.',
        science: 'Water meets coarse gravel first, then fine sand, so the fine layer does not clog. Charcoal binds some smells and tastes.',
        place: 'Charcoal from your mound; sand and gravel where the stream bends.',
        scienceEvent: 'water.filter.clog',
        validate: (c) => built(c.game, 'filter'),
        success: 'Coarse on top, fine below. The filter is built.',
        failures: [{ code: 'filter.layersWrongOrder' }],
        visual: { ghost: 'filter', highlightSpots: [4, 5, 6], handDiagram: 'place' },
      },
      {
        id: 'boil',
        title: 'Filter, then boil',
        materials: { pot: 1 },
        action: 'fire',
        instruction: 'Pour stream water through the filter into your pot, then bring it to a rolling boil.',
        science: 'Filtering removes particles, not microbes. Boiling kills microbes but does not remove particles. You need both.',
        place: 'Set the pot of filtered water in your fire.',
        scienceEvent: 'water.boil.done',
        validate: (c) => c.game.flag('waterSafe') || c.game.hasEvent('water.boil.done'),
        success: 'Clear and disinfected: safe to drink.',
        failures: [{ code: 'water.notBoiled' }],
        onComplete: { sound: 'complete', notebook: true, roadmap: true },
      },
    ],
  },
  {
    id: 'shelter',
    name: 'Lean-to shelter',
    goal: { structure: 'shelter' },
    keyItems: ['branch'],
    steps: [
      {
        id: 'site',
        title: 'Pick a dry, safe spot',
        materials: {},
        action: 'choose',
        instruction: 'Choose slightly raised, flat ground away from the stream with no dead branches overhead.',
        science: 'Cold air is denser and sinks into hollows, and rain runs downhill. Raised ground stays warmer and drier.',
        place: 'Look for a gentle rise in an open part of the forest.',
        scienceEvent: 'shelter.site.chosen',
        validate: (c) => c.game.hasEvent('shelter.site.chosen') || !!site(c.game, 'shelter'),
        success: 'A dry, safe spot.',
        failures: [{ code: 'site.lowGround' }, { code: 'site.deadBranches' }, ...SITE_FAILS],
        visual: { ghost: 'shelter' },
      },
      {
        id: 'ridge',
        title: 'Set a ridge pole',
        materials: { branch: 1 },
        action: 'place',
        instruction: 'Set a long branch across a low fork or rock, about waist height.',
        science: 'The ridge pole carries the roof’s weight to the ground at its two ends.',
        place: 'Long branches lie under the trees.',
        scienceEvent: 'shelter.frame.built',
        validate: (c) => !!site(c.game, 'shelter') || c.game.hasEvent('shelter.frame.built'),
        success: 'The ridge is up.',
        failures: [],
        visual: { ghost: 'shelter', handDiagram: 'twoHandLift' },
      },
      {
        id: 'ribs',
        title: 'Lean ribs steeply against it',
        materials: { branch: 2 },
        action: 'place',
        mark: 'shelter.ribs.set',
        instruction: 'Lean branches against the ridge at a steep angle, close together.',
        science: 'A steep slope sheds water before it can soak through.',
        place: 'Fill the glowing rib spots.',
        validate: either('shelter.ribs.set', (g) => filled(g, 'shelter', [0, 1]) || built(g, 'shelter')),
        success: 'A steep frame.',
        failures: [{ code: 'frame.tooFlat' }],
        visual: { ghost: 'shelter', highlightSpots: [0, 1], handDiagram: 'place' },
      },
      {
        id: 'cover',
        title: 'Cover it from the bottom up',
        materials: { twigs: 1, dryGrass: 1 },
        action: 'layer',
        instruction: 'Pile twigs and cover on the ribs, starting at the bottom so each layer overlaps the one below.',
        science: 'Layers overlapping like roof tiles keep water running downhill on the outside.',
        place: 'Twigs under the trees; dry grass or cloth for the outer cover.',
        scienceEvent: 'shelter.roof.covered',
        validate: (c) => built(c.game, 'shelter') || c.game.hasEvent('shelter.roof.covered'),
        success: 'Rain will run off.',
        failures: [{ code: 'roof.layersReversed' }],
        visual: { ghost: 'shelter', highlightSpots: [2, 3] },
      },
      {
        id: 'bed',
        title: 'Lay a thick, dry bed',
        materials: { leafLitter: 2 },
        action: 'layer',
        instruction: 'Pile dry leaves or grass inside, thicker than your hand is long.',
        science: 'Still air trapped in dry debris conducts heat poorly, so the ground cannot steal your warmth.',
        place: 'Dry leaf litter lies under the trees.',
        scienceEvent: 'shelter.bed.insulated',
        validate: (c) => c.game.hasEvent('shelter.bed.insulated'),
        success: 'A warm bed.',
        failures: [{ code: 'bed.tooThin' }],
      },
      {
        id: 'wind',
        title: 'Back the wall into the wind',
        materials: {},
        action: 'choose',
        instruction: 'Make sure the open side faces away from the wind.',
        science: 'Moving air strips away the warm layer next to your skin. Wind chill is how cold it feels, not the air temperature.',
        place: 'Watch which way smoke or leaves drift.',
        scienceEvent: 'shelter.wind.blocked',
        validate: (c) => c.game.hasEvent('shelter.wind.blocked'),
        success: 'Sheltered from the wind. Ready for the night.',
        failures: [{ code: 'opening.intoWind' }],
        onComplete: { sound: 'complete' },
      },
    ],
  },
  {
    id: 'pot',
    name: 'Clay pot',
    goal: { item: 'pot' },
    keyItems: ['clay'],
    steps: [
      {
        id: 'gather',
        title: 'Collect clay and sand',
        materials: { clay: 2, sand: 1 },
        action: 'gather',
        instruction: 'Dig two handfuls of clay and one of sand.',
        science: 'Clay is made of tiny flat mineral plates that slide past each other when wet.',
        place: 'Streams leave clay and sand where the water slows, on a bend.',
        scienceEvent: 'gather.clay',
        validate: (c) => ever(c.game, 'pot') || (have(c.game, 'clay') >= 2 && have(c.game, 'sand') >= 1),
        success: 'Clay and sand.',
        failures: [],
      },
      {
        id: 'prepare',
        title: 'Knead out the stones',
        materials: { clay: 2 },
        action: 'shape',
        mark: 'pot.clay.kneaded',
        instruction: 'Knead the clay, pick out pebbles and add a little water if it cracks.',
        science: 'Pebbles and air pockets expand differently from clay when heated and start cracks.',
        place: 'Work at your workbench.',
        validate: either('pot.clay.kneaded', (g) => ever(g, 'pot')),
        success: 'Smooth, even clay.',
        failures: [{ code: 'clay.tooDry' }, { code: 'clay.stones' }],
        visual: { handDiagram: 'twist' },
      },
      {
        id: 'temper',
        title: 'Mix in the sand',
        materials: { sand: 1 },
        action: 'shape',
        mark: 'pot.clay.tempered',
        instruction: 'Knead the sand evenly into the clay.',
        science: 'Grit (temper) gives shrinking clay a skeleton and lets water escape, so it cracks less as it dries.',
        place: 'At your workbench.',
        scienceEvent: 'pottery.untempered.crack',
        validate: either('pot.clay.tempered', (g) => ever(g, 'pot')),
        success: 'Tempered clay.',
        failures: [{ code: 'clay.noTemper' }],
      },
      {
        id: 'shape',
        title: 'Shape the pot with even walls',
        materials: {},
        action: 'shape',
        mark: 'pot.shaped',
        instruction: 'Press a hollow into the ball and pinch the walls up to an even thickness.',
        science: 'Thin parts dry and shrink faster than thick parts; the difference pulls the pot apart.',
        place: 'At your workbench.',
        validate: either('pot.shaped', (g) => ever(g, 'pot')),
        success: 'A pot shape with even walls.',
        failures: [{ code: 'pot.wallsUneven' }],
        visual: { handDiagram: 'twist' },
      },
      {
        id: 'dry',
        title: 'Let it dry completely',
        materials: { pot: 1 },
        action: 'wait',
        instruction: 'Leave the pot to dry slowly until it is pale and no longer cool to the touch.',
        science: 'Water left inside turns to steam in the fire and expands violently.',
        place: 'Leave it on the bench, out of the rain.',
        scienceEvent: 'pottery.wet.burst',
        validate: (c) => c.game.flag('potDry') || c.game.flag('potFired'),
        success: 'Bone dry.',
        failures: [{ code: 'pot.stillWet' }],
      },
      {
        id: 'fire',
        title: 'Fire it in your fire',
        materials: { pot: 1 },
        action: 'fire',
        instruction: 'Warm the pot at the edge of the fire, then set it in the hot coals.',
        science: 'Hot enough, the clay minerals change and fuse for good: clay becomes ceramic.',
        place: 'Your fire pit, once it has a bed of coals.',
        uncertain: 'Exact firing temperatures depend on the clay; the game does not state one.',
        scienceEvent: 'pottery.fired',
        validate: (c) => c.game.flag('potFired'),
        success: 'It rings when tapped: ceramic.',
        failures: [{ code: 'pot.cracked', goTo: 'temper' }],
        onComplete: { sound: 'complete', notebook: true },
      },
    ],
  },
  {
    id: 'bow',
    name: 'Bow',
    goal: { item: 'bow' },
    keyItems: ['greenBranch'],
    steps: [
      {
        id: 'select',
        title: 'Choose a living, springy branch',
        materials: { greenBranch: 1 },
        action: 'gather',
        instruction: 'Cut a straight, green branch as long as your arm span.',
        science: 'Living wood holds water that keeps its fibres flexible; dead wood is brittle and snaps.',
        place: 'Young saplings grow at the sunny edges of clearings.',
        scienceEvent: 'gather.greenwood',
        validate: (c) => ever(c.game, 'bow') || have(c.game, 'greenBranch') > 0,
        success: 'A springy branch.',
        failures: [{ code: 'branch.dead' }],
      },
      {
        id: 'shape',
        title: 'Shave the limbs to bend evenly',
        materials: { flake: 1 },
        action: 'shape',
        mark: 'bow.shaped',
        instruction: 'Bend it gently; shave the stiff side until both limbs curve the same.',
        science: 'Even limbs share the strain; a stiff spot makes the other limb bend too far and break.',
        place: 'A sharp flake shaves wood well.',
        validate: either('bow.shaped', (g) => ever(g, 'bow')),
        success: 'Both limbs bend alike.',
        failures: [{ code: 'bow.uneven' }],
        visual: { handDiagram: 'bend' },
      },
      {
        id: 'string',
        title: 'Tie on the string',
        materials: { cord: 1 },
        action: 'lash',
        mark: 'bow.strung',
        instruction: 'Tie cord to one tip, bend the bow, and tie it to the other tip.',
        science: 'The string holds the limbs slightly bent, so they already store a little energy.',
        place: 'Twist cord from plant fibres at your workbench.',
        validate: either('bow.strung', (g) => ever(g, 'bow')),
        success: 'Strung.',
        failures: [{ code: 'cord.tooLoose' }, { code: 'cord.tooTight' }],
        visual: { handDiagram: 'wrap' },
      },
      {
        id: 'tension',
        title: 'Check the string tension',
        materials: {},
        action: 'bend',
        mark: 'bow.braced',
        instruction: 'Pluck the string: it should be taut, with about a fist’s gap between string and handle.',
        science: 'Too slack and the string slaps; too tight and the wood is strained before you draw.',
        place: 'Hold it at arm’s length and look along it.',
        uncertain: 'The "fist’s gap" is a traditional rule of thumb, not a precise figure.',
        validate: either('bow.braced', (g) => ever(g, 'bow')),
        success: 'Good tension.',
        failures: [{ code: 'cord.tooTight' }, { code: 'cord.tooLoose' }],
      },
      {
        id: 'draw',
        title: 'Test draw',
        materials: { bow: 1 },
        action: 'draw',
        instruction: 'Draw the string back smoothly towards your cheek and let down gently.',
        science: 'Bending the limbs stores elastic potential energy; release turns it into the arrow’s kinetic energy.',
        place: 'Hold the bow, pull the string with your other hand.',
        scienceEvent: 'hunt.bow.drawn',
        validate: (c) => c.game.hasEvent('hunt.bow.drawn'),
        success: 'It draws and springs back. Your bow works.',
        failures: [{ code: 'bow.overdrawn' }],
        visual: { handDiagram: 'draw' },
        onComplete: { sound: 'complete' },
      },
    ],
  },
  {
    id: 'cord',
    name: 'Cordage',
    goal: { item: 'cord' },
    keyItems: ['fibers', 'vine', 'bark'],
    steps: [
      {
        id: 'gather',
        title: 'Collect stringy fibres',
        materials: { fibers: 3 },
        action: 'gather',
        instruction: 'Pull long fibres from tall plants, vines or inner bark.',
        science: 'Plant stems hold long, tough cellulose fibres that run along their length.',
        place: 'Fibre plants grow in sunny, open ground and along the stream.',
        validate: (c) => ever(c.game, 'cord') || haveAny(c.game, ['fibers', 'vine', 'bark']) >= 3,
        success: 'A bundle of fibres.',
        failures: [],
      },
      {
        id: 'strands',
        title: 'Split the bundle into two strands',
        materials: { fibers: 3 },
        action: 'twist',
        mark: 'cord.strands',
        instruction: 'Pull the bundle into two even strands.',
        science: 'Two strands let the twist lock against itself.',
        place: 'Hold the bundle in both hands.',
        validate: either('cord.strands', (g) => ever(g, 'cord')),
        success: 'Two even strands.',
        failures: [],
        visual: { handDiagram: 'twist' },
      },
      {
        id: 'twist',
        title: 'Twist the strands',
        materials: {},
        action: 'twist',
        mark: 'cord.twisted',
        instruction: 'Roll your hands in opposite directions to twist each strand tight.',
        science: 'Twisting presses fibres together; friction then shares a pull across all of them.',
        place: 'Roll it along your thigh, or twist with both hands.',
        validate: either('cord.twisted', (g) => ever(g, 'cord')),
        success: 'Tight strands.',
        failures: [{ code: 'twist.sameDirection' }],
        visual: { handDiagram: 'twist' },
      },
      {
        id: 'ply',
        title: 'Let the strands wrap together',
        materials: {},
        action: 'twist',
        instruction: 'Let the twisted strands wind around each other the opposite way.',
        science: 'Each strand wants to untwist; wrapped the opposite way, they hold each other tight.',
        place: 'Keep tension on both ends as they wrap.',
        scienceEvent: 'craft.cord',
        validate: (c) => ever(c.game, 'cord') || c.game.flag('cordMade'),
        success: 'Strong cord.',
        failures: [{ code: 'cord.unravels', goTo: 'twist' }],
        onComplete: { notebook: true },
      },
    ],
  },
  {
    id: 'knap',
    name: 'Stone flake',
    goal: { item: 'flake' },
    keyItems: ['flint'],
    steps: [
      {
        id: 'gather',
        title: 'Find a glassy stone and a hammerstone',
        materials: { flint: 1, dryStone: 1 },
        action: 'gather',
        instruction: 'Find a dark, smooth, glassy stone to flake and a round stone to strike with.',
        science: 'Fine-grained, glassy stone breaks in smooth curves (conchoidal fracture), leaving thin, sharp edges.',
        place: 'Glassy flint turns up among rocks by the water and on ridges.',
        validate: (c) => ever(c.game, 'flake') || (have(c.game, 'flint') >= 1 && have(c.game, 'dryStone') >= 1),
        success: 'A core and a hammerstone.',
        failures: [{ code: 'knap.coarseStone' }],
      },
      {
        id: 'platform',
        title: 'Find a sharp edge to strike',
        materials: {},
        action: 'choose',
        mark: 'knap.platform',
        instruction: 'Turn the core until you find an edge with an angle sharper than a right angle.',
        science: 'A flake comes off only where the force can travel through a thin enough edge.',
        place: 'Look along the rim of the stone.',
        validate: either('knap.platform', (g) => ever(g, 'flake')),
        success: 'A good striking edge.',
        failures: [{ code: 'knap.angleTooSteep' }],
      },
      {
        id: 'strike',
        title: 'Strike near the edge',
        materials: {},
        action: 'strike',
        instruction: 'Hit just inside the edge with a quick, glancing blow, aiming down through the stone.',
        science: 'A sharp blow sends a cone of force into the stone; the flake breaks off along it.',
        place: 'Hold the core firmly; keep fingers clear.',
        uncertain: 'Real knapping needs eye protection: flakes fly unpredictably.',
        scienceEvent: 'tool.knap.flake',
        validate: (c) => ever(c.game, 'flake') || c.game.hasEvent('tool.knap.flake'),
        success: 'A razor-sharp flake.',
        failures: [{ code: 'knap.crushed' }, { code: 'knap.miss' }, { code: 'knap.coarseStone', goTo: 'gather' }],
        visual: { handDiagram: 'strike' },
        onComplete: { notebook: true },
      },
    ],
  },
  {
    id: 'bowDrill',
    name: 'Bow drill (friction fire)',
    goal: { item: 'bowDrill' },
    keyItems: ['board', 'spindle'],
    steps: [
      {
        id: 'gather',
        title: 'Collect the parts',
        materials: { board: 1, spindle: 1, greenBranch: 1, cord: 1 },
        action: 'gather',
        instruction: 'A flat board, a straight dry stick, a springy green branch and a cord.',
        science: 'A bow drill is a machine: the bow turns long back-and-forth strokes into fast spinning, and friction turns that motion into heat.',
        place: 'Your satchel shows what you carry; the workbench panel shows what is missing.',
        validate: (c) => ever(c.game, 'bowDrill') || (have(c.game, 'board') >= 1 && have(c.game, 'spindle') >= 1 && have(c.game, 'greenBranch') >= 1 && have(c.game, 'cord') >= 1),
        success: 'All the parts.',
        failures: [{ code: 'bench.missingParts' }],
      },
      {
        id: 'board',
        title: 'Set the hearth board flat',
        materials: {},
        action: 'place',
        mark: 'bowdrill.board.set',
        instruction: 'Press the board down flat on the bench.',
        science: 'A board that rocks lets the spindle wander and the heat spreads out.',
        place: 'At your workbench: click (or pinch) the slab and choose the recipe.',
        validate: either('bowdrill.board.set', (g) => ever(g, 'bowDrill')),
        success: 'Done.',
        failures: [],
        visual: { handDiagram: 'push' },
      },
      {
        id: 'notch',
        title: 'Carve a pit and a notch',
        materials: {},
        action: 'shape',
        mark: 'bowdrill.notched',
        instruction: 'Scrape back and forth with an edge at the board edge.',
        science: 'Hot wood dust collects in the notch, where it can gather heat and smoulder into an ember.',
        place: 'At your workbench: click (or pinch) the slab and choose the recipe.',
        validate: either('bowdrill.notched', (g) => ever(g, 'bowDrill')),
        success: 'Done.',
        failures: [{ code: 'bench.wrongMotion' }],
        visual: { handDiagram: 'swing' },
      },
      {
        id: 'spindle',
        title: 'Fit the spindle',
        materials: {},
        action: 'place',
        mark: 'bowdrill.spindle.fitted',
        instruction: 'Press the spindle down into the pit.',
        science: 'Pressure on the spindle increases friction at its tip.',
        place: 'At your workbench: click (or pinch) the slab and choose the recipe.',
        validate: either('bowdrill.spindle.fitted', (g) => ever(g, 'bowDrill')),
        success: 'Done.',
        failures: [],
        visual: { handDiagram: 'push' },
      },
      {
        id: 'string',
        title: 'String the bow',
        materials: {},
        action: 'lash',
        mark: 'bowdrill.strung',
        instruction: 'Wrap the cord round both ends of the green branch.',
        science: 'The bow must stay springy so the cord can grip and spin the spindle.',
        place: 'At your workbench: click (or pinch) the slab and choose the recipe.',
        validate: either('bowdrill.strung', (g) => ever(g, 'bowDrill')),
        success: 'Done.',
        failures: [{ code: 'bench.wrongMotion' }],
        visual: { handDiagram: 'wrap' },
      },
      {
        id: 'test',
        title: 'Test-saw the bow',
        materials: {},
        action: 'draw',
        mark: 'bowdrill.tested',
        instruction: 'Saw the bow back and forth in long, fast strokes.',
        science: 'Faster strokes, more friction, more heat.',
        place: 'At your workbench: click (or pinch) the slab and choose the recipe.',
        validate: either('bowdrill.tested', (g) => ever(g, 'bowDrill')),
        success: 'Done.',
        failures: [],
        visual: { handDiagram: 'draw' },
      },
    ],
  },
  {
    id: 'knife',
    name: 'Flint knife',
    goal: { item: 'knife' },
    keyItems: ['flake'],
    steps: [
      {
        id: 'gather',
        title: 'Collect the parts',
        materials: { flake: 1, spindle: 1, cord: 1 },
        action: 'gather',
        instruction: 'A sharp flake, a straight stick for the handle, and cord.',
        science: 'A handle lets you push harder and keeps your fingers off the edge.',
        place: 'Your satchel shows what you carry; the workbench panel shows what is missing.',
        validate: (c) => ever(c.game, 'knife') || (have(c.game, 'flake') >= 1 && have(c.game, 'spindle') >= 1 && have(c.game, 'cord') >= 1),
        success: 'All the parts.',
        failures: [{ code: 'bench.missingParts' }],
      },
      {
        id: 'split',
        title: 'Split the handle end',
        materials: {},
        action: 'strike',
        mark: 'knife.split',
        instruction: 'Tap sharply on the stick end to open a short split.',
        science: 'Wood splits along its grain; a short split grips without breaking the handle.',
        place: 'At your workbench: click (or pinch) the slab and choose the recipe.',
        validate: either('knife.split', (g) => ever(g, 'knife')),
        success: 'Done.',
        failures: [{ code: 'bench.wrongMotion' }],
        visual: { handDiagram: 'strike' },
      },
      {
        id: 'seat',
        title: 'Seat the flake',
        materials: {},
        action: 'place',
        mark: 'knife.seated',
        instruction: 'Press the flake into the split.',
        science: 'The wood springs back and clamps the stone.',
        place: 'At your workbench: click (or pinch) the slab and choose the recipe.',
        validate: either('knife.seated', (g) => ever(g, 'knife')),
        success: 'Done.',
        failures: [],
        visual: { handDiagram: 'push' },
      },
      {
        id: 'lash',
        title: 'Lash it tight',
        materials: {},
        action: 'lash',
        mark: 'knife.lashed',
        instruction: 'Wrap the cord tightly around the split.',
        science: 'Wraps stop the split opening; friction holds the cord.',
        place: 'At your workbench: click (or pinch) the slab and choose the recipe.',
        validate: either('knife.lashed', (g) => ever(g, 'knife')),
        success: 'Done.',
        failures: [{ code: 'cord.tooLoose' }],
        visual: { handDiagram: 'wrap' },
      },
    ],
  },
  {
    id: 'axe',
    name: 'Stone axe',
    goal: { item: 'axe' },
    keyItems: ['spindle'],
    steps: [
      {
        id: 'gather',
        title: 'Collect a head, handle and cord',
        materials: { dryStone: 1, spindle: 1, cord: 2 },
        action: 'gather',
        instruction: 'You need a hard stone with an edge, a stout straight stick and two lengths of cord.',
        science: 'A tool is a system: a hard, heavy head, a long handle for speed, and a binding that transfers the force.',
        place: 'Stones in clearings, straight sticks at the glade, cord from your workbench.',
        validate: (c) =>
          ever(c.game, 'axe') || (have(c.game, 'dryStone') >= 1 && have(c.game, 'spindle') >= 1 && have(c.game, 'cord') >= 2),
        success: 'All the parts.',
        failures: [],
      },
      {
        id: 'seat',
        title: 'Seat the head in the handle',
        materials: {},
        action: 'place',
        mark: 'axe.head.seated',
        instruction: 'Split the top of the handle a little and wedge the stone in tightly.',
        science: 'The handle’s wood squeezes the stone; friction holds it while the cord stops the split spreading.',
        place: 'At your workbench.',
        validate: either('axe.head.seated', (g) => ever(g, 'axe')),
        success: 'Seated firmly.',
        failures: [{ code: 'axe.headLoose' }],
      },
      {
        id: 'lash',
        title: 'Lash it tight',
        materials: { cord: 2 },
        action: 'lash',
        mark: 'axe.lashed',
        instruction: 'Wrap the cord in a cross pattern around head and handle, pulling each wrap tight.',
        science: 'Each wrap adds friction; crossing the wraps stops the head twisting.',
        place: 'At your workbench.',
        scienceEvent: 'tool.lash.hold',
        validate: either('axe.lashed', (g) => ever(g, 'axe')),
        success: 'Lashed tight.',
        failures: [{ code: 'cord.tooLoose' }, { code: 'axe.headLoose', goTo: 'seat' }],
        visual: { handDiagram: 'wrap' },
      },
      {
        id: 'swing',
        title: 'Test it: split a log',
        materials: { axe: 1 },
        action: 'swing',
        instruction: 'Swing the axe so the edge strikes the end of a log square-on, along the grain.',
        science: 'A longer handle moves the head faster; kinetic energy (½mv²) grows with the square of speed. The edge acts as a wedge.',
        place: 'Fallen logs lie through the forest.',
        scienceEvent: 'tool.wedge.split',
        validate: (c) => c.game.hasEvent('tool.wedge.split'),
        success: 'Split clean along the grain.',
        failures: [{ code: 'swing.glancing' }, { code: 'swing.tooWeak' }],
        visual: { handDiagram: 'swing' },
        onComplete: { sound: 'complete', notebook: true },
      },
    ],
  },
];

export const GUIDE_BY_ID: Record<string, Guide> = Object.fromEntries(GUIDES.map((g) => [g.id, g]));

// ------------------------------------------------------------ tracker

export interface GuideView {
  guide: Guide;
  index: number;
  step: GuideStep;
  /** The last reported failure on this step, if not yet fixed. */
  failure?: { code: GuideFailureCode; text: string };
  complete: boolean;
}

export interface GuideSave {
  marks: string[];
  failures: Record<string, number>;
  pinned: string | null;
  hidden: boolean;
}

export interface SelectContext {
  /** Items lying within reach of the player. */
  nearby?: readonly ItemId[];
}

/**
 * Chooses the guide that fits what the player is doing and tracks progress
 * through it. Pure game logic: never changes the satchel or the world.
 */
export class GuideTracker {
  readonly marks = new Set<string>();
  /** Failure counts per `guide.step`. */
  readonly failures = new Map<string, number>();
  pinned: string | null = null;
  /** Toggled by the player; the card is optional. */
  hidden = false;
  private lastFailure = new Map<string, GuideFailureCode>();
  private physicalGuides = new Set<string>();

  constructor(private game: Game) {}

  /** Pins a guide so it stays active regardless of context (null clears). */
  pin(id: string | null): void {
    if (id !== null && !GUIDE_BY_ID[id]) throw new Error(`Unknown guide ${id}`);
    this.pinned = id;
  }

  /** Picks the guide for the current context; see the priority below. */
  select(ctx: SelectContext = {}): Guide | null {
    const g = this.game;
    const unfinished = (guide: Guide) => !this.isComplete(guide);
    // 1. A guide the player chose.
    if (this.pinned) {
      const p = GUIDE_BY_ID[this.pinned];
      if (unfinished(p)) return p;
    }
    // 2. The current quest step's guide.
    const step = g.currentStep()?.step;
    if (step?.guide) {
      const q = GUIDE_BY_ID[step.guide];
      if (q && unfinished(q)) return q;
    }
    if (step) {
      const t = step.target;
      const byTarget = GUIDES.find(
        (gd) => unfinished(gd) && (('structure' in t && gd.goal.structure === t.structure) || (gd.goal.item && t.items.includes(gd.goal.item))),
      );
      if (byTarget) return byTarget;
    }
    // 3. Something in progress: a placed but unfinished structure, or a guide with failures.
    const inProgress = GUIDES.find(
      (gd) => gd.goal.structure && unfinished(gd) && g.structures.some((s) => s.kind === gd.goal.structure && !s.complete),
    );
    if (inProgress) return inProgress;
    // 4. What you are holding.
    if (g.held) {
      const held = GUIDES.find((gd) => unfinished(gd) && gd.keyItems.includes(g.held!));
      if (held) return held;
    }
    // 5. What lies nearby that the next step needs.
    if (ctx.nearby?.length) {
      const near = GUIDES.find((gd) => {
        if (!unfinished(gd)) return false;
        const v = this.view(gd);
        return Object.keys(v.step.materials).some((id) => ctx.nearby!.includes(id as ItemId));
      });
      if (near) return near;
    }
    return null;
  }

  /** The current step of `guide`: the first step whose state is not yet reached. */
  view(guide: Guide): GuideView {
    const c = this.context(guide);
    let index = guide.steps.findIndex((s) => !s.validate(c));
    const complete = index < 0;
    if (complete) index = guide.steps.length - 1;
    const step = guide.steps[index];
    const code = this.lastFailure.get(`${guide.id}.${step.id}`);
    return {
      guide,
      index,
      step,
      complete,
      failure: code && !complete ? { code, text: GUIDE_FAILURES[code] } : undefined,
    };
  }

  /** The active guide and step, or null when nothing applies. */
  current(ctx: SelectContext = {}): GuideView | null {
    const guide = this.select(ctx);
    return guide ? this.view(guide) : null;
  }

  isComplete(guide: Guide): boolean {
    const c = this.context(guide);
    return guide.steps.every((s) => s.validate(c));
  }

  /** Records a physical sub-step. Returns the guide's new view. */
  mark(mark: GuideMark): GuideView | null {
    const guide = GUIDES.find((gd) => gd.steps.some((s) => s.mark === mark));
    if (!guide) throw new Error(`Unknown guide mark ${mark}`);
    this.physicalGuides.add(guide.id);
    const before = this.view(guide);
    this.marks.add(mark);
    // A completed step clears its stale failure.
    const step = guide.steps.find((s) => s.mark === mark)!;
    this.lastFailure.delete(`${guide.id}.${step.id}`);
    const after = this.view(guide);
    if (after.index !== before.index || after.complete) this.game.log.add(`guide ${guide.id}: ${step.id} done`, 'ok');
    return after;
  }

  /**
   * Records a mistake on the active step of the guide that knows `code`.
   * Returns the correction text. If the step maps the code to an earlier
   * step, that step's marks (and every later one's) are cleared so the
   * player redoes them — the guide moves back, it never fixes things itself.
   */
  fail(code: GuideFailureCode, detail?: string, guideId?: string): string {
    if (!isGuideFailure(code)) throw new Error(`Unknown guide failure ${code}`);
    const guide = guideId
      ? GUIDE_BY_ID[guideId]
      : (this.select() && this.view(this.select()!).step.failures.some((f) => f.code === code) ? this.select() : null) ??
        GUIDES.find((gd) => gd.steps.some((s) => s.failures.some((f) => f.code === code)));
    let text: string = GUIDE_FAILURES[code];
    if (detail) text = `${text} (${detail})`;
    if (!guide) return text;
    const v = this.view(guide);
    const key = `${guide.id}.${v.step.id}`;
    this.failures.set(key, (this.failures.get(key) ?? 0) + 1);
    const rule = v.step.failures.find((f) => f.code === code);
    if (rule?.goTo) {
      const to = guide.steps.findIndex((s) => s.id === rule.goTo);
      for (const s of guide.steps.slice(to)) if (s.mark) this.marks.delete(s.mark);
      this.physicalGuides.add(guide.id);
      this.lastFailure.set(`${guide.id}.${guide.steps[to].id}`, code);
    } else {
      this.lastFailure.set(key, code);
    }
    this.game.log.add(`guide ${guide.id} fail ${code}${detail ? ` (${detail})` : ''}`, 'bad');
    return text;
  }

  /**
   * Hint text for escalation level 0/1/2 (science → place → direct) from the
   * active step. Starts higher when the science is already known or the
   * player has failed this step repeatedly.
   */
  hintText(level: 0 | 1 | 2, ctx: SelectContext = {}): { level: 0 | 1 | 2; text: string } | null {
    const v = this.current(ctx);
    if (!v || v.complete) return null;
    const { step } = v;
    let start = 0;
    if (step.scienceEvent && this.game.hasEvent(step.scienceEvent)) start = 1;
    start = Math.max(start, Math.min(2, this.failures.get(`${v.guide.id}.${step.id}`) ?? 0));
    const lvl = Math.min(2, Math.max(level, start)) as 0 | 1 | 2;
    const text = lvl === 0 ? step.science : lvl === 1 ? step.place : step.instruction;
    return { level: lvl, text: v.failure && lvl === 2 ? `${v.failure.text} ${text}` : text };
  }

  snapshot(): GuideSave {
    return {
      marks: [...this.marks],
      failures: Object.fromEntries(this.failures),
      pinned: this.pinned,
      hidden: this.hidden,
    };
  }

  restore(s: GuideSave): void {
    for (const m of s.marks) {
      this.marks.add(m);
      const gd = GUIDES.find((g) => g.steps.some((st) => st.mark === m));
      if (gd) this.physicalGuides.add(gd.id);
    }
    for (const [k, n] of Object.entries(s.failures)) this.failures.set(k, n);
    this.pinned = s.pinned && GUIDE_BY_ID[s.pinned] ? s.pinned : null;
    this.hidden = s.hidden;
  }

  private context(guide: Guide): GuideContext {
    return { game: this.game, marks: this.marks, physical: this.physicalGuides.has(guide.id) };
  }
}
