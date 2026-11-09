import { cva } from 'class-variance-authority';
import { X } from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { cn } from '@/shared/lib';

import { IconButton } from '../IconButton/IconButton';
import { StatusIcon } from '../internal/StatusIcon';
import { dismissToast, getToasts, subscribeToToasts } from './toast-store';

import type { ToastRecord } from './toast-store';
import type { KeyboardEvent } from 'react';

const toastVariants = cva(
  [
    'pointer-events-auto flex w-full items-start gap-3 rounded-lg border bg-surface-raised p-4 text-text shadow-lg',
    'animate-slide-up-in',
  ],
  {
    variants: {
      variant: {
        neutral: 'border-border',
        success: 'border-success',
        warning: 'border-warning',
        danger: 'border-danger',
        info: 'border-info',
      },
    },
  },
);

const iconVariants = cva('size-5 shrink-0', {
  variants: {
    variant: {
      neutral: '',
      success: 'text-success',
      warning: 'text-warning',
      danger: 'text-danger',
      info: 'text-info',
    },
  },
});

function ToastItem({ toast, dismissLabel }: { toast: ToastRecord; dismissLabel: string }) {
  const [paused, setPaused] = useState(false);
  const remaining = useRef(toast.duration);

  // Auto-dismiss, paused while the pointer or keyboard focus is on the toast (WCAG 2.2.1).
  useEffect(() => {
    if (paused || !Number.isFinite(remaining.current)) return;
    const startedAt = Date.now();
    const timer = window.setTimeout(() => {
      dismissToast(toast.id);
    }, remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current -= Date.now() - startedAt;
    };
  }, [paused, toast.id]);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') dismissToast(toast.id);
  };

  return (
    <li
      data-variant={toast.variant}
      data-paused={paused || undefined}
      className={toastVariants({ variant: toast.variant })}
      onPointerEnter={() => {
        setPaused(true);
      }}
      onPointerLeave={() => {
        setPaused(false);
      }}
      onFocus={() => {
        setPaused(true);
      }}
      onBlur={() => {
        setPaused(false);
      }}
    >
      {/* Each status has its own icon shape, so the variant is never conveyed by color alone. */}
      <StatusIcon status={toast.variant} className={iconVariants({ variant: toast.variant })} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-sm font-semibold">{toast.title}</p>
        {toast.description && <p className="text-sm text-text-muted">{toast.description}</p>}
      </div>
      <IconButton
        label={dismissLabel}
        size="sm"
        className="-me-1.5 -mt-1.5"
        // The dismiss button is the only focusable element in a toast, so Escape is handled here.
        onKeyDown={onKeyDown}
        onClick={() => {
          dismissToast(toast.id);
        }}
      >
        <X aria-hidden="true" />
      </IconButton>
    </li>
  );
}

export interface ToasterProps {
  /** Accessible name of the notifications region. */
  label?: string;
  /** Accessible label of each toast's dismiss button. */
  dismissLabel?: string;
  className?: string;
}

/**
 * Renders toasts created with `toast()`. Mount it once near the app root. The live regions exist
 * before any toast is added, so screen readers reliably announce new toasts: danger toasts in an
 * assertive region, all others politely.
 */
export function Toaster({
  label = 'Notifications',
  dismissLabel = 'Dismiss notification',
  className,
}: ToasterProps) {
  const toasts = useSyncExternalStore(subscribeToToasts, getToasts, getToasts);
  const urgent = toasts.filter((item) => item.variant === 'danger');
  const polite = toasts.filter((item) => item.variant !== 'danger');

  const list = (items: readonly ToastRecord[], live: 'polite' | 'assertive') => (
    <ol aria-live={live} aria-relevant="additions" className="flex flex-col gap-2">
      {items.map((item) => (
        <ToastItem key={item.id} toast={item} dismissLabel={dismissLabel} />
      ))}
    </ol>
  );

  return (
    <section
      aria-label={label}
      className={cn(
        'pointer-events-none fixed end-0 bottom-0 z-toast flex w-full max-w-sm flex-col gap-2 p-4',
        className,
      )}
    >
      {list(urgent, 'assertive')}
      {list(polite, 'polite')}
    </section>
  );
}
