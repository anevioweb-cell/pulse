import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom gaps that Radix primitives rely on (popper sizing, pointer capture, scrolling into view).
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class ResizeObserver {
    observe = (): void => undefined;
    unobserve = (): void => undefined;
    disconnect = (): void => undefined;
  };
}

// Node-environment tests (server/) have no DOM; only polyfill where one exists.
const elementPolyfills = {
  hasPointerCapture: () => false,
  setPointerCapture: () => undefined,
  releasePointerCapture: () => undefined,
  scrollIntoView: () => undefined,
};
const elementPrototype: object | undefined =
  typeof Element === 'undefined' ? undefined : Element.prototype;
for (const [name, implementation] of Object.entries(elementPolyfills)) {
  if (elementPrototype && !(name in elementPrototype)) {
    Object.defineProperty(elementPrototype, name, {
      value: implementation,
      configurable: true,
      writable: true,
    });
  }
}

afterEach(() => {
  cleanup();
});
