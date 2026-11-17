// Lesson 01 (Shelter): the new steps. The first steps (stones, workbench, cord) reuse the beginner
// objectives in objectives.ts; these cover the lean-to, the rain test and the bed.

import { BLUEPRINTS, openStage, STAGE_NAMES } from '../../../blueprint.js';
import type { Game } from '../../../game.js';
import type { HintInfo } from '../../../hint-info.js';
import type { ItemId } from '../../../items.js';
import { frameDone, framePush, leakingPanels, roofed, stageCount } from '../../../shelter.js';
import { nearestRise } from '../../../sites.js';
import type { Step } from '../../types.js';
import { bedParts, bedUnder } from './rules.js';

const leanTo = (g: Game) => g.leanTo();
const sub = (text: string, done: boolean) => ({ text, done });
const have = (g: Game, id: ItemId): number => g.count(id) + (g.held === id ? 1 : 0);
const tested = (g: Game): boolean => g.flag('shelterTested');
/** Has the bare frame (posts and ridge, no ribs) been pushed? Saves from before the push test count as done. */
const pushedBare = (g: Game): boolean => {
  const s = leanTo(g);
  return g.experiments.state('framePush').trials.has('unbraced') || g.experiments.concluded('framePush') || (!!s && !s.pushFirst && framePush(s).ribs > 0);
};
/** The frame test cannot be run any more (a save from before it: the ribs went on without a push). */
const pushTooLate = (g: Game): boolean => {
  const s = leanTo(g);
  return !!s && framePush(s).ribs + framePush(s).crosses > 0 && !g.experiments.state('framePush').trials.has('unbraced');
};

/** What the lean-to's lowest open stage takes (empty once the frame is done). */
function frameNeeds(g: Game): ItemId[] {
  const s = leanTo(g);
  if (!s) return ['pole'];
  const def = BLUEPRINTS.leanTo;
  const stage = openStage(def, s.spots);
  if (!Number.isFinite(stage) || stage >= 7) return [];
  const out = new Set<ItemId>();
  def.spots.forEach((sp, i) => {
    if ((sp.stage ?? 0) === stage && s.spots[i] === null) for (const a of sp.accepts) if (a !== 'branch') out.add(a);
  });
  // Only ask for what is not already in the bag.
  const missing = [...out].filter((id) => have(g, id) === 0);
  return missing.length ? missing : [];
}

export const SHELTER_STEPS: Step[] = [
  {
    id: 'pole',
    structure: 'leanTo',
    find: (g) => (have(g, 'pole') > 0 ? [] : ['pole']),
    title: 'Start your shelter',
    short: 'Carry a pole to open ground',
    instruction: 'Find a long, straight pole. Carry it with both hands to flat, slightly raised ground and set it upright: it becomes the first post of a lean-to.',
    doneMessage: 'The first post stands. A shelter starts as a plan on good ground.',
    teach: 'build',
    explains: true,
    howTo: (g) => {
      if (have(g, 'pole') === 0) return 'Dead saplings lie straight and dry through the forest, away from the stream. They are long: pinch one with both hands.';
      const rise = nearestRise(g.player.x, g.player.z);
      const near = rise && Math.hypot(rise.x - g.player.x, rise.z - g.player.z) < 12;
      return near
        ? 'Pale, dry ground marks a slight rise in the clearing: set the pole there. Not in the dark, damp hollows, where cold air and water collect.'
        : 'Hold the pole over open, slightly raised ground a short walk from where you will keep a fire, then open your hands. Or open Build and choose the lean-to.';
    },
    done: (g) => !!leanTo(g),
    implied: tested,
    hint: {
      ref: 'pole',
      levels: [
        'A shelter needs a frame, and a frame needs long, stiff pieces.',
        'A dead sapling: straight, dry and longer than you are tall.',
        'They lie in the forest away from the stream. Build on slightly raised, flat ground, not in a hollow where cold air and water collect.',
        'Pinch a pole with both hands, carry it to open ground and let go to start the lean-to.',
      ],
    },
  },
  {
    id: 'frame',
    structure: 'leanTo',
    find: frameNeeds,
    title: 'Build the frame',
    short: (g) => {
      const s = leanTo(g);
      if (!s) return 'Start the lean-to';
      const st = openStage(BLUEPRINTS.leanTo, s.spots);
      return Number.isFinite(st) && st < 7 ? `Add the ${STAGE_NAMES[st]}` : 'Frame done';
    },
    instruction: 'Set the second post and the ridge pole, push the bare frame, lean three ribs against the ridge, add two cross-supports, lash the joints with cord, then lay small branches across.',
    doneMessage: 'The frame stands. Triangles hold their shape, and cord in tension keeps the poles from spreading.',
    explains: true,
    howTo: (g) => (leanTo(g)?.pushFirst ? 'Push the bare frame now: pinch or click a post or the ridge pole. Does it stand?' : null),
    substeps: (g) => {
      const s = leanTo(g);
      const row = (stage: number, text: string) => {
        if (!s) return sub(text, false);
        const c = stageCount(s, stage);
        return sub(`${text} (${c.done} / ${c.total})`, c.done === c.total && !(stage <= 2 && s.keyOpen));
      };
      return [
        row(1, 'Second post'),
        row(2, 'Ridge pole'),
        ...(pushTooLate(g) ? [] : [sub('Push the bare frame: does it stand?', pushedBare(g))]),
        row(3, 'Leaning ribs'),
        row(4, 'Cross-supports'),
        row(5, 'Lash the joints'),
        row(6, 'Small branches'),
      ];
    },
    done: (g) => {
      const s = leanTo(g);
      return !!s && frameDone(s);
    },
    implied: tested,
    hint: {
      ref: 'greenBranch',
      levels: [
        'Two posts alone will sway. What shape cannot fold when you push on it?',
        'A post, the ridge and a leaning rib make a triangle. Cord pulls the joints tight.',
        'Branches lie under the trees; cord is twisted from fibres at your workbench.',
        'Carry each part to its glowing mark. At a joint, hold cord and twist your wrists in opposite directions (mouse: scroll).',
      ],
    },
  },
  {
    id: 'framePush',
    structure: 'leanTo',
    title: 'Push test: what holds it up?',
    short: 'Push the finished frame',
    instruction: 'Push the frame again now that its ribs and cross-supports are in, and compare it with the bare frame.',
    doneMessage: 'Evidence: the bare box folded, the triangles held.',
    howTo: (g) => {
      const st = g.experiments.state('framePush');
      if (st.phase === 'predict') return 'Open the experiment card and choose what you predict.';
      if (!st.trials.has('braced')) return 'Pinch or click a post or the ridge pole to push the braced frame.';
      return null;
    },
    substeps: (g) => {
      const st = g.experiments.state('framePush');
      return [
        sub('Predict what will happen', !!st.prediction),
        sub('Push the bare frame (posts and ridge)', st.trials.has('unbraced')),
        sub('Push it with ribs and cross-supports', st.trials.has('braced')),
        sub('Check what you learned', st.phase === 'done'),
      ];
    },
    done: (g) => g.experiments.done('framePush'),
    // Saves from before the push test: past the frame already, or the ribs went on without a push.
    implied: (g) => tested(g) || g.lessons.completed.has('roof') || pushTooLate(g),
    hint: {
      ref: 'pole',
      levels: [
        'Push on a box made of sticks and it folds. What shape cannot fold?',
        'A post, the ridge and a leaning rib make a triangle; cross-supports tie the ribs together.',
        'Stand by your frame and reach for a post or the ridge pole.',
        'Pinch or click a post or the ridge pole to push it. The experiment card shows the result.',
      ],
    },
  },
  {
    id: 'roof',
    structure: 'leanTo',
    find: (g) => (['bark', 'leafLitter', 'dryGrass'] as ItemId[]).filter((id) => have(g, id) === 0),
    title: 'Roof it in layers',
    short: 'Cover every roof panel',
    instruction: 'Put bark, dry leaves or dry grass on each glowing roof mark. Overlapping layers give rain no straight way through.',
    doneMessage: 'The roof is on. Will it keep the rain out? Rain is coming.',
    explains: true,
    substeps: (g) => {
      const s = leanTo(g);
      const panels = s ? 3 - (roofed(s) ? 0 : [0, 1, 2].filter((p) => s.spots.every((v, i) => BLUEPRINTS.leanTo.spots[i].panel !== p || v === null)).length) : 0;
      return [sub(`Panels covered (${panels} / 3)`, !!s && roofed(s))];
    },
    done: (g) => {
      const s = leanTo(g);
      return !!s && roofed(s);
    },
    implied: tested,
    hint: {
      ref: 'bark',
      levels: [
        'A roof is not one thing. What overlaps best, and what fills the gaps?',
        'Bark sheds water like tiles; leaves and grass fill the gaps. A steep slope sheds rain faster.',
        'Bark peels from dead trunks, crisp leaves drift under the trees, dry grass grows in sunny clearings.',
        'Hold bark, leaves or grass at a glowing roof mark and let go. Every panel needs at least one layer.',
      ],
    },
  },
  {
    id: 'rainTest',
    structure: 'leanTo',
    find: (g) => (g.drained() || g.flag('shelterTested') || have(g, 'diggingStick') > 0 ? [] : ['diggingStick']),
    title: 'Test it in the rain',
    short: 'Stay under the roof',
    instruction: 'Rain is coming. Stand under your roof, find any drip and add a layer above it, and dig a channel behind the shelter so runoff goes around.',
    doneMessage: 'Dry through the shower. Your shelter is an experiment that passed.',
    substeps: (g) => {
      const s = leanTo(g);
      const leaking = s ? leakingPanels(s).length > 0 : false;
      return [
        sub('Watch the rain on your roof', g.hasEvent('shelter.rain.begin')),
        sub('Close any leak with another layer', g.hasEvent('shelter.rain.begin') && !leaking && (g.hasEvent('shelter.leak.found') ? g.hasEvent('shelter.layers.sealed') : true)),
        sub(g.drained() || g.shelterTest.flood < 0.05 ? 'Dig a channel for the runoff' : `Dig a channel: water on the floor ${Math.round(g.shelterTest.flood * 100)}%`, g.drained()),
        sub('Stay dry until it passes', tested(g)),
      ];
    },
    done: tested,
    hint: {
      ref: 'diggingStick',
      levels: [
        'What does water do on a tilted surface, and where does it go next?',
        'A thin panel (one layer) leaks; two layers hold. Runoff needs an easier path than your floor.',
        'The digging stick is a thick pointed stick, first found near the Lightning Glade.',
        'Stand under the roof. Add a layer over any drip. Touch the digging stick to the three marks behind the shelter.',
      ],
    },
  },
  {
    id: 'roofLayers',
    structure: 'leanTo',
    title: 'Test it: how many layers?',
    short: 'Compare one layer and two',
    instruction: 'Find out what keeps rain out: give one roof panel a single layer and another two, and watch them in the rain.',
    doneMessage: 'Evidence, not a guess: one layer leaks, overlapping layers hold.',
    howTo: (g) => {
      const s = g.experiments.state('roofLayers');
      if (s.phase === 'predict') return 'Open the experiment card and choose what you predict.';
      if (s.phase === 'testing') return s.trials.get('1') ? 'Now make sure one panel has two or more layers and watch it in the rain.' : 'Take a layer off one roof panel (pinch it) so it has only one, then watch it in the rain.';
      return null;
    },
    substeps: (g) => {
      const s = g.experiments.state('roofLayers');
      return [
        sub('Predict what will happen', !!s.prediction),
        sub('Watch a one-layer panel in the rain', s.trials.has('1')),
        sub('Watch a two-layer panel in the rain', s.trials.has('2')),
        sub('Check what you learned', s.phase === 'done'),
      ];
    },
    done: (g) => g.experiments.done('roofLayers'),
    hint: {
      ref: 'bark',
      levels: [
        'A fair test changes one thing at a time: here, the number of layers.',
        'Compare a panel with one layer and a panel with two, in the same rain.',
        'Stand under your lean-to while it rains and look up at each panel.',
        'Pinch a roof layer to take it back so a panel has one layer, wait for rain, then add it again.',
      ],
    },
  },
  {
    id: 'bed',
    structure: 'bedding',
    find: (g) => (have(g, 'leafLitter') + have(g, 'dryGrass') >= 5 ? [] : ['leafLitter', 'dryGrass']),
    title: 'Make a bed off the ground',
    short: 'Build a leaf bed',
    instruction: 'Pile dry leaves and grass thick under your roof. Lying on bare earth, your body heat flows into the cold ground.',
    doneMessage: 'A thick, dry bed: still air between you and the ground keeps your warmth in.',
    teach: 'build',
    explains: true,
    done: (g) => g.hasStructure('bedding'),
    hint: {
      ref: 'leafLitter',
      levels: [
        'The ground pulls heat out of anything that touches it.',
        'Dry leaves and grass trap still air, and still air is a poor conductor of heat.',
        'Leaf litter drifts under trees; dry grass grows in sunny clearings.',
        'Open Build, choose the sleeping bed, place it under the roof and fill its marks with leaves and grass.',
      ],
    },
  },
  {
    id: 'bedMaterials',
    structure: 'bedding',
    find: (g) => (g.experiments.state('bedMaterials').trials.has('dampMoss') || have(g, 'dampMoss') >= 5 ? [] : ['dampMoss']),
    title: 'Test it: what makes a warm bed?',
    short: 'Compare bed materials',
    instruction: 'Stand still under your roof on bare ground, on a whole bed of dry grass or leaves, and on a whole bed of damp moss. Read how much heat flows into the ground.',
    doneMessage: 'Evidence: dry, fluffy beds trap still air; damp ones let the cold through.',
    explains: true,
    howTo: (g) => {
      const st = g.experiments.state('bedMaterials');
      if (st.phase === 'predict') return 'Open the experiment card and choose what you predict.';
      if (st.phase !== 'testing') return null;
      const bed = bedUnder(g, g.player.x, g.player.z) ?? g.structures.find((s) => s.kind === 'bedding') ?? null;
      if (!st.trials.has('bare')) return 'Stand still under your roof, off the bed, on bare ground.';
      if (!st.trials.has('dryGrass') && !st.trials.has('leafLitter')) return 'Make a whole bed of dry grass or of dry leaves, then stand still on it.';
      if (!st.trials.has('dampMoss')) {
        if (bed && bedParts(bed).some((p) => p && p !== 'dampMoss')) return 'Now damp moss: pinch each bed layer to take it back (the bed goes when the last comes off), then lay a whole bed of moss.';
        return have(g, 'dampMoss') >= 5 ? 'Lay a whole bed of damp moss under the roof and stand still on it.' : 'Damp moss grows on shaded rocks. Gather five, lay a moss bed and stand still on it.';
      }
      return null;
    },
    substeps: (g) => {
      const st = g.experiments.state('bedMaterials');
      return [
        sub('Predict what will happen', !!st.prediction),
        sub('Rest on bare ground', st.trials.has('bare')),
        sub('Rest on a bed of dry grass or leaves', st.trials.has('dryGrass') || st.trials.has('leafLitter')),
        sub('Rest on a bed of damp moss', st.trials.has('dampMoss')),
        sub('Check what you learned', st.phase === 'done'),
      ];
    },
    done: (g) => g.experiments.done('bedMaterials'),
    hint: {
      ref: 'dampMoss',
      levels: [
        'A fair test: the same thickness of bed each time, only the material changes.',
        'Dry grass and leaves are full of air; damp moss is full of water.',
        'Damp moss grows on shaded rocks in the forest; bare ground is under your roof, beside the bed.',
        'Pinch bed layers to take them back. Lay a whole bed of one material, stand still on it under the roof and watch the card.',
      ],
    },
  },
  {
    id: 'nightShelter',
    structure: 'bedding',
    title: 'Spend the night in it',
    short: 'Rest in your shelter at night',
    instruction: 'On a cold night, stand still out in the open, then rest on your bed under the roof. Your shelter works when your warmth holds steady.',
    doneMessage: 'Your shelter keeps off the wind, the rain and the cold ground. You can sleep through the night.',
    explains: true,
    howTo: (g) => {
      const st = g.experiments.state('nightShelter');
      if (st.phase === 'predict') return 'Open the experiment card and choose what you predict.';
      if (st.phase === 'check' || st.phase === 'result') return 'Open the experiment card to finish it.';
      return g.shelterRules.nightAdvice(g);
    },
    substeps: (g) => {
      const st = g.experiments.state('nightShelter');
      return [
        sub('Predict what will happen', !!st.prediction),
        sub('Stand out in the open on a cold night', st.trials.has('open')),
        sub('Rest on a dry bed under the roof', st.trials.has('shelter')),
        sub('Warmth holds steady through the night', g.hasEvent('shelter.night.warm')),
        sub('Answer the question', st.phase === 'done'),
      ];
    },
    done: (g) => g.experiments.done('nightShelter') && g.hasEvent('shelter.night.warm'),
    hint: {
      ref: 'leafLitter',
      levels: [
        'A shelter makes no heat. What does it stop?',
        'Wind, rain and the cold ground all take heat. Your body makes it at a steady rate.',
        'Night comes after dusk; the card can let you rest until the cold of midnight.',
        'Stand still in the open for a few seconds, then stand still on your dry bed under the roof until your warmth holds.',
      ],
    },
  },
];

const item = (id: ItemId, x = 0, z = 0) => ({ kind: 'item' as const, id, x, z });

export const SHELTER_HINTS: Record<string, HintInfo> = {
  pole: {
    name: 'Long pole',
    look: 'A straight, dry dead sapling, longer than you are tall, lying on the forest floor.',
    why: 'Two upright poles and a ridge pole across them are the backbone of a lean-to.',
    avoid: 'Bendy green branches (they sag) and ground in a hollow or on the stream bank.',
    views: [{ pieces: [item('pole')], caption: 'A long, straight pole' }],
  },
  frame: {
    name: 'Lean-to frame',
    look: 'Two posts, a ridge pole across their tops, three ribs leaning on the ridge, two cross-supports.',
    why: 'Triangles cannot fold, and lashed joints keep the poles from spreading under load.',
    avoid: 'Leaving joints unlashed: the frame wobbles and the roof slides.',
    views: [{ pieces: [item('pole', -0.5, 0), item('greenBranch', 0, 0), item('cord', 0.5, 0)], caption: 'Poles, branches and cord' }],
  },
  roof: {
    name: 'Layered roof',
    look: 'Bark, dry leaves and dry grass, laid on the roof marks so they overlap.',
    why: 'Overlapping layers give rain no straight path through; a slope sheds it to the ground.',
    avoid: 'One thin layer: rain finds the gaps.',
    views: [{ pieces: [item('bark', -0.4, 0), item('leafLitter', 0, 0), item('dryGrass', 0.4, 0)], caption: 'Bark, leaves and grass' }],
  },
  rainTest: {
    name: 'Rain test',
    look: 'Drips under the roof show which panel needs another layer; puddles show where runoff collects.',
    why: 'Testing shows whether your design works. The fix is evidence-based: add a layer exactly where it leaks.',
    avoid: 'Standing outside the shelter, or digging the channel on the downhill side.',
    views: [{ pieces: [item('diggingStick')], caption: 'The digging stick cuts the channel' }],
  },
  roofLayers: {
    name: 'Roof layer test',
    look: 'Your roof panels: one with a single layer, one with two or more.',
    why: 'Comparing them in the same rain shows what actually keeps water out.',
    avoid: 'Changing two things at once (layers and slope): then you cannot tell which one mattered.',
    views: [{ pieces: [item('bark', -0.3, 0), item('leafLitter', 0.3, 0)], caption: 'One layer, then two' }],
  },
  framePush: {
    name: 'Push test',
    look: 'Your lean-to frame: first the two posts and the ridge, then with ribs and cross-supports.',
    why: 'Pushing both shows which shape keeps its form: the box or the triangles.',
    avoid: 'Adding ribs before you push the bare frame: then there is nothing to compare.',
    views: [{ pieces: [item('pole', -0.4, 0), item('greenBranch', 0.4, 0)], caption: 'Posts and ridge, then ribs' }],
  },
  bedMaterials: {
    name: 'Bed test',
    look: 'Bare ground, a bed of dry grass or leaves, and a bed of damp moss, each under your roof.',
    why: 'The same thickness, a different material: the heat flow into the ground tells them apart.',
    avoid: 'Mixing materials in one bed: then you cannot tell which one did it.',
    views: [{ pieces: [item('dryGrass', -0.4, 0), item('leafLitter', 0, 0), item('dampMoss', 0.4, 0)], caption: 'Grass, leaves, moss' }],
  },
  nightShelter: {
    name: 'A night in your shelter',
    look: 'The open clearing on a cold night, then your bed under the roof.',
    why: 'Comparing them shows what the shelter saves: the wind, the rain and the ground.',
    avoid: 'A damp bed, a leaking roof or wet clothes: each lets your heat out.',
    views: [{ pieces: [item('leafLitter', -0.3, 0), item('bark', 0.3, 0)], caption: 'A dry bed under a roof' }],
  },
  bed: {
    name: 'Leaf bed',
    look: 'A thick pile of dry leaves and grass under the roof.',
    why: 'Bare ground conducts your body heat away; dry, fluffy material traps still air, which insulates.',
    avoid: 'Damp moss and wet leaves: water conducts heat far faster than air.',
    views: [{ pieces: [item('leafLitter', -0.3, 0), item('dryGrass', 0.3, 0)], caption: 'Dry leaves and grass' }],
  },
};
