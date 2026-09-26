#ifndef STATUS_LED_H
#define STATUS_LED_H

#include <Arduino.h>

// Adafruit Feather ESP32 onboard red LED (#13 / LED_BUILTIN).
// Exact modes:
//   WiFi connecting  → slow blink  (1s on / 1s off)
//   MQTT connecting  → fast blink  (100ms on / 100ms off)
//   Connected idle   → solid ON  (digital, not PWM)
//   Action cycle     → breathe (PWM fade up/down)
#ifndef STATUS_LED_PIN
#define STATUS_LED_PIN LED_BUILTIN
#endif

#ifndef STATUS_LED_SLOW_ON_MS
#define STATUS_LED_SLOW_ON_MS 1000
#endif
#ifndef STATUS_LED_SLOW_OFF_MS
#define STATUS_LED_SLOW_OFF_MS 1000
#endif
#ifndef STATUS_LED_FAST_ON_MS
#define STATUS_LED_FAST_ON_MS 100
#endif
#ifndef STATUS_LED_FAST_OFF_MS
#define STATUS_LED_FAST_OFF_MS 100
#endif
#ifndef STATUS_LED_BREATHE_MS
#define STATUS_LED_BREATHE_MS 2000
#endif
#ifndef STATUS_LED_PWM_HZ
#define STATUS_LED_PWM_HZ 5000
#endif

enum StatusLedMode : uint8_t {
  STATUS_LED_OFF = 0,
  STATUS_LED_WIFI,
  STATUS_LED_MQTT,
  STATUS_LED_STANDBY,
};

static StatusLedMode statusLedMode = STATUS_LED_OFF;
static bool statusLedBusyFlag = false;
static bool statusLedPwmActive = false;
static bool statusLedLevel = false;
static unsigned long statusLedPhaseStart = 0;
static bool statusLedPhaseOn = false;

inline void statusLedDigital(bool on) {
  if (statusLedPwmActive) {
    ledcDetach(STATUS_LED_PIN);
    pinMode(STATUS_LED_PIN, OUTPUT);
    statusLedPwmActive = false;
  }
  statusLedLevel = on;
  digitalWrite(STATUS_LED_PIN, on ? HIGH : LOW);
}

inline void statusLedPwm(uint8_t duty) {
  if (!statusLedPwmActive) {
    ledcAttach(STATUS_LED_PIN, STATUS_LED_PWM_HZ, 8);
    statusLedPwmActive = true;
  }
  ledcWrite(STATUS_LED_PIN, duty);
  statusLedLevel = (duty > 0);
}

inline void statusLedInit() {
  pinMode(STATUS_LED_PIN, OUTPUT);
  digitalWrite(STATUS_LED_PIN, LOW);
  statusLedMode = STATUS_LED_OFF;
  statusLedBusyFlag = false;
  statusLedPwmActive = false;
  statusLedLevel = false;
  statusLedPhaseStart = millis();
  statusLedPhaseOn = false;
}

inline void statusLedSetMode(StatusLedMode mode) {
  if (statusLedMode == mode) return;
  statusLedMode = mode;
  statusLedPhaseStart = millis();
  statusLedPhaseOn = false;
  if (!statusLedBusyFlag) {
    statusLedDigital(false);
  }
}

inline void statusLedBusy(bool busy) {
  if (statusLedBusyFlag == busy) return;
  statusLedBusyFlag = busy;
  statusLedPhaseStart = millis();
  if (!busy) {
    statusLedDigital(statusLedMode == STATUS_LED_STANDBY);
  }
}

inline void statusLedBlink(unsigned long onMs, unsigned long offMs) {
  const unsigned long elapsed = millis() - statusLedPhaseStart;
  const unsigned long slice = statusLedPhaseOn ? onMs : offMs;
  if (elapsed >= slice) {
    statusLedPhaseStart = millis();
    statusLedPhaseOn = !statusLedPhaseOn;
  }
  statusLedDigital(statusLedPhaseOn);
}

inline void statusLedBreathe() {
  const unsigned long t = millis() % STATUS_LED_BREATHE_MS;
  uint8_t duty;
  if (t < STATUS_LED_BREATHE_MS / 2) {
    duty = (uint8_t)((t * 255UL) / (STATUS_LED_BREATHE_MS / 2));
  } else {
    const unsigned long down = t - STATUS_LED_BREATHE_MS / 2;
    duty = (uint8_t)(255UL - (down * 255UL) / (STATUS_LED_BREATHE_MS / 2));
  }
  statusLedPwm(duty);
}

// Paint current mode. Prefer statusLedTickFromNet() from MQTTManager so
// the LED tracks WiFi/MQTT truth instead of transient event flicker.
inline void statusLedLoop() {
  if (statusLedBusyFlag) {
    statusLedBreathe();
    return;
  }

  switch (statusLedMode) {
    case STATUS_LED_WIFI:
      statusLedBlink(STATUS_LED_SLOW_ON_MS, STATUS_LED_SLOW_OFF_MS);
      break;
    case STATUS_LED_MQTT:
      statusLedBlink(STATUS_LED_FAST_ON_MS, STATUS_LED_FAST_OFF_MS);
      break;
    case STATUS_LED_STANDBY:
      statusLedDigital(true);
      break;
    case STATUS_LED_OFF:
    default:
      statusLedDigital(false);
      break;
  }
}

inline void statusLedDelay(unsigned long ms) {
  const unsigned long start = millis();
  while ((millis() - start) < ms) {
    statusLedLoop();
    delay(10);
  }
}

#endif
