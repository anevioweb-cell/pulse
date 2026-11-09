# 0009. Mock telemetry server with `ws` and `tsx`

- **Status:** Accepted
- **Date:** 2026-11-09

## Context

Phase 3A needs a local WebSocket server that streams simulated ESP32 telemetry, so that Live Mode (the real `WebSocketTransport` and parser) can be developed and tested without hardware. The server must reuse the app's `SimulationEngine` and protocol code (TypeScript under `src/features/telemetry`), run with a single command, start on an ephemeral port in integration tests, and never be part of the app bundle. None of the pre-approved libraries in CLAUDE.md covers a Node WebSocket server or running TypeScript directly in Node.

## Decision

- **Dependencies:** add three dev dependencies:
  - `ws`, the WebSocket server;
  - `@types/ws`, its types;
  - `tsx`, which runs TypeScript in Node without a build step.
- **Layout:** the server lives in `server/` (entry `server/index.ts`; library `server/telemetry-server.ts`, so tests can start it in-process). The probe CLI lives in `scripts/`. Both are typechecked by `tsconfig.server.json`, which is referenced from the root `tsconfig.json`, so `npm run typecheck` covers them. They are linted by the same ESLint config.
- **Scripts:**
  - `npm run server` runs `tsx server/index.ts`.
  - `npm run server:dev` runs `tsx watch server/index.ts`.
  - `npm run probe` runs `tsx scripts/telemetry-probe.ts`.
- **What the server reuses:** it imports only the feature's public API (`src/features/telemetry/index.ts`): `SimulationEngine`, the message encoder, the parser and the limits in `config.ts`. Demo Mode and Live Mode therefore generate and validate identical messages.
- **Clients:** the probe uses Node's built-in WebSocket client (WHATWG API, Node ≥ 22), injected into `WebSocketTransport`, so no client library is needed.

## Alternatives considered

- **Node's built-in `WebSocket`.** It is client-only; Node has no built-in WebSocket server.
- **`uWebSockets.js`.** Faster, but it's a native binary distributed outside npm's registry, which is overkill for a mock server.
- **Socket.IO.** Adds its own protocol on top of WebSocket, so it would not exercise the plain WebSocket path the ESP32 firmware uses.
- **Hand-written upgrade handling on `node:http`.** Framing, masking, fragmentation and close handshakes are easy to get subtly wrong, and `ws` is the de facto standard (used by most Node tooling, including Vite's own dev server).
- **Compiling the server with `tsc` instead of `tsx`.** Needs a build step and an output folder for a dev-only tool. `tsx` (esbuild-based) runs the sources directly, and the type safety comes from `tsc -b`, not from the runner.
- **Vite plugin or middleware inside the dev server.** Couples the mock to `vite dev`, and it is not usable by integration tests or the probe CLI.

## Consequences

- **Positive:**
  - One shared engine and protocol for Demo Mode, Live Mode and tests.
  - Integration tests start the server on port 0.
  - Server code is outside `src/` and never imported by the app, so it cannot reach the bundle (verified in `docs/performance.md`).
- **Negative:**
  - Three more dev dependencies to keep updated. `ws` has had security advisories in the past (for example, the 2024 header-count DoS fixed in 8.17.1), so keep it current. It is dev-only and binds to `127.0.0.1` by default.
- **Neutral:**
  - The server is a development tool, not production infrastructure. A real deployment (Phase 10) would put a hardened ingestion service in front of devices.
