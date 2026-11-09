// Foundations reference rendered as stories, so the theme / direction / locale toolbar and the a11y
// addon apply. The Foundations.mdx docs page embeds these stories with explanations.

import {
  CHART_SWATCHES,
  CONTENT_SWATCHES,
  EASING_SAMPLES,
  MOTION_SAMPLES,
  NUMERIC_SAMPLES,
  RADIUS_SAMPLES,
  SHADOW_SAMPLES,
  SPACING_SAMPLES,
  STATUS_SWATCHES,
  SURFACE_SWATCHES,
  TYPE_SCALE,
  Z_INDEX_SAMPLES,
} from './foundations-samples';

import type { Swatch } from './foundations-samples';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-text-muted">{title}</h2>
      {children}
    </section>
  );
}

function Swatches({ swatches }: { swatches: readonly Swatch[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {swatches.map(({ token, className, usage }) => (
        <li
          key={token}
          className="flex items-center gap-3 rounded-lg border border-border bg-surface-raised p-3"
        >
          <span
            aria-hidden="true"
            className={`size-10 shrink-0 rounded-md border border-border ${className}`}
          />
          <span className="flex min-w-0 flex-col">
            <code className="numeric text-sm break-all">{token}</code>
            <span className="text-xs text-text-muted">{usage}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function Page({ children }: { children: ReactNode }) {
  return <div className="flex w-full max-w-4xl flex-col gap-8 p-6">{children}</div>;
}

const meta = {
  title: 'Foundations/Reference',
  parameters: { layout: 'fullscreen' },
  tags: ['!autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Colors: Story = {
  render: () => (
    <Page>
      <Group title="Surfaces">
        <Swatches swatches={SURFACE_SWATCHES} />
      </Group>
      <Group title="Content and interaction">
        <Swatches swatches={CONTENT_SWATCHES} />
      </Group>
      <Group title="Status (always paired with an icon or text)">
        <Swatches swatches={STATUS_SWATCHES} />
      </Group>
      <Group title="Chart series (colorblind-safe, Okabe-Ito based)">
        <Swatches swatches={CHART_SWATCHES} />
      </Group>
    </Page>
  ),
};

export const Typography: Story = {
  render: () => (
    <Page>
      <Group title="Type scale (Inter Variable)">
        <ul className="flex flex-col gap-3">
          {TYPE_SCALE.map(({ token, className }) => (
            <li key={token} className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-6">
              <code className="numeric w-24 shrink-0 text-xs text-text-muted">{token}</code>
              <span className={className}>Sensor telemetry at a glance</span>
            </li>
          ))}
        </ul>
      </Group>
      <Group title="Numeric values (JetBrains Mono, tabular, slashed zero)">
        <ul className="numeric flex w-60 flex-col gap-1 text-lg">
          {NUMERIC_SAMPLES.map((value) => (
            <li key={value} className="text-end">
              {value}
            </li>
          ))}
        </ul>
      </Group>
      <Group title="Arabic (Vazirmatn Variable), right to left">
        <p lang="ar" dir="rtl" className="text-lg">
          مرحبًا بك في لوحة Pulse لمراقبة أجهزة الاستشعار.
        </p>
      </Group>
    </Page>
  ),
};

export const SpacingAndRadius: Story = {
  render: () => (
    <Page>
      <Group title="Spacing (0.25rem steps)">
        <ul className="flex flex-col gap-2">
          {SPACING_SAMPLES.map(({ token, className }) => (
            <li key={token} className="flex items-center gap-4">
              <code className="numeric w-28 shrink-0 text-xs text-text-muted">{token}</code>
              <span aria-hidden="true" className={`h-4 rounded-sm bg-accent ${className}`} />
            </li>
          ))}
        </ul>
      </Group>
      <Group title="Radius">
        <ul className="flex flex-wrap gap-4">
          {RADIUS_SAMPLES.map(({ token, className }) => (
            <li key={token} className="flex flex-col items-center gap-2">
              <span
                aria-hidden="true"
                className={`size-16 border border-border-strong bg-surface-sunken ${className}`}
              />
              <code className="numeric text-xs text-text-muted">{token}</code>
            </li>
          ))}
        </ul>
      </Group>
    </Page>
  ),
};

export const Shadows: Story = {
  render: () => (
    <Page>
      <Group title="Elevation (tinted per theme)">
        <ul className="flex flex-wrap gap-6 p-2">
          {SHADOW_SAMPLES.map(({ token, className }) => (
            <li
              key={token}
              className={`flex size-24 items-center justify-center rounded-lg bg-surface-raised ${className}`}
            >
              <code className="numeric text-xs text-text-muted">{token}</code>
            </li>
          ))}
        </ul>
      </Group>
    </Page>
  ),
};

export const Motion: Story = {
  render: () => (
    <Page>
      <Group title="Durations (hover a row; all collapse to 0.01ms under reduced motion)">
        <ul className="flex flex-col gap-2">
          {MOTION_SAMPLES.map(({ token, className }) => (
            <li
              key={token}
              className={`group flex items-center gap-4 rounded-md p-2 transition-colors hover:bg-surface-sunken ${className}`}
            >
              <code className="numeric w-48 shrink-0 text-xs text-text-muted">{token}</code>
              <span
                aria-hidden="true"
                className={`size-6 rounded-md bg-accent transition-transform group-hover:scale-150 ${className}`}
              />
            </li>
          ))}
        </ul>
      </Group>
      <Group title="Easing">
        <ul className="flex flex-wrap gap-2">
          {EASING_SAMPLES.map(({ token }) => (
            <li key={token}>
              <code className="numeric rounded-sm bg-surface-sunken px-2 py-1 text-xs">
                {token}
              </code>
            </li>
          ))}
        </ul>
      </Group>
      <Group title="Z-index scale (z-*)">
        <ol className="flex flex-wrap gap-2">
          {Z_INDEX_SAMPLES.map((token) => (
            <li key={token}>
              <code className="numeric rounded-sm bg-surface-sunken px-2 py-1 text-xs">
                {token}
              </code>
            </li>
          ))}
        </ol>
      </Group>
    </Page>
  ),
};
