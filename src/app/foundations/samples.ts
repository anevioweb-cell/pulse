// Temporary data for the Foundations preview (moves to Storybook in Phase 2B).
// Class names are complete literals so Tailwind's scanner can find them.

export interface Swatch {
  token: string;
  className: string;
  usage: string;
}

export const SURFACE_SWATCHES: Swatch[] = [
  { token: 'surface', className: 'bg-surface', usage: 'App background' },
  { token: 'surface-raised', className: 'bg-surface-raised', usage: 'Cards, popovers' },
  { token: 'surface-sunken', className: 'bg-surface-sunken', usage: 'Wells, inputs' },
];

export const CONTENT_SWATCHES: Swatch[] = [
  { token: 'text', className: 'bg-text', usage: 'Body text' },
  { token: 'text-muted', className: 'bg-text-muted', usage: 'Secondary text' },
  { token: 'border', className: 'bg-border', usage: 'Decorative dividers' },
  { token: 'border-strong', className: 'bg-border-strong', usage: 'Control borders' },
  { token: 'accent', className: 'bg-accent', usage: 'Primary actions, links' },
  { token: 'accent-foreground', className: 'bg-accent-foreground', usage: 'Text on accent' },
  { token: 'focus-ring', className: 'bg-focus-ring', usage: 'Keyboard focus' },
];

export const STATUS_SWATCHES: Swatch[] = [
  { token: 'success', className: 'bg-success', usage: 'Healthy, online' },
  { token: 'warning', className: 'bg-warning', usage: 'Degraded, threshold near' },
  { token: 'danger', className: 'bg-danger', usage: 'Offline, threshold crossed' },
  { token: 'info', className: 'bg-info', usage: 'Neutral notices' },
];

export const CHART_SWATCHES: Swatch[] = [
  { token: 'chart-1', className: 'bg-chart-1', usage: 'Blue' },
  { token: 'chart-2', className: 'bg-chart-2', usage: 'Vermillion' },
  { token: 'chart-3', className: 'bg-chart-3', usage: 'Bluish green' },
  { token: 'chart-4', className: 'bg-chart-4', usage: 'Reddish purple' },
  { token: 'chart-5', className: 'bg-chart-5', usage: 'Ochre' },
  { token: 'chart-6', className: 'bg-chart-6', usage: 'Neutral' },
];

export const TYPE_SCALE = [
  { token: 'text-4xl', className: 'text-4xl font-semibold' },
  { token: 'text-3xl', className: 'text-3xl font-semibold' },
  { token: 'text-2xl', className: 'text-2xl font-semibold' },
  { token: 'text-xl', className: 'text-xl font-medium' },
  { token: 'text-lg', className: 'text-lg' },
  { token: 'text-base', className: 'text-base' },
  { token: 'text-sm', className: 'text-sm' },
  { token: 'text-xs', className: 'text-xs' },
] as const;

export const SPACING_SAMPLES = [
  { token: '1 (0.25rem)', className: 'w-1' },
  { token: '2 (0.5rem)', className: 'w-2' },
  { token: '4 (1rem)', className: 'w-4' },
  { token: '6 (1.5rem)', className: 'w-6' },
  { token: '8 (2rem)', className: 'w-8' },
  { token: '12 (3rem)', className: 'w-12' },
  { token: '16 (4rem)', className: 'w-16' },
] as const;

export const RADIUS_SAMPLES = [
  { token: 'rounded-sm', className: 'rounded-sm' },
  { token: 'rounded-md', className: 'rounded-md' },
  { token: 'rounded-lg', className: 'rounded-lg' },
  { token: 'rounded-xl', className: 'rounded-xl' },
  { token: 'rounded-2xl', className: 'rounded-2xl' },
  { token: 'rounded-full', className: 'rounded-full' },
] as const;

export const SHADOW_SAMPLES = [
  { token: 'shadow-sm', className: 'shadow-sm' },
  { token: 'shadow-md', className: 'shadow-md' },
  { token: 'shadow-lg', className: 'shadow-lg' },
] as const;

export const NUMERIC_SAMPLES = ['23.47 °C', '1013.20 hPa', '00:42:07', '0x3F0A'] as const;
