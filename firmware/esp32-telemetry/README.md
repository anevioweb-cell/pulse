# ESP32 telemetry node (sample firmware)

An Arduino sketch that reads a **BME280** (temperature, humidity, pressure) or a **DHT22** (temperature, humidity) and streams readings to a Pulse telemetry server over WebSocket, using the same JSON wire protocol as the simulator ([docs/telemetry-protocol.md](../../docs/telemetry-protocol.md)).

> **Status: not tested on hardware and not compiled.** No ESP32 board or Arduino toolchain (`arduino-cli`) was available when this sketch was written, and none was installed. The code follows the documented APIs of the libraries listed below, but treat it as a starting point. Expect to fix small compile or wiring issues the first time you flash it. Please open an issue (or update this note) once it has been verified on a board.

## What it does

- Connects to Wi-Fi and sets the clock with NTP. Protocol timestamps are epoch milliseconds, and nothing is sent until the clock is synced.
- Opens a WebSocket to the server (reconnects every 5 s, and uses WebSocket protocol pings to detect dead connections).
- Sends `device_online` once per connection, then a `reading` every `READING_INTERVAL_MS`, with:
  - an incrementing `seq` (the dashboard can detect lost readings);
  - Wi-Fi RSSI as `signal`;
  - `pressure` only with a BME280, and `battery` only if `BATTERY_ADC_PIN` is defined. Both fields are optional in the protocol.
- Skips readings that failed (`NaN`) or are outside the protocol's physical ranges, because the server rejects them anyway.

## Hardware and wiring

Any ESP32 dev board (ESP32-WROOM-32 DevKitC, ESP32-S3 DevKit, …).

**BME280 (I2C, 3.3 V breakout):**

| BME280 | ESP32                                    |
| ------ | ---------------------------------------- |
| VIN    | 3V3                                      |
| GND    | GND                                      |
| SDA    | GPIO 21 (default I2C SDA on ESP32-WROOM) |
| SCL    | GPIO 22 (default I2C SCL)                |

The I2C address is usually `0x76`; some boards use `0x77` (set `BME280_I2C_ADDRESS`). On ESP32-S3 the default I2C pins differ, so check your board's pinout or call `Wire.begin(SDA, SCL)`.

**DHT22:**

| DHT22 | ESP32                                                                       |
| ----- | --------------------------------------------------------------------------- |
| VCC   | 3V3                                                                         |
| DATA  | GPIO 4 (`DHT22_PIN`), with a 10 kΩ pull-up to 3V3 (many modules include it) |
| GND   | GND                                                                         |

The DHT22 must not be read more than once every 2 s; the default 5 s interval respects that.

**Battery (optional):** a 100 kΩ/100 kΩ voltage divider from the battery `+` to an ADC1 pin (for example GPIO 35), then define `BATTERY_ADC_PIN`. ADC2 pins do not work while Wi-Fi is active. The percentage is a linear estimate between `BATTERY_EMPTY_VOLTS` and `BATTERY_FULL_VOLTS`, which is rough for Li-ion discharge curves.

## Setup

1. Install the **esp32** board package (Espressif, core 3.x) in the Arduino IDE, plus these libraries:
   - WebSockets (Markus Sattler / links2004);
   - ArduinoJson 7;
   - Adafruit BME280 Library and Adafruit Unified Sensor (for BME280);
   - DHT sensor library (for DHT22).
2. Copy `config.h.example` to `config.h` and fill in Wi-Fi, server host and device name. `config.h` is git-ignored. **Never commit real credentials.**
3. Start the mock server in **relay mode** on your computer, bound to the LAN so the board can reach it:

   ```bash
   npm run server -- --host 0.0.0.0 --relay
   ```

   In relay mode the server validates each device frame with the same parser as the dashboard and forwards the sanitized message to the other clients, next to the simulated devices. Binding to `0.0.0.0` exposes the dev server to your network; do it only on a trusted network.

4. Set `SERVER_HOST` to your computer's LAN IP, then build and flash. The Serial Monitor (115200 baud) shows the connection status.
5. Check the stream with the probe: `npm run probe -- --seconds 10`. Your device's `device_online` and `reading` messages appear in the counts, and any rejected frame shows up under parse failures with its reason.

## Security notes

- Plain `ws://` sends data unencrypted. The mock server is for development on a trusted network only. A real deployment should use `wss://` (`SERVER_USE_TLS 1`, with certificate validation configured in the WebSockets library) and authenticate devices (planned for Phase 10).
- Device id, name and location must respect the protocol limits (ids: letters, digits, `. _ : -`, at most 64 characters; names and locations at most 64 characters). Frames that break them are rejected by the server.
