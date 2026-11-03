// Renders Game.env (src/game/environment.ts): drives the level root's
// DomeGradient / IBLGradient, the scene's sun + sky lights, fog, a sun and moon
// disc, rain streaks around the player, a wet-ground tint, and rain on an
// exposed fire. Cost: 3 draw calls (sun, moon, rain), no per-frame allocation.

import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  createSystem,
  DirectionalLightComponent,
  DomeGradient,
  Fog,
  HemisphereLightComponent,
  IBLGradient,
  LineSegments,
  Mesh,
  type MeshBasicMaterial,
  type MeshLambertMaterial,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
} from '@iwsdk/core';
import { fireExposed, RAIN_BURN_LOSS, type WeatherKind } from '../game/environment.js';
import { mulberry32 } from '../game/rng.js';
import { getGame } from './shared.js';

const RAIN_STREAKS = 700;
/** Rain box around the head (m): width/depth and height. */
const RAIN_BOX = 18;
const RAIN_HEIGHT = 12;
const DISC_DISTANCE = 300;

const DISC_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv * 2.0 - 1.0;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const DISC_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vUv;
void main() {
  float r = length(vUv);
  float core = smoothstep(0.32, 0.28, r);
  float halo = pow(max(0.0, 1.0 - r), 3.0) * 0.45;
  float a = (core + halo) * uOpacity;
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor * a, a);
}`;

const RAIN_VERT = /* glsl */ `
attribute float aEnd;
uniform float uTime;
uniform vec3 uCenter;
uniform vec2 uWind;
uniform float uLen;
varying float vAlpha;
void main() {
  vec3 p = position;
  float fall = 9.0 + fract(p.x * 13.1) * 3.0;
  p.y = mod(p.y - uTime * fall, ${RAIN_HEIGHT.toFixed(1)});
  vec2 rel = mod(p.xz - uCenter.xz + ${(RAIN_BOX / 2).toFixed(1)}, ${RAIN_BOX.toFixed(1)}) - ${(RAIN_BOX / 2).toFixed(1)};
  vec3 w = vec3(uCenter.x + rel.x, uCenter.y - 3.0 + p.y, uCenter.z + rel.y);
  // The tail trails up-wind of the head.
  w += aEnd * vec3(-uWind.x * 0.25, uLen, -uWind.y * 0.25);
  w.xz += uWind * (p.y * 0.12);
  vAlpha = (1.0 - aEnd * 0.8) * smoothstep(0.0, 1.5, p.y) * (1.0 - smoothstep(9.0, 12.0, p.y));
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}`;
const RAIN_FRAG = /* glsl */ `
uniform float uOpacity;
uniform vec3 uColor;
varying float vAlpha;
void main() {
  gl_FragColor = vec4(uColor, vAlpha * uOpacity);
}`;

export class WorldEnvironmentSystem extends createSystem({
  dome: { required: [DomeGradient] },
  ibl: { required: [IBLGradient] },
  hemi: { required: [HemisphereLightComponent] },
  sun: { required: [DirectionalLightComponent] },
}) {
  private lastTime = -1;
  private fog!: Fog;
  private head = new Vector3();
  private rain!: LineSegments;
  private rainMat!: ShaderMaterial;
  private sunDisc!: Mesh;
  private moonDisc!: Mesh;
  private sunMat!: ShaderMaterial;
  private moonMat!: ShaderMaterial;
  private groundMat: MeshLambertMaterial | null = null;
  private groundSearch = 0;
  /** Unlit mountain ridges (MeshBasicMaterial) and their daytime colours, dimmed with the sky. */
  private ridges: Array<{ mat: MeshBasicMaterial; base: Color }> = [];
  private clock = 0;
  private fireCheck = 0;
  private fireExposed = true;

  init(): void {
    this.fog = new Fog(new Color(0.62, 0.72, 0.76), 16, 52);
    this.scene.fog = this.fog;

    // --- sun and moon discs (camera-centred billboards)
    const plane = new PlaneGeometry(1, 1);
    const disc = (color: number, size: number): [Mesh, ShaderMaterial] => {
      const mat = new ShaderMaterial({
        vertexShader: DISC_VERT,
        fragmentShader: DISC_FRAG,
        uniforms: { uColor: { value: new Color(color) }, uOpacity: { value: 1 } },
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        fog: false,
      });
      const m = new Mesh(plane, mat);
      m.scale.setScalar(size);
      m.frustumCulled = false;
      m.renderOrder = -1;
      this.world.createTransformEntity(m);
      return [m, mat];
    };
    [this.sunDisc, this.sunMat] = disc(0xfff1c8, 40);
    [this.moonDisc, this.moonMat] = disc(0xdfe8ff, 22);

    // --- rain: one LineSegments draw call, animated entirely in the vertex shader
    const rng = mulberry32(99);
    const pos = new Float32Array(RAIN_STREAKS * 2 * 3);
    const end = new Float32Array(RAIN_STREAKS * 2);
    for (let i = 0; i < RAIN_STREAKS; i++) {
      const x = rng() * RAIN_BOX;
      const y = rng() * RAIN_HEIGHT;
      const z = rng() * RAIN_BOX;
      pos.set([x, y, z, x, y, z], i * 6);
      end[i * 2 + 1] = 1;
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setAttribute('aEnd', new BufferAttribute(end, 1));
    this.rainMat = new ShaderMaterial({
      vertexShader: RAIN_VERT,
      fragmentShader: RAIN_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uCenter: { value: new Vector3() },
        uWind: { value: { x: 0, y: 0 } },
        uLen: { value: 0.35 },
        uOpacity: { value: 0 },
        uColor: { value: new Color(0.75, 0.8, 0.88) },
      },
      transparent: true,
      depthWrite: false,
      fog: false,
    });
    this.rain = new LineSegments(geo, this.rainMat);
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.world.createTransformEntity(this.rain);

    const game = getGame(this.world);
    // Debug/tuning hook: window.__env.skipTo(hour) / .env
    (window as unknown as { __env?: unknown }).__env = {
      env: game.env,
      skipTo: (h: number) => game.env.skipTo(game.time, h),
      setSeed: (s: number) => (game.env.seed = s),
      weather: (k: WeatherKind | null) => (game.env.forceWeather = k),
    };
  }

  update(delta: number): void {
    const game = getGame(this.world);
    const env = game.env;
    const dt = this.lastTime < 0 ? 0 : Math.max(0, game.time - this.lastTime);
    this.lastTime = game.time;
    env.update(game.time, dt);
    this.clock += delta;

    // --- sky dome + image-based light on the level root
    for (const e of this.queries.dome.entities) {
      const sky = e.getVectorView(DomeGradient, 'sky');
      const eq = e.getVectorView(DomeGradient, 'equator');
      const gr = e.getVectorView(DomeGradient, 'ground');
      for (let i = 0; i < 3; i++) {
        sky[i] = env.sky[i];
        eq[i] = env.equator[i];
        gr[i] = env.ground[i];
      }
    }
    for (const e of this.queries.ibl.entities) {
      const sky = e.getVectorView(IBLGradient, 'sky');
      const eq = e.getVectorView(IBLGradient, 'equator');
      const gr = e.getVectorView(IBLGradient, 'ground');
      for (let i = 0; i < 3; i++) {
        sky[i] = Math.min(1, env.sky[i] * 1.6 + 0.1 * (1 - env.night) + 0.45 * env.night);
        eq[i] = Math.min(1, env.equator[i] + 0.55 * env.night);
        gr[i] = env.ground[i] * 1.2;
      }
      e.setValue(IBLGradient, 'intensity', env.iblIntensity);
    }

    // --- lights: hemisphere = ambient, directional = sun by day / moon by night
    for (const e of this.queries.hemi.entities) {
      const sky = e.getVectorView(HemisphereLightComponent, 'skyColor');
      // The dark night sky must not tint the ambient light: lights stay day-bright.
      for (let i = 0; i < 3; i++) sky[i] = Math.min(1, env.sky[i] * 0.8 + 0.45 * (1 - env.night) + 0.6 * env.night + 0.08);
      e.setValue(HemisphereLightComponent, 'intensity', env.hemiIntensity);
    }
    for (const e of this.queries.sun.entities) {
      const c = e.getVectorView(DirectionalLightComponent, 'color');
      for (let i = 0; i < 3; i++) c[i] = env.lightColor[i];
      e.setValue(DirectionalLightComponent, 'intensity', env.lightIntensity);
      const o = e.object3D;
      if (o) {
        o.position.set(env.lightDir[0] * 30, env.lightDir[1] * 30, env.lightDir[2] * 30);
        o.lookAt(env.lightDir[0] * 60, env.lightDir[1] * 60, env.lightDir[2] * 60);
      }
    }

    // --- fog
    this.fog.color.setRGB(env.fogColor[0], env.fogColor[1], env.fogColor[2]);
    this.fog.near = env.fogNear;
    this.fog.far = env.fogFar;

    // --- sun / moon discs
    this.camera.getWorldPosition(this.head);
    const sd = env.sunDir;
    this.sunDisc.position.set(this.head.x + sd[0] * DISC_DISTANCE, this.head.y + sd[1] * DISC_DISTANCE, this.head.z + sd[2] * DISC_DISTANCE);
    this.sunDisc.lookAt(this.head);
    this.sunMat.uniforms.uOpacity.value = Math.max(0, Math.min(1, (sd[1] + 0.05) * 6)) * (1 - env.cloud * 0.85);
    this.sunDisc.visible = sd[1] > -0.1;
    const md = env.moonDir;
    this.moonDisc.position.set(this.head.x + md[0] * DISC_DISTANCE, this.head.y + md[1] * DISC_DISTANCE, this.head.z + md[2] * DISC_DISTANCE);
    this.moonDisc.lookAt(this.head);
    this.moonMat.uniforms.uOpacity.value = env.night * (1 - env.cloud * 0.8) * 0.9;
    this.moonDisc.visible = md[1] > -0.1 && env.night > 0.02;

    // --- rain
    const raining = env.rain > 0.02;
    this.rain.visible = raining;
    if (raining) {
      const u = this.rainMat.uniforms;
      u.uTime.value = this.clock;
      (u.uCenter.value as Vector3).copy(this.head);
      u.uWind.value.x = env.wind.x * 3;
      u.uWind.value.y = env.wind.z * 3;
      u.uLen.value = 0.25 + env.rain * 0.25;
      // Light rain shows fewer streaks: fade the faint ones out by opacity.
      u.uOpacity.value = 0.12 + env.rain * 0.3;
      (u.uColor.value as Color).setRGB(0.7, 0.75, 0.82).multiplyScalar(0.35 + 0.65 * (1 - env.night));
    }

    // --- wet ground tint: darken the ground's vertex colours as it soaks
    if (!this.groundMat && (this.groundSearch -= delta) <= 0) {
      this.groundSearch = 2;
      const g = this.scene.getObjectByName('ForestGround') as Mesh | undefined;
      if (g) this.groundMat = g.material as MeshLambertMaterial;
      this.scene.traverse((o) => {
        if (/^Ridge\d/.test(o.name) && (o as Mesh).material) {
          const mat = (o as Mesh).material as MeshBasicMaterial;
          // Keep the true daytime colour once: rescanning must not record an already-dimmed one.
          if (this.ridges.some((r) => r.mat === mat)) return;
          mat.userData.dayColor ??= mat.color.clone();
          this.ridges.push({ mat, base: mat.userData.dayColor as Color });
        }
      });
    }
    const lum = Math.min(1, 0.35 + env.hemiIntensity / 1.6);
    for (const r of this.ridges) {
      r.mat.color.copy(r.base).multiplyScalar(lum);
      r.mat.color.lerp(this.fog.color, Math.min(0.85, env.fog * 0.8 + env.rain * 0.4));
    }
    if (this.groundMat) this.groundMat.color.setScalar(1 - env.wet * 0.32);

    // --- rain on an exposed fire
    if ((this.fireCheck -= delta) <= 0) {
      this.fireCheck = 1;
      const pit = game.structures.find((s) => s.kind === 'firePit' && s.complete);
      this.fireExposed = !pit || fireExposed(game.structures, pit.x, pit.z);
    }
    if (dt > 0 && this.fireExposed && env.rain > 0.05) game.fire.weather(env.rain * RAIN_BURN_LOSS, dt);
  }
}
