import { CircleAlert } from 'lucide-react';
import { useId } from 'react';

import { cn } from '@/shared/lib';

import type { ReactNode } from 'react';

/** Props shared by labelled form controls (Input, Select). */
export interface FieldProps {
  /** Visible label. Required: every field needs an accessible name. */
  label: string;
  /** Helper text shown under the control and linked with `aria-describedby`. */
  hint?: string;
  /**
   * Error message. When set, the control gets `aria-invalid` and `data-invalid`, and the message
   * (with an icon, so the error is not shown by color alone) is linked with `aria-describedby`.
   */
  error?: string;
  /** Visually hide the label (it stays available to assistive technology). */
  hideLabel?: boolean;
}

export interface FieldControlProps {
  id: string;
  'aria-describedby': string | undefined;
  'aria-invalid': true | undefined;
  'data-invalid': '' | undefined;
}

interface FieldInternalProps extends FieldProps {
  id?: string | undefined;
  required?: boolean | undefined;
  className?: string | undefined;
  children: (control: FieldControlProps) => ReactNode;
}

/** Internal layout for label, control, hint and error. */
export function Field({
  id,
  label,
  hint,
  error,
  hideLabel = false,
  required,
  className,
  children,
}: FieldInternalProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const hintId = `${controlId}-hint`;
  const errorId = `${controlId}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label
        htmlFor={controlId}
        className={cn('text-sm font-medium text-text', hideLabel && 'sr-only')}
      >
        {label}
        {required && (
          <span aria-hidden="true" className="ms-0.5 text-danger">
            *
          </span>
        )}
      </label>
      {children({
        id: controlId,
        'aria-describedby': describedBy || undefined,
        'aria-invalid': error ? true : undefined,
        'data-invalid': error ? '' : undefined,
      })}
      {hint && (
        <p id={hintId} className="text-sm text-text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="flex items-center gap-1.5 text-sm text-danger">
          <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
