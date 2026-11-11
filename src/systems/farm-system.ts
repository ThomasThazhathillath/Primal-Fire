// Draws the farming side of Level 3 (rules in game/food.ts): dug plots, the
// plants growing in them (taller as they grow, drooping and browner when the
// soil dries) and the wild tuber plants you can dig up. Pooled meshes only;
// the actions themselves go through WaterSystem's "use" input.

import { CircleGeometry, Color, ConeGeometry, createSystem, Group, InstancedMesh, Mesh, MeshStandardMaterial, Object3D, SphereGeometry } from '@iwsdk/core';
import { cropStage, PLOT_LIMIT, WILD_TUBERS } from '../game/food.js';
import { FORAGE_PATCHES } from '../game/forage.js';
import { groundHeight } from '../game/world-layout.js';
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
  private bloom: Mesh[] = [];
  private bush!: InstancedMesh;
  private fruit!: InstancedMesh;
  private shown: number[] = [];
  private tmp = new Object3D();
  private tint = new Color();

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
      const bloom = new Mesh(new SphereGeometry(0.09, 7, 5), flowerMat);
      bloom.visible = false;
      this.root.add(soil, plant, bloom);
      this.bloom.push(bloom);
      this.plots.push({ soil, plant });
    }
    // Foraging patches: one instanced bush each, with three fruits that differ between the safe plant and its look-alike.
    const n = FORAGE_PATCHES.length;
    this.bush = new InstancedMesh(new SphereGeometry(0.3, 8, 6), new MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }), n);
    this.fruit = new InstancedMesh(new SphereGeometry(0.05, 6, 4), new MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }), n * 3);
    this.bush.frustumCulled = false;
    this.fruit.frustumCulled = false;
    this.root.add(this.bush, this.fruit);
    FORAGE_PATCHES.forEach((q, i) => {
      const y = groundHeight(q.x, q.z);
      this.tmp.position.set(q.x, y + 0.22, q.z);
      this.tmp.scale.set(1, q.kind === 'root' ? 0.5 : 0.8, 1);
      this.tmp.updateMatrix();
      this.bush.setMatrixAt(i, this.tmp.matrix);
      this.bush.setColorAt(i, this.tint.setHex(q.kind === 'nut' ? 0x4a7a3a : q.kind === 'root' ? 0x6a9a48 : 0x3f6e34));
      const fc = q.kind === 'berry' ? (q.edible ? 0xc0243a : 0xf2f2ea) : q.kind === 'nut' ? 0xa9803f : (q.edible ? 0xe8e0a0 : 0xb48ac0);
      for (let k = 0; k < 3; k++) {
        this.tmp.position.set(q.x + Math.cos(k * 2.1 + i) * 0.22, y + 0.32 + k * 0.05, q.z + Math.sin(k * 2.1 + i) * 0.22);
        this.tmp.scale.set(1, 1, 1);
        this.tmp.updateMatrix();
        this.fruit.setMatrixAt(i * 3 + k, this.tmp.matrix);
        this.fruit.setColorAt(i * 3 + k, this.tint.setHex(fc));
      }
      this.shown.push(1);
    });
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
      this.bloom[i].visible = false;
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
        // Stages read at a glance: a seedling is a nub, a mature plant is tall, a ripe one carries a yellow flower.
        const stage = cropStage(p.growth);
        if (stage === 'harvestable') {
          this.bloom[i].visible = true;
          this.bloom[i].position.set(p.x, h * 0.5 + 0.2, p.z);
        }
      }
    }
    for (let i = 0; i < this.wild.length; i++) this.wild[i].visible = food.wild[i] === 0;
    // Picked patches show bare bushes (the fruit shrinks away) until they regrow.
    for (let i = 0; i < FORAGE_PATCHES.length; i++) {
      const on = food.forage[i] === 0 ? 1 : 0;
      if (on === this.shown[i]) continue;
      this.shown[i] = on;
      const q = FORAGE_PATCHES[i];
      for (let k = 0; k < 3; k++) {
        this.fruit.getMatrixAt(i * 3 + k, this.tmp.matrix);
        this.tmp.matrix.decompose(this.tmp.position, this.tmp.quaternion, this.tmp.scale);
        this.tmp.scale.setScalar(on ? 1 : 0.0001);
        this.tmp.updateMatrix();
        this.fruit.setMatrixAt(i * 3 + k, this.tmp.matrix);
      }
      void q;
      this.fruit.instanceMatrix.needsUpdate = true;
    }
  }
}
