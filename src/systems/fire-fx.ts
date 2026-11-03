// Procedural fire visuals for FireSystem: shader-drawn flame tongues (scrolling
// noise, white-hot core to dark-red tips), soft rising smoke puffs and a soft
// ground glow. No textures; every material is shared and built once.

import { AdditiveBlending, DoubleSide, NormalBlending, PlaneGeometry, ShaderMaterial } from '@iwsdk/core';

const NOISE = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int k = 0; k < 4; k++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
    return v;
  }
`;

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** One flame tongue. `uSeed` makes each layer move differently; `uIntensity` 0..1. */
export function flameMaterial(seed: number, core: boolean): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uIntensity: { value: 0 }, uSeed: { value: seed } },
    vertexShader: VERT,
    fragmentShader: /* glsl */ `
      uniform float uTime, uIntensity, uSeed;
      varying vec2 vUv;
      ${NOISE}
      void main() {
        float x = (vUv.x - 0.5) * 2.0;
        float y = vUv.y;
        // Turbulence rises: sample noise scrolling upward, faster higher up.
        float n = fbm(vec2(x * 1.7 + uSeed, y * 2.4 - uTime * 2.3));
        float n2 = fbm(vec2(x * 3.1 - uSeed, y * 4.2 - uTime * 3.6));
        // Teardrop: wide at the base, licking to a point, bent sideways by the noise.
        float width = ${core ? '0.42' : '0.62'} * (1.0 - y) * (0.6 + 0.4 * (1.0 - y)) + 0.02;
        float sway = (n - 0.5) * 0.7 * y;
        float body = 1.0 - smoothstep(width * 0.35, width, abs(x + sway));
        float top = 1.0 - smoothstep(0.25, 0.95, y + (n2 - 0.5) * 0.45);
        float f = body * top * smoothstep(0.0, 0.06, y);
        f = clamp(f * (1.2 + n2 * 0.8) * uIntensity, 0.0, 1.0);
        vec3 col = mix(vec3(0.55, 0.06, 0.0), vec3(1.0, 0.42, 0.04), smoothstep(0.05, 0.45, f));
        col = mix(col, vec3(1.0, 0.86, 0.55), smoothstep(${core ? '0.35' : '0.65'}, 0.95, f));
        gl_FragColor = vec4(col * f, f);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
  });
}

/** A soft, noisy smoke puff; `uAlpha` fades it over its life. */
export function smokeMaterial(seed: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uAlpha: { value: 0 }, uSeed: { value: seed } },
    vertexShader: VERT,
    fragmentShader: /* glsl */ `
      uniform float uTime, uAlpha, uSeed;
      varying vec2 vUv;
      ${NOISE}
      void main() {
        vec2 p = vUv - 0.5;
        float r = length(p) * 2.0;
        float n = fbm(p * 3.0 + vec2(uSeed, -uTime * 0.4));
        float a = (1.0 - smoothstep(0.2, 1.0, r + (n - 0.5) * 0.6)) * uAlpha;
        gl_FragColor = vec4(vec3(0.42, 0.40, 0.38) + n * 0.12, a * 0.55);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
    side: DoubleSide,
  });
}

/** A soft radial glow on the ground under the fire. */
export function glowMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uIntensity: { value: 0 } },
    vertexShader: VERT,
    fragmentShader: /* glsl */ `
      uniform float uIntensity;
      varying vec2 vUv;
      void main() {
        float r = length(vUv - 0.5) * 2.0;
        float a = pow(max(0.0, 1.0 - r), 2.2) * uIntensity;
        gl_FragColor = vec4(vec3(1.0, 0.42, 0.1) * a, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
}

/** Flame quad, pivoted at its base so scaling grows it upward. */
export function flameGeometry(width: number, height: number): PlaneGeometry {
  const g = new PlaneGeometry(width, height);
  g.translate(0, height / 2, 0);
  return g;
}
