// The app-wide live telemetry instance (Phase 5 starts it from the UI). Annotated as pure so
// bundlers can drop it when nothing uses it.
import { TelemetryService } from './service/telemetry-service';
import { createTelemetryHooks } from './store/selectors';
import { createTelemetryStore } from './store/telemetry-store';

/** The live store. Read it through the hooks below; only `telemetryService` writes to it. */
export const telemetryStore = /* @__PURE__ */ createTelemetryStore();

/** Starts and stops demo or live sessions feeding `telemetryStore`. */
export const telemetryService = /* @__PURE__ */ new TelemetryService({ store: telemetryStore });

const liveHooks = /* @__PURE__ */ createTelemetryHooks(telemetryStore);

// Live-stream hooks carry a `Live` prefix so call sites never confuse them with the server-state
// hooks (useDevices, useDevice, ...) in api/hooks.ts: different data, different store (docs/caching.md).
export const useLiveDevice = liveHooks.useDevice;
export const useLiveDeviceIds = liveHooks.useDeviceIds;
export const useLiveConnection = liveHooks.useConnection;
export const useLiveMode = liveHooks.useMode;
export const useLiveCounters = liveHooks.useCounters;
export const useLiveStatusSummary = liveHooks.useStatusSummary;
export const useLiveSeriesVersion = liveHooks.useSeriesVersion;
