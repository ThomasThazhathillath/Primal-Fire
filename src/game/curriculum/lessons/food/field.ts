// Lesson 05 field rules: plant judgement prompts, reading the sky and the sun, the long trek without a compass,
// the closing check, and the food-chain observations. Pure game rules (no rendering), ticked in Game's 4 Hz
// slow step; a system feeds it where you look (observeView) and the choice card shows its prompts.
//
// Everything that counts as an experiment trial comes from the simulation: the real cloud cover and rain
// (environment.ts), the real sun direction for the hour (sunDirection), the body's real digestion
// (survival/body.ts onMeal), and the real plant behind each judgement (food.ts judge).

import { campOf } from '../../../directions.js';
import { sunDirection } from '../../../environment.js';
import { type ForagePatch, FEATURE_NAMES, FIELD_GUIDE, type PlantFeatures } from '../../../forage.js';
import type { Game } from '../../../game.js';
import type { ItemId } from '../../../items.js';
import type { JudgeResult, Verdict } from '../../../food.js';
import { LANDMARK_BY_ID } from '../../../world-layout.js';
import type { Assessment } from '../../../science/assessments.js';
import { FOOD_PROFILES, LASTING_SECONDS, nutritionValue } from './nutrition.js';

/** A card with a question and up to three answers (choice-system.ts draws it). */
export interface ChoicePrompt {
  /** What it is about ('judge:4', 'trek', 'check:2'): the card re-renders when it changes. */
  key: string;
  label: string;
  title: string;
  body: string;
  /** Two side-by-side boxes (this plant / the field guide). */
  cols: Array<{ head: string; text: string }> | null;
  options: string[];
  /** Feedback after an answer. */
  note: string | null;
  /** The big button ('Done', 'Next question'); null = none. */
  action: string | null;
}

export type TrekPhase = 'idle' | 'active' | 'done';

export interface FieldSave {
  v: 1;
  trek: { phase: TrekPhase; reached: boolean; gathered: number; ate: boolean; tries: number };
  /** Closing check: questions answered right so far. */
  check: number;
  checkDone: boolean;
  /** Plant judgements: how many, how many right. */
  judged: number;
  judgedRight: number;
  briefed: boolean;
}

/** Where the trek goes: the Ruins, under the rusted mast, where the Science Roadmap stands. */
export const TREK_DEST = 'ruins';
/** You have set out once you are this far (m) from camp, and are home again within HOME_RADIUS. */
export const TREK_START_RADIUS = 10;
export const HOME_RADIUS = 6;
/** Food to gather on the way. */
export const TREK_FOOD = 4;
/** The trek starts only in daylight hours (game clock), so there is time to get back before dark. */
export const TREK_HOURS: [number, number] = [6, 16];
/** Looking up this long (s) reads the sky; looking at the sun this long reads its direction. */
export const SKY_LOOK = 1.5;
export const SUN_LOOK = 1;
/** After reading the sky, the game watches this long (s) for rain. */
export const SKY_WATCH = 90;

const DIRS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
/** Compass bearing (deg, 0 = north = -Z, 90 = east = +X) of a direction on the ground. */
export const bearingOf = (dx: number, dz: number): number => ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
export const directionWord = (bearing: number): string => DIRS[Math.round(bearing / 45) % 8];
/** Where the sun is on the ground (east, south, west) at an hour, from the same sun path the sky uses. */
export function sunSector(hour: number): 'east' | 'south' | 'west' | 'down' {
  const d = [0, 0, 0];
  sunDirection(hour, d);
  if (d[1] <= 0.02) return 'down';
  const b = bearingOf(d[0], d[2]);
  return b < 135 ? 'east' : b <= 225 ? 'south' : 'west';
}

/** The closing check: one question each on plants, the sun, preserving food and packing for a trek. */
export const FINAL_CHECK: Assessment[] = [
  {
    question: 'Red berries like the guide, but on a smooth stem where the guide says hairy. What do you do?',
    options: [
      { id: 'leave', text: 'Leave it: one feature does not match.', correct: true, why: 'One wrong feature means it is not the plant in the guide.' },
      { id: 'eat', text: 'Eat some: the colour is right.', why: 'Colour alone never identifies a plant; look-alikes share it.' },
      { id: 'taste', text: 'Taste one and wait to see.', why: 'Tasting is how poisonings happen: some plants harm in small amounts.' },
    ],
  },
  {
    question: 'It is late afternoon and you must walk west. Where is the sun?',
    options: [
      { id: 'ahead', text: 'Ahead of me, getting lower.', correct: true, why: 'The sun sets in the west, so late in the day it lies ahead when you walk west.' },
      { id: 'behind', text: 'Behind me.', why: 'Behind you is east, where the sun rises in the morning.' },
      { id: 'overhead', text: 'Straight overhead.', why: 'It is highest around midday; by late afternoon it has moved to the west.' },
    ],
  },
  {
    question: 'Why does dried fish keep for weeks when fresh fish spoils in days?',
    options: [
      { id: 'water', text: 'Microbes need water, and drying takes it out.', correct: true, why: 'With too little water, microbes can hardly grow.' },
      { id: 'kill', text: 'Drying kills every germ for ever.', why: 'Drying only slows them: wet it again and they grow again.' },
      { id: 'sun', text: 'Sunlight makes the fish poisonous to germs.', why: 'It is the lost water, not the light, that stops them growing.' },
    ],
  },
  {
    question: 'You pack food for a long walk. What keeps you going longest?',
    options: [
      { id: 'fatprotein', text: 'Dried fish and nuts: protein and fat.', correct: true, why: 'Fat and protein digest slowly, and fat holds the most energy per bite.' },
      { id: 'sugar', text: 'Berries: sugar is the best fuel.', why: 'Sugar is quick energy, but it is soon used up.' },
      { id: 'none', text: 'Nothing: I will find food on the way.', why: 'You may find none in time. Carry food that keeps.' },
    ],
  },
];

const VERDICTS: Verdict[] = ['safe', 'unsafe', 'unsure'];

export class FieldLesson {
  prompt: ChoicePrompt | null = null;
  /** Bumped whenever the prompt changes (the card re-renders on it). */
  version = 0;
  trek = { phase: 'idle' as TrekPhase, reached: false, gathered: 0, ate: false, tries: 0 };
  check = 0;
  checkDone = false;
  judgedCount = 0;
  judgedRight = 0;
  briefed = false;
  private judging: number | null = null;
  private skyLook = 0;
  private sunLook = 0;
  private skyCooldown = 0;
  /** A sky reading being watched: what it looked like and seconds since. */
  private skyWatch: { kind: 'dark' | 'clear'; t: number } | null = null;
  private cloudPast = 0;
  private cloudT = 0;
  private cloudRising = false;
  private daylightToast = -999;
  private sunRead = '';
  private sunReadAt = -999;

  constructor(private readonly g: Game) {
    g.body.onMeal = (tag, seconds) => this.onMeal(tag, seconds);
  }

  // ------------------------------------------------------------ the choice card

  private show(p: ChoicePrompt | null): void {
    this.prompt = p;
    this.version++;
  }

  /** Close the card (its Close button). */
  dismiss(): void {
    if (this.prompt) this.show(null);
    this.judging = null;
  }

  /** An answer button on the card. */
  choose(i: number): void {
    const p = this.prompt;
    if (!p) return;
    if (p.key.startsWith('judge:') && this.judging !== null) {
      const v = VERDICTS[i];
      const r = v ? this.g.food.judge(this.judging, v) : null;
      this.judging = null;
      if (r) this.show({ ...p, options: [], note: `${r.correct ? 'Good judgement.' : 'A bad guess.'} ${r.text}`, action: 'Done' });
      return;
    }
    if (p.key.startsWith('check:')) {
      const q = FINAL_CHECK[this.check];
      const o = q?.options[i];
      if (!o) return;
      if (o.correct) {
        this.check++;
        const last = this.check >= FINAL_CHECK.length;
        if (last) {
          this.checkDone = true;
          this.g.science('curriculum.food.checked');
          this.g.checkProgress();
        }
        this.show({ ...p, options: [], note: `Right: ${o.why}`, action: last ? 'Finish' : 'Next question' });
      } else this.show({ ...p, note: `Not quite: ${o.why}` });
    }
  }

  /** The big button. */
  act(): void {
    const p = this.prompt;
    if (!p) return;
    if (p.key.startsWith('check:') && !this.checkDone && !p.options.length) return this.checkPrompt();
    this.dismiss();
  }

  /** The objective card's Why? on a Lesson 05 step with a card of its own: open it. */
  openFor(stepId: string): boolean {
    if (stepId === 'trek') {
      this.trekPrompt();
      return true;
    }
    if (stepId === 'finalCheck' && !this.checkDone) {
      this.checkPrompt();
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------ plant judgement

  /** Looking closely at a wild plant: what you can observe, next to the field guide; you decide. */
  judgePrompt(fp: ForagePatch): void {
    const guide = FIELD_GUIDE[fp.kind];
    const lines = (f: PlantFeatures) => (Object.keys(FEATURE_NAMES) as Array<keyof PlantFeatures>).map((k) => `${FEATURE_NAMES[k]}: ${f[k]}`).join('\n');
    this.judging = fp.id;
    this.show({
      key: `judge:${fp.id}`,
      label: 'JUDGE BEFORE YOU EAT',
      title: 'Is this plant food?',
      body: 'Compare every feature with your field guide. Nothing is eaten until you decide.',
      cols: [
        { head: 'This plant', text: lines(fp.features) },
        { head: `Field guide: ${guide.name}`, text: lines(guide.features) },
      ],
      options: ['Safe to eat', 'Not safe', 'Not sure'],
      note: null,
      action: null,
    });
  }

  judged(r: JudgeResult): void {
    this.judgedCount++;
    if (r.correct) this.judgedRight++;
  }

  // ------------------------------------------------------------ nutrition

  /** You ate a food: say what it is made of. */
  ate(id: ItemId): void {
    const p = FOOD_PROFILES[id];
    if (!p) return;
    this.g.toast(p.label, 'note');
    this.g.science(p.main === 'sugar' ? 'food.ate.sugar' : p.main === 'fat' ? 'food.ate.fat' : 'food.ate.protein');
    if (id === 'cookedFish' || id === 'driedFish') this.g.science('food.fish.eaten');
    if (this.trek.phase === 'active') this.trek.ate = true;
  }

  /** The body finished digesting a meal: how long it kept you fed is a trial of the nutrition experiment. */
  private onMeal(tag: string, seconds: number): void {
    const v = nutritionValue(tag as ItemId);
    if (!v || seconds < 0) return;
    this.g.experiments.trial('nutrition', v, seconds >= LASTING_SECONDS ? 'long' : 'short');
  }

  /** Food gathered (picked, caught or dug): counts towards the trek. */
  gatheredFood(n: number): void {
    if (this.trek.phase === 'active') this.trek.gathered += n;
  }

  // ------------------------------------------------------------ where you look (sky and sun)

  /**
   * Where the player is looking: head yaw (0 = towards -Z, left positive) and pitch (up positive), in radians.
   * Looking up at the sky reads the clouds; looking towards the sun reads where it is. Called by a system.
   */
  observeView(yaw: number, pitch: number, dt: number): void {
    const g = this.g;
    const env = g.env;
    // Only in Lesson 05, until each test is done: elsewhere a glance at the sky or the sun says nothing.
    if (!g.lessons.reached('food')) return;
    const skyOn = !g.experiments.done('skyTest');
    const sunOn = !g.experiments.done('sunPath');
    if (!skyOn && !sunOn) return;
    const outdoors = !g.insideShelter(g.player.x, g.player.z);
    // ---- the sky: look up for a moment, by day, under the open sky.
    if (skyOn && outdoors && pitch > 0.6 && env.night < 0.5 && !this.skyWatch && this.skyCooldown <= 0) {
      if ((this.skyLook += dt) >= SKY_LOOK) {
        this.skyLook = 0;
        this.skyCooldown = 20;
        this.readSky();
      }
    } else this.skyLook = 0;
    // ---- the sun: face towards it for a moment while it is up and not hidden by thick cloud.
    const sun = env.sunDir;
    const h = Math.hypot(sun[0], sun[2]);
    if (sunOn && outdoors && sun[1] > 0.05 && env.cloud < 0.75 && h > 0.05 && pitch > -0.3) {
      const fx = -Math.sin(yaw);
      const fz = -Math.cos(yaw);
      const dot = (fx * sun[0] + fz * sun[2]) / h;
      if (dot > 0.9) {
        if ((this.sunLook += dt) >= SUN_LOOK) {
          this.sunLook = 0;
          this.readSun();
        }
      } else this.sunLook = 0;
    }
  }

  private readSky(): void {
    const env = this.g.env;
    if (env.isRaining()) {
      this.g.toast('It is already raining: read the sky before the rain to learn its warning signs.', 'info');
      return;
    }
    const dark = env.cloud >= 0.7 && (this.cloudRising || env.cloud >= 0.85);
    const clear = env.cloud < 0.3;
    if (!dark && !clear) {
      this.g.toast('Grey, even cloud: hard to read. Look again when it changes.', 'info');
      return;
    }
    this.skyWatch = { kind: dark ? 'dark' : 'clear', t: 0 };
    this.g.science('weather.sky.looked');
    this.g.toast(dark ? 'Dark clouds are piling up and thickening. Remember this sky, and watch what comes.' : 'A clear sky, only thin wisps. Remember it, and watch what comes.', 'note');
  }

  private readSun(): void {
    const g = this.g;
    const hour = g.env.hour;
    const where = sunSector(hour);
    if (where === 'down') return;
    const time = hour < 10.5 ? 'morning' : hour >= 14.5 ? 'afternoon' : 'midday';
    // One reading per part of the day (again after a minute), so holding your gaze does not repeat it.
    if (time === this.sunRead && g.time - this.sunReadAt < 60) return;
    this.sunRead = time;
    this.sunReadAt = g.time;
    if (time === 'midday') {
      g.science('nav.sun.noon');
      g.toast(`Midday: the sun is high, in the ${where}.`, 'note');
      return;
    }
    g.science(time === 'morning' ? 'nav.sun.morning' : 'nav.sun.afternoon');
    g.experiments.trial('sunPath', time, where);
    g.toast(`${time === 'morning' ? 'Morning' : 'Afternoon'}: the sun is in the ${where}.`, 'note');
  }

  // ------------------------------------------------------------ the long trek

  /** While the trek is on, your compass is covered: find your way by the sun and landmarks. */
  compassCovered(): boolean {
    return this.trek.phase === 'active';
  }

  /** The trek's goals, for the objective card. */
  trekGoals(): Array<{ text: string; done: boolean }> {
    const dest = LANDMARK_BY_ID[TREK_DEST];
    const t = this.trek;
    const active = t.phase !== 'idle';
    return [
      { text: `Reach ${dest?.name ?? 'the Ruins'} with the compass covered`, done: t.reached },
      { text: `Gather food on the way (${Math.min(t.gathered, TREK_FOOD)}/${TREK_FOOD})`, done: t.gathered >= TREK_FOOD },
      { text: 'Eat on the way to keep your strength', done: t.ate },
      { text: active ? 'Get back to camp before dark' : 'Set out from camp in daylight', done: t.phase === 'done' },
    ];
  }

  /** Which way the destination lies from camp, in words. */
  trekBearing(): string {
    const dest = LANDMARK_BY_ID[TREK_DEST];
    const camp = campOf(this.g);
    return dest ? directionWord(bearingOf(dest.x - camp.x, dest.z - camp.z)) : 'north-west';
  }

  /** The trek briefing card. */
  trekPrompt(): void {
    const dest = LANDMARK_BY_ID[TREK_DEST];
    this.briefed = true;
    this.show({
      key: 'trek',
      label: 'LESSON 05 - THE LONG TREK',
      title: `To ${dest?.name ?? 'the Ruins'} and back, no compass`,
      body: `${dest?.name ?? 'The Ruins'} lie ${this.trekBearing()} of camp, under the rusted mast. When you leave camp your compass is covered: steer by the sun (east in the morning, south at midday, west in the afternoon) and by landmarks. Gather ${TREK_FOOD} food on the way, eat to keep your strength, and be back before dark.`,
      cols: null,
      options: [],
      note: 'Nothing here can kill you: if night falls, the compass comes back so you can get home.',
      action: 'Got it',
    });
  }

  private tickTrek(): void {
    const g = this.g;
    const t = this.trek;
    if (t.phase === 'done' || !g.focusIs('trek')) {
      if (t.phase === 'active' && !g.focusIs('trek')) t.phase = 'idle';
      return;
    }
    if (!this.briefed) this.trekPrompt();
    const camp = campOf(g);
    const fromCamp = Math.hypot(g.player.x - camp.x, g.player.z - camp.z);
    const hour = g.env.hour;
    if (t.phase === 'idle') {
      if (fromCamp <= TREK_START_RADIUS) return;
      if (hour < TREK_HOURS[0] || hour >= TREK_HOURS[1] || g.env.night > 0.4) {
        if (g.time - this.daylightToast > 60) {
          this.daylightToast = g.time;
          g.toast('The trek needs daylight to get there and back. Rest on your bed until morning, then set out.', 'info');
        }
        return;
      }
      t.phase = 'active';
      t.reached = false;
      t.gathered = 0;
      t.ate = false;
      t.tries++;
      g.science('nav.trek.started');
      g.toast(`You set out. Your compass is covered: the Ruins lie ${this.trekBearing()} of camp. Use the sun and landmarks.`, 'note');
      return;
    }
    // Active.
    const dest = LANDMARK_BY_ID[TREK_DEST];
    if (!t.reached && dest && Math.hypot(g.player.x - dest.x, g.player.z - dest.z) < dest.r) {
      t.reached = true;
      g.science('nav.trek.reached');
      g.toast('You found the Ruins without a compass. Now gather food and head home before dark.', 'good');
    }
    if (g.env.night > 0.5) {
      t.phase = 'idle';
      g.toast('Night is falling. Your compass is uncovered so you can get home safely. Try the trek again in daylight.', 'note');
      return;
    }
    if (fromCamp <= HOME_RADIUS) {
      const ok = t.reached && t.gathered >= TREK_FOOD && t.ate;
      if (ok) {
        t.phase = 'done';
        g.science('nav.trek.done');
        g.toast('Home before dark, fed, with food in your pack, and no compass. You can look after yourself out here.', 'good');
        g.checkProgress();
      } else {
        t.phase = 'idle';
        const missing = this.trekGoals()
          .slice(0, 3)
          .filter((x) => !x.done)
          .map((x) => x.text.toLowerCase());
        g.toast(`Back at camp, but the trek is not finished: ${missing.join('; ')}. Set out again when ready.`, 'info');
      }
    }
  }

  // ------------------------------------------------------------ closing check

  checkPrompt(): void {
    const q = FINAL_CHECK[this.check];
    if (!q) return;
    this.show({
      key: `check:${this.check}`,
      label: `LESSON 05 CHECK - ${this.check + 1} OF ${FINAL_CHECK.length}`,
      title: q.question,
      body: '',
      cols: null,
      options: q.options.map((o) => o.text),
      note: null,
      action: null,
    });
  }

  // ------------------------------------------------------------ the slow step (4 Hz)

  update(dt: number): void {
    const g = this.g;
    const env = g.env;
    if (this.skyCooldown > 0) this.skyCooldown -= dt;
    // Are the clouds building? Compared with a few seconds ago.
    if ((this.cloudT += dt) >= 4) {
      this.cloudRising = env.cloud > this.cloudPast + 0.01;
      this.cloudPast = env.cloud;
      this.cloudT = 0;
    }
    // A sky reading waits to see what the weather does.
    const w = this.skyWatch;
    if (w) {
      w.t += dt;
      if (env.isRaining()) {
        this.skyWatch = null;
        g.experiments.trial('skyTest', w.kind, 'rain');
        if (w.kind === 'dark') {
          g.science('weather.sky.read');
          g.toast('Rain, as the dark clouds warned. Rising moist air cooled, and its water fell.', 'note');
        } else g.toast('Rain came after all, out of a sky that looked clear. The sky gives a warning, not a promise.', 'note');
      } else if (w.t >= SKY_WATCH) {
        this.skyWatch = null;
        g.experiments.trial('skyTest', w.kind, 'dry');
        g.toast(w.kind === 'clear' ? 'Still dry under the clear sky.' : 'The dark clouds passed without rain this time: a rule of thumb, not a promise.', 'note');
      }
    }
    // The food chain: you watched plant-eaters feed, and you ate a fish you caught.
    if (!g.hasEvent('nature.foodchain.seen') && g.hasEvent('food.fish.eaten') && (g.hasEvent('wild.rabbit.seen') || g.hasEvent('wild.deer.seen'))) g.science('nature.foodchain.seen');
    this.tickTrek();
    if (g.focusIs('finalCheck') && !this.checkDone && !this.prompt && !this.openedCheck) {
      this.openedCheck = true;
      this.checkPrompt();
    }
  }
  private openedCheck = false;

  /** A deer noticed you: if it was facing away, its side-set eyes saw you coming (you, the predator). */
  preyAlert(heading: number, ax: number, az: number): void {
    const g = this.g;
    if (g.hasEvent('nature.predator.near')) return;
    const dx = g.player.x - ax;
    const dz = g.player.z - az;
    const d = Math.hypot(dx, dz) || 1;
    const facing = (Math.sin(heading) * dx + Math.cos(heading) * dz) / d;
    if (facing < 0.5) g.science('nature.predator.near');
  }

  // ------------------------------------------------------------ save

  snapshot(): FieldSave {
    return {
      v: 1,
      trek: { ...this.trek, phase: this.trek.phase === 'active' ? 'idle' : this.trek.phase },
      check: this.check,
      checkDone: this.checkDone,
      judged: this.judgedCount,
      judgedRight: this.judgedRight,
      briefed: this.briefed,
    };
  }

  restore(s: FieldSave | undefined): void {
    if (!s) return;
    const n = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
    const phase: TrekPhase = s.trek?.phase === 'done' ? 'done' : 'idle';
    this.trek = { phase, reached: !!s.trek?.reached && phase === 'done', gathered: n(s.trek?.gathered), ate: !!s.trek?.ate, tries: n(s.trek?.tries) };
    this.check = Math.max(0, Math.min(FINAL_CHECK.length, n(s.check)));
    this.checkDone = !!s.checkDone || this.check >= FINAL_CHECK.length;
    this.judgedCount = n(s.judged);
    this.judgedRight = n(s.judgedRight);
    this.briefed = !!s.briefed;
  }
}
