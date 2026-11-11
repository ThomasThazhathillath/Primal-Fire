// The forest floor's surface: swaps the vertex-coloured ground (forest.scene-asset createForestGround) for a physically based
// material that blends three Poly Haven textures by zone (forrest_ground_01 in clearings and the meadow, forest_leaves_02
// under the trees, brown_mud_leaves_01 on the stream banks), each with a normal map and a roughness map. The zone weights are a
// vertex attribute baked from the world layout; the old vertex colours still tint the result so meadow, scorch marks and
// paths keep their character. World-space UVs, so nothing stretches on slopes.

import { AssetManager, createSystem, MeshStandardMaterial, NoColorSpace, RepeatWrapping, SRGBColorSpace, type Mesh, type Texture } from '@iwsdk/core';

/** Metres per texture repeat. */
const TILE = { ground: 1.3, leaves: 1.0, mud: 0.9 };

const NAMES = ['ground', 'leaves', 'mud', 'bark'] as const;

export class GroundSystem extends createSystem({}) {
  private done = false;
  private loading = false;
  private search = 0;
  private tex: Texture[] = [];

  init(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading = true;
    for (const n of NAMES) {
      for (const kind of ['dr', 'n'] as const) {
        const key = `ground-${n}-${kind}`;
        const t = AssetManager.getTexture(key) ?? (await AssetManager.loadTexture(key, key).catch(() => null));
        if (!t) return;
        t.wrapS = t.wrapT = RepeatWrapping;
        t.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
        t.colorSpace = kind === 'dr' ? SRGBColorSpace : NoColorSpace;
        t.needsUpdate = true;
        this.tex.push(t);
      }
    }
    this.loading = false;
  }

  update(delta: number): void {
    if (this.done || this.tex.length < 8 || this.loading) return;
    if ((this.search -= delta) > 0) return;
    this.search = 1;
    // The scene names the instance after its node ("Forest Ground"); the asset's own name is ForestGround.
    const ground = (this.scene.getObjectByName('Forest Ground') ?? this.scene.getObjectByName('ForestGround')) as Mesh | undefined;
    if (!ground || !ground.geometry.attributes.zone) return;
    const [gdr, gn, ldr, ln, mdr, mn, bdr, bn] = this.tex;
    // Fallen trunks get bark: the same two-map recipe on a plain PBR material (the trunk's UVs repeat along its length).
    const trunks = this.scene.getObjectByName('FallenTrunks') as Mesh | undefined;
    if (trunks) {
      const old = trunks.material as MeshStandardMaterial;
      trunks.material = new MeshStandardMaterial({ map: bdr, normalMap: bn, roughness: 0.95, metalness: 0, vertexColors: true, color: old.color });
    }
    const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.tGdr = { value: gdr };
      sh.uniforms.tGn = { value: gn };
      sh.uniforms.tLdr = { value: ldr };
      sh.uniforms.tLn = { value: ln };
      sh.uniforms.tMdr = { value: mdr };
      sh.uniforms.tMn = { value: mn };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec3 zone;\nvarying vec3 vZone;\nvarying vec2 vWUv;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvZone = zone;\nvWUv = (modelMatrix * vec4(position, 1.0)).xz;');
      sh.fragmentShader = sh.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform sampler2D tGdr; uniform sampler2D tGn; uniform sampler2D tLdr; uniform sampler2D tLn; uniform sampler2D tMdr; uniform sampler2D tMn;
          varying vec3 vZone; varying vec2 vWUv;
          vec3 perturbGround(vec3 eye, vec3 N, vec3 mapN, vec2 uv) {
            vec3 q0 = dFdx(eye); vec3 q1 = dFdy(eye); vec2 st0 = dFdx(uv); vec2 st1 = dFdy(uv);
            vec3 q1p = cross(q1, N); vec3 q0p = cross(N, q0);
            vec3 T = q1p * st0.x + q0p * st1.x; vec3 B = q1p * st0.y + q0p * st1.y;
            float det = max(dot(T, T), dot(B, B)); float sc = (det == 0.0) ? 0.0 : inversesqrt(det);
            return normalize(T * (mapN.x * sc) + B * (mapN.y * sc) + N * mapN.z);
          }
          vec4 gA, gB, gC;
          float gh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float gn(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f); return mix(mix(gh(i), gh(i + vec2(1.0, 0.0)), u.x), mix(gh(i + vec2(0.0, 1.0)), gh(i + vec2(1.0, 1.0)), u.x), u.y); }`,
        )
        .replace(
          '#include <map_fragment>',
          `vec2 uvA = vWUv / ${TILE.ground.toFixed(2)}; vec2 uvB = vWUv / ${TILE.leaves.toFixed(2)}; vec2 uvC = vWUv / ${TILE.mud.toFixed(2)};
          // A second, rotated and rescaled sample breaks up the repeat.
          vec2 uvA2 = mat2(0.8, -0.6, 0.6, 0.8) * uvA * 0.37; vec2 uvB2 = mat2(0.8, -0.6, 0.6, 0.8) * uvB * 0.41; vec2 uvC2 = mat2(0.8, -0.6, 0.6, 0.8) * uvC * 0.43;
          gA = mix(texture2D(tGdr, uvA), texture2D(tGdr, uvA2), 0.4);
          gB = mix(texture2D(tLdr, uvB), texture2D(tLdr, uvB2), 0.4);
          gC = mix(texture2D(tMdr, uvC), texture2D(tMdr, uvC2), 0.4);
          vec3 zw = vZone / max(vZone.x + vZone.y + vZone.z, 1e-3);
          diffuseColor.rgb = gA.rgb * zw.x + gB.rgb * zw.y + gC.rgb * zw.z;
          // Break up the repeat and the flat brown: large soft colour patches (moss, dry earth, dark soil) and a fine detail grain that
          // keeps the surface sharp close up, both from cheap noise.
          float big = gn(vWUv * 0.07) * 0.6 + gn(vWUv * 0.21 + 9.0) * 0.4;
          float mid = gn(vWUv * 0.9);
          float fine = gn(vWUv * 7.0) * 0.5 + gn(vWUv * 19.0) * 0.5;
          vec3 patchTint = mix(vec3(0.78, 0.92, 0.62), vec3(1.18, 1.04, 0.84), smoothstep(0.3, 0.7, big));
          patchTint = mix(patchTint, vec3(0.82, 0.78, 0.74), smoothstep(0.62, 0.8, gn(vWUv * 0.13 + 31.0)) * 0.6);
          diffuseColor.rgb *= patchTint * (0.86 + 0.28 * mid) * (0.82 + 0.36 * fine);
          // Mid-distance meadow: beyond the tufts (about 5 m) the open ground takes on blades and clumps in the shader, so the meadow
          // reads lush all the way to the treeline without any geometry. Green clumps and darker gaps, speckled with light blade tips.
          {
            float dm = length(vViewPosition);
            float far = smoothstep(3.5, 8.0, dm);
            float meadow = far * zw.x * smoothstep(0.25, 0.5, gn(vWUv * 0.19 + 5.0) * 0.7 + gn(vWUv * 0.7) * 0.3);
            float clump = gn(vWUv * 2.3) * 0.55 + gn(vWUv * 6.5) * 0.45;
            vec3 grassTint = mix(vec3(0.16, 0.3, 0.09), vec3(0.4, 0.55, 0.16), clump);
            grassTint *= 0.78 + 0.5 * gn(vec2(vWUv.x * 17.0, vWUv.y * 4.0));
            grassTint += step(0.82, gn(vWUv * 24.0)) * vec3(0.14, 0.17, 0.05);
            diffuseColor.rgb = mix(diffuseColor.rgb, grassTint, meadow * 0.78);
          }
          // Under the canopy the floor is darker (the leaf-litter zone).
          diffuseColor.rgb *= 1.0 - 0.26 * zw.y * (0.6 + 0.4 * mid);
          // Wet banks: the mud zone is darker and glossier.
          diffuseColor.rgb *= 1.0 - 0.38 * zw.z;`,
        )
        .replace('#include <color_fragment>', 'diffuseColor.rgb *= mix(vec3(1.0), vColor.rgb * 2.3, 0.55);')
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = clamp(gA.a * zw.x + gB.a * zw.y + gC.a * zw.z, 0.35, 1.0) * (1.0 - 0.45 * zw.z);')
        .replace(
          '#include <normal_fragment_maps>',
          `vec3 nA = texture2D(tGn, uvA).xyz * 2.0 - 1.0; vec3 nB = texture2D(tLn, uvB).xyz * 2.0 - 1.0; vec3 nC = texture2D(tMn, uvC).xyz * 2.0 - 1.0;
          vec3 nm = normalize(nA * zw.x + nB * zw.y + nC * zw.z); nm.xy *= 0.85;
          normal = perturbGround(-vViewPosition, normal, nm, vWUv);`,
        );
    };
    mat.customProgramCacheKey = () => 'ground-zones';
    ground.material = mat;
    this.done = true;
  }
}
