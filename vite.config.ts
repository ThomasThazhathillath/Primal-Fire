/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { iwsdkDev } from '@iwsdk/vite-plugin-dev';
import { appendFileSync } from 'node:fs';
import { join, sep } from 'node:path';
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
          server.config.logger.info(`[primal] remote command ${req.url ?? ''} from ${req.socket.remoteAddress ?? '?'}`, { timestamp: true });
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

const ROOT = process.cwd();
const NOT_APP = ['.claude', 'dist', 'docs', '.scratch'].map((d) => join(ROOT, d) + sep);
const PLAYTEST_LOG = join(ROOT, 'playtest.log');

export default defineConfig({
  plugins: [iwsdkDev(), playtestLog()],
  server: {
    host: '0.0.0.0',
    port: Number(process.env.PORT ?? 8081),
    open: false,
    // Session worktrees (.claude/), builds (dist/), the play log and docs are not the app: a build in a worktree
    // used to reload every open game page (131 'page reload .claude/worktrees/.../dist/index.html' in the dev logs),
    // which on the Quest ends the VR session and looks like a crash.
    // Matched against this project's own root, so a server started inside a worktree (whose path contains .claude)
    // still watches its own files.
    watch: { ignored: [(p: string) => NOT_APP.some((d) => p.startsWith(d)) || p === PLAYTEST_LOG] },
  },
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
