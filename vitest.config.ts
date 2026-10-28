// Unit tests cover the pure game core in src/game; they don't need the IWSDK
// dev plugin from vite.config.ts.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['tests/**/*.test.ts'] },
});
