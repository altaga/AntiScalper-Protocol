#ifndef ASP_NODE_H
#define ASP_NODE_H

#include <Arduino.h>
#include <ArduinoJson.h>

extern void mqttPublish(const char* topic, const JsonDocument& doc);

typedef void (*SkillCallback)(String tx_id, JsonArray args);

class AspNode {
 private:
  String nodeId;
  String receiptTopic;
  SkillCallback onActionComplete;

 public:
  AspNode(String id, String topic)
      : nodeId(id), receiptTopic(topic), onActionComplete(nullptr) {}

  void setCallback(SkillCallback callback) { onActionComplete = callback; }

  // Returns true if the skill callback was invoked.
  bool processIntent(String payload) {
    Serial.println("\n[asp] parsing intent");

    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, payload);
    if (error) {
      Serial.print("[asp] JSON error: ");
      Serial.println(error.c_str());
      return false;
    }

    String tx_id = doc["tx_id"] | "MISSING";
    String target = doc["target"] | "MISSING";
    JsonArray actionArgs = doc["action"];

    if (target != "MISSING" && target != nodeId) {
      Serial.println("[asp] identity mismatch — ignore");
      return false;
    }

    if (onActionComplete != nullptr) {
      onActionComplete(tx_id, actionArgs);
      return true;
    }

    Serial.println("[asp] no capability callback");
    return false;
  }

  void publishReceipt(String tx_id, String task, String status) {
    JsonDocument receipt;
    receipt["tx_id"] = tx_id;
    receipt["node_id"] = nodeId;
    receipt["task"] = task;
    receipt["status"] = status;
    receipt["timestamp"] = millis();
    mqttPublish(receiptTopic.c_str(), receipt);
  }
};

#endif
