import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cva } from 'class-variance-authority';
import { X } from 'lucide-react';

import { cn } from '@/shared/lib';

import { IconButton } from '../IconButton/IconButton';

import type { VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';

const contentVariants = cva(
  [
    // inset-0 + m-auto centers without translate, so there is nothing to mirror in RTL.
    'fixed inset-0 z-modal m-auto flex h-fit max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] flex-col gap-4 overflow-y-auto',
    'rounded-xl border border-border bg-surface-raised p-6 text-text shadow-lg',
    'outline-none data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out',
  ],
  {
    variants: {
      size: {
        sm: 'max-w-sm',
        md: 'max-w-lg',
        lg: 'max-w-2xl',
      },
    },
    defaultVariants: { size: 'md' },
  },
);

/** Root of a modal dialog. Controlled with `open`/`onOpenChange` or uncontrolled. */
export const Dialog = DialogPrimitive.Root;

/** Element that opens the dialog. Use `asChild` with a Button. */
export const DialogTrigger = DialogPrimitive.Trigger;

/** Closes the dialog. Use `asChild` with a Button. */
export const DialogClose = DialogPrimitive.Close;

export interface DialogContentProps
  extends ComponentProps<typeof DialogPrimitive.Content>, VariantProps<typeof contentVariants> {
  /** Accessible label of the built-in close button. */
  closeLabel?: string;
  /** Hide the built-in close button (a `DialogClose` must then be provided). */
  hideCloseButton?: boolean;
}

/**
 * Modal panel with an overlay, rendered in a portal. Radix traps focus inside, restores it to the
 * trigger on close, closes on Escape and outside click, and hides the rest of the page from
 * assistive technology. Always include a `DialogTitle`.
 */
export function DialogContent({
  size,
  className,
  children,
  closeLabel = 'Close',
  hideCloseButton = false,
  ...props
}: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-overlay bg-scrim data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out" />
      <DialogPrimitive.Content className={cn(contentVariants({ size }), className)} {...props}>
        {children}
        {!hideCloseButton && (
          <DialogPrimitive.Close asChild>
            <IconButton label={closeLabel} size="sm" className="absolute end-3 top-3">
              <X aria-hidden="true" />
            </IconButton>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/** Groups the title and description at the top of the dialog. */
export function DialogHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1.5 pe-8', className)} {...props} />;
}

/** Dialog heading. Becomes the dialog's accessible name (`aria-labelledby`). */
export function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn('text-lg font-semibold', className)} {...props} />;
}

/** Supporting text. Linked as the dialog's `aria-describedby`. */
export function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description className={cn('text-sm text-text-muted', className)} {...props} />
  );
}

/** Action row at the bottom of the dialog, aligned to the end of the reading direction. */
export function DialogFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  );
}
