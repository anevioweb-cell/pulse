import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cva } from 'class-variance-authority';
import { createContext, use } from 'react';

import { cn } from '@/shared/lib';

import { disabledStyles, focusRing } from '../internal/styles';

import type { VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';

const listVariants = cva('inline-flex items-center', {
  variants: {
    variant: {
      underline: 'gap-4 border-b border-border',
      pill: 'gap-1 rounded-lg bg-surface-sunken p-1',
    },
  },
  defaultVariants: { variant: 'underline' },
});

const triggerVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 text-sm font-medium whitespace-nowrap',
    'text-text-muted transition-colors duration-fast hover:text-text',
    'data-[state=active]:text-text',
    focusRing,
    disabledStyles,
  ],
  {
    variants: {
      variant: {
        // The active marker is a 2px bar, not just a color change.
        underline:
          '-mb-px border-b-2 border-transparent px-1 py-2 data-[state=active]:border-accent',
        pill: 'rounded-md px-3 py-1.5 data-[state=active]:bg-surface-raised data-[state=active]:shadow-sm',
      },
    },
    defaultVariants: { variant: 'underline' },
  },
);

type TabsVariant = NonNullable<VariantProps<typeof listVariants>['variant']>;

const TabsVariantContext = createContext<TabsVariant>('underline');

export interface TabsProps extends ComponentProps<typeof TabsPrimitive.Root> {
  /** Visual style shared by the list and its triggers. */
  variant?: TabsVariant;
}

/**
 * Tabs built on Radix Tabs: arrow keys move between tabs (mirrored in RTL through the Radix
 * DirectionProvider), Home/End jump, and tabs activate on focus by default.
 */
export function Tabs({ variant = 'underline', className, ...props }: TabsProps) {
  return (
    <TabsVariantContext value={variant}>
      <TabsPrimitive.Root className={cn('flex flex-col gap-4', className)} {...props} />
    </TabsVariantContext>
  );
}

export type TabsListProps = ComponentProps<typeof TabsPrimitive.List>;

/** Container for the tab triggers (`role="tablist"`). Give it an `aria-label`. */
export function TabsList({ className, ...props }: TabsListProps) {
  const variant = use(TabsVariantContext);
  return <TabsPrimitive.List className={cn(listVariants({ variant }), className)} {...props} />;
}

export type TabsTriggerProps = ComponentProps<typeof TabsPrimitive.Trigger>;

/** A single tab (`role="tab"`). `value` links it to the matching `TabsContent`. */
export function TabsTrigger({ className, ...props }: TabsTriggerProps) {
  const variant = use(TabsVariantContext);
  return (
    <TabsPrimitive.Trigger className={cn(triggerVariants({ variant }), className)} {...props} />
  );
}

export type TabsContentProps = ComponentProps<typeof TabsPrimitive.Content>;

/** Panel for one tab (`role="tabpanel"`). It is focusable, so it gets the focus ring too. */
export function TabsContent({ className, ...props }: TabsContentProps) {
  return <TabsPrimitive.Content className={cn('rounded-sm', focusRing, className)} {...props} />;
}
