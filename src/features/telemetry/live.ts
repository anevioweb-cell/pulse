// The app-wide live telemetry instance (Phase 5 starts it from the UI). Annotated as pure so
// bundlers can drop it when nothing uses it.
import { TelemetryService } from './service/telemetry-service';
import { createTelemetryHooks } from './store/selectors';
import { createTelemetryStore } from './store/telemetry-store';

/** The live store. Read it through the hooks below; only `telemetryService` writes to it. */
export const telemetryStore = /* @__PURE__ */ createTelemetryStore();

/** Starts and stops demo or live sessions feeding `telemetryStore`. */
export const telemetryService = /* @__PURE__ */ new TelemetryService({ store: telemetryStore });

export const {
  useDevice,
  useDeviceIds,
  useConnection,
  useMode,
  useCounters,
  useStatusSummary,
  useSeriesVersion,
} = /* @__PURE__ */ createTelemetryHooks(telemetryStore);
