#ifndef GACHA_OS_H
#define GACHA_OS_H

#include <Arduino.h>
#include "creds.h"

// Fixed Asp device id — must match asp-gateway/config/devices.json
#ifndef ASP_GACHA_DEVICE_ID
#define ASP_GACHA_DEVICE_ID "Sub_A7C440A00001"
#endif

bool taskPending = false;
String pendingPayload = "";

void aspMessageHandler(String topic, String payload) {
  pendingPayload = payload;
  taskPending = true;
}

#include "MQTTManager.h"
#include "AspNode.h"
// NetDiag HTTPS probe left out of boot — can stall Wi-Fi join on flaky networks.

class GachaOS {
 private:
  String unique_client_id;
  String subscribeTopic;
  String publishTopic;
  String telemetryTopic;
  AspNode* node;
  unsigned long lastHeartbeat = 0;
  // Hackathon always-on: telemetry every 30s keeps the Cloudflare WSS path warm.
  const unsigned long HEARTBEAT_INTERVAL = 30000;

 public:
  GachaOS() : node(nullptr) {}

  void bindCapability(SkillCallback callback) {
    unique_client_id = String(ASP_GACHA_DEVICE_ID);
    subscribeTopic = "asp/passive/" + unique_client_id + "/action";
    publishTopic = "asp/passive/" + unique_client_id + "/receipt";
    telemetryTopic = "asp/passive/" + unique_client_id + "/telemetry";

    node = new AspNode(unique_client_id, publishTopic);
    node->setCallback(callback);
  }

  const String& deviceId() const { return unique_client_id; }

  void boot() {
    Serial.println("\n====================================");
    Serial.println(" ASP GACHA — Tokyo node");
    Serial.println("====================================");
    Serial.println("Node ID: " + unique_client_id);

    setMqttCallback(aspMessageHandler);
    // Timed Wi-Fi join — continues to loop() retries if AP is late (no Serial wait).
    wifiConnect(ssid, password);
    mqttConnect(host, port, mqtt_user, mqtt_pass, unique_client_id.c_str());
    mqttSubscribe(subscribeTopic.c_str());
    Serial.println("Subscribed: " + subscribeTopic);
  }

  void publishReceipt(String tx_id, String task, String status) {
    if (node) node->publishReceipt(tx_id, task, status);
    statusLedBusy(false);
  }

  void loop() {
    delay(10);
    wifiEnsureConnected();
    mqttEnsureConnected();
    statusLedTickFromNet();

    if (taskPending) {
      Serial.println("\n[gacha] action: " + pendingPayload);
      statusLedBusy(true);
      const bool dispatched = node && node->processIntent(pendingPayload);
      taskPending = false;
      // JSON / identity miss: no receipt path — drop breathe immediately.
      if (!dispatched) statusLedBusy(false);
    }

    if (mqtt_connected_flag && (millis() - lastHeartbeat >= HEARTBEAT_INTERVAL)) {
      lastHeartbeat = millis();
      JsonDocument hbDoc;
      hbDoc["node_id"] = unique_client_id;
      hbDoc["status"] = "online";
      hbDoc["skill"] = "DISPENSE_ONCE";
      hbDoc["timestamp"] = millis();
      mqttPublish(telemetryTopic.c_str(), hbDoc);
    }
  }
};

#endif
