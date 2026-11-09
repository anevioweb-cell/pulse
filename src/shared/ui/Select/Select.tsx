import * as SelectPrimitive from '@radix-ui/react-select';
import { cva } from 'class-variance-authority';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';

import { cn } from '@/shared/lib';

import { Field } from '../internal/Field';
import { disabledStyles, fieldStyles, focusRing } from '../internal/styles';

import type { FieldProps } from '../internal/Field';
import type { VariantProps } from 'class-variance-authority';

/** Gap between the trigger and the listbox, in px (Radix positioning prop). */
const CONTENT_OFFSET = 4;

const triggerVariants = cva(
  [
    fieldStyles,
    focusRing,
    disabledStyles,
    'inline-flex items-center justify-between gap-2 text-start',
    'data-placeholder:text-text-muted [&>span]:truncate',
  ],
  {
    variants: {
      size: {
        sm: 'h-8 px-2.5 text-sm',
        md: 'h-10 px-3 text-sm',
        lg: 'h-12 px-4 text-base',
      },
    },
    defaultVariants: { size: 'md' },
  },
);

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends FieldProps, VariantProps<typeof triggerVariants> {
  /** Options to choose from. Values must be unique, non-empty strings. */
  options: readonly SelectOption[];
  /** Controlled value. */
  value?: string;
  /** Uncontrolled initial value. */
  defaultValue?: string;
  /** Called with the new value when the selection changes. */
  onValueChange?: (value: string) => void;
  /** Text shown when no value is selected. */
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  /** Form field name, for native form submission. */
  name?: string;
  id?: string;
  className?: string;
}

/**
 * Single-choice select built on Radix Select: a button trigger plus a listbox with full keyboard
 * support (arrows, Home/End, typeahead, Escape). The listbox renders in a portal at the dropdown
 * z-index and follows the reading direction.
 */
export function Select({
  label,
  hint,
  error,
  hideLabel,
  options,
  placeholder = 'Select…',
  size,
  id,
  required,
  disabled,
  className,
  ...rootProps
}: SelectProps) {
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
        <SelectPrimitive.Root
          {...rootProps}
          {...(required === undefined ? {} : { required })}
          {...(disabled === undefined ? {} : { disabled })}
        >
          <SelectPrimitive.Trigger className={triggerVariants({ size })} {...control}>
            <SelectPrimitive.Value placeholder={placeholder} />
            <SelectPrimitive.Icon asChild>
              <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-text-muted" />
            </SelectPrimitive.Icon>
          </SelectPrimitive.Trigger>
          <SelectPrimitive.Portal>
            <SelectPrimitive.Content
              position="popper"
              sideOffset={CONTENT_OFFSET}
              className={cn(
                'relative z-dropdown max-h-(--radix-select-content-available-height) min-w-(--radix-select-trigger-width) overflow-hidden',
                'rounded-md border border-border bg-surface-raised text-text shadow-md',
                'data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out',
              )}
            >
              <SelectPrimitive.ScrollUpButton className="flex h-6 items-center justify-center text-text-muted">
                <ChevronUp aria-hidden="true" className="size-4" />
              </SelectPrimitive.ScrollUpButton>
              <SelectPrimitive.Viewport className="p-1">
                {options.map((option) => (
                  <SelectPrimitive.Item
                    key={option.value}
                    value={option.value}
                    {...(option.disabled === undefined ? {} : { disabled: option.disabled })}
                    className={cn(
                      'relative flex cursor-default items-center rounded-sm py-1.5 ps-8 pe-2 text-sm outline-none select-none',
                      'data-highlighted:bg-surface-sunken data-[state=checked]:font-medium',
                      disabledStyles,
                    )}
                  >
                    <SelectPrimitive.ItemIndicator className="absolute start-2 inline-flex items-center">
                      <Check aria-hidden="true" className="size-4 text-accent" />
                    </SelectPrimitive.ItemIndicator>
                    <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                  </SelectPrimitive.Item>
                ))}
              </SelectPrimitive.Viewport>
              <SelectPrimitive.ScrollDownButton className="flex h-6 items-center justify-center text-text-muted">
                <ChevronDown aria-hidden="true" className="size-4" />
              </SelectPrimitive.ScrollDownButton>
            </SelectPrimitive.Content>
          </SelectPrimitive.Portal>
        </SelectPrimitive.Root>
      )}
    </Field>
  );
}
