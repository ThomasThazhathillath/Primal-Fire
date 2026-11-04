// The visible sky (docs/SKY_SPEC.md): stars, moon, sun and clouds. Owned by
// WorldEnvironmentSystem, which calls update() once a frame with Game.env, so
// everything here follows the one clock. Four draw calls in all: one Points
// (2000 stars), one sun and one moon billboard, one cloud dome. No per-frame
// allocation; the cloud noise is one small generated texture.
//
// Draw order (all unlit, fog-exempt, no depth writes, behind the world because
// trees and ridges write depth first): stars, then sun and moon, then clouds on
// top, so stars never show through opaque cloud and the sun glows through thin cloud.

import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  DataTexture,
  LinearFilter,
  Mesh,
  PlaneGeometry,
  Points,
  RepeatWrapping,
  RGBAFormat,
  ShaderMaterial,
  SphereGeometry,
  UnsignedByteType,
  Vector3,
  type World,
} from '@iwsdk/core';
import type { Environment } from '../game/environment.js';
import { mulberry32 } from '../game/rng.js';
import { cloudCoverage, cloudLight, starVisibility } from '../game/sky.js';

const STARS = 2000;
const SKY_RADIUS = 280;
const DISC_DISTANCE = 300;
const SUN_SIZE = 110;
const MOON_SIZE = 46;

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ------------------------------------------------------------------ shaders

const DISC_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv * 2.0 - 1.0;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

/** Soft sun: a small bright core, a wide glow and a faint haze, not a white ball. */
const SUN_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vUv;
void main() {
  float r = length(vUv);
  float core = smoothstep(0.13, 0.085, r);
  float glow = exp(-r * r * 26.0) * 0.6;
  float haze = exp(-r * 4.2) * 0.22 * smoothstep(1.0, 0.55, r);
  vec3 c = mix(uColor, vec3(1.0, 0.98, 0.92), core) * (core * 1.4 + glow + haze);
  c *= uOpacity;
  if (max(c.r, max(c.g, c.b)) < 0.003) discard;
  gl_FragColor = vec4(c, 1.0);
}`;

/** Moon: a lit disc with a terminator (phase), dark maria, limb darkening and a faint halo. */
const MOON_FRAG = /* glsl */ `
uniform float uPhase;
uniform float uIllum;
uniform float uOpacity;
varying vec2 vUv;
float blob(vec2 p, vec2 c, float s) { vec2 d = p - c; return exp(-dot(d, d) * s); }
void main() {
  const float RM = 0.34;
  vec2 p = vUv / RM;
  float rr = length(p);
  float disc = smoothstep(1.0, 0.95, rr);
  float z = sqrt(max(0.0, 1.0 - rr * rr));
  vec3 n = vec3(p, z);
  float th = uPhase * 6.2831853;
  vec3 L = vec3(sin(th), 0.0, -cos(th));
  float lit = smoothstep(-0.03, 0.12, dot(n, L));
  float m = blob(p, vec2(-0.32, 0.30), 9.0) * 0.7 + blob(p, vec2(0.12, 0.42), 14.0) * 0.55
          + blob(p, vec2(-0.1, -0.05), 10.0) * 0.6 + blob(p, vec2(0.38, 0.0), 16.0) * 0.45
          + blob(p, vec2(-0.45, -0.28), 18.0) * 0.4;
  float surface = 0.95 - 0.3 * clamp(m, 0.0, 1.0);
  surface *= 0.72 + 0.28 * z;
  vec3 warm = vec3(0.93, 0.92, 0.9);
  vec3 body = warm * surface * (lit + 0.035);
  float halo = exp(-rr * 1.7) * 0.2 * (0.25 + 0.75 * uIllum) * smoothstep(2.9, 1.2, rr);
  vec3 c = body * disc + vec3(0.62, 0.72, 1.0) * halo * (1.0 - disc * 0.6);
  c *= uOpacity;
  if (max(c.r, max(c.g, c.b)) < 0.003) discard;
  gl_FragColor = vec4(c, 1.0);
}`;

const STAR_VERT = /* glsl */ `
attribute float aSize;
attribute float aBright;
attribute float aPhase;
attribute float aTint;
uniform float uTime;
uniform float uVis;
uniform float uPx;
varying float vB;
varying float vTint;
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  float tw = 0.86 + 0.14 * sin(uTime * (0.7 + aPhase) + aPhase * 40.0);
  vB = aBright * tw * uVis;
  vTint = aTint;
  gl_PointSize = aSize * uPx;
}`;
const STAR_FRAG = /* glsl */ `
varying float vB;
varying float vTint;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.1, d) * vB;
  if (a < 0.004) discard;
  vec3 col = mix(vec3(0.72, 0.84, 1.0), vec3(1.0, 0.9, 0.74), vTint);
  gl_FragColor = vec4(col * a, 1.0);
}`;

const CLOUD_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
/**
 * Clouds as one shaded dome. The sky direction is projected onto a flat cloud
 * layer (so they thin toward the horizon like real distant clouds), density
 * comes from three baked octaves in ONE texture fetch, and the lighting is a
 * second fetch shifted toward the sun: the side facing the sun is bright, the
 * far side grey. Near the horizon they fade into the fog colour.
 */
const CLOUD_FRAG = /* glsl */ `
uniform sampler2D uNoise;
uniform vec2 uOff;
uniform vec2 uSun;
uniform float uCover;
uniform vec3 uLit;
uniform vec3 uShade;
uniform vec3 uFog;
uniform float uOpacity;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  if (h < -0.02) discard;
  vec2 uv = d.xz / (h + 0.16) * 0.55 + uOff;
  vec3 t = texture2D(uNoise, uv).rgb;
  float base = t.r * 0.52 + t.g * 0.3 + t.b * 0.18;
  float thr = mix(0.78, 0.34, uCover);
  float dens = smoothstep(thr, thr + 0.2, base);
  vec3 t2 = texture2D(uNoise, uv + uSun * 0.05).rgb;
  float base2 = t2.r * 0.52 + t2.g * 0.3 + t2.b * 0.18;
  float dens2 = smoothstep(thr, thr + 0.2, base2);
  // Facing the sun = lit. Thin edges are brighter (light passes through).
  float light = clamp(0.62 + (dens - dens2) * 2.6 + (1.0 - dens) * 0.25, 0.0, 1.0);
  vec3 col = mix(uShade, uLit, light);
  float fade = smoothstep(0.0, 0.3, h);
  col = mix(uFog, col, fade);
  float a = dens * smoothstep(0.0, 0.18, h) * uOpacity;
  if (a < 0.004) discard;
  gl_FragColor = vec4(col, a);
}`;

// ------------------------------------------------------------------- noise

/** Tileable value noise, three octaves in R, G, B (grid 4, 9, 20). One 128x128 texture. */
function makeCloudNoise(): DataTexture {
  const N = 128;
  const rng = mulberry32(4242);
  const data = new Uint8Array(N * N * 4);
  const grids = [4, 9, 20];
  for (let c = 0; c < 3; c++) {
    const g = grids[c];
    const lat = new Float32Array(g * g);
    for (let i = 0; i < lat.length; i++) lat[i] = rng();
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const fx = (x / N) * g;
        const fy = (y / N) * g;
        const x0 = Math.floor(fx);
        const y0 = Math.floor(fy);
        const tx = smooth(0, 1, fx - x0);
        const ty = smooth(0, 1, fy - y0);
        const a = lat[(y0 % g) * g + (x0 % g)];
        const b = lat[(y0 % g) * g + ((x0 + 1) % g)];
        const cc = lat[((y0 + 1) % g) * g + (x0 % g)];
        const d = lat[((y0 + 1) % g) * g + ((x0 + 1) % g)];
        const v = a + (b - a) * tx + (cc - a) * ty + (a - b - cc + d) * tx * ty;
        data[(y * N + x) * 4 + c] = Math.round(v * 255);
      }
    }
  }
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  const tex = new DataTexture(data, N, N, RGBAFormat, UnsignedByteType);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.magFilter = tex.minFilter = LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

// ------------------------------------------------------------------- system

export class SkyFx {
  private stars!: Points;
  private starMat!: ShaderMaterial;
  private sun!: Mesh;
  private moon!: Mesh;
  private sunMat!: ShaderMaterial;
  private moonMat!: ShaderMaterial;
  private clouds!: Mesh;
  private cloudMat!: ShaderMaterial;
  private t = 0;
  private offX = 0.13;
  private offY = 0.41;
  private readonly lit = new Float32Array(3);
  private readonly shade = new Float32Array(3);
  private readonly warmSun = new Color();

  init(world: World): void {
    const plane = new PlaneGeometry(1, 1);
    const disc = (frag: string, uniforms: Record<string, { value: unknown }>, size: number): [Mesh, ShaderMaterial] => {
      const mat = new ShaderMaterial({
        vertexShader: DISC_VERT,
        fragmentShader: frag,
        uniforms,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        fog: false,
      });
      const m = new Mesh(plane, mat);
      m.scale.setScalar(size);
      m.frustumCulled = false;
      m.renderOrder = -3;
      world.createTransformEntity(m);
      return [m, mat];
    };
    [this.sun, this.sunMat] = disc(SUN_FRAG, { uColor: { value: new Color(1, 0.9, 0.7) }, uOpacity: { value: 1 } }, SUN_SIZE);
    [this.moon, this.moonMat] = disc(MOON_FRAG, { uPhase: { value: 0.5 }, uIllum: { value: 1 }, uOpacity: { value: 0 } }, MOON_SIZE);

    // --- stars: one Points, varied size / brightness / tint, mostly faint
    const rng = mulberry32(777);
    const pos = new Float32Array(STARS * 3);
    const size = new Float32Array(STARS);
    const bright = new Float32Array(STARS);
    const phase = new Float32Array(STARS);
    const tint = new Float32Array(STARS);
    for (let i = 0; i < STARS; i++) {
      // Uniform on the sphere, kept above the horizon (a little below, so it never shows a gap).
      let y = rng() * 2 - 1;
      y = y * 0.5 + 0.5 - 0.04;
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      pos.set([Math.cos(a) * r * SKY_RADIUS, y * SKY_RADIUS, Math.sin(a) * r * SKY_RADIUS], i * 3);
      const b = Math.pow(rng(), 3.2); // most are barely visible, a few are bright
      bright[i] = 0.12 + b * 0.78;
      size[i] = 1.0 + b * 1.5;
      phase[i] = rng();
      tint[i] = rng();
    }
    const sg = new BufferGeometry();
    sg.setAttribute('position', new BufferAttribute(pos, 3));
    sg.setAttribute('aSize', new BufferAttribute(size, 1));
    sg.setAttribute('aBright', new BufferAttribute(bright, 1));
    sg.setAttribute('aPhase', new BufferAttribute(phase, 1));
    sg.setAttribute('aTint', new BufferAttribute(tint, 1));
    this.starMat = new ShaderMaterial({
      vertexShader: STAR_VERT,
      fragmentShader: STAR_FRAG,
      uniforms: { uTime: { value: 0 }, uVis: { value: 0 }, uPx: { value: 1.6 } },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      fog: false,
    });
    this.stars = new Points(sg, this.starMat);
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -4;
    this.stars.visible = false;
    world.createTransformEntity(this.stars);

    // --- clouds: one hemisphere dome seen from inside
    this.cloudMat = new ShaderMaterial({
      vertexShader: CLOUD_VERT,
      fragmentShader: CLOUD_FRAG,
      uniforms: {
        uNoise: { value: makeCloudNoise() },
        uOff: { value: { x: 0, y: 0 } },
        uSun: { value: { x: 0, y: 0 } },
        uCover: { value: 0.3 },
        uLit: { value: new Color(1, 1, 1) },
        uShade: { value: new Color(0.6, 0.65, 0.74) },
        uFog: { value: new Color(0.62, 0.72, 0.76) },
        uOpacity: { value: 0.95 },
      },
      transparent: true,
      depthWrite: false,
      side: BackSide,
      fog: false,
    });
    this.clouds = new Mesh(new SphereGeometry(SKY_RADIUS - 8, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2 + 0.05), this.cloudMat);
    this.clouds.frustumCulled = false;
    this.clouds.renderOrder = -2;
    world.createTransformEntity(this.clouds);
  }

  /** Follow the clock. `head` is the camera's world position; `fog` the current fog colour. */
  update(env: Environment, delta: number, head: Vector3, fog: Color): void {
    this.t += delta;
    const sd = env.sunDir;
    const md = env.moonDir;

    // Sun: soft glow, warm near the horizon.
    this.sun.position.set(head.x + sd[0] * DISC_DISTANCE, head.y + sd[1] * DISC_DISTANCE, head.z + sd[2] * DISC_DISTANCE);
    this.sun.lookAt(head);
    const low = 1 - smooth(0.04, 0.42, sd[1]);
    this.warmSun.setRGB(1, 0.93 - 0.4 * low, 0.76 - 0.46 * low);
    (this.sunMat.uniforms.uColor.value as Color).copy(this.warmSun);
    this.sunMat.uniforms.uOpacity.value = smooth(-0.1, 0.06, sd[1]) * (1 - env.cloud * 0.5);
    this.sun.visible = sd[1] > -0.12;

    // Moon: phase from the clock, brighter when fuller.
    this.moon.position.set(head.x + md[0] * DISC_DISTANCE, head.y + md[1] * DISC_DISTANCE, head.z + md[2] * DISC_DISTANCE);
    this.moon.lookAt(head);
    this.moonMat.uniforms.uPhase.value = env.moonPhase;
    this.moonMat.uniforms.uIllum.value = env.moonIllum;
    this.moonMat.uniforms.uOpacity.value = smooth(0.15, 0.7, env.night) * smooth(-0.1, 0.08, md[1]) * (1 - env.cloud * 0.5);
    this.moon.visible = md[1] > -0.12 && env.night > 0.05;

    // Stars: gradual fade, hidden under cloud (the cloud dome also paints over them).
    const vis = starVisibility(env.night, env.cloud, env.moonIllum);
    this.stars.visible = vis > 0.003;
    this.starMat.uniforms.uVis.value = vis;
    this.starMat.uniforms.uTime.value = this.t;
    this.stars.position.copy(head);

    // Clouds: slow drift with the wind, coverage from the weather, light from the sun.
    this.offX += (0.0035 + env.wind.x * 0.004) * delta;
    this.offY += (0.002 + env.wind.z * 0.004) * delta;
    const u = this.cloudMat.uniforms;
    u.uOff.value.x = this.offX;
    u.uOff.value.y = this.offY;
    const src = env.night > 0.5 ? md : sd;
    const l = Math.hypot(src[0], src[2]) || 1;
    u.uSun.value.x = src[0] / l;
    u.uSun.value.y = src[2] / l;
    u.uCover.value = cloudCoverage(env.cloud);
    cloudLight(sd[1], env.night, env.cloud, this.lit, this.shade, env.hour < 12);
    (u.uLit.value as Color).setRGB(this.lit[0], this.lit[1], this.lit[2]);
    (u.uShade.value as Color).setRGB(this.shade[0], this.shade[1], this.shade[2]);
    (u.uFog.value as Color).copy(fog);
    this.clouds.position.copy(head);
  }
}

