import { cva } from 'class-variance-authority';

import { cn } from '@/shared/lib';

import { Field } from '../internal/Field';
import { disabledStyles, fieldStyles, focusRing } from '../internal/styles';

import type { FieldProps } from '../internal/Field';
import type { VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';

const inputVariants = cva([fieldStyles, focusRing, disabledStyles], {
  variants: {
    size: {
      sm: 'h-8 px-2.5 text-sm',
      md: 'h-10 px-3 text-sm',
      lg: 'h-12 px-4 text-base',
    },
  },
  defaultVariants: { size: 'md' },
});

export interface InputProps
  extends Omit<ComponentProps<'input'>, 'size'>, VariantProps<typeof inputVariants>, FieldProps {
  /** Class name for the wrapper (label, input, messages). Use `inputClassName` for the input. */
  className?: string;
  /** Class name for the `<input>` element itself. */
  inputClassName?: string;
}

/**
 * Text input with a required label, optional hint, and error message. The hint and error are
 * linked through `aria-describedby`; an error sets `aria-invalid` and `data-invalid`.
 */
export function Input({
  label,
  hint,
  error,
  hideLabel,
  size,
  id,
  required,
  className,
  inputClassName,
  ...props
}: InputProps) {
  return (
    <Field
      id={id}
      label={label}
      hideLabel={hideLabel ?? false}
      required={required}
      className={className}
      {...(hint === undefined ? {} : { hint })}
      {...(error === undefined ? {} : { error })}
    >
      {(control) => (
        <input
          required={required}
          className={cn(inputVariants({ size }), inputClassName)}
          {...control}
          {...props}
        />
      )}
    </Field>
  );
}
