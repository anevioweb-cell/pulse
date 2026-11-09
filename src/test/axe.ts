import { configureAxe } from 'jest-axe';
import { expect } from 'vitest';

// Rules turned off for component tests:
// - color-contrast: jsdom cannot compute colors or layout; tokens.test.ts covers contrast instead.
// - region: "all content inside landmarks" is a page-level rule; components are tested in isolation
//   (portaled overlays are checked on document.body, outside any <main>).
const axe = configureAxe({
  rules: {
    'color-contrast': { enabled: false },
    region: { enabled: false },
  },
});

/** Runs axe on a rendered container (or the whole document) and fails with readable details. */
export async function expectNoAxeViolations(container: Element = document.body): Promise<void> {
  const { violations } = await axe(container);
  const summary = violations.map(
    ({ id, help, nodes }) =>
      `${id}: ${help} (${nodes.map((node) => node.target.join(' ')).join(', ')})`,
  );
  expect(summary).toEqual([]);
}
