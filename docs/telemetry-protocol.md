# Telemetry wire protocol (v1)

How ESP32 nodes, the mock server, the Demo Mode simulator and the dashboard exchange telemetry. Schemas live in `src/features/telemetry/model/` (zod/mini), and limits live in `src/features/telemetry/config.ts`. Design rationale: [ADR 0011](adr/0011-versioned-wire-protocol.md).

## Transport

- **WebSocket text frames** (UTF-8 JSON), one message per frame. Binary frames are dropped.
- **Size:** at most **4096 bytes** per frame (`PROTOCOL.MAX_FRAME_BYTES`). Larger frames are dropped by the client transport and refused by the mock server (close code 1009).
- **Rate:** the client accepts at most 200 frames per second (excess dropped and counted). The mock server accepts at most 20 frames per second per client (close code 1008 beyond that).
- **Liveness:** the dashboard sends an application-level `ping` every 15 s and treats the connection as dead if no `pong` (or any other frame) arrives within 5 s. The mock server also sends WebSocket protocol pings every 30 s and drops clients that don't answer.
- **Demo Mode:** frames come from a Web Worker instead of a socket, in the same format, through the same parser.

## Envelope

Every message is a JSON object with exactly the fields listed for its type (**no extra keys**):

| Field  | Type               | Rule                                                                      |
| ------ | ------------------ | ------------------------------------------------------------------------- |
| `v`    | integer            | Protocol version, must be `1`. Anything else: `unknown_version`.          |
| `type` | string             | One of the five types below. Anything else: `unknown_type`.               |
| `ts`   | integer (epoch ms) | Between 2020-01-01 and 2100-01-01. Seconds-based timestamps are rejected. |

## Messages

### `device_online`

Sent by a device when it connects (and by the server for each known device when a client connects).

```json
{
  "v": 1,
  "type": "device_online",
  "ts": 1794200000000,
  "device": {
    "id": "esp32-01",
    "name": "Living room",
    "location": "Ground floor",
    "firmware": "1.4.2"
  }
}
```

### `reading`

```json
{
  "v": 1,
  "type": "reading",
  "ts": 1794200000000,
  "deviceId": "esp32-01",
  "seq": 42,
  "values": {
    "temperature": 21.37,
    "humidity": 48.2,
    "pressure": 1013.25,
    "battery": 87.5,
    "signal": -61
  }
}
```

- `seq` is a per-device counter (integer ≥ 0), incremented for each reading. A gap means readings were lost.
- `pressure` is present only with a BME280; `battery` only when the device has a battery gauge. All other values are required.

### `device_offline`

```json
{
  "v": 1,
  "type": "device_offline",
  "ts": 1794200000000,
  "deviceId": "esp32-01",
  "reason": "low_battery"
}
```

`reason` is one of `shutdown`, `low_battery`, `network`, `unknown`.

### `ping` / `pong`

```json
{ "v": 1, "type": "ping", "ts": 1794200000000 }
```

```json
{ "v": 1, "type": "pong", "ts": 1794200000012, "pingTs": 1794200000000 }
```

`pingTs` echoes the ping's `ts`, so the client can compute the round-trip time.

## Field rules

| Field                            | Rule                                                                                                                                                                                         |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `device.id`, `deviceId`          | 1-64 characters from `A-Z a-z 0-9 . _ : -`; never `__proto__`, `constructor` or `prototype`. Rejected (not cleaned) otherwise.                                                               |
| `device.name`, `device.location` | At most 64 characters. Control characters (C0, DEL, C1), bidi controls (U+202A-E, U+2066-9) and line/paragraph separators are **stripped**, then the value is trimmed and must not be empty. |
| `device.firmware`                | 1-32 characters from `0-9 A-Z a-z . + -`.                                                                                                                                                    |
| `temperature`                    | °C, -40 to 85 (BME280 range).                                                                                                                                                                |
| `humidity`                       | %RH, 0 to 100.                                                                                                                                                                               |
| `pressure`                       | hPa, 300 to 1100 (BME280 range).                                                                                                                                                             |
| `battery`                        | %, 0 to 100.                                                                                                                                                                                 |
| `signal`                         | Wi-Fi RSSI in dBm, -120 to 0.                                                                                                                                                                |
| any number                       | Must be a finite JSON number. `NaN` and `Infinity` are not valid JSON (`invalid_json`); out-of-range values are rejected, not clamped.                                                       |

## Parsing and failure reasons

`parseTelemetryMessage(raw)` never throws. It returns `{ ok: true, message }` or `{ ok: false, reason, detail? }`, running the checks cheapest first:

| Reason                | Meaning                                                                                   |
| --------------------- | ----------------------------------------------------------------------------------------- |
| `unsupported_payload` | Not a text frame.                                                                         |
| `too_large`           | More than 4096 UTF-8 bytes (checked before parsing).                                      |
| `invalid_json`        | Not valid JSON (including `NaN`/`Infinity` literals).                                     |
| `forbidden_key`       | A `__proto__`, `constructor` or `prototype` key at any depth.                             |
| `not_an_object`       | Valid JSON, but not an object.                                                            |
| `unknown_version`     | `v` missing or not `1`. The detail echoes only numeric versions.                          |
| `unknown_type`        | `type` missing or not one of the five types.                                              |
| `schema_violation`    | Missing, extra, mistyped or out-of-range fields. The detail names the first failing path. |

## Versioning

- **Additive changes** (new optional field, new message type) still need a new version, because v1 objects are strict and reject unknown keys. This is deliberate (ADR 0011).
- **Bumping the version:** add a `v: 2` schema next to v1 and let the parser accept both during a migration window. Firmware sends the version it implements.
