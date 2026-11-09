import { cva } from 'class-variance-authority';

import { cn } from '@/shared/lib';

import { Button } from '../Button/Button';

import type { ButtonProps } from '../Button/Button';
import type { VariantProps } from 'class-variance-authority';

const iconButtonSizes = cva('px-0', {
  variants: {
    size: {
      sm: 'size-8',
      md: 'size-10',
      lg: 'size-12',
    },
  },
  defaultVariants: { size: 'md' },
});

export interface IconButtonProps
  extends Omit<ButtonProps, 'size' | 'aria-label'>, VariantProps<typeof iconButtonSizes> {
  /**
   * Accessible name. Required because the button has no visible text. Pair with a Tooltip when
   * sighted users also need the label.
   */
  label: string;
}

/** Square button that shows only an icon. Defaults to the `ghost` variant. */
export function IconButton({
  label,
  size,
  variant = 'ghost',
  className,
  loading,
  children,
  ...props
}: IconButtonProps) {
  return (
    <Button
      aria-label={label}
      variant={variant}
      size={size}
      className={cn(iconButtonSizes({ size }), className)}
      loading={loading ?? false}
      {...props}
    >
      {/* While loading, the spinner replaces the icon instead of sitting next to it. */}
      {loading ? null : children}
    </Button>
  );
}
