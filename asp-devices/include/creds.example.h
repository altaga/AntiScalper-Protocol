#ifndef CREDS_H
#define CREDS_H

// Copy to creds.h (gitignored) and fill venue Wi-Fi + device JWT.
// MQTT JWT `id` claim MUST be Sub_A7C440A00001 (matches devices.json / broker ACL).
// Mint: VM/gacha-device-creds.json (gitignored) or broker/generatorDevice.js + WS_SECRET.
//
// Same path as gateways: wss://mqtt.example.com:443/mqtt

const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

const char* host = "mqtt.example.com";
const int port = 443;

const char* mqtt_user = "";
const char* mqtt_pass = "YOUR_DEVICE_JWT";

#endif
