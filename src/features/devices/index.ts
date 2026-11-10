// Public API of the devices feature. Other features and app/ import only from here.
import { deviceIdSchema } from '@/features/telemetry';

/** Route module for `/devices` (React Router `lazy`): the table and its libraries load on demand. */
export const loadDevicesRoute = () =>
  import('./pages/DevicesPage').then((module) => ({ Component: module.DevicesPage }));

/** Route module for `/devices/:id`. */
export const loadDeviceRoute = () =>
  import('./pages/DevicePage').then((module) => ({ Component: module.DevicePage }));

/** The REST contract's device id rule, for validating a route parameter before it is used. */
export const isDeviceId = (value: unknown): value is string =>
  deviceIdSchema.safeParse(value).success;
