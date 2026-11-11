// Life in the scenery, all applied at runtime to meshes found by name (the
// forest scene asset stays untouched):
// - the stream's water gets a flowing shader (scrolling noise, ripples, edge
//   foam, sky-tinted fresnel, sun glint) and splashes when you drop something in;
// - tree canopies, bushes and ferns sway in the wind (vertex offsets via
//   onBeforeCompile on cloned materials, so shared rock materials stay still);
// - a few leaves drift down around the player.
// Cost: +2 draw calls (splash, leaves) and 2 extra shader programs. No per-frame allocation.

import { roundPoints } from './round-points.js';
import {
  AssetManager,
  BufferAttribute,
  BufferGeometry,
  Color,
  createSystem,
  type Material,
  type Mesh,
  type MeshLambertMaterial,
  type Object3D,
  Points,
  PointsMaterial,
  ShaderMaterial,
  Vector2,
  Vector3,
} from '@iwsdk/core';
import type { GameEvent } from '../game/game.js';
import { mulberry32 } from '../game/rng.js';
import { BOULDERS, RESOURCES, STREAM_HALF_WIDTH, streamDistance } from '../game/world-layout.js';
import { getGame } from './shared.js';

const WATER_VERT = /* glsl */ `
attribute vec2 aFlow;
varying vec2 vFlow;
varying vec3 vWorld;
void main() {
  vFlow = aFlow;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const WATER_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uDeep;
uniform vec3 uSky;
uniform vec3 uHorizon;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uLight;
uniform float uRain;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform sampler2D uBed;
uniform sampler2D uCloud;
uniform float uCloudOp;
uniform vec3 uCloudTint;
uniform vec3 uRocks[12];
varying vec2 vFlow;
varying vec3 vWorld;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float layer2(vec2 q, float t) { return noise(q) * 0.6 + noise(q * 2.1 + vec2(-t * 0.2, 3.1)) * 0.4; }
void main() {
  // Flow coordinates: x along the stream (m), y across (0..1 bank to bank).
  vec2 p = vec2(vFlow.x - uTime * 0.9, vFlow.y * 1.3);
  vec2 q = p * vec2(1.2, 2.0);
  float h = noise(q) * 0.65 + noise(q * 2.3 + vec2(-uTime * 0.5, 1.7)) * 0.35;
  // Normal from finite differences in flow space (smooth, unlike screen derivatives).
  float hx = noise(q + vec2(0.15, 0.0)) * 0.65 + noise((q + vec2(0.15, 0.0)) * 2.3 + vec2(-uTime * 0.5, 1.7)) * 0.35;
  float hy = noise(q + vec2(0.0, 0.15)) * 0.65 + noise((q + vec2(0.0, 0.15)) * 2.3 + vec2(-uTime * 0.5, 1.7)) * 0.35;
  // Second normal layer scrolling the other way and across, at a different scale: the two together read as moving water, not a pattern.
  vec2 q2 = vec2(vFlow.x * 1.9 + uTime * 0.35, vFlow.y * 3.1 - uTime * 0.08);
  float h2 = layer2(q2, uTime);
  float h2x = layer2(q2 + vec2(0.12, 0.0), uTime);
  float h2y = layer2(q2 + vec2(0.0, 0.12), uTime);
  vec3 nrm = normalize(vec3((h - hx) * 2.2 + (h2 - h2x) * 1.7, 1.0, (h - hy) * 2.2 + (h2 - h2y) * 1.7));
  float n2 = noise(p * vec2(3.0, 5.0) + vec2(-uTime * 0.4, 0.0));
  // Rain rings: sparse cells that pulse.
  vec2 cell = floor(vWorld.xz * 3.0);
  float t = fract(uTime * 0.8 + hash(cell));
  float d = length(fract(vWorld.xz * 3.0) - 0.5);
  float ring = uRain * smoothstep(0.04, 0.0, abs(d - t * 0.45)) * (1.0 - t) * step(0.55, hash(cell + 3.1));
  vec3 view = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - max(dot(view, nrm), 0.0), 3.0);
  // Fresnel reflection of the sky: the gradient, then the photographed clouds sampled by the reflected ray (no second scene render).
  vec3 rv = reflect(-view, nrm);
  vec3 refl = mix(uHorizon, uSky, clamp(rv.y * 1.6, 0.0, 1.0));
  vec4 cl = texture2D(uCloud, vec2(atan(rv.z, rv.x) / 6.2831853 + 0.5, 0.5 + asin(clamp(rv.y, 0.0, 1.0)) / 3.1415927));
  refl = mix(refl, cl.rgb * uCloudTint, cl.a * uCloudOp * smoothstep(0.02, 0.25, rv.y));
  // Depth: the bed shows through the shallows near the banks and fades to the deep tint toward the middle.
  float bankD = 1.0 - abs(vFlow.y * 2.0 - 1.0);
  float shallow = 1.0 - smoothstep(0.04, 0.95, bankD);
  vec3 bed = pow(texture2D(uBed, vWorld.xz / 1.6 + nrm.xz * 0.06).rgb, vec3(0.4545)) * (0.4 + 0.6 * uLight) * 0.8;
  vec3 body = mix(uDeep * (0.4 + 0.6 * uLight), bed, shallow * 0.8);
  vec3 col = mix(body, refl, 0.1 + 0.6 * fres);
  // Sun glint.
  vec3 hv = normalize(uSunDir + view);
  col += uSunColor * pow(max(dot(nrm, hv), 0.0), 60.0) * 0.8 * uLight;
  // Foam: banks and the noisy crests.
  float edge = 1.0 - abs(vFlow.y * 2.0 - 1.0);
  float foam = smoothstep(0.22, 0.0, edge + (n2 - 0.5) * 0.2) + smoothstep(0.8, 0.95, h) * 0.25 + ring;
  // Foam rings round the rocks that break the surface (the twelve nearest to you, set from the layout).
  for (int i = 0; i < 12; i++) {
    float rr = uRocks[i].z;
    float dd = length(vWorld.xz - uRocks[i].xy);
    foam += step(0.0, rr) * smoothstep(rr + 0.42, rr + 0.05, dd) * (0.55 + 0.45 * noise(vWorld.xz * 9.0 + vec2(uTime * 0.6, 0.0)));
  }
  col = mix(col, vec3(0.85, 0.9, 0.92) * (0.35 + 0.65 * uLight), clamp(foam, 0.0, 1.0) * 0.7);
  float fogD = length(cameraPosition - vWorld);
  col = mix(col, uFogColor, smoothstep(uFogNear, uFogFar, fogD));
  gl_FragColor = vec4(col, mix(0.72, 0.95, smoothstep(0.0, 0.5, bankD)));
}`;

const SPLASH_N = 48;
const LEAVES_N = 28;
const LEAF_BOX = 14;

/** Meshes whose materials sway, and how stiff the lowest part is (fraction of height). */
const SWAY: Record<string, { amp: number; base: number }> = {
  Pines: { amp: 0.06, base: 0.25 },
  Broadleaves: { amp: 0.08, base: 0.3 },
  Bushes: { amp: 0.06, base: -0.6 },
  Ferns: { amp: 0.12, base: 0 },
};

/** Is (x, z) in the stream's water? Exported for the ambience. */
export function inStream(x: number, z: number): boolean {
  return streamDistance(x, z) < STREAM_HALF_WIDTH + 0.15;
}

/** Rocks that stand in or beside the stream, with the radius their foam ring starts from. */
const STREAM_ROCKS: Array<{ x: number; z: number; r: number }> = [
  ...BOULDERS.filter((b) => streamDistance(b.x, b.z) < STREAM_HALF_WIDTH + b.size + 2.5).map((b) => ({ x: b.x, z: b.z, r: b.size * 0.8 })),
  ...RESOURCES.filter((r) => r.look === 'wetStone' && streamDistance(r.x, r.z) < STREAM_HALF_WIDTH + 0.6).map((r) => ({ x: r.x, z: r.z, r: 0.14 })),
];

export class NatureSystem extends createSystem({}) {
  private rockT = 0;
  private water: ShaderMaterial | null = null;
  private search = 0;
  private swayUniforms = { uTime: { value: 0 }, uWind: { value: new Vector2() }, uGust: { value: 0 } };
  private time = 0;
  private head = new Vector3();
  private lastDropId = 0;

  private splash!: Points;
  private splashPos!: Float32Array;
  private splashVel!: Float32Array;
  private splashLife!: Float32Array;
  private splashNext = 0;
  private splashActive = 0;

  private leaves!: Points;
  private leafPos!: Float32Array;
  private leafPhase!: Float32Array;

  init(): void {
    const game = getGame(this.world);
    this.lastDropId = game.drops.reduce((m, d) => Math.max(m, d.id), 0);
    this.cleanupFuncs.push(game.on((e: GameEvent) => e.type === 'drops' && this.onDrops()));
    // Debug/tuning: window.__splash(x, z)
    (window as unknown as { __splash?: unknown }).__splash = (x: number, z: number) => this.spawnSplash(x, z);

    // Splash particles: one pooled Points cloud, hidden when idle.
    this.splashPos = new Float32Array(SPLASH_N * 3);
    this.splashVel = new Float32Array(SPLASH_N * 3);
    this.splashLife = new Float32Array(SPLASH_N);
    const sg = new BufferGeometry();
    sg.setAttribute('position', new BufferAttribute(this.splashPos, 3));
    this.splash = new Points(sg, roundPoints(new PointsMaterial({ color: 0xdfeef5, size: 0.07, transparent: true, opacity: 0.85, depthWrite: false })));
    this.splash.frustumCulled = false;
    this.splash.visible = false;
    this.world.createTransformEntity(this.splash);

    // Falling leaves around the head.
    const rng = mulberry32(17);
    this.leafPos = new Float32Array(LEAVES_N * 3);
    this.leafPhase = new Float32Array(LEAVES_N);
    const colors = new Float32Array(LEAVES_N * 3);
    const c = new Color();
    for (let i = 0; i < LEAVES_N; i++) {
      this.leafPos[i * 3] = (rng() - 0.5) * LEAF_BOX;
      this.leafPos[i * 3 + 1] = rng() * 7;
      this.leafPos[i * 3 + 2] = (rng() - 0.5) * LEAF_BOX;
      this.leafPhase[i] = rng() * 10;
      c.setHex([0xb5862f, 0x8f6a26, 0xa64b22, 0x7d8a2c][i % 4]);
      colors.set([c.r, c.g, c.b], i * 3);
    }
    const lg = new BufferGeometry();
    lg.setAttribute('position', new BufferAttribute(this.leafPos, 3));
    lg.setAttribute('color', new BufferAttribute(colors, 3));
    this.leaves = new Points(lg, roundPoints(new PointsMaterial({ size: 0.07, vertexColors: true })));
    this.leaves.frustumCulled = false;
    this.world.createTransformEntity(this.leaves);
  }

  /** Find the stream and the swaying meshes once the forest asset is in the scene. */
  private findScenery(): void {
    this.scene.traverse((o: Object3D) => {
      if (!this.water && o.name === 'Water' && (o as Mesh).isMesh) this.setupWater(o as Mesh);
      const sway = SWAY[o.name];
      if (sway && (o as Mesh).isMesh && !o.userData.sway) this.setupSway(o as Mesh, sway.amp, sway.base);
    });
  }

  private setupWater(mesh: Mesh): void {
    const geo = mesh.geometry as BufferGeometry;
    const pos = geo.getAttribute('position');
    // Vertices come in bank pairs (left, right) along the centreline.
    const flow = new Float32Array(pos.count * 2);
    let along = 0;
    for (let i = 0; i < pos.count; i += 2) {
      if (i >= 2) {
        const mx = (pos.getX(i) + pos.getX(i + 1) - pos.getX(i - 2) - pos.getX(i - 1)) / 2;
        const mz = (pos.getZ(i) + pos.getZ(i + 1) - pos.getZ(i - 2) - pos.getZ(i - 1)) / 2;
        along += Math.hypot(mx, mz);
      }
      flow[i * 2] = along;
      flow[i * 2 + 1] = 0;
      flow[i * 2 + 2] = along;
      flow[i * 2 + 3] = 1;
    }
    geo.setAttribute('aFlow', new BufferAttribute(flow, 2));
    this.water = new ShaderMaterial({
      vertexShader: WATER_VERT,
      fragmentShader: WATER_FRAG,
      transparent: true,
      uniforms: {
        uTime: { value: 0 },
        uDeep: { value: new Color(0x1f4f63) },
        uSky: { value: new Color() },
        uHorizon: { value: new Color() },
        uSunDir: { value: new Vector3(0, 1, 0) },
        uSunColor: { value: new Color() },
        uLight: { value: 1 },
        uRain: { value: 0 },
        uFogColor: { value: new Color() },
        uFogNear: { value: 16 },
        uFogFar: { value: 52 },
        uRocks: { value: Array.from({ length: 12 }, () => new Vector3(0, 0, -1)) },
        uBed: { value: null },
        uCloud: { value: null },
        uCloudOp: { value: 0 },
        uCloudTint: { value: new Color(1, 1, 1) },
      },
    });
    (mesh.material as Material).dispose();
    mesh.material = this.water;
  }

  private setupSway(mesh: Mesh, amp: number, base: number): void {
    mesh.userData.sway = true;
    const geo = mesh.geometry as BufferGeometry;
    geo.computeBoundingBox();
    const top = geo.boundingBox!.max.y;
    const bottom = geo.boundingBox!.min.y;
    const mat = (mesh.material as MeshLambertMaterial).clone();
    const u = this.swayUniforms;
    const start = (bottom + (top - bottom) * Math.max(0, base)).toFixed(3);
    const span = Math.max(0.01, top - (bottom + (top - bottom) * Math.max(0, base))).toFixed(3);
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = u.uTime;
      shader.uniforms.uWind = u.uWind;
      shader.uniforms.uGust = u.uGust;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform vec2 uWind;\nuniform float uGust;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          {
            float k = clamp((position.y - ${start}) / ${span}, 0.0, 1.0);
            k *= k;
            vec3 ip = vec3(0.0);
            #ifdef USE_INSTANCING
              ip = instanceMatrix[3].xyz;
            #endif
            float ph = dot(ip.xz, vec2(0.37, 0.71));
            float s = sin(uTime * 1.3 + ph) * 0.6 + sin(uTime * 2.9 + ph * 1.7) * 0.25;
            float w = 0.25 + length(uWind) * 1.2 + uGust;
            transformed.xz += (uWind * (0.6 + uGust) + vec2(s, s * 0.6)) * k * ${amp.toFixed(3)} * w * (${(top - bottom).toFixed(3)});
          }`,
        );
    };
    mat.customProgramCacheKey = () => `sway:${mesh.name}`;
    mesh.material = mat;
  }

  private onDrops(): void {
    const drops = getGame(this.world).drops;
    for (const d of drops) {
      if (d.id <= this.lastDropId) continue;
      this.lastDropId = d.id;
      if (inStream(d.x, d.z)) this.spawnSplash(d.x, d.z);
    }
  }

  spawnSplash(x: number, z: number): void {
    for (let n = 0; n < 16; n++) {
      const i = this.splashNext;
      this.splashNext = (this.splashNext + 1) % SPLASH_N;
      const a = (n / 16) * Math.PI * 2 + Math.random() * 0.4;
      const sp = 0.4 + Math.random() * 0.8;
      this.splashPos[i * 3] = x;
      this.splashPos[i * 3 + 1] = 0.05;
      this.splashPos[i * 3 + 2] = z;
      this.splashVel[i * 3] = Math.cos(a) * sp;
      this.splashVel[i * 3 + 1] = 1.4 + Math.random() * 1.4;
      this.splashVel[i * 3 + 2] = Math.sin(a) * sp;
      this.splashLife[i] = 1;
    }
    this.splashActive = 1.2;
    this.splash.visible = true;
  }

  /** Every second, point the shader's twelve foam slots at the stream rocks nearest the camera (no allocation). */
  private updateRocks(delta: number): void {
    if ((this.rockT -= delta) > 0 || !this.water) return;
    this.rockT = 1;
    this.camera.getWorldPosition(this.head);
    const slots = this.water.uniforms.uRocks.value as Vector3[];
    let last = -1;
    for (let k = 0; k < 12; k++) {
      let best = -1;
      let bd = 30 * 30;
      for (let i = 0; i < STREAM_ROCKS.length; i++) {
        const c = STREAM_ROCKS[i];
        const d = (c.x - this.head.x) ** 2 + (c.z - this.head.z) ** 2;
        if (d >= bd) continue;
        let taken = false;
        for (let j = 0; j < k; j++) if (slots[j].x === c.x && slots[j].y === c.z) taken = true;
        if (!taken) {
          bd = d;
          best = i;
        }
      }
      if (best < 0) {
        slots[k].set(0, 0, -1);
      } else {
        slots[k].set(STREAM_ROCKS[best].x, STREAM_ROCKS[best].z, STREAM_ROCKS[best].r);
        last = best;
      }
    }
    void last;
  }

  update(delta: number): void {
    if (!this.water && (this.search -= delta) <= 0) {
      this.search = 1.5;
      this.findScenery();
    }
    const env = getGame(this.world).env;
    this.time += delta;

    // --- wind sway uniforms; gusts are slow random pulses scaled by the wind
    const u = this.swayUniforms;
    u.uTime.value = this.time;
    u.uWind.value.set(env.wind.x, env.wind.z);
    const gust = Math.max(0, Math.sin(this.time * 0.37) * Math.sin(this.time * 0.13 + 1.3));
    u.uGust.value = gust * env.windStrength;

    // --- water
    if (this.water) {
      const w = this.water.uniforms;
      w.uTime.value = this.time;
      (w.uSky.value as Color).setRGB(env.sky[0], env.sky[1], env.sky[2]);
      (w.uHorizon.value as Color).setRGB(env.equator[0], env.equator[1], env.equator[2]);
      (w.uSunDir.value as Vector3).set(env.lightDir[0], env.lightDir[1], env.lightDir[2]);
      (w.uSunColor.value as Color).setRGB(env.lightColor[0], env.lightColor[1], env.lightColor[2]);
      w.uLight.value = Math.min(1, 0.15 + env.lightIntensity / 2.2);
      w.uRain.value = env.rain;
      (w.uFogColor.value as Color).setRGB(env.fogColor[0], env.fogColor[1], env.fogColor[2]);
      w.uFogNear.value = env.fogNear;
      w.uFogFar.value = env.fogFar;
      this.updateRocks(delta);
      // Textures are preloaded by the manifest; pick them up once.
      w.uBed.value ??= AssetManager.getTexture('ground-mud-dr');
      w.uCloud.value ??= AssetManager.getTexture('sky-clouds');
      w.uCloudOp.value = (1 - env.night) * Math.min(1, 0.35 + env.cloud * 1.2) * (1 - env.fog * 0.7);
      (w.uCloudTint.value as Color).setScalar(0.7 + 0.3 * env.lightIntensity / 2.2);
    }

    // --- splash particles
    if (this.splashActive > 0) {
      this.splashActive -= delta;
      for (let i = 0; i < SPLASH_N; i++) {
        if (this.splashLife[i] <= 0) continue;
        this.splashLife[i] -= delta * 1.2;
        this.splashVel[i * 3 + 1] -= 9.8 * delta;
        this.splashPos[i * 3] += this.splashVel[i * 3] * delta;
        this.splashPos[i * 3 + 1] = Math.max(0.02, this.splashPos[i * 3 + 1] + this.splashVel[i * 3 + 1] * delta);
        this.splashPos[i * 3 + 2] += this.splashVel[i * 3 + 2] * delta;
        if (this.splashLife[i] <= 0) this.splashPos[i * 3 + 1] = -10;
      }
      (this.splash.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
      if (this.splashActive <= 0) this.splash.visible = false;
    }

    // --- falling leaves (fewer in rain: they are stuck wet to the branches)
    this.camera.getWorldPosition(this.head);
    const half = LEAF_BOX / 2;
    const p = this.leafPos;
    for (let i = 0; i < LEAVES_N; i++) {
      const ph = this.leafPhase[i] + this.time;
      p[i * 3] += (env.wind.x * 0.8 + Math.sin(ph * 1.7) * 0.25) * delta;
      p[i * 3 + 1] -= (0.35 + Math.sin(ph * 2.3) * 0.12) * delta;
      p[i * 3 + 2] += (env.wind.z * 0.8 + Math.cos(ph * 1.3) * 0.25) * delta;
      // Keep each leaf inside a box that follows the player.
      let dx = p[i * 3] - this.head.x;
      let dz = p[i * 3 + 2] - this.head.z;
      if (dx > half) dx -= LEAF_BOX;
      else if (dx < -half) dx += LEAF_BOX;
      if (dz > half) dz -= LEAF_BOX;
      else if (dz < -half) dz += LEAF_BOX;
      p[i * 3] = this.head.x + dx;
      p[i * 3 + 2] = this.head.z + dz;
      if (p[i * 3 + 1] < 0) p[i * 3 + 1] += 7;
    }
    (this.leaves.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
    this.leaves.visible = env.rain < 0.5 && env.night < 0.9;
  }
}
