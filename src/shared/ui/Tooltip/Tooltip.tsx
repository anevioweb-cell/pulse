import * as TooltipPrimitive from '@radix-ui/react-tooltip';

import { cn } from '@/shared/lib';

import type { ComponentProps, ReactNode } from 'react';

/** Hover delay before a tooltip opens, in ms. Focus opens it immediately. */
const OPEN_DELAY_MS = 400;
/** Gap between the trigger and the tooltip, in px (Radix positioning prop). */
const SIDE_OFFSET = 6;

export interface TooltipProps extends Pick<
  ComponentProps<typeof TooltipPrimitive.Content>,
  'side' | 'align'
> {
  /** Tooltip text. Keep it short; it must not contain interactive content. */
  content: ReactNode;
  /** The trigger. It must be focusable (for example a Button or IconButton) and accept a ref. */
  children: ReactNode;
  /** Hover delay in ms. */
  delayDuration?: number;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

/**
 * Short supplementary label shown on hover and on keyboard focus, built on Radix Tooltip. It is
 * linked to the trigger with `aria-describedby` and closes on Escape. Never put essential
 * information only in a tooltip (it is unavailable on touch devices).
 */
export function Tooltip({
  content,
  children,
  side = 'top',
  align = 'center',
  delayDuration = OPEN_DELAY_MS,
  className,
  ...rootProps
}: TooltipProps) {
  return (
    <TooltipPrimitive.Provider delayDuration={delayDuration}>
      <TooltipPrimitive.Root {...rootProps}>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            align={align}
            sideOffset={SIDE_OFFSET}
            className={cn(
              'z-tooltip max-w-xs rounded-md bg-text px-2.5 py-1.5 text-xs text-surface shadow-md',
              'data-[state=delayed-open]:animate-fade-in data-[state=instant-open]:animate-fade-in data-[state=closed]:animate-fade-out',
              className,
            )}
          >
            {content}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
