// One theme for every UI panel (docs: "field journal" look). The tokens live in
// src/ui/theme.json; this writes the shared CSS block between the theme markers
// of each public/ui/*.uikitml that has them. Run `npm run theme` after editing the
// tokens; tests/theme.test.ts fails if a panel's block is stale.

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
export const UI_DIR = join(here, '..', 'public', 'ui');
export const TOKENS = JSON.parse(readFileSync(join(here, '..', 'src', 'ui', 'theme.json'), 'utf8'));

export const BEGIN = '.theme-begin { display: flex; }';
export const END = '.theme-end { display: flex; }';

export function themeCss(t = TOKENS) {
  const c = t.color;
  const f = t.font;
  const r = t.radius;
  return [
    BEGIN,
    `  .t-root { background-color: ${c.bg}; border-radius: ${r.panel}px; }`,
    `  .t-title { color: ${c.text}; font-size: ${f.title}px; font-weight: 700; }`,
    `  .t-name { color: ${c.text}; font-size: ${f.name}px; font-weight: 700; }`,
    `  .t-lead { color: ${c.text}; font-size: ${f.lead}px; line-height: 1.25; }`,
    `  .t-body { color: ${c.text}; font-size: ${f.body}px; line-height: 1.3; }`,
    `  .t-muted { color: ${c.muted}; font-size: ${f.muted}px; line-height: 1.3; }`,
    `  .t-small { color: ${c.text}; font-size: ${f.small}px; font-weight: 700; }`,
    `  .t-label { color: ${c.accent}; font-size: ${f.label}px; font-weight: 700; letter-spacing: 1.5px; }`,
    `  .t-accent { color: ${c.accent}; font-size: ${f.lead}px; font-weight: 700; }`,
    `  .t-note { color: ${c.accentSoft}; font-size: ${f.muted - 1}px; line-height: 1.25; }`,
    `  .t-ok { color: ${c.ok}; font-size: ${f.muted}px; font-weight: 700; line-height: 1.25; }`,
    `  .t-bad { color: ${c.bad}; font-size: ${f.muted}px; font-weight: 700; line-height: 1.25; }`,
    `  .t-row { background-color: ${c.raised}; border-radius: ${r.control}px; }`,
    `  .t-btn { background-color: ${c.raised}; border-radius: ${r.control}px; }`,
    `  .t-go { background-color: ${c.accent}; border-radius: ${r.control}px; }`,
    `  .t-track { background-color: ${c.track}; border-radius: 4px; }`,
    `  .t-fill { background-color: ${c.accent}; border-radius: 4px; }`,
    END,
  ].join('\n');
}

/** Replace (or insert after <style>) the theme block in one file's text. */
export function withTheme(text, css = themeCss()) {
  const a = text.indexOf(BEGIN);
  const b = text.indexOf(END);
  if (a >= 0 && b > a) return text.slice(0, a) + css + text.slice(b + END.length);
  return text.replace('<style>', `<style>\n  ${css.replace(/\n/g, '\n')}`);
}

export const THEMED = ['objective', 'iconbar', 'satchel', 'buildbook', 'bench', 'hint', 'card'];

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const n of THEMED) {
    const p = join(UI_DIR, `${n}.uikitml`);
    const s = readFileSync(p, 'utf8');
    const out = withTheme(s);
    if (out !== s) writeFileSync(p, out);
  }
  console.log('theme synced:', THEMED.join(', '));
}
