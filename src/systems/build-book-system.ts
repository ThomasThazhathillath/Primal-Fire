// The build book: a compact list card (opened by the book icon) with one row
// per buildable. Tapping an unlocked structure places its outline in front of
// you (Game.placeFromBook) and closes the card; locked rows show "?" and how
// to unlock them; recipes made at the workbench are listed for reference.
// Nothing floats unless you opened it; in VR the card stays put (StaticAnchor).

import { createSystem, type Entity, RayInteractable, type UIKit, type UIKitMLAsset, Vector3, VisibilityState } from '@iwsdk/core';
import type { BookEntry } from '../game/buildbook.js';
import { getGame, getUi, hidePanel, placeInFront, StaticAnchor, uiText } from './shared.js';

const ROWS = 14;

export class BuildBookSystem extends createSystem({}) {
  private panel!: UIKitMLAsset;
  private panelEntity!: Entity;
  private open = false;
  private rows: BookEntry[] = [];
  private anchor = new StaticAnchor(0.9, 0, 0.1);
  private dir = new Vector3();
  private timer = 0;

  async init(): Promise<void> {
    const game = getGame(this.world);
    this.panel = await this.world.assets.instantiate<UIKitMLAsset>('book-panel');
    this.panel.name = 'BuildBookPanel';
    this.panel.scale.setScalar(0.1);
    this.panelEntity = this.world.createTransformEntity(this.panel);
    this.panelEntity.addComponent(RayInteractable);
    hidePanel(this.panel);
    for (let i = 0; i < ROWS; i++) {
      const el = this.panel.requireElementById(`entry-${i}`);
      const onClick = () => this.choose(i);
      el.addEventListener('click', onClick);
      this.cleanupFuncs.push(() => el.removeEventListener('click', onClick));
    }
    const close = this.panel.requireElementById('book-close');
    const onClose = () => this.setOpen(false);
    close.addEventListener('click', onClose);
    this.cleanupFuncs.push(() => close.removeEventListener('click', onClose));
    getUi(this.world).toggleBook = () => this.setOpen(!this.open);
    game.updateBook(); // what is already open is not news
  }

  private immersive(): boolean {
    return this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
  }

  private choose(i: number): void {
    const entry = this.rows[i];
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
      this.refresh();
      this.panel.visible = true;
      this.anchor.reset();
      placeInFront(this.panel, this.camera, 0.9, 0, 0.1);
    } else hidePanel(this.panel);
  }

  private refresh(): void {
    const game = getGame(this.world);
    this.rows = game.bookEntries();
    for (let i = 0; i < ROWS; i++) {
      const e = this.rows[i];
      this.panel.requireElementById(`entry-${i}`).setProperties({ display: e ? 'flex' : 'none' });
      if (!e) continue;
      this.panel.requireElementById<UIKit.Text>(`entry-${i}-label`).setProperties({ text: uiText(label(e)) });
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
    if (this.open && this.immersive()) this.anchor.update(this.panel, this.camera);
  }
}

/** One line: name and parts you have / need, or "?" and how to unlock. */
function label(e: BookEntry): string {
  if (!e.unlocked) return `? - ${e.hint}`;
  if (e.kind === 'recipe') return `${e.name} (at the bench): ${e.parts.map((p) => `${p.label} ${Math.min(p.have, p.need)}/${p.need}`).join(', ')}`;
  return `${e.name}: ${e.parts.map((p) => `${p.label} ${Math.min(p.have, p.need)}/${p.need}`).join(', ')}`;
}
