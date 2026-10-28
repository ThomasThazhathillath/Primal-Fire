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
} from '@iwsdk/core';
import { spotWorldPosition, BLUEPRINTS } from '../game/blueprint.js';
import type { GameEvent } from '../game/game.js';
import { itemName } from '../game/items.js';
import { OBSERVATION_COUNT, OBSERVATIONS } from '../game/observations.js';
import { QUESTS } from '../game/quests.js';
import { Gatherable, SnapSpot } from '../components/game-components.js';
import { REACH, ResourceSystem } from './resource-system.js';
import { getGame, getUi, hidePanel, placeInFront, uiText } from './shared.js';

const STEP_LINES = 6;
const TOAST_SECONDS = 4.5;
const BEACON_SECONDS = 45;

export class HudSystem extends createSystem({
  hoverGather: { required: [Gatherable, Hovered] },
  hoverSpot: { required: [SnapSpot, Hovered] },
}) {
  private hud!: UIKitMLAsset;
  private hudEntity!: Entity;
  private card!: UIKitMLAsset;
  private tip!: UIKitMLAsset;
  private cardQueue: string[] = [];
  private notebookIndex = 0;
  private browsing = false;
  private toastTimer = 0;
  private beacon!: Mesh;
  private beaconTimer = 0;
  private tipTarget: Entity | null = null;
  private tmp = new Vector3();
  private ready = false;
  private shown = false;

  async init(): Promise<void> {
    const game = getGame(this.world);
    const [hud, card, tip] = await Promise.all([
      this.world.assets.instantiate<UIKitMLAsset>('hud-panel'),
      this.world.assets.instantiate<UIKitMLAsset>('card-panel'),
      this.world.assets.instantiate<UIKitMLAsset>('tip-panel'),
    ]);
    this.hud = hud;
    this.card = card;
    this.tip = tip;
    hud.name = 'QuestHud';
    card.name = 'NotebookCard';
    tip.name = 'Tooltip';

    // UIKit units here are ~1 cm, so 0.09 makes the 400-wide HUD ~36 cm in VR.
    hud.scale.setScalar(0.09);
    this.hudEntity = this.world.createTransformEntity(hud);
    this.hudEntity.addComponent(RayInteractable);
    hidePanel(hud); // shown when you wake up

    this.world.createTransformEntity(card).addComponent(RayInteractable);
    card.scale.setScalar(0.09);
    hidePanel(card);
    this.world.createTransformEntity(tip);
    tip.scale.setScalar(0.06);
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
    wire(hud, 'hint-button', () => this.showHint());
    wire(hud, 'satchel-button', () => getUi(this.world).toggleSatchel?.());
    wire(hud, 'notebook-button', () => this.openNotebook());
    wire(card, 'card-ok', () => this.nextCard());
    const ui = getUi(this.world);
    ui.showHint = () => this.showHint();
    ui.openNotebook = () => this.openNotebook();

    this.cleanupFuncs.push(
      game.on((e: GameEvent) => this.onGameEvent(e)),
      this.world.visibilityState.subscribe((v) => this.onVisibility(v)),
      this.queries.hoverGather.subscribe('qualify', (e) => (this.tipTarget = e)),
      this.queries.hoverSpot.subscribe('qualify', (e) => (this.tipTarget = e)),
      this.queries.hoverGather.subscribe('disqualify', (e) => this.clearTip(e)),
      this.queries.hoverSpot.subscribe('disqualify', (e) => this.clearTip(e)),
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
    if (v === VisibilityState.NonImmersive) {
      if (this.hudEntity.hasComponent(Follower)) this.hudEntity.removeComponent(Follower);
    } else if (!this.hudEntity.hasComponent(Follower)) {
      this.hudEntity.addComponent(Follower, {
        target: this.player.head,
        // Eye level, to the left: out of the way of rays aimed down at the ground.
        offsetPosition: [-0.4, 0.02, -0.8],
        behavior: FollowBehavior.PivotY,
        maxAngle: 35,
        tolerance: 0.35,
        speed: 2,
      });
    }
  }

  private onGameEvent(e: GameEvent): void {
    switch (e.type) {
      case 'toast':
        this.setToast(e.text);
        break;
      case 'observation':
        this.cardQueue.push(e.id);
        if (!this.card.visible) this.nextCard();
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
    const q = game.quest;
    const text = (id: string, t: string) => this.hud.requireElementById<UIKit.Text>(id).setProperties({ text: uiText(t) });
    text('quest-num', q ? `QUEST ${game.questIndex + 1} / ${QUESTS.length}` : 'CHAPTER 1');
    text('level', `Level ${game.level}   ${game.xp} XP`);
    text('quest-title', q ? q.title : 'Complete');
    text('quest-desc', q ? q.desc : 'Keep exploring - can you find every observation?');
    for (let i = 0; i < STEP_LINES; i++) {
      const step = q?.steps[i];
      const el = this.hud.requireElementById<UIKit.Text>(`step-${i}`);
      el.setProperties({ display: step ? 'flex' : 'none' });
      if (step) {
        const done = step.done(game);
        el.setProperties({ text: uiText(`${done ? '[x]' : '[ ]'} ${step.text(game)}`), color: done ? '#7fd37f' : undefined });
      }
    }
    this.hud.requireElementById('xp-fill').setProperties({ width: Math.round(350 * game.levelProgress) });
    text('notebook-label', `Notebook ${game.notebook.length}/${OBSERVATION_COUNT}`);
  }

  showHint(): void {
    const game = getGame(this.world);
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

  /** "Got it" / "Next": shows the next queued observation or notebook page. */
  private nextCard(): void {
    const game = getGame(this.world);
    let id: string | undefined;
    if (this.browsing) {
      this.notebookIndex++;
      id = game.notebook[this.notebookIndex];
      if (!id) this.browsing = false;
    } else {
      id = this.cardQueue.shift();
    }
    if (id) this.showCard(id);
    else hidePanel(this.card);
  }

  private showCard(id: string): void {
    const game = getGame(this.world);
    const o = OBSERVATIONS[id];
    const set = (el: string, t: string) => this.card.requireElementById<UIKit.Text>(el).setProperties({ text: uiText(t) });
    set('card-eyebrow', this.browsing ? `LAB NOTEBOOK ${this.notebookIndex + 1} / ${game.notebook.length}` : 'NEW OBSERVATION');
    set('card-title', o.title);
    set('card-obs', o.obs);
    set('card-pri', o.pri);
    set('card-lim', o.lim || '-');
    this.card.requireElementById('card-lim-label').setProperties({ display: o.lim ? 'flex' : 'none' });
    this.card.requireElementById('card-lim').setProperties({ display: o.lim ? 'flex' : 'none' });
    this.card.visible = true;
    placeInFront(this.card, this.camera, 0.75, 0.3, 0.05);
  }

  /** Pages through every observation you have recorded, oldest first. */
  openNotebook(): void {
    const game = getGame(this.world);
    if (!game.notebook.length) {
      game.toast('Your notebook is empty. Every outcome you witness is recorded here.');
      return;
    }
    this.cardQueue.length = 0;
    this.browsing = true;
    this.notebookIndex = 0;
    this.showCard(game.notebook[0]);
  }

  private clearTip(e: Entity): void {
    if (this.tipTarget === e) this.tipTarget = null;
  }

  private updateTip(): void {
    const e = this.tipTarget;
    if (!e || !e.object3D) {
      if (this.tip.visible) hidePanel(this.tip);
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
      sub = resources!.distanceTo(spot) > REACH ? 'Too far - get closer' : 'Pinch to gather';
      e.object3D.getWorldPosition(this.tmp);
      this.tmp.y += 0.6;
    } else {
      const s = game.structures.find((t) => t.id === e.getValue(SnapSpot, 'structureId'));
      if (!s) return;
      const spotDef = BLUEPRINTS[s.kind].spots[e.getValue(SnapSpot, 'index') ?? 0];
      title = spotDef.label;
      sub = `Pinch to place: ${spotDef.accepts.map((id) => itemName(id).toLowerCase()).join(' or ')}`;
      const p = spotWorldPosition(s, e.getValue(SnapSpot, 'index') ?? 0);
      this.tmp.set(p.x, p.y + 0.35, p.z);
    }
    this.tip.requireElementById<UIKit.Text>('tip-text').setProperties({ text: uiText(title) });
    this.tip.requireElementById<UIKit.Text>('tip-sub').setProperties({ text: uiText(sub) });
    this.tip.visible = true;
    this.tip.position.copy(this.tmp);
    this.camera.getWorldPosition(this.tmp);
    this.tip.rotation.set(0, Math.atan2(this.tmp.x - this.tip.position.x, this.tmp.z - this.tip.position.z), 0);
  }

  update(delta: number): void {
    if (!this.ready) return;
    if (this.toastTimer > 0 && (this.toastTimer -= delta) <= 0) {
      this.hud.requireElementById<UIKit.Text>('toast').setProperties({ text: ' ' });
    }
    if (this.beaconTimer > 0 && (this.beaconTimer -= delta) <= 0) this.beacon.visible = false;
    this.updateTip();
  }
}
