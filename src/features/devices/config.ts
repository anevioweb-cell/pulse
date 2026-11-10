// Display rules for device data. Each value states why.
import { STORE } from '@/features/telemetry';
import type { SensorMetric } from '@/features/telemetry';

export const DEVICE_DISPLAY = {
  /**
   * Fraction digits per metric: the sensors' useful resolution (BME280 temperature ±0.5 °C, so one
   * decimal; humidity ±3 %RH, pressure ±1 hPa, battery and RSSI are whole numbers).
   */
  DECIMALS: new Map<SensorMetric, number>([
    ['temperature', 1],
    ['humidity', 0],
    ['pressure', 0],
    ['battery', 0],
    ['signal', 0],
  ]),
  /**
   * "Seen 20 seconds ago" refreshes this often for a silent device: a third of the stale threshold
   * (15 s), so the label moves at least twice before a device turns stale.
   */
  LAST_SEEN_REFRESH_MS: STORE.STALE_AFTER_MS / 3,
} as const;
