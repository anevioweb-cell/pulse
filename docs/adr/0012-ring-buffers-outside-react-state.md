# 0012. Ring buffers in typed arrays, outside React state

- **Status:** Accepted
- **Date:** 2026-11-09

## Context

Charts need recent history for every device and metric: by default 12 devices × 5 metrics at 1 Hz, and up to 200 devices or 10 Hz in stress tests. History must be bounded (a dashboard left open for days must not leak memory), cheap to append (on every message), cheap to read (on every frame for visible charts), and must not make React re-render or diff large arrays on every message.

## Decision

- **Storage:** each device gets a `DeviceSeries` with one `RingBuffer` per metric. Each buffer holds a fixed capacity (`STORE.RING_BUFFER_CAPACITY` = 1800 samples, 30 minutes at 1 Hz) in two `Float64Array`s, for timestamps and values, allocated once (about 141 KiB per device).
- **Writes:** `push` is O(1) and allocation-free and overwrites the oldest sample when full. Timestamps stay non-decreasing:
  - an equal timestamp replaces the value (last write wins);
  - an older one is rejected and counted;
  - NaN or Infinity is rejected.
- **Reads:**
  - `segments()`: one or two copy-free subarray views, oldest to newest;
  - `copyTo(target)`: a zero-allocation copy into arrays the chart reuses;
  - `toArrays()` and `range(from, to)`: binary-searched, copying only the range;
  - `latestValue` / `latestTimestamp`;
  - a monotonically increasing `version`.
- **React state:** buffers live **outside** React state. The store only publishes a reference (`device.series`, stable identity) and `seriesVersion`. Components subscribe to the version and read the buffers directly.

## Alternatives considered

- **Plain arrays in Zustand state** (`state.series[id].temperature.push(...)` with a new array per update).
  - Pros: idiomatic.
  - Cons: every message allocates a new array of up to 1800 elements (copy-on-write) or mutates state in place (breaking change detection). Garbage-collection pressure and O(n) copies per message at 200+ messages per second.
- **Immutable arrays with structural sharing** (Immutable.js, or persistent vectors).
  - Pros: cheaper copies than plain arrays.
  - Cons: still allocates per push, adds a dependency, and charts (uPlot) need flat typed arrays anyway.
- **Immer.**
  - Pros: convenient mutable syntax over immutable updates.
  - Cons: makes the problem worse for this workload: proxies plus structural copies per message, and Immer freezes data in development builds.
- **RxJS streams with windowed buffers.**
  - Pros: elegant for transforms.
  - Cons: a large dependency and a new mental model. History still needs a bounded store, and charts still need arrays, so it would wrap the same ring buffer.
- **`Array` with `shift()`.**
  - Pros: simple.
  - Cons: `shift` is O(n), and boxed number arrays use more memory than `Float64Array`.

## Consequences

- **Positive:**
  - **Memory:** constant and predictable. 1.65 MiB for 12 devices, 27.5 MiB for 200, capped at about 36.9 MB by `STORE.MAX_DEVICES`. A test pushes a million samples and checks lengths and `byteLength`.
  - **Speed:** ingestion stays dominated by parsing (about 178k messages per second end to end on Node, see `docs/performance.md`).
  - **Charts:** uPlot accepts typed arrays directly.
- **Negative:**
  - Two kinds of state (Zustand snapshot plus mutable buffers) that components must use correctly. The subscription rules are in `docs/architecture.md`.
  - Views from `segments()` alias live memory and are valid only until the next push. Charts must read them within one frame or copy.
  - Out-of-order samples are dropped rather than inserted (an accepted trade-off for sorted O(1) writes; the count is visible).
- **Follow-up:** Phase 6 measures chart read and draw cost per frame, and decides whether the capacity should depend on the configured rate.
