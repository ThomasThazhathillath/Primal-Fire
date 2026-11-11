// Particles drawn with PointsMaterial are square by default. This makes them round with a soft edge (a cheap fragment tweak, no
// textures), so fireflies, sparks, splashes, drips and leaves read as particles rather than coloured squares.

import type { PointsMaterial } from '@iwsdk/core';

export function roundPoints<T extends PointsMaterial>(mat: T): T {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      { float pd = length(gl_PointCoord - vec2(0.5)); if (pd > 0.5) discard; diffuseColor.a *= smoothstep(0.5, 0.12, pd); }`,
    );
  };
  mat.customProgramCacheKey = () => 'round-points';
  return mat;
}
