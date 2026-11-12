// The build book: a compact list card (opened by the book icon) with one row
// per buildable. Tapping an unlocked structure places its outline in front of
// you (Game.placeFromBook) and closes the card; locked rows show "?" and how
// to unlock them; recipes made at the workbench are listed for reference.
// Nothing floats unless you opened it; in VR the card stays put (StaticAnchor).

import { createSystem, type Entity, RayInteractable, type UIKit, type UIKitMLAsset, Vector3, VisibilityState } from '@iwsdk/core';
import type { BookEntry } from '../game/buildbook.js';
import { PanelTouch } from './panel-touch.js';
import { structureView } from '../game/hint-info.js';
import { RowThumbs } from './row-thumbs.js';
import { PopIn } from './ui-fx.js';
import { getGame, getUi, hidePanel, menu, PANEL_DISTANCE, PANEL_DOWN, placeInFront, StaticAnchor, SwipePager, uiText } from './shared.js';

/** Entries per page: keeps every row a full-size fingertip target and the card on screen. */
const ROWS = 8;
/** Panel scale in VR (metres per layout unit * 100). */
const VR_SCALE = 0.08; // 20px row text * 0.08 = the bag's 16px * 0.1 on screen, in a panel short enough to fit the view

export class BuildBookSystem extends createSystem({}) {
  private panel!: UIKitMLAsset;
  private panelEntity!: Entity;
  private touch!: PanelTouch;
  private thumbs!: RowThumbs;
  private pop!: PopIn;
  private thumbTimer = 0;
  private vr = false;
  private open = false;
  private rows: BookEntry[] = [];
  private anchor = new StaticAnchor(0.9, 0, 0.1).movable('buildbook', 520, 500);
  private dir = new Vector3();
  private timer = 0;
  private page = 0;
  private swipe = new SwipePager((d) => {
    this.page += d;
    this.refresh();
  }, 520, 500);

  async init(): Promise<void> {
    const game = getGame(this.world);
    this.panel = await this.world.assets.instantiate<UIKitMLAsset>('book-panel');
    this.panel.name = 'BuildBookPanel';
    this.panel.scale.setScalar(0.1);
    this.panelEntity = this.world.createTransformEntity(this.panel);
    this.panelEntity.addComponent(RayInteractable);
    hidePanel(this.panel);
    this.touch = new PanelTouch(this.world, this.panel, 0.1, 'book');
    this.thumbs = new RowThumbs(this.panel, this.renderer, ROWS);
    this.pop = new PopIn(this.panel, () => (this.vr ? VR_SCALE : 0.1));
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((v) => {
        this.vr = v !== VisibilityState.NonImmersive;
        PanelTouch.setRay(this.world, this.panelEntity, this.vr);
      }),
    );
    menu.register('book', () => this.setOpen(false));
    for (let i = 0; i < ROWS; i++) {
      const el = this.panel.requireElementById(`entry-${i}`);
      const onClick = () => this.choose(i);
      el.addEventListener('click', onClick);
      this.touch.add(`entry-${i}`, onClick);
      this.cleanupFuncs.push(() => el.removeEventListener('click', onClick));
    }
    this.cleanupFuncs.push(this.swipe.listenWheel(() => !!this.panel?.visible));
    const close = this.panel.requireElementById('book-close');
    const onClose = () => menu.back();
    close.addEventListener('click', onClose);
    this.touch.add('book-close', onClose);
    this.cleanupFuncs.push(() => close.removeEventListener('click', onClose));
    for (const [id, step] of [['book-prev', -1], ['book-next', 1]] as const) {
      const el = this.panel.requireElementById(id);
      const onPage = () => {
        this.page += step;
        this.refresh();
      };
      el.addEventListener('click', onPage);
      this.touch.add(id, onPage);
      this.cleanupFuncs.push(() => el.removeEventListener('click', onPage));
    }
    getUi(this.world).toggleBook = () => this.setOpen(!this.open);
    game.updateBook(); // what is already open is not news
  }

  private immersive(): boolean {
    return this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
  }

  private choose(i: number): void {
    const entry = this.rows[this.page * ROWS + i];
    if (!entry) return;
    const game = getGame(this.world);
    if (entry.kind === 'recipe') {
      game.toast(entry.unlocked ? `${entry.name}: made at the workbench - press the finished bench to choose it.` : entry.hint, 'note');
      return;
    }
    this.camera.getWorldDirection(this.dir);
    const res = game.placeFromBook(entry.id, this.dir.x, this.dir.z);
    if (res.ok) this.setOpen(false);
    else this.refresh(); // stay open: the message line says why
  }

  setOpen(open: boolean): void {
    if (!this.panel) return;
    this.open = open;
    if (open) {
      menu.open('book');
      this.page = 0;
      this.refresh();
      this.panel.visible = true;
      this.anchor.reset();
      // Tall list: a little smaller in VR so all eight rows fit the view at arm's length.
      const sc = this.vr ? VR_SCALE : 0.1;
      this.panel.scale.setScalar(sc);
      this.touch.setScale(sc);
      placeInFront(this.panel, this.camera, this.vr ? PANEL_DISTANCE : 0.9, 0, this.vr ? PANEL_DOWN + 0.04 : 0.1);
      this.touch.reset();
      this.pop.open();
    } else {
      menu.closed('book');
      this.pop.close(() => hidePanel(this.panel));
    }
  }

  private refresh(): void {
    const game = getGame(this.world);
    // Locked bench recipes collapse into a single "?" row.
    let lockedRecipe = false;
    this.rows = game.bookEntries().filter((e) => {
      if (e.kind !== 'recipe' || e.unlocked) return true;
      const first = !lockedRecipe;
      lockedRecipe = true;
      return first;
    });
    const pages = Math.max(1, Math.ceil(this.rows.length / ROWS));
    this.page = Math.max(0, Math.min(pages - 1, this.page));
    this.panel.requireElementById('book-prev').setProperties({ display: pages > 1 && this.page > 0 ? 'flex' : 'none' });
    this.panel.requireElementById('book-next').setProperties({ display: pages > 1 && this.page < pages - 1 ? 'flex' : 'none' });
    this.panel.requireElementById<UIKit.Text>('book-page').setProperties({ text: pages > 1 ? `${this.page + 1} / ${pages}` : '' });
    for (let i = 0; i < ROWS; i++) {
      const e = this.rows[this.page * ROWS + i];
      this.panel.requireElementById(`entry-${i}`).setProperties({ display: e ? 'flex' : 'none' });
      if (!e) continue;
      this.panel.requireElementById<UIKit.Text>(`entry-${i}-label`).setProperties({ text: uiText(label(e)) });
    }
    // A small picture of the build (only where a real picture exists: a locked row shows none).
    if (this.open) {
      this.thumbs.setRows(
        Array.from({ length: ROWS }, (_, i) => {
          const e = this.rows[this.page * ROWS + i];
          const view = e?.unlocked && e.structure ? structureView(e.structure) : null;
          return { el: `entry-${i}`, pic: view ? { key: `struct:${e!.structure}`, view } : null };
        }),
      );
    }
  }

  update(delta: number): void {
    if (!this.panel) return;
    const game = getGame(this.world);
    if ((this.timer += delta) > 0.5) {
      this.timer = 0;
      game.updateBook();
      if (this.open) this.refresh();
    }
    if (this.pop.busy) this.pop.update(delta);
    if (this.open && this.immersive()) {
      this.touch.update(delta);
      if (!this.anchor.dragging) this.swipe.update(this.panel);
    }
    if (this.open && (this.thumbTimer += delta) > 0.25) {
      this.thumbTimer = 0;
      this.thumbs.update();
    }
  }
}

/** One line: name and parts you have / need, or "?" and how to unlock. */
function label(e: BookEntry): string {
  if (!e.unlocked) return e.kind === 'recipe' ? `? Tools and more - ${e.hint}` : `? - ${e.hint}`;
  if (e.kind === 'recipe') return `${e.name} (at the bench): ${e.parts.map((p) => `${p.label} ${Math.min(p.have, p.need)}/${p.need}`).join(', ')}`;
  return `${e.name}: ${e.parts.map((p) => `${p.label} ${Math.min(p.have, p.need)}/${p.need}`).join(', ')}`;
}
