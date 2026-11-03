// Draws the farming side of Level 3 (rules in game/food.ts): dug plots, the
// plants growing in them (taller as they grow, drooping and browner when the
// soil dries) and the wild tuber plants you can dig up. Pooled meshes only;
// the actions themselves go through WaterSystem's "use" input.

import { CircleGeometry, ConeGeometry, createSystem, Group, Mesh, MeshStandardMaterial, SphereGeometry } from '@iwsdk/core';
import { PLOT_LIMIT, WILD_TUBERS } from '../game/food.js';
import { getGame } from './shared.js';

const soilMat = new MeshStandardMaterial({ color: 0x3b2a1c, roughness: 1 });
const wetSoilMat = new MeshStandardMaterial({ color: 0x2a1c12, roughness: 0.8 });
const leafMat = new MeshStandardMaterial({ color: 0x4f9a3a, roughness: 0.9 });
const dryLeafMat = new MeshStandardMaterial({ color: 0x8a8a3a, roughness: 0.9 });
const wildMat = new MeshStandardMaterial({ color: 0x5d8f3a, roughness: 0.9 });
const flowerMat = new MeshStandardMaterial({ color: 0xe8d26a, roughness: 0.8 });

export class FarmSystem extends createSystem({}) {
  private root = new Group();
  private plots: Array<{ soil: Mesh; plant: Mesh }> = [];
  private wild: Group[] = [];

  init(): void {
    this.root.name = 'Farm';
    this.world.createTransformEntity(this.root);
    const soilGeo = new CircleGeometry(0.5, 14);
    soilGeo.rotateX(-Math.PI / 2);
    const plantGeo = new ConeGeometry(0.18, 0.5, 7);
    plantGeo.translate(0, 0.25, 0);
    for (let i = 0; i < PLOT_LIMIT; i++) {
      const soil = new Mesh(soilGeo, soilMat);
      soil.position.y = 0.015;
      soil.visible = false;
      const plant = new Mesh(plantGeo, leafMat);
      plant.visible = false;
      this.root.add(soil, plant);
      this.plots.push({ soil, plant });
    }
    const bushGeo = new SphereGeometry(0.22, 8, 6);
    const flowerGeo = new SphereGeometry(0.05, 6, 4);
    for (const w of WILD_TUBERS) {
      const grp = new Group();
      grp.name = 'WildTuber';
      for (let k = 0; k < 3; k++) {
        const b = new Mesh(bushGeo, wildMat);
        b.position.set(Math.cos(k * 2.1) * 0.15, 0.15 + k * 0.04, Math.sin(k * 2.1) * 0.15);
        b.scale.y = 0.7;
        grp.add(b);
      }
      const f = new Mesh(flowerGeo, flowerMat);
      f.position.set(0, 0.42, 0);
      grp.add(f);
      grp.position.set(w.x, 0, w.z);
      this.root.add(grp);
      this.wild.push(grp);
    }
  }

  update(): void {
    const food = getGame(this.world).food;
    for (let i = 0; i < PLOT_LIMIT; i++) {
      const p = food.plots[i];
      const { soil, plant } = this.plots[i];
      soil.visible = !!p;
      plant.visible = !!p?.crop;
      if (!p) continue;
      soil.position.x = p.x;
      soil.position.z = p.z;
      soil.material = p.moist > 0 ? wetSoilMat : soilMat;
      if (p.crop) {
        plant.position.set(p.x, 0, p.z);
        const h = 0.15 + p.growth * 1.1;
        const droop = p.moist > 0 || p.growth >= 1 ? 1 : 0.7;
        plant.scale.set(0.5 + p.growth, h * droop, 0.5 + p.growth);
        plant.material = droop < 1 ? dryLeafMat : leafMat;
      }
    }
    for (let i = 0; i < this.wild.length; i++) this.wild[i].visible = food.wild[i] === 0;
  }
}
