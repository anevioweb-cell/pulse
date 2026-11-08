import { describe, expect, it } from 'vitest';

import { cn } from './cn';

describe('cn', () => {
  it('joins clsx-style inputs and drops falsy values', () => {
    const classes = (isActive: boolean, isDisabled: boolean) =>
      cn('flex', isActive && 'gap-2', isDisabled && 'opacity-50', null, undefined, ['p-2']);
    expect(classes(true, false)).toBe('flex gap-2 p-2');
    expect(classes(false, true)).toBe('flex opacity-50 p-2');
    expect(cn({ 'bg-accent': true, 'bg-danger': false })).toBe('bg-accent');
  });

  it('lets the last conflicting utility win', () => {
    expect(cn('ps-2 pe-2', 'ps-4')).toBe('pe-2 ps-4');
    expect(cn('bg-surface', 'bg-surface-raised')).toBe('bg-surface-raised');
    expect(cn('rounded-md', 'rounded-lg')).toBe('rounded-lg');
  });

  it('keeps text color and font size apart', () => {
    expect(cn('text-sm text-text', 'text-text-muted')).toBe('text-sm text-text-muted');
    expect(cn('text-sm text-text', 'text-lg')).toBe('text-text text-lg');
  });

  it('understands the project z-index, duration, ease, and font tokens', () => {
    expect(cn('z-dropdown', 'z-modal')).toBe('z-modal');
    expect(cn('duration-fast', 'duration-slow')).toBe('duration-slow');
    expect(cn('ease-standard', 'ease-exit')).toBe('ease-exit');
    expect(cn('font-sans', 'numeric')).toBe('numeric');
  });

  it('keeps variants separate', () => {
    expect(cn('bg-surface hover:bg-surface-sunken', 'hover:bg-surface-raised')).toBe(
      'bg-surface hover:bg-surface-raised',
    );
  });
});
