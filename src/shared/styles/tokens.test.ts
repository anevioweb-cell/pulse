import { describe, expect, it } from 'vitest';

import { contrastRatio, parseBlock, resolveToken } from '../../test/color-contrast';
import tokensCss from './tokens.css?raw';

// WCAG 2.2 AA: 1.4.3 (text) and 1.4.11 (UI components and graphical objects).
const MIN_TEXT = 4.5;
const MIN_NON_TEXT = 3;

const BACKGROUNDS = ['surface', 'surface-raised', 'surface-sunken'] as const;
const TEXT_ROLES = [
  'text',
  'text-muted',
  'accent',
  'success',
  'warning',
  'danger',
  'info',
] as const;
const UI_ROLES = ['border-strong', 'focus-ring'] as const;
const CHART_SERIES = ['chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5', 'chart-6'] as const;

const primitives = parseBlock(tokensCss, ':root');
const lightRoles = parseBlock(tokensCss, '@theme');
const darkRoles = parseBlock(tokensCss, ":root[data-theme='dark']");

const themes = {
  light: new Map([...primitives, ...lightRoles]),
  dark: new Map([...primitives, ...lightRoles, ...darkRoles]),
};

const color = (tokens: ReadonlyMap<string, string>, role: string) =>
  resolveToken(`--color-${role}`, tokens);

interface Pair {
  foreground: string;
  background: string;
  minimum: number;
}

const pairs: Pair[] = [
  ...BACKGROUNDS.flatMap((background) => [
    ...TEXT_ROLES.map((foreground) => ({ foreground, background, minimum: MIN_TEXT })),
    ...UI_ROLES.map((foreground) => ({ foreground, background, minimum: MIN_NON_TEXT })),
    ...CHART_SERIES.map((foreground) => ({ foreground, background, minimum: MIN_NON_TEXT })),
  ]),
  { foreground: 'accent-foreground', background: 'accent', minimum: MIN_TEXT },
  { foreground: 'danger-foreground', background: 'danger', minimum: MIN_TEXT },
];

describe.each(Object.entries(themes))('%s theme contrast', (theme, tokens) => {
  const cases = pairs.map((pair) => {
    const ratio = contrastRatio(color(tokens, pair.foreground), color(tokens, pair.background));
    return {
      ...pair,
      ratio,
      shown: ratio.toFixed(2),
      label: `${pair.foreground} on ${pair.background}`,
    };
  });

  it.each(cases)('$label: $shown:1 (min $minimum)', ({ ratio, minimum }) => {
    expect(ratio).toBeGreaterThanOrEqual(minimum);
  });

  it(`defines every semantic role for ${theme}`, () => {
    for (const role of [
      ...BACKGROUNDS,
      ...TEXT_ROLES,
      ...UI_ROLES,
      'border',
      'accent-foreground',
    ]) {
      expect(color(tokens, role)).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe('reduced motion', () => {
  const MAX_REDUCED_DURATION_MS = 0.01;
  const reduced = parseBlock(tokensCss, '@media (prefers-reduced-motion: reduce)');
  const durationTokens = [...lightRoles.keys()].filter((name) =>
    name.startsWith('--transition-duration-'),
  );

  it('defines motion duration tokens', () => {
    expect(durationTokens.length).toBeGreaterThan(0);
  });

  it.each(durationTokens)('collapses %s to near zero', (name) => {
    const value = reduced.get(name);
    expect(value).toMatch(/^\d*\.?\d+ms$/);
    expect(Number.parseFloat(value ?? '')).toBeLessThanOrEqual(MAX_REDUCED_DURATION_MS);
  });
});
