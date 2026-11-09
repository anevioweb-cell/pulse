import { z } from 'zod/mini';

import { PROTOCOL } from '../config';
import { untrustedIdentifier, untrustedText } from './untrusted';

export const deviceIdSchema = untrustedIdentifier(PROTOCOL.DEVICE_ID_MAX_LENGTH);

/** A sensor node as announced by `device_online`. */
export const deviceSchema = z.strictObject({
  id: deviceIdSchema,
  name: untrustedText(PROTOCOL.NAME_MAX_LENGTH),
  location: untrustedText(PROTOCOL.LOCATION_MAX_LENGTH),
  firmware: untrustedIdentifier(PROTOCOL.FIRMWARE_VERSION_MAX_LENGTH).check(
    z.regex(/^[0-9A-Za-z.+-]+$/),
  ),
});

export type DeviceId = z.infer<typeof deviceIdSchema>;
export type Device = z.infer<typeof deviceSchema>;
