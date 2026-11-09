import * as SwitchPrimitive from '@radix-ui/react-switch';
import { cva } from 'class-variance-authority';
import { useId } from 'react';

import { cn } from '@/shared/lib';

import { disabledStyles, focusRing } from '../internal/styles';

import type { VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';

const trackVariants = cva(
  [
    'peer inline-flex shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent',
    'transition-colors duration-fast',
    'data-[state=checked]:bg-accent data-[state=unchecked]:bg-border-strong',
    focusRing,
    disabledStyles,
  ],
  {
    variants: {
      size: {
        sm: 'h-5 w-9',
        md: 'h-6 w-11',
      },
    },
    defaultVariants: { size: 'md' },
  },
);

// The thumb moves along the inline axis, so RTL mirrors the translation.
const thumbVariants = cva(
  [
    'pointer-events-none block rounded-full bg-surface-raised shadow-sm',
    'transition-transform duration-fast data-[state=unchecked]:translate-x-0',
  ],
  {
    variants: {
      size: {
        sm: 'size-4 data-[state=checked]:translate-x-4 rtl:data-[state=checked]:-translate-x-4',
        md: 'size-5 data-[state=checked]:translate-x-5 rtl:data-[state=checked]:-translate-x-5',
      },
    },
    defaultVariants: { size: 'md' },
  },
);

export interface SwitchProps
  extends
    Omit<ComponentProps<typeof SwitchPrimitive.Root>, 'children'>,
    VariantProps<typeof trackVariants> {
  /** Visible label, linked to the switch. Required for an accessible name. */
  label: string;
  /** Extra description under the label, linked with `aria-describedby`. */
  description?: string;
}

/**
 * On/off toggle for settings that take effect immediately (`role="switch"`). Space toggles it;
 * clicking the label toggles it too. The state is exposed as `aria-checked` and `data-state`.
 */
export function Switch({ label, description, size, id, className, ...props }: SwitchProps) {
  const generatedId = useId();
  const switchId = id ?? generatedId;
  const descriptionId = `${switchId}-description`;

  return (
    <div className={cn('flex items-start gap-3', className)}>
      <SwitchPrimitive.Root
        id={switchId}
        aria-describedby={description ? descriptionId : undefined}
        className={trackVariants({ size })}
        {...props}
      >
        <SwitchPrimitive.Thumb className={thumbVariants({ size })} />
      </SwitchPrimitive.Root>
      <div className="flex flex-col gap-0.5">
        <label
          htmlFor={switchId}
          className="cursor-pointer text-sm font-medium text-text peer-data-disabled:cursor-not-allowed peer-data-disabled:opacity-50"
        >
          {label}
        </label>
        {description && (
          <p id={descriptionId} className="text-sm text-text-muted">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}
