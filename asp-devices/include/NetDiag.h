#ifndef NET_DIAG_H
#define NET_DIAG_H

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>

// Light egress check only. Do NOT HTTPS-probe the MQTT host here —
// a failed/insecure TLS to the same CF hostname before mqttConnect
// correlates with connection-abort storms on the ESP32.
inline void netDiag(const char* mqttHost) {
  Serial.println("\n[diag] === network probe ===");
  Serial.print("[diag] RSSI=");
  Serial.println(WiFi.RSSI());
  Serial.print("[diag] gateway=");
  Serial.println(WiFi.gatewayIP());
  Serial.print("[diag] dns=");
  Serial.println(WiFi.dnsIP());

  IPAddress ip;
  Serial.print("[diag] DNS ");
  Serial.print(mqttHost);
  Serial.print(" -> ");
  if (WiFi.hostByName(mqttHost, ip)) {
    Serial.println(ip);
  } else {
    Serial.println("FAIL");
  }

  WiFiClientSecure tls;
  tls.setInsecure();
  tls.setTimeout(12000);
  HTTPClient http;
  Serial.print("[diag] HTTPS google/204 ... ");
  if (http.begin(tls, "https://www.google.com/generate_204")) {
    http.setTimeout(12000);
    Serial.print("HTTP ");
    Serial.println(http.GET());
    http.end();
  } else {
    Serial.println("begin FAIL");
  }

  Serial.println("[diag] === end probe ===\n");
}

#endif
