# Asp gacha (Feather ESP32 + stepper + MQTT)

Asp physical dispenser. Gateway publishes `DISPENSE_ONCE` after payment + Proof of Human; this node spins once and returns a receipt.

## Wiring

| Driver | Feather GPIO |
|--------|--------------|
| PUL+   | 15           |
| DIR+   | 27           |
| ENA+   | 33           |
| PUL− / DIR− / ENA− | GND |
| Motor supply | driver VCC/GND (9–42 V) — not the Feather |

Speed 100 steps/s · −200 steps/turn · direction locked.

## Status LED (onboard #13)

| Pattern | Meaning |
|---------|---------|
| Slow blink (1s on / 1s off) | Connecting to Wi-Fi |
| Fast blink (100ms on / 100ms off) | Connecting to MQTT |
| Solid on (steady) | Connected / standby |
| Breathe (PWM fade) | MQTT action in progress (receive → dispense → receipt) |

Always-on (hackathon): MQTT keepalive 15s, Wi‑Fi/MQTT rebuild in a few seconds, telemetry every 30s.

## External power

Serial stays enabled (logs + `start` bench + USB reflash as usual). Boot never waits for a serial host (`while(!Serial)`), so USB wall power or LiPo works the same. Wi-Fi/MQTT retries continue in `loop()` if the AP is late.

## Credentials

```bash
copy include\creds.example.h include\creds.h
```

Fill Wi-Fi + device JWT. JWT `id` **must** be `Sub_A7C440A00001` (same as `asp-gateway/config/devices.json`).

## CLI

```powershell
cd asp-devices
& "$env:USERPROFILE\.platformio\penv\Scripts\pio.exe" run
& "$env:USERPROFILE\.platformio\penv\Scripts\pio.exe" run -t upload
& "$env:USERPROFILE\.platformio\penv\Scripts\pio.exe" device monitor --port COM3 --baud 115200 --echo --filter send_on_enter --eol CRLF
```

## Topics

- Sub: `asp/passive/Sub_A7C440A00001/action`
- Pub: `asp/passive/Sub_A7C440A00001/receipt`
- Telemetry: `asp/passive/Sub_A7C440A00001/telemetry`

Action payload shape: `{ "tx_id", "target", "action": ["DISPENSE_ONCE"], "timestamp" }`.

Busy guard: second action while spinning → receipt `busy`.

Serial `start` = local bench spin only (no MQTT receipt).
