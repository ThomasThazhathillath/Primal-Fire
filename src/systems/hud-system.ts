// Quest + XP HUD, toasts, Lab Notebook cards, hover tooltips and the hint
// beacon. In the browser the HUD is pinned to the screen; in VR it follows you
// lazily at eye level to your left, so essential UI stays in a comfortable view
// without blocking rays aimed down at things on the ground.

import {
  AdditiveBlending,
  createSystem,
  CylinderGeometry,
  type Entity,
  Follower,
  FollowBehavior,
  Hovered,
  Mesh,
  MeshBasicMaterial,
  RayInteractable,
  ScreenSpace,
  type UIKit,
  type UIKitMLAsset,
  Vector3,
  VisibilityState,
  findUIKitDocument,
  type Object3D,
} from '@iwsdk/core';
import { spotWorldPosition, BLUEPRINTS } from '../game/blueprint.js';
import type { GameEvent } from '../game/game.js';
import { itemName } from '../game/items.js';
import { bagPrompt, gatherPrompt } from '../game/prompts.js';
import { SatchelSystem } from './satchel-system.js';
import { OBSERVATIONS } from '../game/observations.js';
import { LESSONS } from '../game/curriculum/registry.js';
import { Gatherable, SatchelItem, SnapSpot, StructurePart, WorldDropItem } from '../components/game-components.js';
import { REACH, ResourceSystem } from './resource-system.js';
import { PanelTouch } from './panel-touch.js';
import { PopIn } from './ui-fx.js';
import { getGame, getUi, hidePanel, menu, PANEL_DISTANCE, PANEL_DOWN, placeInFront, StaticAnchor, uiText } from './shared.js';

const STEP_LINES = 6;
const TOAST_SECONDS = 4.5;
const BEACON_SECONDS = 45;

export class HudSystem extends createSystem({
  hoverGather: { required: [Gatherable, Hovered] },
  hoverSpot: { required: [SnapSpot, Hovered] },
  hoverDrop: { required: [WorldDropItem, Hovered] },
  hoverBag: { required: [SatchelItem, Hovered] },
  hoverPart: { required: [StructurePart, Hovered] },
}) {
  private hud!: UIKitMLAsset;
  private hudEntity!: Entity;
  private vrNow = false;
  /** VR: low and to the left, out of the way of rays aimed at the ground; it never drifts. */
  private hudAnchor = StaticAnchor.slot('hud', 1.05, 1.2);
  private tip!: UIKitMLAsset;
  private toastTimer = 0;
  private beacon!: Mesh;
  private beaconTimer = 0;
  private beaconHeld = false;
  private beaconT = 0;
  private tipTarget: Entity | null = null;
  private tmp = new Vector3();
  private ready = false;
  private shown = false;

  async init(): Promise<void> {
    const game = getGame(this.world);
    const [hud, tip] = await Promise.all([
      this.world.assets.instantiate<UIKitMLAsset>('hud-panel'),
      this.world.assets.instantiate<UIKitMLAsset>('tip-panel'),
    ]);
    this.hud = hud;
    this.tip = tip;
    hud.name = 'QuestHud';
    tip.name = 'Tooltip';

    // UIKit units here are ~1 cm, so 0.09 makes the 400-wide HUD ~36 cm in VR.
    hud.scale.setScalar(0.09);
    this.hudEntity = this.world.createTransformEntity(hud);
    this.hudEntity.addComponent(RayInteractable);
    hidePanel(hud); // shown when you wake up

    this.world.createTransformEntity(tip);
    tip.scale.setScalar(0.085);
    hidePanel(tip);

    this.beacon = new Mesh(
      new CylinderGeometry(0.08, 0.25, 30, 10, 1, true),
      new MeshBasicMaterial({ color: 0x7dff8a, transparent: true, opacity: 0.35, blending: AdditiveBlending, depthWrite: false }),
    );
    this.beacon.name = 'HintBeacon';
    this.beacon.visible = false;
    this.world.createTransformEntity(this.beacon);

    const wire = (panel: UIKitMLAsset, id: string, fn: () => void) => {
      const el = panel.requireElementById(id);
      el.addEventListener('click', fn);
      this.cleanupFuncs.push(() => el.removeEventListener('click', fn));
    };
    wire(hud, 'enter-vr-button', () => this.world.launchXR());
    const enterVr = hud.requireElementById('enter-vr-button');
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((v) => {
        enterVr.setProperties({ display: this.world.xrEnabled && v === VisibilityState.NonImmersive ? 'flex' : 'none' });
      }),
    );
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((v) => {
        this.vrNow = v !== VisibilityState.NonImmersive;
      }),
    );
    const ui = getUi(this.world);
    ui.showHint = () => this.showHint();
    // A hint-driven pillar stays until it is cleared (not on the old 45 s timer), tall and gently pulsing.
    ui.setBeacon = (at) => {
      this.beaconHeld = !!at;
      if (at) {
        this.beacon.position.set(at.x, 30, at.z);
        this.beacon.scale.set(1, 2, 1);
        this.beacon.visible = true;
        this.beaconTimer = 0;
      } else {
        this.beacon.visible = false;
        this.beacon.scale.set(1, 1, 1);
      }
    };
    // The quest icon opens the objective card (ObjectiveCardSystem) and Notes the Lab Notebook (NotebookSystem);
    // this strip keeps XP and toasts.

    this.cleanupFuncs.push(
      game.on((e: GameEvent) => this.onGameEvent(e)),
      this.world.visibilityState.subscribe((v) => this.onVisibility(v)),
      this.queries.hoverGather.subscribe('qualify', (e) => (this.tipTarget = e)),
      this.queries.hoverSpot.subscribe('qualify', (e) => (this.tipTarget = e)),
      this.queries.hoverGather.subscribe('disqualify', (e) => this.clearTip(e)),
      this.queries.hoverSpot.subscribe('disqualify', (e) => this.clearTip(e)),
      this.queries.hoverDrop.subscribe('qualify', (e) => (this.tipTarget = e)),
      this.queries.hoverDrop.subscribe('disqualify', (e) => this.clearTip(e)),
      this.queries.hoverBag.subscribe('qualify', (e) => (this.tipTarget = e)),
      this.queries.hoverBag.subscribe('disqualify', (e) => this.clearTip(e)),
      this.queries.hoverPart.subscribe('qualify', (e) => (this.tipTarget = e)),
      this.queries.hoverPart.subscribe('disqualify', (e) => this.clearTip(e)),
    );
    this.ready = true;
    this.renderQuest();
  }

  /** Called once you wake up (IntroSystem). */
  show(): void {
    if (!this.ready || this.shown) return;
    this.shown = true;
    this.hud.visible = true;
    this.hudEntity.addComponent(ScreenSpace, { width: '340px', height: '420px', top: '12px', left: '12px', bottom: 'auto', right: 'auto', zOffset: 0.25 });
    this.onVisibility(this.world.visibilityState.peek());
    this.renderQuest();
  }

  private onVisibility(v: VisibilityState): void {
    if (!this.shown) return;
    // ScreenSpace pins the HUD in the browser; in VR it hands the panel back to
    // world space, and a lazy Follower keeps it low-left in view.
    // In VR the HUD stays still (StaticAnchor in update): a panel that glides after your head is tiring.
    if (this.hudEntity.hasComponent(Follower)) this.hudEntity.removeComponent(Follower);
    this.hudAnchor.reset();
  }

  private onGameEvent(e: GameEvent): void {
    switch (e.type) {
      case 'toast':
        this.setToast(e.text);
        break;
      case 'observation':
        // No pop-up card: the Notes icon counts it (Game.notebookSeen), and the notebook opens when you choose.
        this.setToast(`New notebook entry: ${OBSERVATIONS[e.id]?.title ?? ''}. Open the notebook to read it.`);
        this.renderQuest();
        break;
      case 'xp':
      case 'quest':
      case 'satchel':
      case 'structure':
        this.renderQuest();
        break;
    }
  }

  private setToast(text: string): void {
    if (!this.ready) return;
    this.hud.requireElementById<UIKit.Text>('toast').setProperties({ text: uiText(text) });
    this.toastTimer = TOAST_SECONDS;
  }

  renderQuest(): void {
    if (!this.ready) return;
    const game = getGame(this.world);
    const text = (id: string, t: string) => this.hud.requireElementById<UIKit.Text>(id).setProperties({ text: uiText(t) });
    const lesson = game.lessons.lesson;
    // While the beginner objectives run, the objective card is the one place that names the task.
    const tutorial = game.guiding();
    this.hud.requireElementById('quest-num').setProperties({ display: tutorial ? 'none' : 'flex' });
    text('quest-num', lesson ? `LESSON ${String(lesson.n).padStart(2, '0')} OF ${String(LESSONS.length).padStart(2, '0')}` : 'ALL LESSONS COMPLETE');
    text('level', `Rank ${game.level}   ${game.xp} XP`);
    this.hud.requireElementById('quest-title').setProperties({ display: tutorial ? 'none' : 'flex' });
    text('quest-title', lesson ? lesson.name : 'Life at your camp');
    text('quest-desc', lesson ? lesson.goal : 'Keep exploring - can you find every observation?');
    // The five lessons, ticked off as they finish.
    for (let i = 0; i < STEP_LINES; i++) {
      const l = LESSONS[i];
      const el = this.hud.requireElementById<UIKit.Text>(`step-${i}`);
      el.setProperties({ display: l ? 'flex' : 'none' });
      if (l) {
        const done = game.lessons.lessonDone.has(l.id);
        el.setProperties({ text: uiText(`${done ? '[x]' : '[ ]'} Lesson ${String(l.n).padStart(2, '0')}: ${l.name}`), color: done ? '#7fd37f' : undefined });
      }
    }
    // The non-linear field tasks (Phase 3): the one you are furthest along, and its next step.
    const field = game.fieldTask();
    for (let i = 0; i < 2; i++) this.hud.requireElementById<UIKit.Text>(`field-${i}`).setProperties({ display: field ? 'flex' : 'none' });
    if (field) {
      this.hud.requireElementById<UIKit.Text>('field-0').setProperties({ text: uiText(`FIELD TASK: ${field.title} ${field.done}/${field.total}`), color: '#e8c36a' });
      this.hud.requireElementById<UIKit.Text>('field-1').setProperties({ text: uiText(`[ ] ${field.next}`) });
    }
    this.hud.requireElementById('xp-fill').setProperties({ width: Math.round(350 * game.levelProgress) });
  }

  showHint(): void {
    const game = getGame(this.world);
    // While the beginner objectives run, the hint button (and H) gives the hint for the objective on
    // the card, exactly like the card's bulb: the quest list behind it can be on another step (it
    // pointed at logs while the card said to knap flint).
    const objective = game.focus();
    if (objective) {
      const ui = getUi(this.world);
      if (ui.openHint) ui.openHint(objective.id);
      else {
        const level = game.steps.unlockHint(objective.id);
        game.toast(`💡 ${objective.hint.levels[level - 1]}`, 'note');
      }
      return;
    }
    const resources = this.world.getSystem(ResourceSystem);
    const res = game.hint((items, from) => resources?.locate(items, from) ?? null);
    if (!res) {
      game.toast('Nothing to hint at right now.');
      return;
    }
    if (res.target) {
      this.beacon.position.set(res.target.x, 15, res.target.z);
      this.beacon.visible = true;
      this.beaconTimer = BEACON_SECONDS;
    }
  }

  private clearTip(e: Entity): void {
    if (this.tipTarget === e) this.tipTarget = null;
  }

  private updateTip(): void {
    const e = this.tipTarget;
    if (!e || !e.object3D) {
      if (this.tip.visible) hidePanel(this.tip);
      if (this.hoverShown) {
        this.hoverShown = false;
        this.hoverText = '';
        this.hud.requireElementById<UIKit.Text>('hover').setProperties({ text: ' ' });
      }
      return;
    }
    const game = getGame(this.world);
    let title = '';
    let sub = '';
    if (e.hasComponent(Gatherable)) {
      const resources = this.world.getSystem(ResourceSystem);
      const spot = resources?.spot(e.getValue(Gatherable, 'spotId') ?? '');
      if (!spot) return;
      const known = game.gatheredCount(spot.itemId) > 0;
      title = known ? itemName(spot.itemId) : spot.label;
      sub = resources!.distanceTo(spot) > REACH ? 'Too far - get closer' : gatherPrompt(spot.itemId, game.held, (i) => game.count(i) > 0);
      e.object3D.getWorldPosition(this.tmp);
      this.tmp.y += 0.75;
    } else if (e.hasComponent(WorldDropItem)) {
      const d = game.drops.find((x) => x.id === e.getValue(WorldDropItem, 'dropId'));
      if (!d) return;
      title = itemName(d.item);
      sub = 'Pick up what you dropped';
      e.object3D.getWorldPosition(this.tmp);
      this.tmp.y += 0.6;
    } else if (e.hasComponent(StructurePart)) {
      const s = game.structures.find((t) => t.id === e.getValue(StructurePart, 'structureId'));
      if (!s) return;
      const index = e.getValue(StructurePart, 'index') ?? 0;
      const vr = this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
      title = s.kind === 'workbench' && s.complete ? 'Workbench' : index < 0 ? itemName(s.key) : itemName(s.spots[index] ?? s.key);
      sub =
        s.kind === 'workbench' && s.complete
          ? `${vr ? 'Pinch' : 'Click'} to choose what to make here`
          : index < 0
          ? s.complete
            ? `${vr ? 'Grip with both hands' : 'Click'} to lift it off and take it back`
            : `Press down to test if it is stable - ${vr ? 'grip with both hands' : 'Shift+click'} to lift it off`
          : s.keyPlaced
            ? `Lift the ${itemName(s.key).toLowerCase()} off first`
            : 'Click to pick it back up';
      e.object3D.getWorldPosition(this.tmp);
      this.tmp.y += 0.35;
    } else if (e.hasComponent(SatchelItem)) {
      const id = this.world.getSystem(SatchelSystem)?.bagItemAt(e.getValue(SatchelItem, 'index') ?? 0);
      if (!id) return;
      title = itemName(id);
      sub = bagPrompt(id, game.nearbyStorage() !== null);
      e.object3D.getWorldPosition(this.tmp);
      this.tmp.y += 0.3;
    } else {
      const s = game.structures.find((t) => t.id === e.getValue(SnapSpot, 'structureId'));
      if (!s) return;
      const spotDef = BLUEPRINTS[s.kind].spots[e.getValue(SnapSpot, 'index') ?? 0];
      title = spotDef.label;
      sub = `Hold ${spotDef.accepts.map((id) => itemName(id).toLowerCase()).join(' or ')} and set it down on the glow`;
      const p = spotWorldPosition(s, e.getValue(SnapSpot, 'index') ?? 0);
      this.tmp.set(p.x, p.y + 0.35, p.z);
    }
    // Shown on the HUD's hover line, not as a card floating over the object.
    const line = `${title}: ${sub}`;
    if (line !== this.hoverText) {
      this.hoverText = line;
      this.hud.requireElementById<UIKit.Text>('hover').setProperties({ text: uiText(line) });
    }
    this.hoverShown = true;
  }
  private hoverShown = false;
  private hoverText = '';

  /** Hidden while it has nothing to say (no message, nothing hovered, no quest line): no empty box in view. */
  private idle = false;
  private hudDoc: Object3D | null | undefined;

  private setIdle(idle: boolean): void {
    if (idle === this.idle) return;
    this.idle = idle;
    if (this.hudDoc === undefined) this.hudDoc = findUIKitDocument(this.hud);
    // In the browser ScreenSpace reparents the UIKit document onto the camera: hide it too.
    if (this.hudDoc) this.hudDoc.visible = !idle;
    if (idle) hidePanel(this.hud);
    else {
      this.hud.visible = true;
      this.hudAnchor.reset();
    }
  }

  update(delta: number): void {
    if (!this.ready) return;
    if (this.shown) {
      const vr = this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
      // VR during the tutorial: never shown (the objective card carries the task and the
      // failure reasons; a strip that flickers in for each message read as an empty floating box).
      // The flat view keeps it for messages and the Enter VR button.
      const tutorial = getGame(this.world).guiding();
      this.setIdle(tutorial && (vr || (this.toastTimer <= 0 && !this.hoverShown && !this.world.xrEnabled)));
      if (!this.idle && vr) this.hudAnchor.update(this.hud, this.camera);
    }
    if (this.toastTimer > 0 && (this.toastTimer -= delta) <= 0) {
      this.hud.requireElementById<UIKit.Text>('toast').setProperties({ text: ' ' });
    }
    if (this.beaconTimer > 0 && (this.beaconTimer -= delta) <= 0) this.beacon.visible = false;
    if (this.beacon.visible) {
      this.beaconT += delta;
      (this.beacon.material as MeshBasicMaterial).opacity = 0.3 + 0.14 * Math.sin(this.beaconT * 2.4);
    }
    this.updateTip();
  }
}
