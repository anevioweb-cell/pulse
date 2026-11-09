import type { TelemetryMode } from '../store/telemetry-store';
import type { AlertsQueryInput, ReadingsQueryInput } from './contract';

/**
 * Hierarchical TanStack Query keys. The first two levels namespace by mode, so demo and live data
 * never share a cache entry (or a persisted record). Each level is a prefix of the next, which
 * makes targeted invalidation possible:
 *
 *   ['telemetry', mode]                                   everything for one mode
 *   ['telemetry', mode, 'devices']                        all device data
 *   ['telemetry', mode, 'devices', 'list']                device list
 *   ['telemetry', mode, 'devices', 'detail', id]          one device
 *   ['telemetry', mode, 'devices', 'readings', id]        every readings range of one device
 *   ['telemetry', mode, 'devices', 'readings', id, {...}] one range
 *   ['telemetry', mode, 'alerts']                         rules and history (rules change history)
 *   ['telemetry', mode, 'alerts', 'rules']
 *   ['telemetry', mode, 'alerts', 'history', {...}]
 */
export const telemetryKeys = {
  all: (mode: TelemetryMode) => ['telemetry', mode] as const,
  devices: (mode: TelemetryMode) => [...telemetryKeys.all(mode), 'devices'] as const,
  deviceList: (mode: TelemetryMode) => [...telemetryKeys.devices(mode), 'list'] as const,
  device: (mode: TelemetryMode, id: string) =>
    [...telemetryKeys.devices(mode), 'detail', id] as const,
  deviceReadings: (mode: TelemetryMode, id: string) =>
    [...telemetryKeys.devices(mode), 'readings', id] as const,
  readings: (
    mode: TelemetryMode,
    id: string,
    { metric, from, to, maxPoints }: ReadingsQueryInput,
  ) =>
    [
      ...telemetryKeys.deviceReadings(mode, id),
      { metric, from, to, maxPoints: maxPoints ?? null },
    ] as const,
  alerts: (mode: TelemetryMode) => [...telemetryKeys.all(mode), 'alerts'] as const,
  alertRules: (mode: TelemetryMode) => [...telemetryKeys.alerts(mode), 'rules'] as const,
  alertHistory: (mode: TelemetryMode, { from, to, limit }: AlertsQueryInput) =>
    [...telemetryKeys.alerts(mode), 'history', { from, to, limit: limit ?? null }] as const,
};

/** The resource a key belongs to (used by persistence to pick a validator), or null. */
export type TelemetryResource =
  'deviceList' | 'device' | 'readings' | 'alertRules' | 'alertHistory';

export function resourceOf(key: readonly unknown[]): TelemetryResource | null {
  const [root, , group, kind] = key;
  if (root !== 'telemetry') return null;
  if (group === 'devices' && kind === 'list') return 'deviceList';
  if (group === 'devices' && kind === 'detail') return 'device';
  if (group === 'devices' && kind === 'readings') return 'readings';
  if (group === 'alerts' && kind === 'rules') return 'alertRules';
  if (group === 'alerts' && kind === 'history') return 'alertHistory';
  return null;
}
