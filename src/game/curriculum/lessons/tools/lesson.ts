// Lesson 04: Tools, Materials & Primitive Engineering.
import type { LessonModule } from '../../types.js';
import { TOOLS_EXPERIMENTS } from './experiments.js';
import { TOOLS_HINTS, TOOLS_STEPS } from './steps.js';

export const TOOLS: LessonModule = {
  lesson: {
    id: 'tools',
    n: 4,
    name: 'Tools',
    title: 'Tools, Materials & Primitive Engineering',
    story: 'You can stay warm, dry and watered. Now make tools that let you do what bare hands cannot: edges, handles, cords and levers.',
    goal: 'Make a set of working stone tools, test your materials, and move a boulder no one could lift.',
    science: ['How stone fractures', 'Twisted fibres and tension', 'Wood grain, handles and wedges', 'Triangles and structures', 'Levers and mechanical advantage'],
    steps: ['stoneTools', 'strikeAngle', 'cutting', 'cordTest', 'axe', 'split', 'toolkit', 'frameTest', 'leverTest', 'boulder', 'toolCheck'],
    unlocks: ['Lesson 05: Food & Navigation', 'The flint seam at Split Rock', 'Tool-made gear: spears, knives, digging sticks'],
    complete: 'Edges, handles, cords, triangles and levers: simple machines that multiply what your hands can do.',
    legacyQuests: [],
  },
  steps: TOOLS_STEPS,
  hints: TOOLS_HINTS,
  experiments: TOOLS_EXPERIMENTS,
};
