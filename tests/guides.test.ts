import { describe, expect, it } from 'vitest';
import { BLUEPRINTS } from '../src/game/blueprint.js';
import { Game } from '../src/game/game.js';
import { GUIDE_FAILURES, GUIDE_MARKS, GUIDES, type GuideFailureCode } from '../src/game/guides.js';
import { ITEMS, type ItemId } from '../src/game/items.js';
import { QUESTS } from '../src/game/quests.js';
import { isScienceEvent } from '../src/game/science-events.js';

const nonEmpty = (s: unknown) => typeof s === 'string' && s.trim().length > 0;
const satchel = (g: Game) => JSON.stringify([...g.satchel].sort());

describe('guide data', () => {
  it('references only real items, structures, science events, marks and failure codes', () => {
    const marks = new Set<string>(GUIDE_MARKS);
    for (const gd of GUIDES) {
      if (gd.goal.structure) expect(BLUEPRINTS[gd.goal.structure], gd.id).toBeDefined();
      if (gd.goal.item) expect(ITEMS[gd.goal.item], gd.id).toBeDefined();
      for (const id of gd.keyItems) expect(ITEMS[id], `${gd.id} key ${id}`).toBeDefined();
      const stepIds = new Set(gd.steps.map((s) => s.id));
      expect(stepIds.size, `${gd.id} unique steps`).toBe(gd.steps.length);
      for (const s of gd.steps) {
        const where = `${gd.id}.${s.id}`;
        for (const id of Object.keys(s.materials)) expect(ITEMS[id as ItemId], `${where} ${id}`).toBeDefined();
        if (s.scienceEvent) expect(isScienceEvent(s.scienceEvent), where).toBe(true);
        if (s.mark) expect(marks.has(s.mark), where).toBe(true);
        for (const f of s.failures) {
          expect(GUIDE_FAILURES[f.code], `${where} ${f.code}`).toBeDefined();
          if (f.goTo) expect(stepIds.has(f.goTo), `${where} goTo ${f.goTo}`).toBe(true);
        }
        if (s.visual?.ghost) expect(BLUEPRINTS[s.visual.ghost], where).toBeDefined();
        for (const t of [s.title, s.instruction, s.science, s.place, s.success]) expect(nonEmpty(t), where).toBe(true);
      }
    }
  });
  it('every mark belongs to exactly one step', () => {
    for (const m of GUIDE_MARKS) {
      const owners = GUIDES.flatMap((gd) => gd.steps.filter((s) => s.mark === m));
      expect(owners.length, m).toBe(1);
    }
  });
  it('every failure code has correction text and is used by some step', () => {
    const used = new Set(GUIDES.flatMap((gd) => gd.steps.flatMap((s) => s.failures.map((f) => f.code))));
    for (const [code, text] of Object.entries(GUIDE_FAILURES)) {
      expect(nonEmpty(text), code).toBe(true);
      expect(used.has(code as GuideFailureCode), code).toBe(true);
    }
  });
  it('covers the requested builds', () => {
    const ids = GUIDES.map((g) => g.id);
    for (const id of ['workbench', 'firePit', 'filter', 'shelter', 'pot', 'bow', 'cord', 'knap', 'axe']) expect(ids).toContain(id);
    expect(GUIDES.find((g) => g.id === 'workbench')!.steps).toHaveLength(6);
  });
  it('quest steps point at real guides', () => {
    const ids = new Set(GUIDES.map((g) => g.id));
    for (const q of QUESTS) for (const s of q.steps) if (s.guide) expect(ids.has(s.guide), s.guide).toBe(true);
  });
  it('the water filter teaches filtration vs disinfection', () => {
    const boil = GUIDES.find((g) => g.id === 'filter')!.steps.at(-1)!;
    expect(boil.science).toMatch(/microbes/);
    expect(boil.science).toMatch(/Boiling/);
  });
});

describe('workbench walkthrough', () => {
  it('walks every stage, handles a wobble by sending you back, and never crafts for you', () => {
    const g = new Game();
    g.guide.pin('workbench');
    const step = () => g.guide.current()!.step.id;
    expect(step()).toBe('gather');

    g.gather('slab');
    for (let i = 0; i < 3; i++) g.gather('dryStone');
    expect(step()).toBe('site');

    const before = satchel(g);
    g.guide.mark('workbench.site.ready');
    expect(step()).toBe('supports');
    expect(g.guide.current()!.step.visual?.highlightSpots).toEqual([0, 1, 2]);

    // A bad placement keeps you on the step with specific feedback.
    const msg = g.guide.fail('support.tooFar');
    expect(msg).toMatch(/too far/);
    expect(step()).toBe('supports');
    expect(g.guide.current()!.failure?.code).toBe('support.tooFar');

    g.guide.mark('workbench.supports.placed');
    expect(g.guide.current()!.failure).toBeUndefined();
    expect(step()).toBe('slab');
    g.guide.mark('workbench.slab.aligned');
    expect(step()).toBe('push');

    // The push test finds a wobbly support: back to placing supports.
    const wobble = g.guide.fail('support.unstable', 'the support on your left');
    expect(wobble).toMatch(/wobbles/);
    expect(wobble).toMatch(/on your left/);
    expect(step()).toBe('supports');
    expect(g.guide.current()!.failure?.code).toBe('support.unstable');

    // Reposition, re-lay, push again.
    g.guide.mark('workbench.supports.placed');
    g.guide.mark('workbench.slab.aligned');
    g.guide.mark('workbench.push.stable');
    expect(step()).toBe('done');
    expect(g.guide.current()!.complete).toBe(false);

    // Marks and failures never touched the satchel or built anything.
    expect(satchel(g)).toBe(before);
    expect(g.hasStructure('workbench')).toBe(false);

    // Only the player's own building finishes it.
    g.takeOut('slab');
    const res = g.placeBlueprint('workbench', -1, -2);
    expect(res.ok).toBe(true);
    res.structure!.spots.forEach((_, i) => expect(g.fillSpot(res.structure!.id, i)).toBe(true));
    expect(g.hasStructure('workbench')).toBe(true);
    const done = g.guide.view(GUIDES.find((x) => x.id === 'workbench')!);
    expect(done.complete).toBe(true);
    expect(done.step.onComplete).toMatchObject({ sound: 'complete', notebook: true, roadmap: true });
  });

  it('falls back to plain building when no physical marks are reported', () => {
    const g = new Game();
    g.gather('slab');
    for (let i = 0; i < 3; i++) g.gather('dryStone');
    g.takeOut('slab');
    const res = g.placeBlueprint('workbench', -1, -2);
    g.guide.pin('workbench');
    expect(g.guide.current()!.step.id).toBe('supports');
    res.structure!.spots.forEach((_, i) => g.fillSpot(res.structure!.id, i));
    expect(g.guide.isComplete(GUIDES[0])).toBe(true);
  });
});

describe('context and hints', () => {
  it('selects by held item and by quest step', () => {
    const g = new Game();
    expect(g.guide.current()).toBeNull();
    g.gather('greenBranch');
    g.takeOut('greenBranch');
    expect(g.guide.select()!.id).toBe('bow');
  });
  it('selects by nearby materials', () => {
    const g = new Game();
    expect(g.guide.select({ nearby: ['fibers'] })!.id).toBe('cord');
  });
  it('escalates science → place → instruction, skipping known science and after failures', () => {
    const g = new Game();
    g.guide.pin('knap');
    const gather = GUIDES.find((x) => x.id === 'knap')!.steps[0];
    expect(g.guide.hintText(0)!.text).toBe(gather.science);
    expect(g.guide.hintText(1)!.text).toBe(gather.place);
    expect(g.guide.hintText(2)!.text).toBe(gather.instruction);
    g.guide.fail('knap.coarseStone');
    g.guide.fail('knap.coarseStone');
    const h = g.guide.hintText(0)!;
    expect(h.level).toBe(2);
    expect(h.text).toMatch(/coarse/);
  });
  it('Game.hint uses the active guide step text', () => {
    const g = new Game();
    g.guide.pin('shelter');
    const r = g.hint(() => null)!;
    expect(r.text).toBe(GUIDES.find((x) => x.id === 'shelter')!.steps[0].science);
  });
  it('rejects unknown marks and failure codes, and survives save/load', () => {
    const g = new Game();
    expect(() => g.guide.mark('nope' as never)).toThrow();
    expect(() => g.guide.fail('nope' as never)).toThrow();
    g.guide.pin('workbench');
    g.guide.mark('workbench.site.ready');
    g.guide.fail('support.tooFar');
    const r = Game.restore(JSON.parse(JSON.stringify(g.snapshot())));
    expect(r.guide.marks.has('workbench.site.ready')).toBe(true);
    expect(r.guide.pinned).toBe('workbench');
  });
});
