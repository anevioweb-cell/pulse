// Pulse ESP32 telemetry node: reads a BME280 or DHT22 and streams readings to a Pulse
// telemetry server over WebSocket using wire protocol v1 (docs/telemetry-protocol.md).
//
// UNTESTED ON HARDWARE: see README.md.
//
// Libraries (Arduino Library Manager):
//   - ESP32 Arduino core 3.x (board package "esp32" by Espressif)
//   - WebSockets by Markus Sattler (links2004), 2.6.x
//   - ArduinoJson by Benoit Blanchon, 7.x
//   - Adafruit BME280 Library + Adafruit Unified Sensor (for SENSOR_BME280)
//   - DHT sensor library by Adafruit (for SENSOR_DHT22)

#include <Arduino.h>
#include <ArduinoJson.h>
#include <WebSocketsClient.h>
#include <WiFi.h>
#include <math.h>
#include <sys/time.h>
#include <time.h>

#include "config.h"

#if defined(SENSOR_BME280) == defined(SENSOR_DHT22)
#error "Define exactly one of SENSOR_BME280 or SENSOR_DHT22 in config.h"
#endif

#ifdef SENSOR_BME280
#include <Adafruit_BME280.h>
#include <Wire.h>
Adafruit_BME280 bme;
#endif

#ifdef SENSOR_DHT22
#include <DHT.h>
DHT dht(DHT22_PIN, DHT22);
#endif

static const char *FIRMWARE_VERSION = "0.1.0";
static const int PROTOCOL_VERSION = 1;

// Protocol bounds (src/features/telemetry/config.ts): readings outside are skipped, not clamped.
static const float TEMPERATURE_MIN = -40.0f, TEMPERATURE_MAX = 85.0f;
static const float HUMIDITY_MIN = 0.0f, HUMIDITY_MAX = 100.0f;
static const float PRESSURE_MIN = 300.0f, PRESSURE_MAX = 1100.0f;
// Timestamps before 2020-01-01 mean NTP has not synced yet; the server would reject them.
static const uint64_t MIN_VALID_EPOCH_MS = 1577836800000ULL;

static const uint32_t WS_RECONNECT_MS = 5000;
// WebSocket protocol pings (answered automatically by the server): every 15 s, 3 s timeout,
// disconnect after 2 missed pongs.
static const uint32_t WS_PING_INTERVAL_MS = 15000, WS_PONG_TIMEOUT_MS = 3000;
static const uint8_t WS_MISSED_PONGS = 2;
static const size_t FRAME_BUFFER = 512;  // largest frame is about 450 bytes

WebSocketsClient ws;
String deviceId;
uint64_t seq = 0;
uint32_t lastReadingAt = 0;
bool socketOpen = false;

uint64_t epochMillis() {
  struct timeval tv;
  gettimeofday(&tv, nullptr);
  return (uint64_t)tv.tv_sec * 1000ULL + (uint64_t)(tv.tv_usec / 1000);
}

bool clockSynced() { return epochMillis() >= MIN_VALID_EPOCH_MS; }

bool inRange(float value, float min, float max) { return !isnan(value) && value >= min && value <= max; }

float round2(float value) { return roundf(value * 100.0f) / 100.0f; }

void sendJson(JsonDocument &doc) {
  char frame[FRAME_BUFFER];
  size_t length = serializeJson(doc, frame, sizeof(frame));
  if (length == 0 || length >= sizeof(frame)) {
    Serial.println("[pulse] frame too large, not sent");
    return;
  }
  ws.sendTXT(frame, length);
}

void sendDeviceOnline() {
  JsonDocument doc;
  doc["v"] = PROTOCOL_VERSION;
  doc["type"] = "device_online";
  doc["ts"] = epochMillis();
  JsonObject device = doc["device"].to<JsonObject>();
  device["id"] = deviceId;
  device["name"] = DEVICE_NAME;
  device["location"] = DEVICE_LOCATION;
  device["firmware"] = FIRMWARE_VERSION;
  sendJson(doc);
}

#ifdef BATTERY_ADC_PIN
float readBatteryPercent() {
  float volts = analogReadMilliVolts(BATTERY_ADC_PIN) / 1000.0f * BATTERY_DIVIDER_RATIO;
  float percent = (volts - BATTERY_EMPTY_VOLTS) / (BATTERY_FULL_VOLTS - BATTERY_EMPTY_VOLTS) * 100.0f;
  return constrain(percent, 0.0f, 100.0f);
}
#endif

void sendReading() {
#ifdef SENSOR_BME280
  float temperature = bme.readTemperature();
  float humidity = bme.readHumidity();
  float pressure = bme.readPressure() / 100.0f;  // Pa -> hPa
#else
  float temperature = dht.readTemperature();
  float humidity = dht.readHumidity();
#endif

  // JSON has no NaN: a failed sensor read would become null and be rejected, so skip it.
  if (!inRange(temperature, TEMPERATURE_MIN, TEMPERATURE_MAX) ||
      !inRange(humidity, HUMIDITY_MIN, HUMIDITY_MAX)) {
    Serial.println("[pulse] sensor read failed or out of range, skipping");
    return;
  }

  JsonDocument doc;
  doc["v"] = PROTOCOL_VERSION;
  doc["type"] = "reading";
  doc["ts"] = epochMillis();
  doc["deviceId"] = deviceId;
  doc["seq"] = seq++;
  JsonObject values = doc["values"].to<JsonObject>();
  values["temperature"] = round2(temperature);
  values["humidity"] = round2(humidity);
#ifdef SENSOR_BME280
  if (inRange(pressure, PRESSURE_MIN, PRESSURE_MAX)) values["pressure"] = round2(pressure);
#endif
#ifdef BATTERY_ADC_PIN
  values["battery"] = round2(readBatteryPercent());
#endif
  values["signal"] = constrain(WiFi.RSSI(), -120, 0);
  sendJson(doc);
}

void onWebSocketEvent(WStype_t type, uint8_t *payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED:
      socketOpen = true;
      Serial.println("[pulse] connected");  // loop() announces once the clock is synced
      break;
    case WStype_DISCONNECTED:
      socketOpen = false;
      Serial.println("[pulse] disconnected");
      break;
    default:
      // The node ignores inbound messages: it only publishes.
      break;
  }
}

void setup() {
  Serial.begin(115200);

#ifdef SENSOR_BME280
  if (!bme.begin(BME280_I2C_ADDRESS)) Serial.println("[pulse] BME280 not found, check wiring and address");
#else
  dht.begin();
#endif

  WiFi.mode(WIFI_STA);  // before reading the MAC: it can read as zeros until Wi-Fi starts
  String configuredId = DEVICE_ID;
  if (configuredId.length() > 0) {
    deviceId = configuredId;
  } else {
    uint8_t mac[6];
    WiFi.macAddress(mac);
    char id[20];
    snprintf(id, sizeof(id), "esp32-%02x%02x%02x%02x%02x%02x", mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
    deviceId = id;
  }

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("[pulse] connecting to Wi-Fi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print('.');
  }
  Serial.printf("\n[pulse] Wi-Fi connected, IP %s\n", WiFi.localIP().toString().c_str());

  // Protocol timestamps are epoch milliseconds, so the clock must be set before sending.
  configTime(0, 0, "pool.ntp.org", "time.google.com");

#if SERVER_USE_TLS
  ws.beginSSL(SERVER_HOST, SERVER_PORT, SERVER_PATH);
#else
  ws.begin(SERVER_HOST, SERVER_PORT, SERVER_PATH);
#endif
  ws.onEvent(onWebSocketEvent);
  ws.setReconnectInterval(WS_RECONNECT_MS);
  ws.enableHeartbeat(WS_PING_INTERVAL_MS, WS_PONG_TIMEOUT_MS, WS_MISSED_PONGS);
}

void loop() {
  ws.loop();
  static bool announced = false;
  if (!socketOpen) {
    announced = false;
    return;
  }
  if (!clockSynced()) return;
  if (!announced) {
    sendDeviceOnline();
    announced = true;
  }
  uint32_t now = millis();
  if (now - lastReadingAt >= READING_INTERVAL_MS) {
    lastReadingAt = now;
    sendReading();
  }
}
