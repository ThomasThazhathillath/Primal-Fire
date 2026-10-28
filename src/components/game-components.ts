// Component declarations only: no systems, DOM or renderer imports here
// (the editor imports this module to build its inspector).

import { createComponent, Types } from '@iwsdk/core';

/** A place in the forest you can gather from (see RESOURCES in world-layout). */
export const Gatherable = createComponent('Gatherable', {
  spotId: { type: Types.String, default: '' },
  charges: { type: Types.Int8, default: 1 },
  /** Game time (s) at which a used-up spot grows back; 0 = not regrowing. */
  regrowAt: { type: Types.Float32, default: 0 },
});

/** A glowing snap spot on a placed blueprint. index -1 is unused. */
export const SnapSpot = createComponent('SnapSpot', {
  structureId: { type: Types.Int32, default: 0 },
  index: { type: Types.Int8, default: 0 },
});

/** The ghost outline that follows your pointer while you hold a key part. */
export const BlueprintGhost = createComponent('BlueprintGhost', {
  kind: { type: Types.String, default: '' },
  valid: { type: Types.Boolean, default: false },
});

/** The pouch on your hip. Pinch it to open the satchel. */
export const SatchelPouch = createComponent('SatchelPouch', {});
