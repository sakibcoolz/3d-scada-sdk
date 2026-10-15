import { describe, expect, it } from 'vitest';
import { EDITOR_CSS, formatMetres } from './editorStyles.js';

describe('formatMetres', () => {
  it.each([
    [0.6349999999999999, '0.635'],
    [3, '3'],
    [-1.0000000000000004, '-1'],
    [-0.0001, '0'],
    [12.34567, '12.346'],
  ])('shows %p as %p', (metres, shown) => {
    expect(formatMetres(metres)).toBe(shown);
  });
});

describe('EDITOR_CSS', () => {
  it('only styles inside the editor root', () => {
    // Split selector lists on top-level commas only, not those inside :is(...).
    const selectors = EDITOR_CSS.replace(/\{[^}]*\}/g, '\n').replace(/\([^)]*\)/g, '()').split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
    expect(selectors.length).toBeGreaterThan(10);
    for (const selector of selectors) expect(selector.startsWith('.scada3d-editor')).toBe(true);
  });
});
