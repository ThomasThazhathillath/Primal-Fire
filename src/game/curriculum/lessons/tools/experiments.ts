// Lesson 04 (Tools) experiments. Each is fed by the real simulation; nothing here decides an outcome.
//
// Strike angle: every knapping blow that is firm enough and near the edge is a trial (CraftGestureSystem ->
//   ToolYard.knapStrike); the knap rule (interact.ts) decides flake or crushed edge from the blow's angle.
// Cord strength: lifting the test stone at the Tool Yard with loose fibres or with twisted cord; the
//   tensile rule (engineering.ts) compares the strand's strength with the stone's weight.
// Frame bracing: pushing the top of the stick frame with and without a diagonal brace (rackTest).
// Lever pivot: pushing the lever's end with the pivot stone close to the boulder or close to your hands
//   (effort x effort arm = load x load arm, leverPush).

import type { ExperimentDef } from '../../../science/experiments.js';
import { leverEffort, MAX_PUSH, pivotArm, PIVOTS, strandStrength, TEST_LOAD } from './engineering.js';

/** "Both values tried: which prediction does the evidence support?" for a two-value experiment. */
function compare(a: string, b: string, good: string, aWins: string, bWins: string, neither: string) {
  return (t: ReadonlyMap<string, string>): string | null => {
    const x = t.get(a);
    const y = t.get(b);
    if (!x || !y) return null;
    if (x === good && y !== good) return aWins;
    if (y === good && x !== good) return bWins;
    return neither;
  };
}

export const STRIKE_ANGLE: ExperimentDef = {
  id: 'strikeAngle',
  lesson: 'tools',
  concept: 'fracture',
  question: 'How should you strike flint to get a sharp flake?',
  why: 'A good flake is a blade. A bad blow just crushes the stone.',
  predictions: [
    { id: 'angled', text: 'An angled blow, close to the edge.' },
    { id: 'square', text: 'Straight down, square onto the stone.' },
    { id: 'same', text: 'The angle does not matter, only how hard.' },
  ],
  variable: {
    name: 'Angle of the blow',
    values: [
      { id: 'angled', text: 'At an angle' },
      { id: 'square', text: 'Straight down' },
    ],
  },
  outcomes: [
    { id: 'flake', text: 'a flake breaks off' },
    { id: 'crushed', text: 'the edge crushes' },
  ],
  howTo: 'Strike near the edge, firmly but not wildly: one blow at an angle (a diagonal flick), one straight down.',
  // What the simulation measured on the last blow.
  readout: (g) => {
    const b = g.yard.lastBlow;
    if (!b) return null;
    const what = b.outcome === 'flake' ? 'a flake came off' : b.outcome === 'crushed' ? 'the edge crushed' : 'nothing came off';
    return `Last blow: ${Math.round(b.angle)} degrees at ${b.speed.toFixed(1)} m/s - ${what}${b.fair ? '' : ' (too soft, too hard or off the edge: not a fair test)'}.`;
  },
  conclude: compare('angled', 'square', 'flake', 'angled', 'square', 'same'),
  principle: 'Flint breaks in a cone that spreads from where it is hit (conchoidal fracture). Struck at an angle near the edge, the cone breaks out through the side and a thin flake comes away. Struck straight down, the force drives into the stone and crushes it.',
  apply: 'Glass breaks the same way: a pebble that hits a window knocks a small cone out of the far side.',
  limits: 'Real knappers also prepare the striking edge and read each stone. Coarse rock like granite crumbles at any angle.',
  check: {
    question: 'Your blows keep crushing the edge. What do you change?',
    options: [
      { id: 'angle', text: 'Strike at an angle, close to the edge.', correct: true, why: 'An angled blow lets the fracture cone break out through the side as a flake.' },
      { id: 'harder', text: 'Strike straight down, even harder.', why: 'Harder and square on drives the force into the stone: it crushes even more.' },
      { id: 'middle', text: 'Strike the middle of the stone.', why: 'In the middle the force spreads out through the stone and nothing comes away.' },
    ],
  },
  // Offered with the first knapping step, so the very first blows already count.
  opens: (g) => g.focusIs('stoneTools', 'strikeAngle'),
};

export const CORD_STRENGTH: ExperimentDef = {
  id: 'cordStrength',
  lesson: 'tools',
  concept: 'tension',
  question: 'Do twisted fibres hold more than loose ones?',
  why: 'Cord lashes your tools and your shelter. If it snaps, everything falls apart.',
  predictions: [
    { id: 'loose', text: 'Loose fibres: twisting only weakens them.' },
    { id: 'twisted', text: 'Twisted cord made of the same fibres.' },
    { id: 'same', text: 'The same: it is the same amount of fibre.' },
  ],
  variable: {
    name: 'The strand',
    values: [
      { id: 'loose', text: 'Loose fibres' },
      { id: 'twisted', text: 'Twisted cord' },
    ],
  },
  outcomes: [
    { id: 'snaps', text: 'snaps' },
    { id: 'holds', text: 'lifts the stone' },
  ],
  howTo: 'At the test bough by Split Rock, hold loose fibres and lift the test stone with them. Then do it holding cord.',
  readout: (g) => {
    const l = g.yard.lastLift;
    if (!l) return `The test stone pulls about ${TEST_LOAD} N.`;
    const name = l.strand === 'loose' ? 'Loose fibres' : 'Twisted cord';
    return `${name} ${l.result === 'holds' ? 'held' : 'snapped'}: they take about ${Math.round(strandStrength(l.strand))} N; the stone pulls about ${TEST_LOAD} N.`;
  },
  conclude: compare('twisted', 'loose', 'holds', 'twisted', 'loose', 'same'),
  principle: 'Loose fibres do not share the pull: the tightest take it first and snap one by one, and short fibres slide apart. Twisting presses them together, so friction passes the load between them and they act as one strong strand.',
  apply: 'Rope, thread and yarn are all twisted. A thick rope is several twisted strands twisted together again.',
  limits: 'Our numbers are rough. Real cord depends on the plant, its thickness and how well it is made; wet or rotten cord is weaker.',
  check: {
    question: 'You need a cord to hang a heavy pot. What do you do?',
    options: [
      { id: 'twist', text: 'Twist the fibres tightly into cord, or twist cords together.', correct: true, why: 'Twist makes the fibres share the load, and more twisted strands carry more.' },
      { id: 'bundle', text: 'Use a thick bundle of loose fibres.', why: 'Loose fibres take the load a few at a time and snap one after another.' },
      { id: 'knots', text: 'Tie knots all along some loose fibres.', why: 'Knots are weak points, and without twist the fibres still slip apart.' },
    ],
  },
  opens: (g) => g.focusIs('cordTest'),
};

export const FRAME_BRACING: ExperimentDef = {
  id: 'frameBracing',
  lesson: 'tools',
  concept: 'bracing',
  question: 'Which stick frame stands up to a sideways push?',
  why: 'Shelters, racks and bridges must not fold when wind or a load pushes them sideways.',
  predictions: [
    { id: 'square', text: 'The square frame: four strong sides.' },
    { id: 'braced', text: 'The frame with one diagonal brace.' },
    { id: 'same', text: 'Both fold: only the lashings hold anything.' },
  ],
  variable: {
    name: 'Bracing',
    values: [
      { id: 'none', text: 'Square (no brace)' },
      { id: 'diagonal', text: 'Diagonal brace' },
    ],
  },
  outcomes: [
    { id: 'folds', text: 'leans over and folds' },
    { id: 'holds', text: 'stands firm' },
  ],
  howTo: 'At the frame ground by Split Rock, build a square frame from straight sticks and push its top. Add a diagonal brace and push again.',
  readout: (g) => {
    const f = g.yard.frame;
    if (f.posts < 2 || !f.bar) return `Frame: ${f.posts} of 2 posts${f.bar ? ', bar on' : ''}.`;
    return `Frame: ${f.brace ? 'braced with a diagonal (two triangles)' : 'square, no brace'}${f.folded ? ', folded flat - touch it to stand it up' : ''}.`;
  },
  conclude: (t) => {
    const none = t.get('none');
    const diag = t.get('diagonal');
    if (!none || !diag) return null;
    if (diag === 'holds' && none === 'folds') return 'braced';
    if (none === 'folds') return 'same';
    return 'square';
  },
  principle: 'Lashed joints turn a little, like hinges, so a square can lean into a slanted shape without any stick bending. A triangle cannot change shape unless a stick stretches, squashes or breaks, so a diagonal brace locks the frame.',
  apply: 'Bridges, cranes, roof trusses, pylons and bike frames are all built from triangles.',
  limits: 'A brace only works if its ends are tied firmly, and a very heavy load can still buckle a thin stick.',
  check: {
    question: 'Your drying rack sways in the wind. How do you fix it?',
    options: [
      { id: 'brace', text: 'Lash a diagonal stick across it, making triangles.', correct: true, why: 'Triangles cannot change shape, so the rack stops swaying.' },
      { id: 'thicker', text: 'Use thicker upright posts.', why: 'Thick posts with hinge-like joints can still lean over together.' },
      { id: 'more', text: 'Add more upright sticks side by side.', why: 'More straight posts just make more squares, and squares still fold.' },
    ],
  },
  opens: (g) => g.focusIs('frameTest'),
};

export const LEVER_PIVOT: ExperimentDef = {
  id: 'leverPivot',
  lesson: 'tools',
  concept: 'levers',
  question: 'Where should the pivot go to move the boulder?',
  why: 'The boulder is far too heavy for your hands. A lever can multiply your push.',
  predictions: [
    { id: 'near', text: 'Close to the boulder.' },
    { id: 'middle', text: 'In the middle of the pole.' },
    { id: 'far', text: 'Close to my hands.' },
  ],
  variable: {
    name: 'Where the pivot stone is',
    values: [
      { id: 'near', text: 'Close to the boulder' },
      { id: 'middle', text: 'In the middle' },
      { id: 'far', text: 'Close to your hands' },
    ],
  },
  outcomes: [
    { id: 'moves', text: 'the boulder lifts' },
    { id: 'stuck', text: 'nothing moves' },
  ],
  howTo: 'Lay a long pole under the boulder, set the pivot stone on a mark and push the pole end down. Try it close to the boulder and close to your hands.',
  // The lever law for where the pivot stone sits now: effort = load x load arm / effort arm.
  readout: (g) => {
    const p = PIVOTS.find((x) => x.id === g.yard.pivot)!;
    const need = Math.round(leverEffort(pivotArm(p.id)));
    return `Pivot ${p.name}: the push needed is about ${need} N; your best push is about ${MAX_PUSH} N.`;
  },
  conclude: compare('near', 'far', 'moves', 'near', 'far', 'middle'),
  principle: 'A lever turns about its pivot: effort x effort arm = load x load arm. With the pivot close to the boulder your side of the pole is long, so a small push lifts a big load. Close to your hands you would need several times the boulder\'s weight.',
  apply: 'Crowbars, bottle openers, wheelbarrows, scissors and oars are all levers.',
  limits: 'Nothing is free: your end moves much further than the boulder rises. A pole can also bend or snap under a big load.',
  check: {
    question: 'Even with a lever, a rock will not move. What helps most?',
    options: [
      { id: 'closer', text: 'Move the pivot closer to the rock.', correct: true, why: 'That makes the load arm short and your effort arm long, so your push is multiplied more.' },
      { id: 'shorter', text: 'Use a shorter pole.', why: 'A shorter pole shortens your effort arm, so you need more force, not less.' },
      { id: 'nearPivot', text: 'Push the pole nearer the pivot.', why: 'Pushing near the pivot shortens your arm: it takes more force.' },
    ],
  },
  opens: (g) => g.focusIs('leverTest', 'boulder'),
};

export const TOOLS_EXPERIMENTS: ExperimentDef[] = [STRIKE_ANGLE, CORD_STRENGTH, FRAME_BRACING, LEVER_PIVOT];
