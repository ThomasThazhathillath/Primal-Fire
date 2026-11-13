// The Settings card (docs/NPE_PLAN.md, milestone E): assistance mode (Guided / Standard / Explorer) and the
// accessibility options (text size, hint frequency, guidance markers, interaction sensitivity, seated assist).
// Opened from the pause card and the title menu. Every change is applied to the live tuning at once and
// remembered (settings.ts); nothing needs a restart. Fingertip, pinch-press and gaze in the headset; mouse on
// the desktop.

import { type Entity, createSystem, RayInteractable, ScreenSpace, type UIKit, type UIKitMLAsset, VisibilityState } from '@iwsdk/core';
import { ADAPT, STRUGGLE } from '../game/adaptive.js';
import { ASSIST } from '../game/assist.js';
import { BENCH_ASSIST } from '../game/bench.js';
import { TOLERANCE } from '../game/gaze.js';
import { type Amount, type AssistMode, type Guidance, loadSettings, saveSettings, type Settings, type TextSize, tuning } from '../game/settings.js';
import { browserStore, choiceMade } from '../game/tutorial-mode.js';
import { compassCfg } from './compass-system.js';
import { PanelTouch } from './panel-touch.js';
import { reachCfg } from './resource-system.js';
import { FAR_CARD_DISTANCE, FAR_CARD_DOWN, getGame, getUi, hidePanel, StaticAnchor, uiScale } from './shared.js';

/** Settings takes the pause card's place, out of reach (look at a button and pinch), so it is drawn larger too. */
const SCALE = 0.1;
const ON = '#f0a54e';
const OFF = '#5e6e34';

const DESC: Record<AssistMode, string> = {
  guided: 'Guided: help comes sooner, aiming is a little more forgiving, arrows show where parts go.',
  standard: 'Standard: the game as intended. Help comes when you seem stuck.',
  explorer: 'Explorer: few markers and late hints. Find your own way.',
};

type Row = { key: keyof Omit<Settings, 'v'>; values: string[] };
const ROWS: Row[] = [
  { key: 'mode', values: ['guided', 'standard', 'explorer'] },
  { key: 'textSize', values: ['small', 'normal', 'large'] },
  { key: 'hints', values: ['low', 'normal', 'high'] },
  { key: 'guidance', values: ['minimal', 'normal', 'full'] },
  { key: 'sensitivity', values: ['low', 'normal', 'high'] },
  { key: 'seated', values: ['off', 'on'] },
];

/** The placement radii as shipped; the snap setting scales from these. */
const BASE_SNAP = { releaseRadius: ASSIST.releaseRadius, touchRadius: ASSIST.touchRadius, magnetRadius: ASSIST.magnetRadius, catchRadius: ASSIST.catchRadius };

/** Live flags read by other systems (the always-on next-target arrow). */
export const guidanceCfg = { nextTarget: true };

/** Apply settings to every live tuning object. Exported for tests and for the debug hook. */
export function applySettings(s: Settings, game?: { easyBuild: boolean }): void {
  const t = tuning(s);
  ASSIST.releaseRadius = BASE_SNAP.releaseRadius * t.snap;
  ASSIST.touchRadius = BASE_SNAP.touchRadius * t.snap;
  ASSIST.magnetRadius = BASE_SNAP.magnetRadius * t.snap;
  ASSIST.catchRadius = BASE_SNAP.catchRadius * t.snap;
  if (game) game.easyBuild = t.easyBuild;
  guidanceCfg.nextTarget = t.nextTarget;
  STRUGGLE.delay = t.helpDelay;
  TOLERANCE.sensitivity = t.sensitivity;
  reachCfg.scale = t.reach;
  BENCH_ASSIST.forgiveAfter = t.forgiveAfter;
  ADAPT.pulseLevel = t.pulseLevel;
  ADAPT.arrowLevel = t.arrowLevel;
  ASSIST.highlightBudget = t.highlightBudget;
  compassCfg.show = t.compass;
  uiScale.text = t.textScale;
}

export class SettingsSystem extends createSystem({}) {
  private panel: UIKitMLAsset | null = null;
  private entity: Entity | null = null;
  private touch: PanelTouch | null = null;
  private anchor = new StaticAnchor(FAR_CARD_DISTANCE, 0, FAR_CARD_DOWN, 0.9, 1);
  private settings!: Settings;
  private open = false;
  private vr = false;

  get current(): Settings {
    return this.settings;
  }

  async init(): Promise<void> {
    const store = browserStore();
    // A brand-new player (no start choice, no survival save) starts Guided; an existing game keeps Standard.
    this.settings = loadSettings(store, !choiceMade(store));
    saveSettings(store, this.settings);
    applySettings(this.settings, getGame(this.world));
    const ui = getUi(this.world);
    ui.openSettings = () => this.setOpen(true);
    ui.settingsOpen = () => this.open;
    (window as unknown as { __settings?: unknown }).__settings = {
      get: () => ({ ...this.settings }),
      set: (k: keyof Omit<Settings, 'v'>, v: string) => this.choose(k, v),
      open: () => this.setOpen(true),
      close: () => this.setOpen(false),
      tap: (id: string) => this.touch?.tapById(id) ?? false,
    };

    const panel = await this.world.assets.instantiate<UIKitMLAsset>('settings-panel');
    this.panel = panel;
    panel.name = 'SettingsCard';
    panel.scale.setScalar(SCALE);
    this.entity = this.world.createTransformEntity(panel);
    hidePanel(panel);
    const touch = new PanelTouch(this.world, panel, SCALE, 'settings');
    touch.setRequirePoint(false);
    this.touch = touch;
    const wire = (id: string, fn: () => void): void => {
      const el = panel.requireElementById(id);
      const click = () => {
        if (!this.vr) fn();
      };
      el.addEventListener('click', click);
      this.cleanupFuncs.push(() => el.removeEventListener('click', click));
      touch.add(id, fn);
    };
    for (const r of ROWS) for (const v of r.values) wire(`s-${r.key}-${v}`, () => this.choose(r.key, v));
    wire('s-back', () => this.setOpen(false));
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((v) => {
        this.vr = v !== VisibilityState.NonImmersive;
        if (this.entity) {
          if (this.vr && this.entity.hasComponent(RayInteractable)) this.entity.removeComponent(RayInteractable);
          if (!this.vr && !this.entity.hasComponent(RayInteractable)) this.entity.addComponent(RayInteractable);
        }
        this.anchor.reset();
        this.touch?.reset();
        this.layout();
      }),
    );
    this.render();
  }

  /** One option changed: store it, apply it at once, light the chosen button. */
  choose(key: keyof Omit<Settings, 'v'>, value: string): void {
    const s = { ...this.settings };
    switch (key) {
      case 'mode':
        s.mode = value as AssistMode;
        break;
      case 'textSize':
        s.textSize = value as TextSize;
        break;
      case 'hints':
        s.hints = value as Amount;
        break;
      case 'guidance':
        s.guidance = value as Guidance;
        break;
      case 'sensitivity':
        s.sensitivity = value as Amount;
        break;
      case 'seated':
        s.seated = value === 'on';
        break;
    }
    this.settings = s;
    saveSettings(browserStore(), s);
    applySettings(s, getGame(this.world));
    getGame(this.world).log.add(`settings: ${key} = ${value}`);
    this.render();
  }

  private render(): void {
    const p = this.panel;
    if (!p) return;
    for (const r of ROWS) {
      const cur = r.key === 'seated' ? (this.settings.seated ? 'on' : 'off') : String(this.settings[r.key]);
      for (const v of r.values) p.getElementById(`s-${r.key}-${v}`)?.setProperties({ backgroundColor: v === cur ? ON : OFF } as never);
    }
    p.getElementById<UIKit.Text>('s-desc')?.setProperties({ text: DESC[this.settings.mode] });
  }

  setOpen(on: boolean): void {
    if (on === this.open || !this.panel) return;
    this.open = on;
    if (on) {
      this.anchor.reset();
      this.touch?.reset();
      this.panel.visible = true;
    } else hidePanel(this.panel);
    this.layout();
  }

  /** Flat view: a screen overlay in the middle while open. */
  private layout(): void {
    const e = this.entity;
    if (!e) return;
    if (e.hasComponent(ScreenSpace)) e.removeComponent(ScreenSpace);
    if (!this.vr && this.open) {
      e.addComponent(ScreenSpace, { width: '520px', height: '640px', top: 'calc(50% - 320px)', left: 'calc(50% - 260px)', right: 'auto', bottom: 'auto', zOffset: 0.15 });
    }
  }

  update(delta: number): void {
    if (!this.open || !this.panel) return;
    if (!this.vr) {
      this.panel.visible = true;
      return;
    }
    this.panel.visible = true;
    this.anchor.update(this.panel, this.camera);
    this.touch?.update(delta);
  }
}
