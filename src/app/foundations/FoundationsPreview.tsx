import {
  CHART_SWATCHES,
  CONTENT_SWATCHES,
  NUMERIC_SAMPLES,
  RADIUS_SAMPLES,
  SHADOW_SAMPLES,
  SPACING_SAMPLES,
  STATUS_SWATCHES,
  SURFACE_SWATCHES,
  TYPE_SCALE,
} from './samples';
import { ThemeSwitcher } from './ThemeSwitcher';

import type { Swatch } from './samples';
import type { ReactNode } from 'react';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`section-${title}`} className="flex flex-col gap-4">
      <h2 id={`section-${title}`} className="text-xl font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function SwatchGrid({ label, swatches }: { label: string; swatches: Swatch[] }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium text-text-muted">{label}</h3>
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
              <span className="truncate text-xs text-text-muted">{usage}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FoundationsPreview() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-10 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold">Pulse</h1>
          <p className="text-text-muted">
            Foundations preview: tokens, theming, and typography. Temporary; moves to Storybook in
            Phase 2B.
          </p>
        </div>
        <ThemeSwitcher />
      </header>

      <main className="flex flex-col gap-10">
        <Section title="Color roles">
          <SwatchGrid label="Surfaces" swatches={SURFACE_SWATCHES} />
          <SwatchGrid label="Content and interaction" swatches={CONTENT_SWATCHES} />
          <SwatchGrid label="Status" swatches={STATUS_SWATCHES} />
          <SwatchGrid label="Chart series (colorblind-safe)" swatches={CHART_SWATCHES} />
          <div className="flex flex-wrap gap-4 rounded-lg border border-border bg-surface-raised p-4 text-sm">
            <span className="text-success">● Online</span>
            <span className="text-warning">▲ Degraded</span>
            <span className="text-danger">■ Offline</span>
            <span className="text-info">◆ Notice</span>
            <a
              href="#section-Typography"
              className="text-accent underline underline-offset-2 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              Accent link
            </a>
          </div>
        </Section>

        <Section title="Typography">
          <ul className="flex flex-col gap-3">
            {TYPE_SCALE.map(({ token, className }) => (
              <li
                key={token}
                className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-6"
              >
                <code className="numeric w-24 shrink-0 text-xs text-text-muted">{token}</code>
                <span className={className}>Sensor telemetry at a glance</span>
              </li>
            ))}
          </ul>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-surface-raised p-4">
              <h3 className="mb-2 text-sm font-medium text-text-muted">
                Numeric (JetBrains Mono, tabular)
              </h3>
              <ul className="numeric flex flex-col gap-1 text-lg">
                {NUMERIC_SAMPLES.map((value) => (
                  <li key={value} className="text-end">
                    {value}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg border border-border bg-surface-raised p-4">
              <h3 className="mb-2 text-sm font-medium text-text-muted">Arabic (Vazirmatn), RTL</h3>
              <p lang="ar" dir="rtl" className="text-lg">
                مرحبًا بك في لوحة Pulse لمراقبة أجهزة الاستشعار.
              </p>
              <p lang="fr" className="mt-2 text-sm text-text-muted">
                Français : capteurs connectés, température élevée, mise à jour en cours.
              </p>
            </div>
          </div>
        </Section>

        <Section title="Spacing, radius, and elevation">
          <ul className="flex flex-col gap-2">
            {SPACING_SAMPLES.map(({ token, className }) => (
              <li key={token} className="flex items-center gap-4">
                <code className="numeric w-28 shrink-0 text-xs text-text-muted">{token}</code>
                <span aria-hidden="true" className={`h-4 rounded-sm bg-accent ${className}`} />
              </li>
            ))}
          </ul>
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
          <ul className="flex flex-wrap gap-6">
            {SHADOW_SAMPLES.map(({ token, className }) => (
              <li
                key={token}
                className={`flex size-24 items-center justify-center rounded-lg bg-surface-raised ${className}`}
              >
                <code className="numeric text-xs text-text-muted">{token}</code>
              </li>
            ))}
          </ul>
        </Section>
      </main>
    </div>
  );
}
