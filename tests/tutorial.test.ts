import { gazeStats } from '../src/game/gaze.js';
import { describe, expect, it } from 'vitest';
import { spotWorldPosition } from '../src/game/blueprint.js';
import { LAY_NEEDS } from '../src/game/fire.js';
import { Game } from '../src/game/game.js';
import { setEasyCarry } from '../src/game/items.js';
import { campItems, tutorialSpots } from '../src/game/tutorial-layout.js';
import { LESSONS, storyHour, TutorialRunner, type LessonId } from '../src/game/tutorial-lessons.js';
import {
  chooseSurvival,
  chooseTutorial,
  choiceMade,
  currentMode,
  MODE_KEY,
  SURVIVAL_SAVE_KEY,
  TUTORIAL_PROGRESS_KEY,
  TUTORIAL_SAVE_KEY,
  saveProgressRaw,
  saveCarry,
  takeCarry,
  CARRY_KEY,
  type KeyStore,
} from '../src/game/tutorial-mode.js';

const ui = { hintLevel: 0, notebookOpen: false };

function store(): KeyStore & { m: Map<string, string> } {
  const m = new Map<string, string>();
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

function at(r: TutorialRunner, id: LessonId): void {
  expect(r.lesson.id).toBe(id);
}

/** Play every lesson with real Game actions, as a player would. */
function playLesson(r: TutorialRunner, g: Game): void {
  switch (r.lesson.id) {
    case 'hands':
      g.gather('slab', 'tutorial');
      g.gather('dryStone', 'tutorial');
      break;
    case 'look':
      gazeStats.picks++;
      gazeStats.releases++;
      gazeStats.placed++;
      break;
    case 'gather':
      for (const id of ['dryGrass', 'twigs', 'fibers', 'dryStone'] as const) g.gather(id, 'tutorial');
      break;
    case 'satchel':
      g.takeOut('dryStone');
      g.stow();
      break;
    case 'move':
      g.setPlayerPosition(1.5, 0);
      r.poll(ui);
      g.facingYaw = 0.5;
      r.poll(ui);
      g.facingYaw = 1.0;
      r.poll(ui);
      g.setPlayerPosition(0, 0);
      break;
    case 'place':
      g.takeOut('logs');
      g.dropItem('logs', 0.5, -1);
      g.takeOut('dryStone');
      g.dropItem('dryStone', 0.5, -1.5);
      break;
    case 'build': {
      g.gather('slab');
      if (g.held !== 'slab') g.takeOut('slab'); // easy carry: it went in the bag
      const s = g.placeBlueprint('workbench', -1, -1.5).structure!;
      r.poll(ui);
      for (let i = 0; i < 3; i++) {
        const p = spotWorldPosition(s, i);
        g.fillSpot(s.id, i, 'dryStone', { x: p.x, z: p.z });
      }
      r.poll(ui);
      g.placeKey(s.id, s.x, s.z, 2);
      break;
    }
    case 'craft':
      g.craft('cord');
      g.craft('bowDrill');
      break;
    case 'fire': {
      if (g.held) g.dropItem(g.held, 1, 1);
      g.takeOut('dryStone');
      const pit = g.placeBlueprint('firePit', 1.5, 1.5).structure!;
      pit.spots.forEach((_, i) => g.fillSpot(pit.id, i));
      r.poll(ui);
      g.addItem('dryGrass', LAY_NEEDS.tinder);
      g.addItem('twigs', LAY_NEEDS.twigs);
      g.addItem('logs', LAY_NEEDS.logs);
      while (!g.fire.layBuilt) g.fire.addFuel();
      r.poll(ui);
      g.takeOut('bowDrill');
      for (let i = 0; i < 100 && !g.fire.carrying; i++) g.fire.saw(0.3, 0.2);
      g.fire.transferEmber();
      for (let i = 0; i < 20; i++) g.fire.fan(0.6, 0.25);
      break;
    }
    case 'hints':
      r.poll({ hintLevel: 1, notebookOpen: false });
      r.poll({ hintLevel: 2, notebookOpen: false });
      return;
    case 'notebook':
      r.poll({ hintLevel: 0, notebookOpen: true });
      return;
    case 'final': {
      if (g.held) g.dropItem(g.held, 1, 1);
      g.gather('fibers', 'tutorial');
      g.gather('fibers', 'tutorial');
      g.gather('fibers', 'tutorial');
      g.addItem('dryStone', 4);
      g.takeOut('dryStone');
      const pit = g.placeBlueprint('firePit', -2, 1).structure;
      if (pit) pit.spots.forEach((_, i) => g.fillSpot(pit.id, i));
      r.poll(ui);
      g.craft('cord');
      break;
    }
  }
  r.poll(ui);
}

describe('THE FIRST STEPS tutorial', () => {
  it('every lesson can be completed in order with the real mechanics', () => {
    const g = new Game();
    const r = new TutorialRunner(g);
    const order = LESSONS.map((l) => l.id);
    for (const id of order) {
      at(r, id);
      playLesson(r, g);
      if (id !== 'final') expect(r.lesson.id, `stuck in ${id}: ticks ${r.ticks}`).not.toBe(id);
    }
    expect(r.finished).toBe(true);
    expect([...r.done].sort()).toEqual([...order].sort());
  });

  it('every lesson can also be completed with easy carry on (the play-test build)', () => {
    setEasyCarry(true);
    try {
      const g = new Game();
      const r = new TutorialRunner(g);
      for (const l of LESSONS) {
        at(r, l.id);
        playLesson(r, g);
      }
      expect(r.finished).toBe(true);
    } finally {
      setEasyCarry(false);
    }
  });

  it('each lesson can be replayed on its own from a fresh game (none can strand you)', () => {
    for (let i = 0; i < LESSONS.length; i++) {
      const g = new Game();
      const r = new TutorialRunner(g);
      // Lessons that need a finished bench: build it first like a player would.
      if (['craft', 'final'].includes(LESSONS[i].id)) {
        r.begin(LESSONS.findIndex((l) => l.id === 'build'));
        playLesson(r, g);
      }
      r.begin(i);
      playLesson(r, g);
      expect(r.done.has(LESSONS[i].id), `lesson ${LESSONS[i].id}`).toBe(true);
    }
  });

  it('a finished lesson can be repeated and ticks again from scratch', () => {
    const g = new Game();
    const r = new TutorialRunner(g);
    playLesson(r, g);
    at(r, 'look');
    r.begin(0);
    expect(r.ticks.every((t) => !t)).toBe(true);
    playLesson(r, g);
    at(r, 'look'); // goes on to the first lesson not yet done
  });

  it('a lesson can be skipped, and the whole tutorial too', () => {
    const g = new Game();
    const r = new TutorialRunner(g);
    r.skipLesson();
    at(r, 'look');
    expect(r.done.has('hands')).toBe(true);
    r.skipAll();
    expect(r.finished).toBe(true);
    expect(r.done.size).toBe(LESSONS.length);
  });

  it('a second stone counts as the second pickup', () => {
    const g = new Game();
    const r = new TutorialRunner(g);
    g.gather('dryStone');
    g.gather('dryStone');
    at(r, 'look');
  });

  it('outside building lessons no blueprint can be started; inside, only the lesson structure', () => {
    const g = new Game();
    const r = new TutorialRunner(g);
    r.begin(LESSONS.findIndex((l) => l.id === 'place'));
    g.takeOut('dryStone');
    expect(g.placeBlueprint('firePit', 1, 1).ok).toBe(false);
    expect(g.structures.length).toBe(0);
    r.begin(LESSONS.findIndex((l) => l.id === 'build'));
    g.takeOut('dryStone');
    expect(g.placeBlueprint('firePit', 1, 1).ok).toBe(false);
    r.begin(LESSONS.findIndex((l) => l.id === 'fire'));
    if (g.held !== 'dryStone') g.takeOut('dryStone');
    expect(g.placeBlueprint('firePit', 1, 1).ok).toBe(true);
    r.skipAll();
    expect(g.allowsBuild('storage')).toBe(true);
  });

  it('the final challenge needs a finished structure, not just an outline', () => {
    const g = new Game();
    const r = new TutorialRunner(g);
    r.begin(LESSONS.findIndex((l) => l.id === 'final'));
    g.addItem('dryStone', 4);
    g.takeOut('dryStone');
    const pit = g.placeBlueprint('firePit', -2, 1).structure!;
    r.poll(ui);
    expect(r.ticks[2]).toBe(false);
    pit.spots.forEach((_, i) => g.fillSpot(pit.id, i));
    r.poll(ui);
    expect(r.ticks[2]).toBe(true);
  });

  it('tasks tick any order and never un-tick', () => {
    const g = new Game();
    const r = new TutorialRunner(g);
    r.skipLesson();
    r.skipLesson();
    at(r, 'gather');
    g.gather('fibers');
    g.gather('dryStone');
    expect(r.ticks).toEqual([false, false, true, true]); // any order: each ticks the moment it is gathered
    g.gather('twigs');
    expect(r.ticks).toEqual([false, true, true, true]);
    g.gather('dryGrass');
    at(r, 'satchel');
  });

  it('a reload mid-lesson keeps the half-built work (setup does not run again)', () => {
    const g = new Game();
    const r = new TutorialRunner(g);
    r.begin(LESSONS.findIndex((l) => l.id === 'build'));
    g.gather('slab');
    if (g.held !== 'slab') g.takeOut('slab');
    g.placeBlueprint('workbench', -1, -1.5);
    r.poll(ui);
    const g2 = Game.restore(JSON.parse(JSON.stringify(g.snapshot())));
    const r2 = new TutorialRunner(g2, JSON.parse(JSON.stringify(r.snapshot())));
    at(r2, 'build');
    expect(g2.structures.length).toBe(1);
    expect(r2.ticks[0]).toBe(true); // the plan tick is kept
  });

  it('progress survives a reload', () => {
    const g = new Game();
    const r = new TutorialRunner(g);
    r.skipLesson();
    r.skipLesson();
    r.skipLesson();
    const r2 = new TutorialRunner(new Game(), JSON.parse(JSON.stringify(r.snapshot())));
    at(r2, 'satchel');
    expect(r2.done.has('hands')).toBe(true);
  });

  it('every item the lessons expect you to gather is on offer in the camp, within seated reach', () => {
    const offered = campItems();
    for (const id of ['dryGrass', 'twigs', 'fibers', 'dryStone', 'logs', 'slab', 'spindle', 'board', 'greenBranch', 'dampMoss'] as const) {
      expect(offered.has(id), id).toBe(true);
    }
    for (const s of tutorialSpots()) {
      expect(Math.hypot(s.x, s.z)).toBeLessThan(2.3);
      expect(s.regrow).toBeGreaterThan(0);
    }
  });
});

describe('tutorial and survival saves stay separate', () => {
  it('uses keys distinct from the survival save', () => {
    const keys = [TUTORIAL_SAVE_KEY, TUTORIAL_PROGRESS_KEY, MODE_KEY];
    expect(keys).not.toContain(SURVIVAL_SAVE_KEY);
    expect(new Set(keys).size).toBe(3);
  });

  it('choosing, leaving and lesson progress never touch the survival save', () => {
    const s = store();
    s.setItem(SURVIVAL_SAVE_KEY, '{"survival":true}');
    expect(choiceMade(s)).toBe(true);
    chooseTutorial(s);
    expect(currentMode(s, '')).toBe('tutorial');
    s.setItem(TUTORIAL_SAVE_KEY, '{"t":1}');
    saveProgressRaw('{"done":[]}', s);
    chooseSurvival(s);
    expect(currentMode(s, '')).toBe('survival');
    expect(s.getItem(TUTORIAL_SAVE_KEY)).toBeNull(); // the tutorial's game is thrown away
    expect(s.getItem(SURVIVAL_SAVE_KEY)).toBe('{"survival":true}');
  });

  it('a first-time player has not made the choice; ?tutorial forces the tutorial', () => {
    const s = store();
    expect(choiceMade(s)).toBe(false);
    expect(currentMode(s, '')).toBe('tutorial'); // a new player starts in The First Steps
    s.setItem(SURVIVAL_SAVE_KEY, '{"survival":true}');
    expect(currentMode(s, '')).toBe('survival'); // an existing save keeps going
    expect(currentMode(s, '?tutorial')).toBe('tutorial');
    chooseTutorial(s);
    expect(s.getItem(TUTORIAL_SAVE_KEY)).toBeNull(); // starts fresh
  });

  it('a tutorial game never shares state with another Game', () => {
    const survival = new Game();
    survival.addItem('dryStone', 2);
    const tutorial = new Game();
    const r = new TutorialRunner(tutorial);
    r.begin(LESSONS.findIndex((l) => l.id === 'fire'));
    expect(survival.count('bowDrill')).toBe(0);
    expect(survival.count('dryStone')).toBe(2);
  });
});

describe('the opening as a story', () => {
  it('no step title or line reads like a training course', () => {
    for (const l of LESSONS) {
      for (const t of [l.title, l.say, l.science, ...l.tasks.map((x) => x.text)]) {
        expect(t, t).not.toMatch(/lesson|tutorial|training|\bpractice\b/i);
      }
      expect(l.title).not.toMatch(/^\d/);
      expect(l.science.length).toBeGreaterThan(10);
    }
  });

  it('a science line follows each step, and its notebook entry is recorded', () => {
    const g = new Game();
    const r = new TutorialRunner(g);
    const said: string[] = [];
    r.on((e) => e.type === 'science' && said.push(e.text));
    r.begin(LESSONS.findIndex((l) => l.id === 'gather'));
    playLesson(r, g);
    expect(said).toEqual([LESSONS[LESSONS.findIndex((l) => l.id === 'gather')].science]);
    expect(g.notebook).toContain('g_dead');
  });

  it('the clock runs from early afternoon to dusk across the opening', () => {
    expect(storyHour('hands')).toBeCloseTo(13);
    expect(storyHour('fire')).toBeGreaterThanOrEqual(18); // dusk by the fire
    expect(storyHour(null)).toBeGreaterThan(storyHour('final'));
    for (let i = 1; i < LESSONS.length; i++) expect(storyHour(LESSONS[i].id)).toBeGreaterThan(storyHour(LESSONS[i - 1].id));
  });

  it('only learned controls carry into survival, once', () => {
    const s = store();
    saveCarry({ learned: ['grab', 'build', 7 as unknown as string] }, s);
    expect(JSON.parse(s.getItem(CARRY_KEY)!)).toEqual({ learned: ['grab', 'build'] });
    expect(takeCarry(s)).toEqual({ learned: ['grab', 'build'] });
    expect(takeCarry(s)).toBeNull();
    expect(s.getItem(SURVIVAL_SAVE_KEY)).toBeNull();
  });
});
