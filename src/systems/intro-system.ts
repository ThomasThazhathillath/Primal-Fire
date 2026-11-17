// The title menu: EUREKA over the calm forest. Play / Continue, Tutorial, New Game, Enter VR (flat view) and Quit.
// Fingertip tap and gaze + pinch in the headset (PanelTouch), mouse in the browser. Big targets. In the headset it
// hangs in front of you until you choose a level; nothing starts on its own.
// Play opens the level list on the same card: each level on its own, only the playable ones (registry.ts), with how
// far you got. On the tutorial page the tutorial is listed too, and choosing a level leaves it for survival.

import { createSystem, type UIKit, type UIKitMLAsset, VisibilityState } from '@iwsdk/core';
import { isPlayable, LESSON_IDS, lessonById, playableLessons } from '../game/curriculum/registry.js';
import type { LessonId } from '../game/curriculum/types.js';
import { currentMode } from '../game/tutorial-mode.js';
import { HudSystem } from './hud-system.js';
import { PanelTouch } from './panel-touch.js';
import { StorySystem } from './story-system.js';
import { getGame, getUi, hidePanel, StaticAnchor } from './shared.js';
import { clearSave, WorldSystem } from './world-system.js';

/** Panel units are ~1 cm; in the headset the 520-unit card is scaled to about 0.5 m wide. */
const VR_SCALE = 0.1;
const FLAT_SCALE = 0.26;
/** A second tap on New Game must come within this long (ms). */
const CONFIRM_MS = 4000;
/** Set when the tutorial page reloads into survival for a chosen level: the survival title opens on the level list. */
const LEVELS_NEXT_KEY = 'eureka.title.levels';

export class IntroSystem extends createSystem({}) {
  private panel: UIKitMLAsset | undefined;
  private touch: PanelTouch | null = null;
  private anchor = StaticAnchor.slot('title', 0.6, 1);
  private vr = false;
  private newArmedAt = -1e9;
  private open = true;
  private flatPos: [number, number, number] | null = null;
  /** The level list is showing instead of the title buttons. */
  private levelsOpen = false;
  /** This page is the tutorial ("The First Steps"), not survival. */
  private tutorialPage = false;

  init(): void {
    const game = getGame(this.world);
    const panel = this.world.getSceneObject<UIKitMLAsset>('welcome-panel');
    this.panel = panel;
    const el = (id: string) => panel?.getElementById(id);
    if (!panel || !el('begin-button')) {
      this.begin();
      return;
    }
    this.flatPos = [panel.position.x, panel.position.y, panel.position.z];
    getUi(this.world).titleOpen = () => this.open;
    if (game.time > 0) panel.getElementById<UIKit.Text>('begin-label')?.setProperties({ text: 'Continue' });
    this.touch = new PanelTouch(this.world, panel, VR_SCALE, 'title');
    this.touch.setRequirePoint(false);
    const wire = (id: string, fn: () => void): void => {
      const b = el(id);
      if (!b) return;
      const click = () => {
        if (!this.vr) fn();
      };
      b.addEventListener('click', click);
      this.cleanupFuncs.push(() => b.removeEventListener('click', click));
      this.touch!.add(id, fn);
    };
    this.tutorialPage = currentMode() === 'tutorial';
    wire('begin-button', () => this.showLevels(true));
    wire('levels-back', () => this.showLevels(false));
    wire('lvl-tutorial', () => {
      getUi(this.world).titlePlay?.();
      this.begin();
    });
    for (const id of LESSON_IDS) wire(`lvl-${id}`, () => this.playLevel(id));
    wire('tutorial-button', () => getUi(this.world).titleTutorial?.());
    wire('new-button', () => this.newGame());
    wire('xr-button', () => void this.world.launchXR());
    wire('quit-button', () => this.quit());
    wire('settings-button', () => getUi(this.world).openSettings?.());
    (window as unknown as { __title?: unknown }).__title = {
      tap: (id: string) => this.touch?.tapById(id) ?? false,
      open: () => this.open,
      levels: () => this.levelsOpen,
      // Checks and scripts: what Play then the first entry does (the tutorial on its page, else the first playable level).
      play: () => {
        if (!this.open) return false;
        if (this.tutorialPage) {
          getUi(this.world).titlePlay?.();
          this.begin();
        } else this.playLevel(playableLessons()[0]);
        return true;
      },
    };
    this.refreshLevels();
    if (takeFlag(LEVELS_NEXT_KEY)) this.showLevels(true);
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((v) => {
        this.vr = v !== VisibilityState.NonImmersive;
        // The flat view offers Enter VR; inside the headset it is pointless.
        el('xr-button')?.setProperties({ display: !this.vr && this.world.xrEnabled ? 'flex' : 'none' });
        // Quit closes the headset session (VR) or the tab (flat, where the browser may refuse: then it just says so).
        if (this.open && panel) {
          panel.scale.setScalar(this.vr ? VR_SCALE : FLAT_SCALE);
          this.anchor.reset();
          this.touch?.reset();
          if (!this.vr && this.flatPos) panel.position.set(...this.flatPos);
        }
      }),
    );
  }

  /** Show the level list (Play) or the title buttons (Back). */
  private showLevels(on: boolean): void {
    const p = this.panel;
    if (!p) return;
    this.levelsOpen = on;
    p.getElementById('title-menu')?.setProperties({ display: on ? 'none' : 'flex' });
    p.getElementById('levels')?.setProperties({ display: on ? 'flex' : 'none' });
    if (on) this.refreshLevels();
    // The buttons under the fingertip just changed: start the touch tracking afresh.
    this.touch?.reset();
  }

  /** One row per playable level: its name, how far you got (survival page) and its goal. */
  private refreshLevels(): void {
    const p = this.panel;
    if (!p) return;
    const g = getGame(this.world);
    p.getElementById('lvl-row-tutorial')?.setProperties({ display: this.tutorialPage ? 'flex' : 'none' });
    for (const id of LESSON_IDS) {
      const l = lessonById(id);
      const on = !!l && isPlayable(id);
      p.getElementById(`lvl-row-${id}`)?.setProperties({ display: on ? 'flex' : 'none' });
      if (!l || !on) continue;
      p.getElementById<UIKit.Text>(`lvl-${id}-label`)?.setProperties({ text: `Level ${l.n}: ${l.name}` });
      // The tutorial page runs its own game: the survival progress is not loaded here.
      const done = g.lessons.lessonDone.has(id);
      const steps = l.steps.filter((s) => g.lessons.completed.has(s)).length;
      const status = done ? 'Complete' : steps > 0 ? `In progress: ${steps} of ${l.steps.length} steps` : 'Not started';
      p.getElementById<UIKit.Text>(`lvl-${id}-note`)?.setProperties({ text: this.tutorialPage ? l.goal : `${status}. ${l.goal}` });
    }
  }

  /** Start (or go on with) a level. From the tutorial page this leaves the tutorial for survival first. */
  private playLevel(id: LessonId): void {
    if (!isPlayable(id)) return;
    if (this.tutorialPage) {
      setFlag(LEVELS_NEXT_KEY);
      getUi(this.world).titleTutorial?.();
      return;
    }
    getGame(this.world).lessons.setResume(id);
    getUi(this.world).titlePlay?.();
    this.begin();
  }

  /** New Game: needs a second tap, then wipes the survival save and starts over. */
  private newGame(): void {
    const now = performance.now();
    const label = this.panel?.getElementById<UIKit.Text>('new-label');
    if (now - this.newArmedAt > CONFIRM_MS) {
      this.newArmedAt = now;
      label?.setProperties({ text: 'Tap again to erase' });
      return;
    }
    clearSave();
    try {
      localStorage.removeItem('primal-first-fire.mode.v1');
      localStorage.removeItem('primal-first-fire.tutorial.v1');
    } catch {
      /* ignore */
    }
    location.reload();
  }

  /** Quit: end the headset session; in the flat view close the tab (browsers only allow that for pages a script opened). */
  private quit(): void {
    getUi(this.world).saveNow?.();
    const session = this.renderer.xr.getSession();
    if (session) void session.end();
    else {
      window.close();
      this.panel?.getElementById<UIKit.Text>('quit-label')?.setProperties({ text: 'You can close this tab' });
    }
  }

  update(delta: number): void {
    if (!this.open || !this.panel || !this.touch) return;
    if (this.newArmedAt > 0 && performance.now() - this.newArmedAt > CONFIRM_MS) {
      this.newArmedAt = -1e9;
      this.panel.getElementById<UIKit.Text>('new-label')?.setProperties({ text: 'New Game' });
    }
    if (this.vr) {
      this.panel.visible = true;
      this.anchor.update(this.panel, this.camera);
      this.touch.update(delta);
    }
  }

  begin(): void {
    const world = this.world.getSystem(WorldSystem);
    if (!world || world.started) return;
    world.started = true;
    this.open = false;
    if (this.panel) hidePanel(this.panel);
    this.world.getSystem(HudSystem)?.show();
    const game = getGame(this.world);
    game.log.add('woke up', 'ok');
    const story = this.world.getSystem(StorySystem);
    if (game.time > 0 || !story) game.toast(game.time > 0 ? 'Welcome back.' : 'You wake with nothing. Look around.', 'note');
    // A new game: the awakening (dark fade-in and first thoughts), once.
    story?.awaken();
    game.checkProgress();
  }
}

/** One-shot flags that survive a reload (sessionStorage; absent or blocked storage simply means no flag). */
function setFlag(key: string): void {
  try {
    sessionStorage.setItem(key, '1');
  } catch {
    /* ignore */
  }
}

function takeFlag(key: string): boolean {
  try {
    const on = sessionStorage.getItem(key) === '1';
    sessionStorage.removeItem(key);
    return on;
  } catch {
    return false;
  }
}
