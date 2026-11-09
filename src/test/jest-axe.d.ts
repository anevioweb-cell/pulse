// Minimal typings for jest-axe. @types/jest-axe is not used because it references @types/jest,
// which would declare Jest globals alongside Vitest's.
declare module 'jest-axe' {
  import type { AxeResults, RunOptions, Spec } from 'axe-core';

  export interface JestAxeConfigureOptions extends RunOptions {
    globalOptions?: Spec;
  }

  export type JestAxe = (html: Element | string, options?: RunOptions) => Promise<AxeResults>;

  export const axe: JestAxe;
  export function configureAxe(options?: JestAxeConfigureOptions): JestAxe;
}
