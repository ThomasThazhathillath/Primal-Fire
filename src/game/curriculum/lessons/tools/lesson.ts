// Lesson 04: Tools, Materials & Primitive Engineering.
import type { LessonModule } from '../../types.js';
import { TOOLS_HINTS, TOOLS_STEPS } from './steps.js';

export const TOOLS: LessonModule = {
  lesson: {
    id: 'tools',
    n: 4,
    name: 'Tools',
    title: 'Tools, Materials & Primitive Engineering',
    story: 'You can stay warm, dry and watered. Now make tools that let you do what bare hands cannot.',
    goal: 'Make a set of working stone tools and use them on real jobs.',
    science: ['How stone fractures', 'Pressure: force over area', 'Wood grain and strength', 'Twisted fibres and tension', 'Levers and wedges'],
    steps: ['stoneTools', 'cutting', 'axe', 'split'],
    unlocks: ['Lesson 05: Food & Navigation', 'Tool-made gear: spears, knives, digging sticks'],
    complete: 'Edges, handles and wedges: simple machines that multiply what your hands can do.',
    legacyQuests: [],
  },
  steps: TOOLS_STEPS,
  hints: TOOLS_HINTS,
};
