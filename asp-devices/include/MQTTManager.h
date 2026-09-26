#ifndef MQTTMANAGER_H
#define MQTTMANAGER_H

#include <WiFi.h>
#include "mqtt_client.h"
#include <ArduinoJson.h>
#include "StatusLed.h"

// GTS Root R4 — Google Trust Services.
// mqtt.example.com is Cloudflare-fronted:
//   leaf → WE1 → GTS Root R4  (NOT Let's Encrypt / ISRG).
// TODO: CA pin - still dropping every ~20min on Feather
// Re-verify with: openssl s_client -connect mqtt.example.com:443 -servername mqtt.example.com -showcerts
const char* MQTT_ROOT_CA =
"-----BEGIN CERTIFICATE-----\n"
"MIIDejCCAmKgAwIBAgIQf+UwvzMTQ77dghYQST2KGzANBgkqhkiG9w0BAQsFADBX\n"
"MQswCQYDVQQGEwJCRTEZMBcGA1UEChMQR2xvYmFsU2lnbiBudi1zYTEQMA4GA1UE\n"
"CxMHUm9vdCBDQTEbMBkGA1UEAxMSR2xvYmFsU2lnbiBSb290IENBMB4XDTIzMTEx\n"
"NTAzNDMyMVoXDTI4MDEyODAwMDA0MlowRzELMAkGA1UEBhMCVVMxIjAgBgNVBAoT\n"
"GUdvb2dsZSBUcnVzdCBTZXJ2aWNlcyBMTEMxFDASBgNVBAMTC0dUUyBSb290IFI0\n"
"MHYwEAYHKoZIzj0CAQYFK4EEACIDYgAE83Rzp2iLYK5DuDXFgTB7S0md+8Fhzube\n"
"Rr1r1WEYNa5A3XP3iZEwWus87oV8okB2O6nGuEfYKueSkWpz6bFyOZ8pn6KY019e\n"
"WIZlD6GEZQbR3IvJx3PIjGov5cSr0R2Ko4H/MIH8MA4GA1UdDwEB/wQEAwIBhjAd\n"
"BgNVHSUEFjAUBggrBgEFBQcDAQYIKwYBBQUHAwIwDwYDVR0TAQH/BAUwAwEB/zAd\n"
"BgNVHQ4EFgQUgEzW63T/STaj1dj8tT7FavCUHYwwHwYDVR0jBBgwFoAUYHtmGkUN\n"
"l8qJUC99BM00qP/8/UswNgYIKwYBBQUHAQEEKjAoMCYGCCsGAQUFBzAChhpodHRw\n"
"Oi8vaS5wa2kuZ29vZy9nc3IxLmNydDAtBgNVHR8EJjAkMCKgIKAehhxodHRwOi8v\n"
"Yy5wa2kuZ29vZy9yL2dzcjEuY3JsMBMGA1UdIAQMMAowCAYGZ4EMAQIBMA0GCSqG\n"
"SIb3DQEBCwUAA4IBAQAYQrsPBtYDh5bjP2OBDwmkoWhIDDkic574y04tfzHpn+cJ\n"
"odI2D4SseesQ6bDrarZ7C30ddLibZatoKiws3UL9xnELz4ct92vID24FfVbiI1hY\n"
"+SW6FoVHkNeWIP0GCbaM4C6uVdF5dTUsMVs/ZbzNnIdCp5Gxmx5ejvEau8otR/Cs\n"
"kGN+hr/W5GvT1tMBjgWKZ1i4//emhA1JG1BbPzoLJQvyEotc03lXjTaCzv8mEbep\n"
"8RqZ7a2CPsgRbuvTPBwcOMBBmuFeU88+FSBX6+7iP0il8b4Z0QFqIwwMHfs/L6K1\n"
"vepuoxtGzi4CZ68zJpiq1UvSqTbFJjtbD4seiMHl\n"
"-----END CERTIFICATE-----\n";

esp_mqtt_client_handle_t client = nullptr;
volatile bool mqtt_connected_flag = false;
bool system_ready = false;
volatile bool mqtt_rebuild_requested = false;

static char mqtt_uri_buf[160];
static char mqtt_host_buf[96];
static int mqtt_port_saved = 443;
static const char* mqtt_user_saved = nullptr;
static const char* mqtt_pass_saved = nullptr;
static const char* mqtt_id_saved = nullptr;
static unsigned long mqtt_last_rebuild_ms = 0;

static const char* wifi_ssid_saved = nullptr;
static const char* wifi_pass_saved = nullptr;
static unsigned long wifi_last_attempt_ms = 0;
static bool wifi_join_pending = false;
static unsigned long wifi_join_started_ms = 0;
static unsigned long wifi_last_lost_log_ms = 0;

#ifndef WIFI_CONNECT_TIMEOUT_MS
#define WIFI_CONNECT_TIMEOUT_MS 30000
#endif
#ifndef WIFI_RETRY_INTERVAL_MS
#define WIFI_RETRY_INTERVAL_MS 12000
#endif
#ifndef WIFI_JOIN_TIMEOUT_MS
#define WIFI_JOIN_TIMEOUT_MS 25000
#endif
// Hackathon always-on: short MQTT keepalive + fast rebuild so WSS stays warm 24/7.
#ifndef MQTT_KEEPALIVE_SEC
#define MQTT_KEEPALIVE_SEC 15
#endif
#ifndef MQTT_REBUILD_MIN_MS
#define MQTT_REBUILD_MIN_MS 3000
#endif
#ifndef MQTT_REBUILD_IDLE_MS
#define MQTT_REBUILD_IDLE_MS 5000
#endif

const int MAX_SUBSCRIPTIONS = 20;
String active_subscriptions[MAX_SUBSCRIPTIONS];
int active_subscription_count = 0;

enum DeviceState {
  STATE_CONNECTING_WIFI,
  STATE_CONNECTING_MQTT,
  STATE_CONNECTED,
  STATE_OFF
};
volatile DeviceState current_state = STATE_OFF;

inline void syncStatusLedFromState() {
  switch (current_state) {
    case STATE_CONNECTING_WIFI:
      statusLedSetMode(STATUS_LED_WIFI);
      break;
    case STATE_CONNECTING_MQTT:
      statusLedSetMode(STATUS_LED_MQTT);
      break;
    case STATE_CONNECTED:
      statusLedSetMode(STATUS_LED_STANDBY);
      break;
    case STATE_OFF:
    default:
      statusLedSetMode(STATUS_LED_OFF);
      break;
  }
}

// Derive LED from live link flags — avoids false blinks from brief MQTT rebuild edges.
inline void statusLedTickFromNet() {
  if (statusLedBusyFlag) {
    statusLedLoop();
    return;
  }
  if (WiFi.status() != WL_CONNECTED) {
    statusLedSetMode(STATUS_LED_WIFI);
  } else if (!mqtt_connected_flag) {
    statusLedSetMode(STATUS_LED_MQTT);
  } else {
    statusLedSetMode(STATUS_LED_STANDBY);
  }
  statusLedLoop();
}

inline void statusLedNetDelay(unsigned long ms) {
  const unsigned long start = millis();
  while ((millis() - start) < ms) {
    statusLedTickFromNet();
    delay(10);
  }
}

typedef void (*MessageHandler)(String topic, String payload);
typedef void (*ConnectHandler)();
MessageHandler globalMessageHandler = NULL;
ConnectHandler globalConnectHandler = NULL;

void setMqttCallback(MessageHandler handler) {
  globalMessageHandler = handler;
}

void setMqttConnectCallback(ConnectHandler handler) {
  globalConnectHandler = handler;
}

void trackSubscription(String topic) {
  for (int i = 0; i < active_subscription_count; i++) {
    if (active_subscriptions[i] == topic) return;
  }
  if (active_subscription_count < MAX_SUBSCRIPTIONS) {
    active_subscriptions[active_subscription_count++] = topic;
  }
}

bool isTopicTracked(String incomingTopic) {
  for (int i = 0; i < active_subscription_count; i++) {
    if (active_subscriptions[i] == incomingTopic) return true;
  }
  return false;
}

void resubscribeAllTracked() {
  if (client == nullptr || !mqtt_connected_flag) return;
  for (int i = 0; i < active_subscription_count; i++) {
    esp_mqtt_client_subscribe(client, active_subscriptions[i].c_str(), 0);
    Serial.println("[mqtt] sub " + active_subscriptions[i]);
  }
}

void mqttDestroyClient() {
  mqtt_connected_flag = false;
  if (client != nullptr) {
    esp_mqtt_client_stop(client);
    esp_mqtt_client_destroy(client);
    client = nullptr;
  }
}

static void mqtt_event_handler(void* handler_args, esp_event_base_t base, int32_t event_id, void* event_data);

bool mqttRebuildAndStart() {
  mqttDestroyClient();
  current_state = STATE_CONNECTING_MQTT;
  syncStatusLedFromState();

  snprintf(mqtt_uri_buf, sizeof(mqtt_uri_buf), "wss://%s:%d/mqtt", mqtt_host_buf, mqtt_port_saved);

  esp_mqtt_client_config_t mqtt_cfg = {};
#if ESP_IDF_VERSION >= ESP_IDF_VERSION_VAL(5, 0, 0)
  mqtt_cfg.broker.address.uri = mqtt_uri_buf;
  mqtt_cfg.broker.verification.certificate = MQTT_ROOT_CA;
  mqtt_cfg.credentials.username = mqtt_user_saved;
  mqtt_cfg.credentials.authentication.password = mqtt_pass_saved;
  mqtt_cfg.credentials.client_id = mqtt_id_saved;
  mqtt_cfg.session.protocol_ver = MQTT_PROTOCOL_V_3_1_1;
  mqtt_cfg.session.keepalive = MQTT_KEEPALIVE_SEC;
  mqtt_cfg.network.timeout_ms = 30000;
  mqtt_cfg.network.reconnect_timeout_ms = 5000;
  mqtt_cfg.network.disable_auto_reconnect = true;
#else
  mqtt_cfg.uri = mqtt_uri_buf;
  mqtt_cfg.cert_pem = MQTT_ROOT_CA;
  mqtt_cfg.username = mqtt_user_saved;
  mqtt_cfg.password = mqtt_pass_saved;
  mqtt_cfg.client_id = mqtt_id_saved;
  mqtt_cfg.keepalive = MQTT_KEEPALIVE_SEC;
  mqtt_cfg.disable_auto_reconnect = true;
#endif

  client = esp_mqtt_client_init(&mqtt_cfg);
  if (client == nullptr) {
    Serial.println("[mqtt] init failed");
    return false;
  }
  esp_mqtt_client_register_event(client, MQTT_EVENT_ANY, mqtt_event_handler, NULL);
  Serial.println(String("[mqtt] connecting ") + mqtt_uri_buf + " (GTS Root R4)");
  if (esp_mqtt_client_start(client) != ESP_OK) {
    Serial.println("[mqtt] start failed");
    mqttDestroyClient();
    return false;
  }
  return true;
}

void wifi_event_handler(WiFiEvent_t event, WiFiEventInfo_t info) {
  switch (event) {
    case ARDUINO_EVENT_WIFI_STA_DISCONNECTED:
      current_state = STATE_CONNECTING_WIFI;
      syncStatusLedFromState();
      if (system_ready) {
        mqtt_connected_flag = false;
        mqtt_rebuild_requested = true;
        const unsigned long now = millis();
        if ((now - wifi_last_lost_log_ms) > 5000) {
          wifi_last_lost_log_ms = now;
          Serial.println("\n[net] WiFi lost — will retry in loop");
        }
      }
      break;
    case ARDUINO_EVENT_WIFI_STA_GOT_IP:
      wifi_join_pending = false;
      current_state = STATE_CONNECTING_MQTT;
      syncStatusLedFromState();
      if (system_ready) {
        Serial.println("\n[net] IP acquired");
        Serial.println(WiFi.localIP());
        mqtt_rebuild_requested = true;
      }
      break;
    default:
      break;
  }
}

static void mqtt_event_handler(void* handler_args, esp_event_base_t base, int32_t event_id, void* event_data) {
  esp_mqtt_event_handle_t event = (esp_mqtt_event_handle_t)event_data;
  switch ((esp_mqtt_event_id_t)event_id) {
    case MQTT_EVENT_CONNECTED:
      mqtt_connected_flag = true;
      mqtt_rebuild_requested = false;
      current_state = STATE_CONNECTED;
      syncStatusLedFromState();
      Serial.println("\n[mqtt] broker connected");
      resubscribeAllTracked();
      if (globalConnectHandler != NULL) globalConnectHandler();
      break;
    case MQTT_EVENT_DISCONNECTED:
      mqtt_connected_flag = false;
      if (WiFi.status() == WL_CONNECTED) {
        current_state = STATE_CONNECTING_MQTT;
        syncStatusLedFromState();
        mqtt_rebuild_requested = true;
      }
      Serial.println("\n[mqtt] disconnected");
      break;
    case MQTT_EVENT_ERROR:
      Serial.println("\n[mqtt] error event");
      if (event->error_handle) {
        Serial.printf("[mqtt] type=%d esp_tls=%d tls_stack=%d sock_errno=%d\n",
                      event->error_handle->error_type,
                      event->error_handle->esp_tls_last_esp_err,
                      event->error_handle->esp_tls_stack_err,
                      event->error_handle->esp_transport_sock_errno);
      }
      mqtt_rebuild_requested = true;
      break;
    case MQTT_EVENT_DATA: {
      String topicStr((char*)event->topic, event->topic_len);
      if (!isTopicTracked(topicStr)) break;
      String payloadStr((char*)event->data, event->data_len);
      Serial.println("\n[mqtt] " + topicStr);
      Serial.println(payloadStr);
      if (globalMessageHandler != NULL) globalMessageHandler(topicStr, payloadStr);
      break;
    }
    default:
      break;
  }
}

// Timed Wi-Fi join — never blocks forever (headless / external power).
bool wifiConnect(const char* ssid, const char* pass,
                 unsigned long timeoutMs = WIFI_CONNECT_TIMEOUT_MS) {
  wifi_ssid_saved = ssid;
  wifi_pass_saved = pass;
  wifi_last_attempt_ms = millis();
  wifi_join_pending = true;
  wifi_join_started_ms = wifi_last_attempt_ms;

  current_state = STATE_CONNECTING_WIFI;
  syncStatusLedFromState();
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(false);
  WiFi.onEvent(wifi_event_handler);
  WiFi.begin(ssid, pass);
  Serial.print("[net] WiFi");

  const unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - start) < timeoutMs) {
    statusLedNetDelay(500);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    wifi_join_pending = false;
    Serial.println(" ok");
    Serial.println(WiFi.localIP());
    return true;
  }

  Serial.println("\n[net] WiFi timeout — will retry in loop");
  wifi_join_pending = false;
  current_state = STATE_CONNECTING_WIFI;
  syncStatusLedFromState();
  return false;
}

// Keep STA associated. One join at a time — no begin storms.
void wifiEnsureConnected() {
  if (WiFi.status() == WL_CONNECTED) {
    wifi_join_pending = false;
    return;
  }
  if (wifi_ssid_saved == nullptr) return;

  current_state = STATE_CONNECTING_WIFI;
  syncStatusLedFromState();
  mqtt_connected_flag = false;

  const unsigned long now = millis();
  if (wifi_join_pending && (now - wifi_join_started_ms) < WIFI_JOIN_TIMEOUT_MS) {
    return;  // ESP already joining — do not call begin again
  }
  if ((now - wifi_last_attempt_ms) < WIFI_RETRY_INTERVAL_MS) return;

  wifi_last_attempt_ms = now;
  wifi_join_started_ms = now;
  wifi_join_pending = true;
  Serial.println("\n[net] WiFi retry");
  WiFi.begin(wifi_ssid_saved, wifi_pass_saved);
}

void mqttEnsureConnected() {
  if (mqtt_connected_flag) return;
  if (WiFi.status() != WL_CONNECTED) return;

  unsigned long now = millis();
  if (!mqtt_rebuild_requested && client != nullptr) {
    if ((now - mqtt_last_rebuild_ms) < MQTT_REBUILD_IDLE_MS) return;
  }
  if ((now - mqtt_last_rebuild_ms) < MQTT_REBUILD_MIN_MS) return;

  mqtt_last_rebuild_ms = now;
  mqtt_rebuild_requested = false;
  Serial.println("\n[mqtt] rebuild session...");
  mqttRebuildAndStart();
}

void mqttConnect(const char* host, int port, const char* user, const char* pass, const char* id) {
  strncpy(mqtt_host_buf, host, sizeof(mqtt_host_buf) - 1);
  mqtt_host_buf[sizeof(mqtt_host_buf) - 1] = '\0';
  mqtt_port_saved = port;
  mqtt_user_saved = user;
  mqtt_pass_saved = pass;
  mqtt_id_saved = id;

  // Always mark ready so loop() can recover if boot join timed out.
  system_ready = true;

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[mqtt] deferred — waiting for WiFi");
    current_state = STATE_CONNECTING_WIFI;
    syncStatusLedFromState();
    mqtt_rebuild_requested = true;
    return;
  }

  for (int attempt = 1; attempt <= 4 && !mqtt_connected_flag; attempt++) {
    Serial.printf("[mqtt] attempt %d/4\n", attempt);
    mqtt_last_rebuild_ms = millis();
    if (!mqttRebuildAndStart()) {
      statusLedNetDelay(2000);
      continue;
    }
    unsigned long start = millis();
    while (!mqtt_connected_flag && (millis() - start) < 25000) {
      statusLedNetDelay(250);
      Serial.print(".");
    }
    if (!mqtt_connected_flag) {
      Serial.println("\n[mqtt] attempt timed out — hard rebuild");
      mqttDestroyClient();
      statusLedNetDelay(1500);
    }
  }

  if (mqtt_connected_flag) {
    Serial.println(" ok");
  } else {
    Serial.println("\n[mqtt] deferred — loop will keep rebuilding");
    mqtt_rebuild_requested = true;
  }
}

void mqttSubscribe(const char* topic) {
  trackSubscription(String(topic));
  if (client != NULL && mqtt_connected_flag) {
    esp_mqtt_client_subscribe(client, topic, 0);
    Serial.println("[mqtt] sub " + String(topic));
  }
}

void mqttPublish(const char* topic, const JsonDocument& doc) {
  if (client != NULL && mqtt_connected_flag) {
    String output;
    serializeJson(doc, output);
    esp_mqtt_client_publish(client, topic, output.c_str(), 0, 0, 0);
    Serial.println("[mqtt] pub " + String(topic) + " " + output);
  }
}

#endif
