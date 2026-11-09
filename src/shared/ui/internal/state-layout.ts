import { cva } from 'class-variance-authority';

/** Layout shared by EmptyState and ErrorState. */
export const stateLayout = cva('flex flex-col items-center justify-center gap-3 text-center', {
  variants: {
    size: {
      sm: 'px-4 py-6',
      md: 'px-6 py-12',
    },
  },
  defaultVariants: { size: 'md' },
});

export const stateIcon = cva('inline-flex shrink-0 [&>svg]:size-full', {
  variants: {
    size: {
      sm: 'size-8',
      md: 'size-12',
    },
  },
  defaultVariants: { size: 'md' },
});
