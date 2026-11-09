import { z } from 'zod/mini';

import { SENSOR_RANGES } from '../config';
import { boundedNumber } from './untrusted';

/**
 * One measurement set. Temperature, humidity and signal are always present; pressure needs a
 * BME280 (absent with a DHT22) and battery needs a battery gauge (absent on USB power).
 */
export const sensorReadingSchema = z.strictObject({
  temperature: boundedNumber(SENSOR_RANGES.temperature),
  humidity: boundedNumber(SENSOR_RANGES.humidity),
  pressure: z.optional(boundedNumber(SENSOR_RANGES.pressure)),
  battery: z.optional(boundedNumber(SENSOR_RANGES.battery)),
  signal: boundedNumber(SENSOR_RANGES.signal),
});

export type SensorReading = z.infer<typeof sensorReadingSchema>;
export type SensorMetric = keyof SensorReading;
