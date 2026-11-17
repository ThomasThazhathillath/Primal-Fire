// Lesson 04 (Tools): new steps. Knapping and cutting reuse the beginner objectives in objectives.ts.
// The Tool Yard steps (cord test, frame, lever, boulder) happen by Split Rock (yard.ts).
import type { Game } from '../../../game.js';
import type { HintInfo } from '../../../hint-info.js';
import type { ItemId } from '../../../items.js';
import type { Step } from '../../types.js';
import { TOOL_JOBS, type ToolJob } from './yard.js';

const everHad = (g: Game, id: ItemId): boolean => g.gatheredCount(id) > 0 || g.count(id) > 0 || g.held === id;
const has = (g: Game, id: ItemId): boolean => g.count(id) > 0 || g.held === id;
const sub = (text: string, done: boolean) => ({ text, done });
/** Level 4 can be chosen from the title list in a fresh game: say how to get what earlier lessons made. */
const benchBuilt = (g: Game): boolean => g.hasStructure('workbench');
const BUILD_BENCH = 'First build a workbench: tap the hammer icon, place the Workbench outline on open ground, set a stone on each of its three marks and lower a flat slab on top.';
const benchParts = (g: Game): ItemId[] => (['slab', 'dryStone'] as ItemId[]).filter((id) => !has(g, id));
const TWIST_CORD = 'No cord yet? Hold fibres and twist them: pull the bundle apart, then roll your wrists opposite ways (desktop: hold, drag sideways, scroll the wheel).';
const JOB_TEXT: Record<ToolJob, string> = {
  knife: 'Cut fibres or grass with the knife',
  axe: 'Chop wood with the axe',
  hammer: 'Break flint from the seam with the hammer',
};

export const TOOLS_STEPS: Step[] = [
  {
    id: 'strikeAngle',
    guide: 'knap',
    find: (g) => (has(g, 'flint') ? [] : ['flint']),
    title: 'Test the strike angle',
    short: 'Strike flint two ways',
    instruction: 'Knap flint again: one blow at an angle near the edge, one straight down onto it. Which gives a flake?',
    doneMessage: 'An angled blow near the edge lets the fracture break out as a flake.',
    howTo: (g) =>
      has(g, 'flint')
        ? 'Take the flint out. Desktop: press, raise and flick diagonally onto the edge, then flick straight down. VR: strike the edge at a slant, then straight down.'
        : 'You need another flint nodule: dark, glassy stone. Keep an ordinary stone in your bag to strike with.',
    done: (g) => g.experiments.done('strikeAngle'),
    hint: {
      ref: 'flint',
      levels: [
        'The same flint, the same stone: only the angle of the blow changes.',
        'Strike close to the edge, firmly but not wildly.',
        'Flint lies by the stream and in stony ground; a hammerstone is any ordinary stone.',
        'Hold the flint and strike once with a slanting flick, once straight down, and watch what comes off.',
      ],
    },
  },
  {
    id: 'cordTest',
    place: 'splitRock',
    find: (g) => (has(g, 'fibers') ? [] : ['fibers']),
    title: 'Test fibres against cord',
    short: 'Lift the stone with each',
    instruction: 'At the test bough by Split Rock, hold loose fibres and lift the test stone with them. Then do the same holding cord.',
    doneMessage: 'Twisting makes fibres share the pull: the same fibres become far stronger.',
    howTo: (g) =>
      `Take fibres (or cord) out of your bag, then touch the test stone under the bough and pull it up. Desktop: press on the stone and drag up.${has(g, 'cord') ? '' : ` ${TWIST_CORD}`}`,
    done: (g) => g.experiments.done('cordStrength'),
    hint: {
      ref: 'cord',
      levels: [
        'Is a bundle of loose fibres as strong as the same fibres twisted together?',
        'Hold the strand in your hand: fibres for one test, cord for the other.',
        'The test bough stands at the Tool Yard, on the north side of Split Rock.',
        'Holding fibres, touch the stone under the bough and lift it. Then do it again holding cord.',
      ],
    },
  },
  {
    id: 'axe',
    find: (g) => (everHad(g, 'axe') ? [] : benchBuilt(g) ? (['dryStone', 'spindle', 'fibers'] as ItemId[]).filter((id) => (id === 'fibers' ? g.count('cord') < 2 && !has(g, id) : g.count(id) === 0)) : benchParts(g)),
    title: 'Make a stone axe',
    short: 'Make an axe at the bench',
    instruction: (g) => (benchBuilt(g) ? 'At your workbench, split a handle, seat a stone head in it and lash it tight with cord.' : BUILD_BENCH),
    howTo: (g) => (benchBuilt(g) ? (g.count('cord') < 2 ? `The axe takes a stone, a straight stick and 2 cords. ${TWIST_CORD}` : null) : BUILD_BENCH),
    doneMessage: 'A stone axe: a long handle makes the head move fast, and a fast head hits hard.',
    teach: 'bench',
    done: (g) => g.hasEvent('tool.axe.made') || everHad(g, 'axe'),
    hint: {
      ref: 'axe',
      levels: [
        'A heavy head on a long handle moves faster than your hand can.',
        'A stone head, a straight handle and two cords to lash them.',
        'Make it at your workbench.',
        'Poke the workbench, choose the axe and follow each step: split, seat, lash.',
      ],
    },
  },
  {
    id: 'split',
    find: (g) => (g.gatheredCount('logs') > 0 ? [] : ['logs']),
    title: 'Split wood with the axe',
    short: 'Chop a log with the axe',
    instruction: 'Hold the axe and swing it at a fallen log. The edge drives in like a wedge and pushes the fibres apart.',
    doneMessage: 'A wedge turns a downward blow into a sideways push that splits wood along its grain.',
    teach: 'tool',
    done: (g) => g.hasEvent('tool.wedge.split'),
    hint: {
      ref: 'logs',
      levels: [
        'Wood splits easily along its grain and hardly at all across it.',
        'The axe edge is a wedge: it pushes the fibres sideways.',
        'Fallen logs lie where trees came down.',
        'Hold the axe and swing it down onto a log, along the grain.',
      ],
    },
  },
  {
    id: 'toolkit',
    find: (g) => {
      if (!benchBuilt(g)) return benchParts(g);
      const need: ItemId[] = [];
      if (!everHad(g, 'knife') && !has(g, 'flake')) need.push('flint');
      if (!has(g, 'spindle')) need.push('spindle');
      if (!has(g, 'cord')) need.push('fibers');
      if (!everHad(g, 'hammer') && !has(g, 'dryStone')) need.push('dryStone');
      return need;
    },
    title: 'Haft a tool kit',
    short: 'Make a knife and a hammer',
    instruction: (g) =>
      benchBuilt(g) ? 'At your workbench, make a flint knife and a stone hammer: split each handle along the grain, seat the stone, lash it tight.' : BUILD_BENCH,
    doneMessage: 'A tool for each job: flint for edges, a tough stone for blows, wood for reach, cord to bind.',
    teach: 'bench',
    howTo: () => 'Knife: a flake, a straight stick, a cord. Hammer: a stone, a straight stick, a cord. Tip: turn a digging stick over a fire to harden its point.',
    substeps: (g) => [
      sub('Stone axe', g.hasEvent('tool.axe.made') || everHad(g, 'axe')),
      sub('Flint knife', everHad(g, 'knife')),
      sub('Stone hammer', everHad(g, 'hammer')),
    ],
    done: (g) => g.hasEvent('tool.kit.made'),
    hint: {
      ref: 'knife',
      levels: [
        'Each tool pairs a hard stone with a wooden handle.',
        'A knife takes a sharp flake; a hammer takes a rounded stone that will not shatter.',
        'Make them at your workbench, from a stick and a cord each.',
        'Poke the workbench, choose the knife, then the hammer, and follow each step: split, seat, lash.',
      ],
    },
  },
  {
    id: 'frameTest',
    place: 'splitRock',
    find: (g) => (has(g, 'spindle') || (g.yard.frame.posts >= 2 && g.yard.frame.bar && g.yard.frame.brace) ? [] : ['spindle']),
    title: 'Brace a frame',
    short: 'Build and push a frame',
    instruction: (g) => {
      const f = g.yard.frame;
      if (f.posts < 2 || !f.bar) return 'At the frame ground by Split Rock, set two posts and a top bar from straight sticks.';
      if (!f.brace) return f.folded ? 'It folded. Touch it to stand it up, then lash a diagonal brace across with another stick.' : 'Push the top of the square frame sideways.';
      return f.folded ? 'Touch the frame to stand it up.' : 'Push the braced frame sideways.';
    },
    doneMessage: 'Triangles cannot change shape: that is why frames, bridges and roofs are braced.',
    howTo: () => 'Hold a straight stick and touch the frame ground to set each piece. To push: touch the frame top and move your hand sideways. Desktop: press on it and drag sideways.',
    substeps: (g) => {
      const t = g.experiments.state('frameBracing').trials;
      return [sub('Square frame: two posts and a bar', g.yard.frame.posts >= 2 && g.yard.frame.bar), sub('Push the square', t.has('none')), sub('Add a diagonal brace', g.yard.frame.brace), sub('Push the braced frame', t.has('diagonal'))];
    },
    done: (g) => g.experiments.done('frameBracing'),
    hint: {
      ref: 'spindle',
      levels: [
        'A four-sided frame and a frame with a diagonal: which one can lean over?',
        'Lashed joints can turn a little, like hinges.',
        'The frame ground is at the Tool Yard, on the north side of Split Rock.',
        'Set two posts and a bar, push the top; then add a diagonal brace and push again.',
      ],
    },
  },
  {
    id: 'leverTest',
    place: 'splitRock',
    find: (g) => (g.yard.pole === 'none' && !has(g, 'pole') ? ['pole'] : []),
    title: 'Find the best pivot',
    short: 'Try the lever two ways',
    instruction: 'At Split Rock, lay a long pole under the boulder. Set the pivot stone on a mark and push the pole end down. Try the pivot close to the boulder and close to your hands.',
    doneMessage: 'Effort x effort arm = load x load arm: a long arm on your side multiplies your push.',
    howTo: (g) =>
      g.yard.pole === 'none'
        ? 'Carry a long pole (a dead sapling) to the boulder and touch the boulder with it.'
        : 'Touch a mark to move the pivot stone. Then grab the far end of the pole and push it down. Desktop: press on the end and drag down.',
    substeps: (g) => {
      const t = g.experiments.state('leverPivot').trials;
      return [sub('Lay the pole under the boulder', g.yard.pole !== 'none'), sub('Push with the pivot close to the boulder', t.has('near')), sub('Push with the pivot close to your hands', t.has('far'))];
    },
    done: (g) => g.experiments.done('leverPivot'),
    hint: {
      ref: 'pole',
      levels: [
        'A long pole resting on a stone can lift what your hands cannot.',
        'Where the pivot stone sits decides how hard you must push.',
        'The boulder lies at the Tool Yard, on the north side of Split Rock. Long dead poles lie in the forest.',
        'Lay the pole under the boulder, move the pivot to a mark and push the end down. Try both ends.',
      ],
    },
  },
  {
    id: 'boulder',
    place: 'splitRock',
    find: (g) => (g.yard.pole === 'none' && !has(g, 'pole') ? ['pole'] : []),
    title: 'Move the boulder',
    short: 'Roll the boulder off the seam',
    instruction: 'Roll the boulder clear of the flint seam under it. After each roll, set the pole under it again.',
    doneMessage: 'You moved a boulder no one could lift. Under it: good flint for your next tools.',
    howTo: (g) => (g.yard.pole === 'set' ? 'Push the pole end all the way down.' : 'Touch the boulder to set the pole under it again.'),
    progress: (g) => ({ have: Math.min(g.yard.rolls, g.yard.rollsNeeded()), need: g.yard.rollsNeeded() }),
    done: (g) => g.yard.seamOpen(),
    hint: {
      ref: 'pole',
      levels: [
        'Use what you just learned about the pivot.',
        'Each roll moves the boulder about a stride; set the lever again after each one.',
        'The boulder lies at the Tool Yard by Split Rock.',
        'Pivot close to the boulder, push the pole end right down; touch the boulder to set the pole again.',
      ],
    },
  },
  {
    id: 'toolCheck',
    place: 'splitRock',
    title: 'Tool test',
    short: 'Use each tool on its job',
    instruction: 'Show your tools work: cut fibres or grass with the knife, chop wood with the axe, and break flint from the seam with the hammer.',
    doneMessage: 'Your tools do what bare hands cannot. Lesson 04 complete.',
    howTo: () => 'Keep the tool in your bag (or hold it) while you gather: the knife for fibres, the axe for wood, the hammer at the flint seam.',
    substeps: (g) => TOOL_JOBS.map((j) => sub(JOB_TEXT[j], g.yard.jobs.has(j))),
    progress: (g) => ({ have: TOOL_JOBS.filter((j) => g.yard.jobs.has(j)).length, need: TOOL_JOBS.length }),
    done: (g) => TOOL_JOBS.every((j) => g.yard.jobs.has(j)),
    hint: {
      ref: 'hammer',
      levels: [
        'Each tool is made for one kind of job.',
        'The knife cuts soft plants, the axe chops wood, the hammer breaks stone.',
        'Fibre plants and grass grow in the meadow; logs lie under the trees; the seam is at Split Rock.',
        'With each tool in your bag, gather what it is for. Touch the flint seam with a hammer in your bag.',
      ],
    },
  },
];

const item = (id: ItemId, x = 0, z = 0) => ({ kind: 'item' as const, id, x, z });

export const TOOLS_HINTS: Record<string, HintInfo> = {
  strikeAngle: {
    name: 'Strike angle',
    look: 'A flint nodule and an ordinary stone to hit it with.',
    why: 'Only one thing changes between the two blows: their angle.',
    avoid: 'Hitting so hard that both blows crush the stone: then force decides, not the angle.',
    views: [{ pieces: [item('flint', -0.15, 0), item('dryStone', 0.15, 0)], caption: 'Flint and a hammerstone' }],
  },
  cordTest: {
    name: 'Tensile test',
    look: 'A stone tied under a bough, lifted by fibres or by cord.',
    why: 'The same fibres, loose or twisted: only the twist changes.',
    avoid: 'Comparing a thin cord with a thick bundle: keep the amount of fibre the same.',
    views: [{ pieces: [item('fibers', -0.2, 0), item('cord', 0.2, 0)], caption: 'Loose fibres and twisted cord' }],
  },
  axe: {
    name: 'Stone axe',
    look: 'A fist-sized stone lashed into the split end of a straight handle.',
    why: 'The handle is a lever: the head travels further and faster than your hand, so it strikes harder.',
    avoid: 'A loose head: lash it crosswise so it cannot twist.',
    views: [{ pieces: [item('dryStone', -0.3, 0), item('spindle', 0.1, 0), item('cord', 0.45, 0)], caption: 'Stone, handle and cord' }],
  },
  split: {
    name: 'Splitting a log',
    look: 'A fallen log; swing the axe down along its length.',
    why: 'Wood fibres run along the grain, so a wedge driven along them pushes them apart easily.',
    avoid: 'Chopping across the grain: the fibres resist.',
    views: [{ pieces: [item('logs')], caption: 'A log to split' }],
  },
  toolkit: {
    name: 'Tool kit',
    look: 'A flint knife and a stone hammer, each lashed to a straight wooden handle.',
    why: 'Each material is there for one property: sharp flint, tough stone, stiff wood, strong cord.',
    avoid: 'A brittle, flaky stone for the hammer head: it shatters on the first blow.',
    views: [{ pieces: [item('knife', -0.25, 0), item('hammer', 0.25, 0)], caption: 'Knife and hammer' }],
  },
  frameTest: {
    name: 'Braced frame',
    look: 'Two upright sticks with a bar across the top, then a diagonal brace.',
    why: 'A frame of triangles cannot lean over; a square frame can.',
    avoid: 'A brace with loose ends: it must be lashed tight at both corners.',
    views: [{ pieces: [item('spindle', -0.2, 0), item('spindle', 0.2, 0), item('cord', 0, 0.2)], caption: 'Straight sticks and cord' }],
  },
  leverTest: {
    name: 'Lever and pivot',
    look: 'A long pole over a pivot stone, its tip under the boulder.',
    why: 'Effort x effort arm = load x load arm: where the pivot sits decides the push you need.',
    avoid: 'A short stick: it gives you no arm to push with.',
    views: [{ pieces: [item('pole', 0, 0), item('dryStone', -0.4, 0.15)], caption: 'A long pole and a pivot stone' }],
  },
  boulder: {
    name: 'The boulder',
    look: 'A grey boulder sitting on a dark seam of flint by Split Rock.',
    why: 'It blocks good flint. A lever lets you roll what you could never lift.',
    avoid: 'Standing on the side it rolls toward (it rolls away from the lever).',
    views: [{ pieces: [item('pole', 0, 0), item('flint', -0.6, 0.1)], caption: 'Lever the boulder off the flint' }],
  },
  toolCheck: {
    name: 'Tool test',
    look: 'Your knife, axe and hammer, each on the job it is made for.',
    why: 'A tool is only finished when it does real work.',
    avoid: 'The wrong tool for the job: an axe on stone only blunts it.',
    views: [{ pieces: [item('knife', -0.35, 0), item('axe', 0, 0), item('hammer', 0.35, 0)], caption: 'Knife, axe and hammer' }],
  },
};
