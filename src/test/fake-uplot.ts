// Test utility: jsdom has no canvas, so page tests replace uPlot with this recorder:
// vi.mock('uplot', async () => ({ default: (await import('<path>/test/fake-uplot')).FakeUPlot })).
import { vi } from 'vitest';

import type uPlot from 'uplot';

export class FakeUPlot {
  static pxRatio = 1;
  static instances: FakeUPlot[] = [];
  readonly options: uPlot.Options;
  data: uPlot.AlignedData;
  readonly root: HTMLDivElement;
  readonly over: HTMLDivElement;
  readonly bbox = { left: 0, top: 0, width: 400, height: 200 };
  readonly cursor: { idx: number | null; left: number } = { idx: null, left: 0 };
  readonly ctx = {
    save: vi.fn(),
    restore: vi.fn(),
    setLineDash: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
  };
  setData = vi.fn((data: uPlot.AlignedData) => {
    this.data = data;
  });
  setSize = vi.fn();
  redraw = vi.fn();
  destroy = vi.fn();
  valToPos = vi.fn(() => 50);

  constructor(options: uPlot.Options, data: uPlot.AlignedData, target: HTMLElement) {
    this.options = options;
    this.data = data;
    this.root = document.createElement('div');
    this.over = document.createElement('div');
    target.append(this.root);
    FakeUPlot.instances.push(this);
  }

  /** Runs the chart's draw hooks, as uPlot does after each redraw (threshold lines). */
  runDrawHooks(): void {
    // uPlot's hook arrays are typed with optional entries.
    for (const hook of this.options.hooks?.draw ?? []) hook?.(this as unknown as uPlot);
  }

  /** The labels drawn by the draw hooks (threshold labels). */
  drawnLabels(): string[] {
    this.ctx.fillText.mockClear();
    this.runDrawHooks();
    return this.ctx.fillText.mock.calls.map((call) => String(call[0]));
  }
}
