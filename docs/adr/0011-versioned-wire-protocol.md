# 0011. Versioned wire protocol with strict schemas

- **Status:** Accepted
- **Date:** 2026-11-09

## Context

Telemetry arrives from microcontrollers whose firmware is updated independently of the dashboard, and possibly from hostile clients on the network. The dashboard renders device-provided strings (names, locations) and keeps per-device state keyed by device-provided ids. We need:

- a format that tiny firmware can produce;
- evolution without breaking deployed devices;
- strict rejection of anything malformed, without crashing or slowing the UI.

## Decision

- **JSON text frames** with an envelope of `v` (protocol version), `type` (discriminator) and `ts` (epoch ms). There are five types: `device_online`, `reading`, `device_offline`, `ping` and `pong` (`docs/telemetry-protocol.md`).
- **The version is explicit and strict.** v1 accepts only `v: 1`. Unknown versions are rejected with the reason `unknown_version`, and unknown types with `unknown_type`, never by throwing.
- **Schemas are strict** (`z.strictObject`, zod/mini): extra keys are a `schema_violation`. Numbers must be finite and within physical sensor ranges (rejected, not clamped). Timestamps must fall in a plausible window (2020-2100), which catches seconds-vs-milliseconds bugs.
- **Device strings are untrusted:**
  - **Ids:** an allowlist charset, at most 64 characters, never prototype names. They are rejected rather than cleaned, because they are keys.
  - **Display strings:** length-capped first, then stripped of control, bidi and separator characters, trimmed, and required to be non-empty.
- **Prototype pollution is blocked at parse time.** A `JSON.parse` reviver rejects `__proto__`, `constructor` and `prototype` keys at any depth (`forbidden_key`). Later layers keep per-device data in `Map`s, never plain objects keyed by device ids.
- **The parser is non-throwing and cheapest-first.** It returns a typed result `{ ok, message } | { ok: false, reason, detail }` and checks payload type, then byte size (before `JSON.parse`), JSON, forbidden keys, envelope and schema. Failure details never echo attacker strings.

## Alternatives considered

- **Lenient schemas (strip unknown keys, clamp values).**
  - Pros: more forgiving of firmware drift.
  - Cons: silently hides bugs and makes "what did the device actually send" unanswerable. A clamped 150 °C reading looks like a real 85 °C one.
- **Additive evolution without version bumps** (accept unknown keys).
  - Pros: common in public APIs.
  - Cons: with untrusted senders, extra keys are an attack surface (pollution, payload smuggling) with no benefit for a closed protocol whose firmware we write.
- **Binary encodings (CBOR, MessagePack, Protobuf).**
  - Pros: smaller frames.
  - Cons: messages are ~170 bytes on average, Wi-Fi bandwidth is not the bottleneck, and JSON keeps the firmware simple and frames debuggable (the probe prints them).
- **Schema-validation libraries other than Zod.** Already decided in ADR 0001 and ADR 0006 (zod/mini).
- **Throwing parser.** Any `try/catch` gap in a hot path would turn a malformed frame into a crash. A result type forces callers to handle failures.

## Consequences

- **Positive:**
  - Malformed or hostile frames are rejected with a precise, countable reason (useful for a diagnostics panel).
  - Types come from the schemas (`z.infer`).
  - The same parser runs in browser, worker, server and CLI.
- **Negative:**
  - Every protocol change, even additive, needs a version bump and a migration window where the parser accepts two versions.
  - Firmware must keep strings within limits and avoid sending NaN.
- **Performance:** about 179k valid messages/second on one Node 24 thread (measured, `docs/performance.md`), so validation is not a bottleneck at the planned rates. It will be re-measured in the browser under load in Phase 6.
