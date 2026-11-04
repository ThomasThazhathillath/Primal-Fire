import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const card = readFileSync('src/systems/objective-card-system.ts', 'utf8');
const hint = readFileSync('src/systems/hint-panel-system.ts', 'utf8');

describe('hint panel and objective card never overlap', () => {
  it('the hint panel reports when it is open', () => {
    expect(hint).toMatch(/hintOpen = \(\) => this\.opened !== null/);
  });
  it('the card hides while the hint is open and is restored on close', () => {
    expect(card).toMatch(/!this\.hintOn/);
    expect(card).toMatch(/hintOpen\?\.\(\)/);
  });
});
