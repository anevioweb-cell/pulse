import { act, render, screen } from '@testing-library/react';
import { Profiler, createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { expectNoAxeViolations } from '../../../test/axe';
import { TimeSeriesChart, valueRange } from './TimeSeriesChart';

import type { ChartThreshold, TimeSeriesChartHandle } from './TimeSeriesChart';
import type uPlot from 'uplot';

// jsdom has no canvas: a fake uPlot records what the wrapper asks of it.
const fake = vi.hoisted(() => {
  class FakeUPlot {
    static pxRatio = 1;
    static instances: FakeUPlot[] = [];
    readonly options: uPlot.Options;
    data: uPlot.AlignedData;
    readonly root = document.createElement('div');
    readonly over = document.createElement('div');
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
      target.append(this.root);
      FakeUPlot.instances.push(this);
    }
  }
  return { FakeUPlot };
});
vi.mock('uplot', () => ({ default: fake.FakeUPlot }));

// A ResizeObserver the test can trigger, and whose lifecycle it can see.
const observers = vi.hoisted(() => {
  class FakeResizeObserver {
    static instances: FakeResizeObserver[] = [];
    readonly callback: ResizeObserverCallback;
    observe = vi.fn();
    disconnect = vi.fn();
    unobserve = vi.fn();
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
      FakeResizeObserver.instances.push(this);
    }
    resize(width: number, height: number) {
      this.callback([{ contentRect: { width, height } } as ResizeObserverEntry], this);
    }
  }
  return { FakeResizeObserver };
});

const chart = () => {
  const instance = fake.FakeUPlot.instances.at(-1);
  if (!instance) throw new Error('no chart created');
  return instance;
};

const DATA = { xs: [1000, 2000, 3000], ys: [20, null, 22] };
const WINDOW = { from: 0, to: 4000 };
const THRESHOLDS: ChartThreshold[] = [{ value: 30, label: 'Above 30', tone: 'danger' }];

beforeEach(() => {
  fake.FakeUPlot.instances = [];
  observers.FakeResizeObserver.instances = [];
  vi.stubGlobal('ResizeObserver', observers.FakeResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute('data-theme');
});

function renderChart(props: Partial<Parameters<typeof TimeSeriesChart>[0]> = {}) {
  const ref = createRef<TimeSeriesChartHandle>();
  const onRender = vi.fn();
  const element = (extra: typeof props = {}) => (
    <Profiler id="chart" onRender={onRender}>
      <TimeSeriesChart
        ref={ref}
        label="Temperature, last minute"
        seriesName="Temperature"
        unit="°C"
        decimals={1}
        {...props}
        {...extra}
      />
    </Profiler>
  );
  const view = render(element());
  return {
    ...view,
    ref,
    onRender,
    rerenderWith: (extra: typeof props) => {
      view.rerender(element(extra));
    },
  };
}

describe('TimeSeriesChart', () => {
  it('is an image named by its summary, with the plot area left to right', async () => {
    const { container } = renderChart();
    const image = screen.getByRole('img', { name: 'Temperature, last minute' });
    expect(image.querySelector('[dir="ltr"]')).not.toBeNull();
    await expectNoAxeViolations(container);
  });

  it('creates one chart: time in ms, no legend, gaps not spanned', () => {
    renderChart();
    expect(fake.FakeUPlot.instances).toHaveLength(1);
    const { options } = chart();
    expect(options.ms).toBe(1);
    expect(options.legend?.show).toBe(false);
    expect(options.series[1]?.spanGaps).toBe(false);
    expect(options.scales?.x?.time).toBe(true);
  });

  it('sends data through the handle without rendering React', () => {
    const { ref, onRender } = renderChart();
    const renders = onRender.mock.calls.length;
    act(() => {
      for (let frame = 0; frame < 100; frame += 1) ref.current?.setData(DATA, WINDOW);
    });
    expect(chart().setData).toHaveBeenCalledTimes(100);
    expect(chart().setData).toHaveBeenLastCalledWith([DATA.xs, DATA.ys]);
    expect(onRender).toHaveBeenCalledTimes(renders);
  });

  it('uses the given window as the time scale, whatever the data covers', () => {
    const { ref } = renderChart();
    act(() => ref.current?.setData(DATA, WINDOW));
    const range = chart().options.scales?.x?.range;
    if (typeof range !== 'function') throw new Error('x range must be a function');
    expect(range(chart() as unknown as uPlot, 1000, 3000, 'x')).toEqual([0, 4000]);
  });

  it('does not touch the chart when re-rendered with the same props', () => {
    const { rerenderWith } = renderChart({ thresholds: THRESHOLDS });
    rerenderWith({ thresholds: THRESHOLDS });
    expect(fake.FakeUPlot.instances).toHaveLength(1);
    expect(chart().setData).not.toHaveBeenCalled();
    expect(chart().redraw).not.toHaveBeenCalled();
  });

  it('updates options in place: new thresholds rescale, a new format redraws, nothing is recreated', () => {
    const { ref, rerenderWith } = renderChart();
    act(() => ref.current?.setData(DATA, WINDOW));
    chart().setData.mockClear();

    rerenderWith({ thresholds: THRESHOLDS });
    expect(chart().setData).toHaveBeenCalledWith([DATA.xs, DATA.ys]);
    const range = chart().options.scales?.y?.range;
    if (typeof range !== 'function') throw new Error('y range must be a function');
    expect(range(chart() as unknown as uPlot, 20, 22, 'y')[1]).toBeGreaterThan(30);

    rerenderWith({ thresholds: THRESHOLDS, decimals: 2 });
    expect(chart().redraw).toHaveBeenCalledWith(false, true);
    expect(fake.FakeUPlot.instances).toHaveLength(1);
  });

  it('follows its container size', () => {
    renderChart();
    const observer = observers.FakeResizeObserver.instances.at(-1);
    observer?.resize(640.7, 224.2);
    expect(chart().setSize).toHaveBeenCalledWith({ width: 640, height: 224 });
  });

  it('redraws with re-read tokens when the theme changes, without recreating the chart', async () => {
    renderChart();
    document.documentElement.setAttribute('data-theme', 'dark');
    await vi.waitFor(() => {
      expect(chart().redraw).toHaveBeenCalledWith(false, true);
    });
    expect(fake.FakeUPlot.instances).toHaveLength(1);
  });

  it('draws threshold lines in their tone, across the plot', () => {
    renderChart({ thresholds: THRESHOLDS });
    const draw = chart().options.hooks?.draw?.[0];
    draw?.(chart() as unknown as uPlot);
    expect(chart().ctx.moveTo).toHaveBeenCalledWith(0, 50);
    expect(chart().ctx.lineTo).toHaveBeenCalledWith(400, 50);
    expect(chart().ctx.fillText).toHaveBeenCalledWith(
      'Above 30',
      expect.any(Number),
      expect.any(Number),
    );
  });

  it('shows the exact value at the cursor, and hides the tooltip over a gap', () => {
    const { ref, container } = renderChart();
    act(() => ref.current?.setData(DATA, WINDOW));
    const tooltip = container.querySelector<HTMLElement>('[aria-hidden="true"]');
    const setCursor = chart().options.hooks?.setCursor?.[0];

    chart().cursor.idx = 2;
    setCursor?.(chart() as unknown as uPlot);
    expect(tooltip?.hidden).toBe(false);
    expect(tooltip).toHaveTextContent('Temperature: 22.0 °C');

    chart().cursor.idx = 1;
    setCursor?.(chart() as unknown as uPlot);
    expect(tooltip?.hidden).toBe(true);
  });

  it('destroys the chart and disconnects its observers on unmount', async () => {
    const { unmount } = renderChart();
    const instance = chart();
    const observer = observers.FakeResizeObserver.instances.at(-1);
    unmount();
    expect(instance.destroy).toHaveBeenCalledTimes(1);
    expect(observer?.disconnect).toHaveBeenCalledTimes(1);
    // The theme observer is gone too: a theme change no longer reaches the chart.
    document.documentElement.setAttribute('data-theme', 'dark');
    await Promise.resolve();
    expect(instance.redraw).not.toHaveBeenCalled();
  });
});

describe('valueRange', () => {
  it('pads the data range', () => {
    expect(valueRange(10, 20, [])).toEqual([9, 21]);
  });

  it('includes thresholds outside the data', () => {
    const [min, max] = valueRange(10, 20, [40]);
    expect(min).toBeLessThan(10);
    expect(max).toBeGreaterThan(40);
  });

  it('gives a flat line and empty data a usable range', () => {
    const [min, max] = valueRange(5, 5, []);
    expect(min).toBeLessThan(5);
    expect(max).toBeGreaterThan(5);
    expect(valueRange(null, null, [])).toEqual([0, 1]);
    expect(valueRange(null, null, [30])[0]).toBeLessThan(30);
  });
});
