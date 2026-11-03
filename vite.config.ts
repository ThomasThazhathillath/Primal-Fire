/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { iwsdkDev } from '@iwsdk/vite-plugin-dev';
import { appendFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

/** Dev only: the game (desktop or headset) posts its play-test log here; it lands in playtest.log (git-ignored). */
function playtestLog(): Plugin {
  return {
    name: 'primal-playtest-log',
    apply: 'serve',
    configureServer(server) {
      // A tiny remote control: POST /__primal-cmd?c=reload makes every open game page reload once.
      let reloadAt = 0;
      let resetAt = 0;
      server.middlewares.use('/__primal-cmd', (req, res) => {
        if (req.method === 'POST') {
          if ((req.url ?? '').includes('c=reload')) reloadAt = Date.now();
          // c=reset: wipe the save on every open page, then reload into a new game.
          if ((req.url ?? '').includes('c=reset')) resetAt = Date.now();
          res.statusCode = 204;
          return void res.end();
        }
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ reloadAt, resetAt }));
      });
      server.middlewares.use('/__primal-log', (req, res) => {
        if (req.method !== 'POST') return void res.end();
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          const ua = req.headers['user-agent'] ?? '';
          const who = /OculusBrowser|Quest/i.test(ua) ? 'QUEST' : 'desktop';
          const stamp = new Date().toISOString().slice(11, 19);
          const lines = body.split('\n').filter(Boolean).map((l) => `${stamp} [${who}] ${l}`);
          if (lines.length) appendFileSync('playtest.log', lines.join('\n') + '\n');
          res.statusCode = 204;
          res.end();
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [iwsdkDev(), playtestLog()],
  server: { host: '0.0.0.0', port: Number(process.env.PORT ?? 8081), open: false },
  build: {
    outDir: 'dist',
    sourcemap: process.env.NODE_ENV !== 'production',
    target: 'esnext',
    rollupOptions: { input: './index.html' },
  },
  esbuild: { target: 'esnext' },
  // @drawcall/uikitml otherwise pulls a second three/@pmndrs/uikit graph
  // (its own three vs the app's super-three alias). Duplicate Component classes break
  // instanceof checks → "Only pmndrs/uikit components can be added as children".
  resolve: {
    dedupe: [
      'three',
      '@pmndrs/uikit',
      '@pmndrs/uikit-horizon',
      '@pmndrs/uikit-lucide',
    ],
  },
  optimizeDeps: {
    exclude: ['@babylonjs/havok'],
    include: [
      'three',
      '@pmndrs/uikit',
      '@pmndrs/uikit-horizon',
      '@pmndrs/uikit-lucide',
      '@drawcall/uikitml',
    ],
    esbuildOptions: { target: 'esnext' },
  },
  publicDir: 'public',
  base: './',
});
