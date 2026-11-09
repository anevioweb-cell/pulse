# 0010. Transport abstraction with one shared validation path for Demo and Live Mode

- **Status:** Accepted
- **Date:** 2026-11-09

## Context

Pulse gets telemetry from two sources:

- **Live Mode:** real ESP32 nodes, or the mock server, over WebSocket.
- **Demo Mode:** a simulator running in a Web Worker, so the dashboard works without hardware or a server, for example on the portfolio deployment.

Demo Mode is what most reviewers will see, so it must not be a "happy path" shortcut. If simulated data skipped validation, a parser bug or a schema change could break Live Mode while Demo Mode kept working. The ring buffer, store and batching (Phase 3B) should also not care where data comes from.

## Decision

- A `TelemetryTransport` interface with `connect()`, `disconnect()`, `onMessage(listener) → unsubscribe`, `onStatus(listener) → unsubscribe`, `getStatus()` and `getStats()`. It uses no event library: a tiny typed `ListenerSet` gives synchronous delivery and safe unsubscribe-while-emitting.
- **Transports deliver raw strings and never parse.** Both `WebSocketTransport` and `SimulatorTransport` emit the exact wire frames, and the next layer (Phase 3B) runs every frame through the single `parseTelemetryMessage`. The simulator worker encodes its messages with the same `encodeMessage` the server uses. Demo Mode therefore exercises size checks, JSON parsing, forbidden-key rejection, schema validation and string sanitization exactly like Live Mode.
- **Transports own the transport-level protection:**
  - frame size (both transports);
  - inbound rate limits (WebSocket);
  - the connection state machine, backoff and heartbeat (WebSocket);
  - worker lifecycle (simulator).

  Statuses share one `ConnectionStatus` type and one transition table, so the UI can show either mode with the same component.

- **Dependencies are injected for testability:**
  - the WebSocket constructor (a minimal WHATWG-compatible interface that browsers and Node's global `WebSocket` both satisfy);
  - the clock and timers (`Scheduler`);
  - the random source (backoff jitter);
  - the worker factory.

  Tests run with fakes and fake timers, the probe CLI uses Node's built-in client, and the server integration test uses the real transport against a real server.

## Alternatives considered

- **Parse inside each transport and emit typed messages.** Simpler call sites, but two places to keep in sync. It's also tempting to skip parsing for the "trusted" simulator, which is exactly the drift this ADR prevents.
- **Inject simulated data straight into the store (no transport).** Fastest, but Demo Mode would then bypass the connection lifecycle and validation, and a different code path would be what reviewers see.
- **RxJS or an EventEmitter library.** Powerful, but adds weight and concepts for a two-event interface.
- **Mock Service Worker for Demo Mode.** MSW can mock WebSocket, but it runs on the main thread and is intended for tests. A dedicated worker keeps simulation off the UI thread.

## Consequences

- **Positive:**
  - One validation path, tested once and exercised by both modes.
  - Transports are swappable (a future MQTT-over-WebSocket or SSE transport only needs the interface).
  - Deterministic tests for reconnect, heartbeat and limits.
- **Negative:**
  - Demo Mode pays for JSON encoding and parsing (about 5.6 µs per message measured on Node; see `docs/performance.md`). That is negligible at demo rates (12-120 msg/s).
- **Follow-up (Phase 3B):** a telemetry service that owns the active transport, parses frames, batches them into the ring buffers and Zustand store, and exposes parse-failure counts for diagnostics.
