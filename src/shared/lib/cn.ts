import { clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

import type { ClassValue } from 'clsx';

// Project token names that tailwind-merge cannot infer from its defaults (see tokens.css).
const Z_INDEX_TOKENS = [
  'base',
  'raised',
  'sticky',
  'dropdown',
  'overlay',
  'modal',
  'toast',
  'tooltip',
];
const DURATION_TOKENS = ['instant', 'fast', 'normal', 'slow'];
const EASE_TOKENS = ['standard', 'enter', 'exit'];

const twMerge = extendTailwindMerge({
  override: {
    theme: { ease: EASE_TOKENS },
  },
  extend: {
    classGroups: {
      z: [{ z: Z_INDEX_TOKENS }],
      duration: [{ duration: DURATION_TOKENS }],
      'font-family': [{ font: ['sans', 'mono'] }, 'numeric'],
    },
  },
});

/** Joins class names (clsx syntax) and resolves Tailwind conflicts so the last class wins. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
