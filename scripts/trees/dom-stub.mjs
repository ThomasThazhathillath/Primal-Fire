// The library loads bark and leaf textures at import time through three's ImageLoader, which needs a DOM.
// Textures are not used for the baked models (vertex colours are), so a do-nothing image is enough.
const img = () => ({ addEventListener() {}, removeEventListener() {}, set src(_v) {}, style: {} });
globalThis.document ??= { createElementNS: () => img(), createElement: () => img() };
