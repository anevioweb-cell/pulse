# 0014. Frame-rate batching and backpressure policy

- **Status:** Accepted
- **Date:** 2026-11-09

## Context

Telemetry arrives in bursts and at rates that can exceed the display's frame rate (200 devices × 5 Hz = 1000 messages per second, against 60 frames per second). Publishing to React per message would re-render subscribers far more often than the screen can show. Browsers pause `requestAnimationFrame` in hidden tabs, and a dashboard can sit hidden for hours. The policy must say what is recorded, what is published, what is dropped, and how much memory any of it can take.

## Decision

1. **Process on arrival, publish per frame.** Each raw frame is parsed and its reading written to the ring buffers immediately, inside the transport callback. Publishing to the Zustand store happens at most once per animation frame, through an injectable `FrameScheduler` (requestAnimationFrame in browsers, a ~60 Hz timer in Node). Only one frame is ever requested at a time.
2. **No queue: coalesce.** Messages are not queued for later processing, so there is no backlog to grow. Between two frames, the pending state holds at most one record per device (its newest `latest` reading, status and metadata) plus a fixed set of counters. When a device gets several readings in one frame, all of them are in the ring buffer, but only the newest becomes React state. Each superseded update increments `counters.coalescedUpdates`, so the coalescing is visible and not silent.
3. **Bounded by construction.** The pending records are capped by `STORE.MAX_DEVICES` (256, with extra devices rejected and counted). The buffers have fixed capacity. Input is capped upstream by the transport (frame size and 200 frames per second in Live Mode, with drops counted in `counters.transport`).
4. **Hidden tab.** While requestAnimationFrame is paused:
   - recording continues (buffers keep up to 30 minutes of history);
   - the single pending frame stays pending;
   - nothing else accumulates.

   When the tab becomes visible, one publish delivers the newest state. Tested: 50,000 readings with frames paused give one pending frame and constant buffer bytes, then exactly one publish.

5. **Stale status despite silence.** Stale status depends on time alone, so a 1 s timer (injected scheduler) requests a frame only when some device's derived status would change. While the tab is hidden that frame waits too, which is harmless because nobody is looking.
6. **Final state on stop.** `stop()` publishes synchronously, so the store never shows a live connection after the session ended.

## Alternatives considered

- **Publish per message.** Simplest, but wasteful: hundreds of renders per second that the screen cannot show. Measured: one publish per message lowers 12-device throughput from 184k to 138k messages per second before any React work.
- **Throttle by time (`setTimeout`, every 100 ms).** Not aligned with paint, so it either lags behind the display or wastes publishes. Timers also keep running in hidden tabs (clamped to 1 per second) and do pointless work.
- **Queue messages and process them per frame.** Moves the parsing cost into the frame (jank at high rates), and the queue grows without bound while the tab is hidden, which is exactly the failure this ADR exists to prevent.
- **Drop messages when overloaded.** Loses history. With 5.6 µs per message, the client can ingest about 178k messages per second, so the transport rate limit (200 per second by default) is the right place to shed load. Drops there are counted.
- **A worker-side store with snapshots posted per frame.** Moves parsing off the main thread, but adds copying and complexity. Reconsider in Phase 6 if browser measurements show main-thread pressure.

## Consequences

- **Positive:**
  - React renders at most once per frame per subscriber, and only for changed slices.
  - Memory is bounded in every state, including long hidden periods.
  - Every loss or merge is counted: parse failures, transport drops, rejected devices, out-of-order and duplicate samples, coalesced updates.
- **Negative:**
  - Intermediate values between frames are never React state. Components that need every sample (charts) must read the ring buffers, as ADR 0012 intends.
  - Parsing stays on the main thread: about 5.6 µs per message, about 0.6 % of one core at 1000 messages per second, before React rendering. Phase 6 will measure this in browsers.
