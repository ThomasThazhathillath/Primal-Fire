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
import { fitsPouch, itemName } from '../game/items.js';
import { bagPrompt, gatherPrompt } from '../game/prompts.js';
import { SatchelSystem } from './satchel-system.js';
import { OBSERVATION_COUNT, OBSERVATIONS } from '../game/observations.js';
import { QUESTS } from '../game/quests.js';
import { Gatherable, SatchelItem, SnapSpot, StructurePart, WorldDropItem } from '../components/game-components.js';
import { REACH, ResourceSystem } from './resource-system.js';
import { getGame, getUi, hidePanel, placeInFront, StaticAnchor, uiText } from './shared.js';

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
  /** VR: low and to the left, out of the way of rays aimed at the ground; it never drifts. */
  private hudAnchor = new StaticAnchor(0.85, -0.42, 0.12);
  private card!: UIKitMLAsset;
  private tip!: UIKitMLAsset;
  private cardQueue: string[] = [];
  /** Notebook entries recorded since you last opened it (shown on the notebook icon). */
  private newNotes = 0;
  private questOpen = false;
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
    wire(hud, 'hint-button', () => this.showHint());
    wire(hud, 'satchel-button', () => getUi(this.world).toggleSatchel?.());
    wire(hud, 'notebook-button', () => this.openNotebook());
    wire(hud, 'quest-button', () => {
      this.questOpen = !this.questOpen;
      hud.requireElementById('quest-body').setProperties({ display: this.questOpen ? 'flex' : 'none' });
    });
    wire(hud, 'guide-button', () => getUi(this.world).toggleGuide?.());
    // Hands-friendly: put the held thing in the bag, or set it down when it is too big for it.
    wire(hud, 'stow-button', () => {
      const game = getGame(this.world);
      const held = game.held;
      if (!held) return game.toast('Your hands are empty.', 'note');
      if (fitsPouch(held)) game.stow();
      else getUi(this.world).dropHeld?.(held);
    });
    wire(hud, 'remove-build-button', () => {
      const game = getGame(this.world);
      const s = game.nearestUnfinished(6);
      if (s) game.removeStructure(s.id);
      else game.toast('No unfinished build near you to remove.', 'note');
    });
    // Reload saves first, so nothing is lost; Exit VR ends the headset session (back to the flat page).
    wire(hud, 'reload-button', () => {
      getUi(this.world).saveNow?.();
      location.reload();
    });
    // The top-right X: leave VR (in the browser there is nothing to leave, so it just saves).
    wire(hud, 'close-x-button', () => {
      getUi(this.world).saveNow?.();
      const session = this.renderer.xr.getSession();
      if (session) void session.end();
      else getGame(this.world).toast('Saved. Close the browser tab to quit.', 'note');
    });
    wire(hud, 'exit-vr-button', () => {
      getUi(this.world).saveNow?.();
      void this.renderer.xr.getSession()?.end();
    });
    // Drop what you hold on the ground in front of you (frees a pocket; you can pick it up again).
    wire(hud, 'drop-button', () => {
      const game = getGame(this.world);
      if (game.held) getUi(this.world).dropHeld?.(game.held);
      else game.toast('Take something out of the bag first, then drop it.', 'note');
    });
    wire(hud, 'enter-vr-button', () => this.world.launchXR());
    const enterVr = hud.requireElementById('enter-vr-button');
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((v) => {
        enterVr.setProperties({ display: this.world.xrEnabled && v === VisibilityState.NonImmersive ? 'flex' : 'none' });
      }),
    );
    wire(hud, 'turn-left-button', () => getUi(this.world).snapTurn?.(45));
    wire(hud, 'turn-right-button', () => getUi(this.world).snapTurn?.(-45));
    const stowLabel = hud.requireElementById<UIKit.Text>('stow-label');
    this.cleanupFuncs.push(
      getGame(this.world).on((e) => {
        if (e.type !== 'held') return;
        stowLabel.setProperties({ text: e.item && !fitsPouch(e.item) ? 'Put down' : 'Put away' });
      }),
    );
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
        // No pop-up card: the notebook icon counts it, and it opens when you choose.
        this.newNotes++;
        this.setToast(`New notebook entry: ${OBSERVATIONS[e.id]?.title ?? ''}. Open the book to read it.`);
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
    const lv = game.gameLevel;
    const inLevel = lv.quests.indexOf(q?.title ?? '');
    text('quest-num', q ? `LEVEL ${lv.n}: ${lv.name.toUpperCase()}${inLevel >= 0 ? `  ${inLevel + 1}/${lv.quests.length}` : ''}` : 'CHAPTER 1');
    text('level', `Rank ${game.level}   ${game.xp} XP`);
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
    text('notebook-label', this.newNotes ? `${this.newNotes} new` : `${game.notebook.length}/${OBSERVATION_COUNT}`);
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
    set('card-why', o.why ?? '-');
    this.card.requireElementById('card-why-label').setProperties({ display: o.why ? 'flex' : 'none' });
    this.card.requireElementById('card-why').setProperties({ display: o.why ? 'flex' : 'none' });
    this.card.visible = true;
    placeInFront(this.card, this.camera, 0.75, 0.3, 0.05);
  }

  /** Pages through every observation you have recorded, oldest first. */
  openNotebook(): void {
    const game = getGame(this.world);
    // A second press closes it.
    if (this.card.visible) {
      this.browsing = false;
      hidePanel(this.card);
      return;
    }
    if (!game.notebook.length) {
      game.toast('Your notebook is empty. Every outcome you witness is recorded here.');
      return;
    }
    this.cardQueue.length = 0;
    this.browsing = true;
    // Start at the first entry you haven't read yet.
    this.notebookIndex = Math.max(0, game.notebook.length - this.newNotes);
    if (this.notebookIndex >= game.notebook.length) this.notebookIndex = 0;
    this.newNotes = 0;
    this.renderQuest();
    this.showCard(game.notebook[this.notebookIndex]);
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

  update(delta: number): void {
    if (!this.ready) return;
    if (this.shown && this.world.visibilityState.peek() !== VisibilityState.NonImmersive) this.hudAnchor.update(this.hud, this.camera);
    if (this.toastTimer > 0 && (this.toastTimer -= delta) <= 0) {
      this.hud.requireElementById<UIKit.Text>('toast').setProperties({ text: ' ' });
    }
    if (this.beaconTimer > 0 && (this.beaconTimer -= delta) <= 0) this.beacon.visible = false;
    this.updateTip();
  }
}
