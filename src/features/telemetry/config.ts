// Every limit and timing of the telemetry feature (protocol, transports, simulator, mock server).
// Values are chosen for a home-scale ESP32 fleet; each one states why. Change them here only.

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;

/* ---------------------------------------------------------------------------------------------- */
/* Wire protocol                                                                                  */
/* ---------------------------------------------------------------------------------------------- */

export const PROTOCOL = {
  /** Current wire protocol version. Messages with any other `v` are rejected (ADR 0011). */
  VERSION: 1,
  /**
   * Largest accepted frame, in UTF-8 bytes. The largest valid message (device_online with every
   * string at its cap) is about 450 bytes, so 4 KiB leaves ~9x headroom while keeping hostile
   * frames cheap to reject. The same value is the mock server's `maxPayload`.
   */
  MAX_FRAME_BYTES: 4096,
  /** Device ids: short, URL- and log-safe identifiers (ESP32 MAC-based ids are 12-17 chars). */
  DEVICE_ID_MAX_LENGTH: 64,
  /** Human-readable names and locations shown in the UI; long enough for "Greenhouse north". */
  NAME_MAX_LENGTH: 64,
  LOCATION_MAX_LENGTH: 64,
  /** Firmware versions like "1.4.2" or "2.0.0-rc.1+esp32s3". */
  FIRMWARE_VERSION_MAX_LENGTH: 32,
  /**
   * Plausible timestamp window (epoch ms): 2020-01-01 to 2100-01-01. Rejects seconds-based
   * timestamps (off by 1000x), zero/negative values and absurd future dates without needing
   * the current time, so parsing stays pure.
   */
  MIN_TIMESTAMP_MS: 1_577_836_800_000,
  MAX_TIMESTAMP_MS: 4_102_444_800_000,
  /** Per-device sequence numbers must stay exactly representable as integers. */
  MAX_SEQUENCE: Number.MAX_SAFE_INTEGER,
} as const;

/**
 * Physical bounds of each measurement. Values outside are sensor faults or tampering, so the
 * message is rejected rather than clamped. Ranges follow the datasheets of the sensors the
 * firmware supports (Bosch BME280, Aosong DHT22) and ESP32 Wi-Fi RSSI.
 */
export const SENSOR_RANGES = {
  /** °C. BME280 operating range -40..85; DHT22 -40..80. */
  temperature: { min: -40, max: 85 },
  /** %RH. Physical range of relative humidity. */
  humidity: { min: 0, max: 100 },
  /** hPa. BME280 measurement range 300..1100 (about 9000 m altitude to below sea level). */
  pressure: { min: 300, max: 1100 },
  /** % state of charge as reported by the firmware's battery gauge. */
  battery: { min: 0, max: 100 },
  /** dBm. ESP32 RSSI is reported between about -120 (no signal) and 0. */
  signal: { min: -120, max: 0 },
} as const;

/* ---------------------------------------------------------------------------------------------- */
/* WebSocket transport                                                                            */
/* ---------------------------------------------------------------------------------------------- */

export const WEBSOCKET = {
  /** Allowed URL schemes. Anything else is rejected before a socket is constructed. */
  ALLOWED_PROTOCOLS: ['ws:', 'wss:'] as readonly string[],
  /** A socket that has not opened within 10 s is treated as failed and retried. */
  CONNECT_TIMEOUT_MS: 10 * MS_PER_SECOND,
  /** First reconnect delay ceiling. Full jitter picks a delay in [0, ceiling). */
  RECONNECT_BASE_MS: 500,
  /** Delay ceiling cap: no client waits more than 30 s between attempts. */
  RECONNECT_CAP_MS: 30 * MS_PER_SECOND,
  /**
   * Consecutive failed attempts before giving up (status `failed`). With base 500 ms and cap 30 s,
   * 10 attempts span up to about 2.5 minutes, enough to ride out a router reboot.
   */
  RECONNECT_MAX_ATTEMPTS: 10,
  /** A connection that stays open this long is "stable": the attempt counter resets. */
  STABLE_CONNECTION_MS: 10 * MS_PER_SECOND,
  /**
   * Application-level heartbeat. Browsers cannot send WebSocket protocol pings, so the client
   * sends a `ping` message every 15 s and expects a `pong` (or any other traffic) within 5 s.
   */
  HEARTBEAT_INTERVAL_MS: 15 * MS_PER_SECOND,
  HEARTBEAT_TIMEOUT_MS: 5 * MS_PER_SECOND,
  /**
   * Inbound rate limit (frames per second, fixed 1 s window). The default demo fleet sends
   * 12 devices x 1 Hz = 12 msg/s; 200/s allows 50 devices at 4 Hz before frames are dropped.
   */
  MAX_MESSAGES_PER_SECOND: 200,
  RATE_WINDOW_MS: MS_PER_SECOND,
  /** Outgoing frames queued while (re)connecting; the oldest are dropped beyond this. */
  MAX_OUTGOING_QUEUE: 32,
} as const;

/* ---------------------------------------------------------------------------------------------- */
/* Simulator (SimulationEngine, SimulatorTransport, mock server)                                  */
/* ---------------------------------------------------------------------------------------------- */

export const SIMULATOR = {
  /** Default fleet size for Demo Mode: enough to fill a dashboard grid. */
  DEFAULT_DEVICE_COUNT: 12,
  /** Upper bound for the control message, keeps the worker and UI responsive. */
  MAX_DEVICE_COUNT: 100,
  /** Readings per device per second. Real ESP32 sensors typically report every 1-60 s. */
  DEFAULT_RATE_HZ: 1,
  MIN_RATE_HZ: 0.1,
  MAX_RATE_HZ: 10,
  /** Default PRNG seed, so Demo Mode is reproducible unless a seed is chosen. */
  DEFAULT_SEED: 20_261_109,
  /** How often the worker / server advances the engine and flushes messages. */
  TICK_MS: 100,
  /**
   * Length of one simulated "day" for the daily cycle. Compressed to 10 minutes so the cycle is
   * visible in a demo session.
   */
  DAY_CYCLE_MS: 10 * SECONDS_PER_MINUTE * MS_PER_SECOND,
  /** Per-device baselines, drawn once per device: typical indoor conditions at sea level. */
  TEMPERATURE_BASELINE: { min: 18, max: 26 },
  HUMIDITY_BASELINE: { min: 35, max: 60 },
  PRESSURE_BASELINE: { min: 1005, max: 1020 },
  /** Wi-Fi RSSI baselines: -45 dBm next to the router, -85 dBm at the edge of coverage. */
  SIGNAL_BASELINE: { min: -85, max: -45 },
  /** Daily-cycle amplitudes (peak deviation from each device's baseline). */
  TEMPERATURE_CYCLE_AMPLITUDE: 3,
  HUMIDITY_CYCLE_AMPLITUDE: 8,
  /** Mean reversion of the random walk per reading (0 = pure walk, 1 = no memory). */
  DRIFT_REVERSION: 0.05,
  /** Random-walk step size per reading (standard-ish deviation in sensor units). */
  TEMPERATURE_DRIFT_STEP: 0.15,
  HUMIDITY_DRIFT_STEP: 0.5,
  PRESSURE_DRIFT_STEP: 0.3,
  SIGNAL_DRIFT_STEP: 1.5,
  /** Chance per reading of a one-off spike (sensor glitch) and its size in °C. */
  SPIKE_PROBABILITY: 0.004,
  SPIKE_MAGNITUDE: 12,
  /** Chance per reading that a device drops off Wi-Fi, and how long it stays silent. */
  DROPOUT_PROBABILITY: 0.002,
  DROPOUT_MIN_MS: 5 * MS_PER_SECOND,
  DROPOUT_MAX_MS: 45 * MS_PER_SECOND,
  /** Battery drain per reading, in percentage points (randomized per device within this range). */
  BATTERY_DRAIN_MIN: 0.002,
  BATTERY_DRAIN_MAX: 0.05,
  /** Initial charge range, so some devices start near the low-battery threshold. */
  BATTERY_INITIAL_MIN: 15,
  BATTERY_INITIAL_MAX: 100,
  /** Below this, devices are "low battery"; at 0 they go offline until recharged. */
  LOW_BATTERY_THRESHOLD: 20,
  /** A depleted device comes back (recharged to 100 %) after this long. */
  RECHARGE_DELAY_MS: 60 * MS_PER_SECOND,
  /** Readings are rounded to this many decimals, like real sensor drivers. */
  VALUE_DECIMALS: 2,
  /**
   * Resolution of simulated history (REST readings in Demo Mode and on the mock server): one
   * sample per 10 s = 8,640 samples per device and metric per day, cheap to compute on demand.
   */
  HISTORY_SAMPLE_MS: 10 * MS_PER_SECOND,
  /** Time scale of the smooth history noise: values wander noticeably over ~5 minutes. */
  HISTORY_NOISE_KNOT_MS: 5 * SECONDS_PER_MINUTE * MS_PER_SECOND,
  /** Peak noise added to each metric's baseline in simulated history. */
  HISTORY_TEMPERATURE_NOISE: 1.5,
  HISTORY_HUMIDITY_NOISE: 4,
  HISTORY_PRESSURE_NOISE: 3,
  HISTORY_SIGNAL_NOISE: 6,
  /** Simulated battery discharge cycle in history: 100 % down to 5 % over 2 days, then recharge. */
  HISTORY_BATTERY_CYCLE_MS: 2 * 24 * SECONDS_PER_MINUTE * SECONDS_PER_MINUTE * MS_PER_SECOND,
  HISTORY_BATTERY_FLOOR: 5,
} as const;

/* ---------------------------------------------------------------------------------------------- */
/* Mock server (server/)                                                                          */
/* ---------------------------------------------------------------------------------------------- */

export const MOCK_SERVER = {
  /** Loopback only by default: the mock server is a dev tool and must not be exposed. */
  DEFAULT_HOST: '127.0.0.1',
  DEFAULT_PORT: 8787,
  /** Inbound frames per client per second; clients only send pings, so 20/s is generous. */
  MAX_CLIENT_MESSAGES_PER_SECOND: 20,
  /**
   * Slow-consumer guard: while a client has more than 1 MiB of unsent data buffered, new frames
   * for it are dropped instead of growing server memory without bound.
   */
  MAX_CLIENT_BUFFERED_BYTES: 1024 * 1024,
  /** Protocol-level ping to detect dead TCP connections (clients that vanished without closing). */
  PROTOCOL_PING_INTERVAL_MS: 30 * MS_PER_SECOND,
  /** On SIGINT/SIGTERM, clients get this long to close cleanly before being terminated. */
  SHUTDOWN_GRACE_MS: 5 * MS_PER_SECOND,
} as const;

/* ---------------------------------------------------------------------------------------------- */
/* Live store (ring buffers, batching, stale detection)                                           */
/* ---------------------------------------------------------------------------------------------- */

export const STORE = {
  /**
   * Samples kept per device and metric. 1800 = 30 minutes of history at the default 1 Hz
   * (3 minutes at the 10 Hz maximum, 2.5 hours at the firmware's 5 s interval). Memory:
   * 2 Float64Arrays x 1800 x 8 B = 28,800 B per metric, x 5 metrics = 144,000 B (~141 KiB) per
   * device; 12 devices ~1.65 MiB, 200 devices ~27.5 MiB.
   */
  RING_BUFFER_CAPACITY: 1800,
  /**
   * Maximum distinct devices tracked. Each new device id allocates ~141 KiB of buffers, so an
   * uncapped map would let a hostile client exhaust memory by announcing endless ids. 256 is
   * above the 200-device stress target with headroom; extra ids are rejected and counted.
   */
  MAX_DEVICES: 256,
  /**
   * A device with no reading for 15 s is "stale": 3 missed readings at the firmware's 5 s
   * interval, 15 at the simulator's 1 Hz. Distinct from an explicit device_offline message.
   */
  STALE_AFTER_MS: 15 * MS_PER_SECOND,
  /** How often stale status is re-evaluated when no messages arrive (it changes with time alone). */
  STALE_CHECK_INTERVAL_MS: MS_PER_SECOND,
  /**
   * Fallback frame interval where requestAnimationFrame does not exist (Node, workers): ~60 Hz.
   */
  FALLBACK_FRAME_MS: 16,
} as const;

/** WebSocket close codes used by the transport and server (RFC 6455 section 7.4). */
export const CLOSE_CODES = {
  NORMAL: 1000,
  GOING_AWAY: 1001,
  POLICY_VIOLATION: 1008,
  MESSAGE_TOO_BIG: 1009,
  /** Application range (4000-4999): the client stopped hearing from the server. */
  HEARTBEAT_TIMEOUT: 4000,
} as const;

/** A config object with literal types widened, so tests and tools can override values. */
export type Tunable<T> = {
  -readonly [K in keyof T]: T[K] extends number
    ? number
    : T[K] extends string
      ? string
      : T[K] extends { readonly min: number; readonly max: number }
        ? { min: number; max: number }
        : T[K];
};
