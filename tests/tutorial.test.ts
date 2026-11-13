import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/game.js';
import { setEasyCarry } from '../src/game/items.js';
import { campItems, tutorialSpots } from '../src/game/tutorial-layout.js';
import { BENCH_SITE, LESSONS, RING, storyHour, TutorialRunner, type LessonId } from '../src/game/tutorial-lessons.js';
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

const bench = (g: Game) => g.structures.find((s) => s.kind === 'workbench');

/** Play the open step with real Game actions, as a player would. */
function playLesson(r: TutorialRunner, g: Game): void {
  switch (r.lesson.id) {
    case 'stone':
      g.gather('dryStone', 'tutorial');
      break;
    case 'ring':
      g.setPlayerPosition(RING.x + 0.3, RING.z);
      break;
    case 'marks': {
      const b = bench(g)!;
      b.spots.forEach((_, i) => g.fillFromBag(b.id, i));
      break;
    }
    case 'slab':
      g.gather('slab', 'tutorial');
      if (g.held !== 'slab') g.takeOut('slab'); // easy carry: it went in the bag
      break;
    case 'top': {
      const b = bench(g)!;
      if (g.held !== 'slab') g.takeOut('slab');
      g.placeKey(b.id, b.x, b.z, 2);
      break;
    }
    case 'bag':
      r.poll({ ...ui, bagOpen: true });
      return;
    case 'bench':
      r.poll({ ...ui, benchOpen: true });
      return;
  }
  r.poll(ui);
}

describe('THE FIRST STEPS: seven one-instruction steps', () => {
  it('has 6 to 8 steps, each one instruction of at most six words, verb first', () => {
    expect(LESSONS.length).toBeGreaterThanOrEqual(6);
    expect(LESSONS.length).toBeLessThanOrEqual(8);
    for (const l of LESSONS) {
      expect(l.title.split(/\s+/).length, l.title).toBeLessThanOrEqual(6);
      expect(l.title, l.title).toMatch(/^(Pinch|Walk|Put|Tap|Open|Turn|Look|Take|Make)\b/);
      expect(l.tasks.length, l.id).toBe(1);
    }
  });

  it('every step can be completed in order with the real mechanics', () => {
    const g = new Game();
    const r = new TutorialRunner(g);
    for (const l of LESSONS) {
      at(r, l.id);
      playLesson(r, g);
    }
    expect(r.finished).toBe(true);
    expect(bench(g)?.complete).toBe(true);
  });

  it('also with easy carry on (the play-test build)', () => {
    setEasyCarry(true);
    try {
      const g = new Game();
      const r = new TutorialRunner(g);
      for (let n = 0; n < 12 && !r.finished; n++) playLesson(r, g);
      expect(r.finished).toBe(true);
    } finally {
      setEasyCarry(false);
    }
  });

  it('each step can be replayed on its own from a fresh game (none can strand you)', () => {
    for (let i = 0; i < LESSONS.length; i++) {
      const g = new Game();
      const r = new TutorialRunner(g);
      r.begin(i);
      playLesson(r, g);
      expect(r.done.has(LESSONS[i].id), `step ${LESSONS[i].id}`).toBe(true);
    }
  });

  it('every step but the bag points at its exact target', () => {
    const g = new Game();
    const r = new TutorialRunner(g);
    for (const l of LESSONS) {
      if (l.id !== 'bag') expect(l.target?.(g), l.id).toBeTruthy();
      playLesson(r, g);
    }
  });

  it('the marks step lays a practice workbench outline beyond the ring, and a pinch per mark fills it', () => {
    const g = new Game();
    const r = new TutorialRunner(g);
    r.begin(LESSONS.findIndex((l) => l.id === 'marks'));
    const b = bench(g)!;
    expect(Math.hypot(b.x - BENCH_SITE.x, b.z - BENCH_SITE.z)).toBeLessThan(1.5);
    expect(g.fillFromBag(b.id, 0)).toBe(true);
    expect(b.spots[0]).not.toBeNull();
  });

  it('a step can be skipped, and the whole thing too', () => {
    const g = new Game();
    const r = new TutorialRunner(g);
    r.skipLesson();
    at(r, 'ring');
    r.skipAll();
    expect(r.finished).toBe(true);
    expect(r.done.size).toBe(LESSONS.length);
  });

  it('progress survives a reload', () => {
    const g = new Game();
    const r = new TutorialRunner(g);
    r.skipLesson();
    r.skipLesson();
    const r2 = new TutorialRunner(new Game(), JSON.parse(JSON.stringify(r.snapshot())));
    at(r2, 'marks');
    expect(r2.done.has('stone')).toBe(true);
  });

  it('outside building steps no blueprint can be started', () => {
    const g = new Game();
    const r = new TutorialRunner(g);
    r.begin(LESSONS.findIndex((l) => l.id === 'ring'));
    g.addItem('dryStone', 1);
    g.takeOut('dryStone');
    expect(g.placeBlueprint('firePit', 1, 1).ok).toBe(false);
    r.skipAll();
    expect(g.allowsBuild('storage')).toBe(true);
  });

  it('every item the steps need is on offer in the camp, within seated reach', () => {
    const offered = campItems();
    for (const id of ['dryStone', 'slab'] as const) expect(offered.has(id), id).toBe(true);
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
    r.begin(LESSONS.findIndex((l) => l.id === 'marks'));
    playLesson(r, g);
    expect(said).toEqual([LESSONS[LESSONS.findIndex((l) => l.id === 'marks')].science]);
    expect(g.notebook).toContain('b_tripod');
  });

  it('the clock runs from early afternoon towards dusk across the steps', () => {
    expect(storyHour(LESSONS[0].id)).toBeCloseTo(13);
    expect(storyHour(null)).toBeGreaterThan(storyHour(LESSONS[LESSONS.length - 1].id));
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
