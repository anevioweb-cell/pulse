// Test utilities: parse CSS custom properties and compute WCAG 2.x contrast ratios.

const HEX_COLOR = /^#([0-9a-f]{6})$/i;
const DECLARATION = /(--[\w-]+)\s*:\s*([^;]+);/g;
const VAR_REFERENCE = /^var\((--[\w-]+)\)$/;
const COMMENT = /\/\*[\s\S]*?\*\//g;

const MAX_CHANNEL = 255;
const HEX_RADIX = 16;
const [RED_OFFSET, GREEN_OFFSET, BLUE_OFFSET] = [0, 2, 4] as const;
// WCAG 2.x relative luminance constants (https://www.w3.org/TR/WCAG22/#dfn-relative-luminance).
const SRGB_LINEAR_THRESHOLD = 0.04045;
const SRGB_LINEAR_DIVISOR = 12.92;
const SRGB_OFFSET = 0.055;
const SRGB_SCALE = 1.055;
const SRGB_GAMMA = 2.4;
const LUMINANCE_WEIGHTS = [0.2126, 0.7152, 0.0722] as const;
const CONTRAST_OFFSET = 0.05;

export type TokenMap = ReadonlyMap<string, string>;

/** Index of the `}` matching the `{` at `open`. */
function matchingBrace(source: string, open: number): number {
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    const char = source.charAt(index);
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) return index;
  }
  throw new Error('Unbalanced braces');
}

/** Removes nested at-rule blocks such as `@keyframes name { ... }` (not selector blocks). */
function stripNestedAtRules(body: string): string {
  let result = body;
  for (let at = result.indexOf('@'); at !== -1; at = result.indexOf('@')) {
    const open = result.indexOf('{', at);
    if (open === -1) break;
    result = result.slice(0, at) + result.slice(matchingBrace(result, open) + 1);
  }
  return result;
}

/** Returns the declarations of the first rule whose header matches exactly, e.g. `@theme`. */
export function parseBlock(css: string, header: string): Map<string, string> {
  const source = `\n${css.replace(COMMENT, '')}`;
  const start = source.indexOf(`\n${header} {`);
  if (start === -1) throw new Error(`Block "${header}" not found`);
  const open = source.indexOf('{', start);
  const body = stripNestedAtRules(source.slice(open + 1, matchingBrace(source, open)));
  return new Map(
    [...body.matchAll(DECLARATION)].map(([, name = '', value = '']) => [name, value.trim()]),
  );
}

/** Resolves a token through `var()` chains to its final value. */
export function resolveToken(name: string, tokens: TokenMap, seen = new Set<string>()): string {
  if (seen.has(name)) throw new Error(`Circular token reference: ${[...seen, name].join(' -> ')}`);
  const value = tokens.get(name);
  if (value === undefined) throw new Error(`Unknown token ${name}`);
  const reference = VAR_REFERENCE.exec(value)?.[1];
  return reference ? resolveToken(reference, tokens, new Set([...seen, name])) : value;
}

export function relativeLuminance(hex: string): number {
  const match = HEX_COLOR.exec(hex)?.[1];
  if (!match) throw new Error(`Expected a #rrggbb color, got "${hex}"`);
  const linear = (offset: number) => {
    const value = parseInt(match.slice(offset, offset + 2), HEX_RADIX) / MAX_CHANNEL;
    return value <= SRGB_LINEAR_THRESHOLD
      ? value / SRGB_LINEAR_DIVISOR
      : ((value + SRGB_OFFSET) / SRGB_SCALE) ** SRGB_GAMMA;
  };
  const [redWeight, greenWeight, blueWeight] = LUMINANCE_WEIGHTS;
  return (
    redWeight * linear(RED_OFFSET) +
    greenWeight * linear(GREEN_OFFSET) +
    blueWeight * linear(BLUE_OFFSET)
  );
}

export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  return (Math.max(a, b) + CONTRAST_OFFSET) / (Math.min(a, b) + CONTRAST_OFFSET);
}
