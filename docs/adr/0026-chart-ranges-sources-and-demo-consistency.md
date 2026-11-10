# 0026. Chart ranges: which source serves which range, gaps, redraws, and Demo history that agrees with the live stream

- **Status:** Accepted
- **Date:** 2026-11-10

## Context

Phase 5B adds charts to the device page, with four ranges: `live` (a rolling window), `5m`, `1h` and `24h`. Two sources of samples exist:

- **The ring buffers** (ADR 0012): `STORE.RING_BUFFER_CAPACITY` = 1800 samples per device and metric, recorded since the session started. That is 30 minutes at the default 1 Hz, 3 minutes at the 10 Hz maximum, 2.5 hours at the firmware's 5 s interval. They hold every sample the client received, including dropouts (no samples) and the moment a device went offline.
- **REST history** (`getReadings`, ADR 0015): any range up to 7 days, downsampled by the server to at most `maxPoints` (min/max per bucket, API default 500 points). It ends at the time of the request, and a cached response for a range touching "now" may be up to 30 s old (`QUERY_POLICY.READINGS.RECENT_STALE_TIME_MS`).

Charts also need a redraw policy (the store publishes at most once per frame, but charts read buffers, not React state), and a rule for when a line must break.

In Demo Mode, REST history came from `HistoryModel` (a smooth function of time) and the live stream from `SimulationEngine` (a random walk from its start, with its own battery drain from a random initial charge). Both shared each device's profile (names, baselines, cycle phase), but their values were independent: a 1 h battery chart could show 70 % in history while the live stream said 18 %. A chart that stitches the two would jump at the seam.

## Decision

1. **Range to source, fixed per range:**

   | Range  | Span  | Source                                         | REST request                                   |
   | ------ | ----- | ---------------------------------------------- | ---------------------------------------------- |
   | `live` | 1 min | Ring buffer only                               | None                                           |
   | `5m`   | 5 min | Ring buffer only                               | None                                           |
   | `1h`   | 1 h   | REST history, then the ring buffer's live tail | `to` rounded up to 30 s, API default maxPoints |
   | `24h`  | 24 h  | REST history, then the ring buffer's live tail | Same                                           |
   - **Partly covered ranges are not filled in.** A buffer range shows what this session recorded. Right after the page opens, or at more than 6 Hz for `5m`, the start of the window is empty, and the page says since when it has data. It never switches source while someone watches it.
   - **History ranges stitch.** The series is the history up to its last point, then every buffer sample newer than that point. The tail covers the time since the request, at full resolution.
   - The 1 h temperature request equals the prefetched one (`recentReadingsRequest`), so a hover on a device link fills the default history chart's cache.

2. **Gap rule.** Two consecutive samples further apart than `DEVICE_CHART.GAP_FACTOR` (3) sample intervals get a `null` point between them, so uPlot breaks the line. The interval is the median spacing of the buffer samples in the window (robust against the gaps themselves, and right for any device rate), and `sampleIntervalMs × bucketSize` for history. At the seam, the coarser of the two decides. One lost sample (an interval of 2) is bridged, two or more break the line, and a dropout or an offline period always does: at 1 Hz a device turns stale after 15 missed samples.
3. **Ordering.** The adapter applies the ring buffer's policy again to the stitched series: an equal timestamp replaces the value, an older one is dropped and counted. Both inputs are already sorted (the buffer by construction, history by the REST contract), so this is a guard.
4. **Redraws** go through one `RedrawScheduler` per page, framework-free, with an injectable frame scheduler (as the TelemetryService). Once per animation frame it draws each chart whose buffer version changed, or whose window moved into a new clock tick (`DEVICE_CHART.CLOCK_TICK_MS`, 1 s, so a silent device's window still advances), and only while the view is not paused and the page is visible. Pausing stops all draws while the buffers keep recording; resuming draws at the live edge. React never re-renders for data.
5. **Demo history and the live stream follow one model.** `SimulationEngine` now computes each value as the `HistoryModel` value at that time plus a mean-reverting random walk, clamped to `SIMULATOR.DRIFT_LIMIT_STD` (2) stationary standard deviations: about 0.96 °C, 3.2 %, 1.9 hPa and 9.6 dBm. The battery follows the history's discharge curve exactly.
   - Depletion (`device_offline` with reason `low_battery`) now happens only after a `low_battery` fault: the battery then drains from just under the threshold, the device goes offline at 0 %, and after the recharge delay the battery follows the history curve again. `BATTERY_INITIAL_MIN/MAX` are gone.
   - Spikes, dropouts and injected faults are live-only anomalies: history does not contain them.
   - The mock server uses the same engine and history model, so Live Mode against it agrees the same way.

## Alternatives considered

- **Choose the source dynamically:** the buffer when it covers the range, history otherwise. It uses the finest data available, but the chart would change source, resolution and gaps while someone watches it (for example after 30 minutes at 1 Hz), and every range would need both code paths.
- **Fill partly covered buffer ranges from REST.** It shows a full `5m` window at once, but `5m` would then depend on the network in Live Mode and need the stitching logic too. The empty start is honest and short-lived at the default rate.
- **History only for `1h` and `24h`, without a live tail.** Simpler, but the right edge would lag by up to 30 s plus the request time and not move between refetches, while the header shows the live value.
- **Interpolate across gaps (`spanGaps`).** It draws data that was never measured, exactly at the moments (dropouts, offline periods) the chart should show.
- **A fixed gap threshold in milliseconds.** It is wrong for devices at different rates: 5 s for a 1 Hz device, but a firmware device reports every 5 s.
- **Keep the two Demo models and replay the engine for history.** The engine's state depends on its start and on injected faults, so replay could not give history before the session or for another tab. Generating live data from history, plus bounded noise, keeps history deterministic for any range (ADR 0015) and the live stream consistent with it.
- **Redraw from React effects on each store publish.** Every publish would re-render the chart components, which ADR 0012 and ADR 0014 exist to avoid.

## Consequences

- **Positive:**
  - Tested in `src/features/devices/charts/demo-consistency.test.ts`: over a 10-minute Demo session, every history point is within the drift bound (plus the history's change over at most 1 s) of the nearest live sample, and the stitched 1 h series has no gap and no jump at the seam. `simulation-engine.test.ts` checks every live value of 12 devices over 30 minutes against the history model.
  - The adapter is tested against a straightforward reference implementation on 300 random cases, and reuses its arrays (no allocation per sample).
  - Charts redraw only when data changed, at most once per frame for all charts, and never while hidden or paused (`redraw-scheduler.test.ts`).
- **Negative:**
  - Demo data changed: every live value differs from before, the battery no longer starts at a random level, and no device depletes on its own. Demos of low-battery depletion now need the `low_battery` fault.
  - A buffer range is partly empty for its first minutes after the page opens.
  - The `24h` live tail can hold up to 30 s of full-resolution samples next to 5-minute buckets. They are drawn at their true times, so they take a sliver of the width.
- **Follow-up:** Phase 6 measures draw time with all charts at full buffers (docs/performance.md).
