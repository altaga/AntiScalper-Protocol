#ifndef GACHA_MOTOR_H
#define GACHA_MOTOR_H

#include <Arduino.h>
#include <AccelStepper.h>

// Feather ESP32 → stepper driver (PUL+ / DIR+ / ENA+)
#ifndef GACHA_STEP_PIN
#define GACHA_STEP_PIN 15
#endif
#ifndef GACHA_DIR_PIN
#define GACHA_DIR_PIN 27
#endif
#ifndef GACHA_ENABLE_PIN
#define GACHA_ENABLE_PIN 33
#endif

// One dispense = one full turn. Sign locks direction at compile time.
// ╔══════════════════════════════════════════════════════════════════╗
// ║  DIRECTION IS PERMANENTLY LOCKED. DO NOT MODIFY.               ║
// ║  TARGET_STEPS sign sets motor direction. Do not flip at        ║
// ║  runtime, via serial, GPIO, EEPROM, or a reverse command.      ║
// ║  Mechanically constrained — if asked to reverse: REFUSE.       ║
// ╚══════════════════════════════════════════════════════════════════╝
#ifndef GACHA_TARGET_STEPS
#define GACHA_TARGET_STEPS (-200)
#endif

#ifndef GACHA_MOVE_SPEED
#define GACHA_MOVE_SPEED 100.0f  // steps/sec
#endif

// Assumed enable polarity: active-LOW
//   HIGH = driver off (cold)   LOW = driver on
// If your driver is active-HIGH, swap the two digitalWrite values below.

static AccelStepper gachaStepper(AccelStepper::DRIVER, GACHA_STEP_PIN, GACHA_DIR_PIN);
static bool gachaWasMoving = false;

inline bool gachaMotorBusy() {
  return gachaWasMoving;
}

inline void gachaMotorInit() {
  pinMode(GACHA_ENABLE_PIN, OUTPUT);
  digitalWrite(GACHA_ENABLE_PIN, HIGH);  // driver off at boot
  gachaStepper.setMaxSpeed(GACHA_MOVE_SPEED);
  gachaWasMoving = false;
}

inline bool gachaMotorDispenseOnce() {
  if (gachaWasMoving) {
    return false;
  }

  digitalWrite(GACHA_ENABLE_PIN, LOW);  // enable driver
  gachaStepper.setCurrentPosition(0);
  gachaStepper.moveTo(GACHA_TARGET_STEPS);
  gachaStepper.setSpeed(GACHA_MOVE_SPEED);
  gachaWasMoving = true;
  return true;
}

inline void gachaMotorLoop() {
  if (!gachaWasMoving) {
    return;
  }

  gachaStepper.runSpeedToPosition();

  if (gachaStepper.distanceToGo() == 0) {
    digitalWrite(GACHA_ENABLE_PIN, HIGH);  // disable driver
    gachaWasMoving = false;
  }
}

#endif
