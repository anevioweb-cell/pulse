import { describe, expect, it } from 'vitest';

import { contrastRatio, parseBlock, relativeLuminance, resolveToken } from './color-contrast';

describe('color-contrast utilities', () => {
  it('computes WCAG luminance and contrast for known values', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#ffffff')).toBe(1);
    expect(contrastRatio('#000000', '#ffffff')).toBe(21);
    expect(contrastRatio('#ffffff', '#000000')).toBe(21);
    // #767676 on white is the classic "just passes AA" gray.
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
  });

  it('rejects non-hex colors', () => {
    expect(() => relativeLuminance('rgb(0 0 0)')).toThrow(/#rrggbb/);
  });

  it('parses a block and resolves var() chains', () => {
    const css = `/* :root { --ignored: 1; } */\n:root {\n  --a: #112233;\n  --b: var(--a);\n}\n@theme {\n  --c: var(--b);\n}`;
    const tokens = new Map([...parseBlock(css, ':root'), ...parseBlock(css, '@theme')]);
    expect(resolveToken('--c', tokens)).toBe('#112233');
  });

  it('reports unknown and circular references', () => {
    expect(() => resolveToken('--missing', new Map())).toThrow(/Unknown token/);
    const loop = new Map([
      ['--a', 'var(--b)'],
      ['--b', 'var(--a)'],
    ]);
    expect(() => resolveToken('--a', loop)).toThrow(/Circular/);
  });
});
