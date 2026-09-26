# Asp

<div align="center">
  <img src="images/logofinal.png" alt="Asp" width="42%"/>
</div>

**Fair physical releases when agents can buy.**

Asp is the AntiScalper Protocol for ETHGlobal Tokyo 2026: one eligible human, one capsule, paid on Sui, dispensed by a real machine. World Proof of Human gates entitlement. Payment Kit settles USDC. MQTT fires the motor. Walrus keeps the receipt.

---

## Demo in 60 seconds

| Step | What happens |
|---|---|
| 1. **Get ticket** | World selfie check → winner ticket |
| 2. **Claim capsule** | Enter ticket at the kiosk → confirm → pay with Slush QR |
| 3. **Dispense** | Gateway settles → MQTT → motor spins once |

Backup path (no ticket): `/v1` — World → pay → dispense on the spot.

---

<div align="center">
  <img src="images/shot-ticket.png" alt="Asp — get a winner ticket" width="90%"/>
</div>
<div align="center">
  <i>Get ticket — World Proof of Human issues a one-time winner code.</i>
</div>

<br/>

<div align="center">
  <img src="images/shot-claim.png" alt="Asp — claim capsule at kiosk" width="90%"/>
</div>
<div align="center">
  <i>Claim capsule — ticket in, pay with Payment Kit, machine hands over the goods.</i>
</div>

<br/>

<div align="center">
  <img src="images/shot-demo.png" alt="Asp — backup demo flow" width="90%"/>
</div>
<div align="center">
  <i>Backup demo — same PoH + pay + motor loop without a pre-issued ticket.</i>
</div>

---

## Why this exists

Agents can buy for people. Venues still need answers payment alone cannot give:

- **Who is entitled?** → World Proof of Human
- **What may they buy?** → one item from this machine, this release
- **Has it been used?** → ticket burns; no double claim

Payment proves money moved. Asp proves *who* was allowed to move it, once.

---

## Stack

| Layer | Role |
|---|---|
| **World ID** | Proof of Human for ticket / claim |
| **Sui + Payment Kit** | USDC checkout (Slush QR) |
| **x402 / `@altaga/x402-sui`** | Paid actuation barrier on the gateway |
| **MQTT + Feather ESP32** | One motor spin per settled claim |
| **Walrus** | Immutable dispense receipt |

---

## Repo map

| Path | What it is |
|---|---|
| [`asp-dapp`](asp-dapp) | Expo web UI — ticket, kiosk claim, backup demo |
| [`asp-gateway`](asp-gateway) | Policy, kiosk intents, x402, MQTT dispatch |
| [`asp-devices`](asp-devices) | Feather firmware for the gacha motor |
| [`asp-sui-facilitator`](asp-sui-facilitator) | Gas sponsorship for Sui settlements |
| [`x402-examples`](x402-examples) | Minimal buyer / facilitator smoke samples |

Judges / agents: see [`AGENT.md`](./AGENT.md) for endpoints. Humans walking the booth: see [`SIMULATOR.md`](./SIMULATOR.md).

---

## Quick start (local UI)

```bash
cd asp-dapp
npm install
npx expo start --web --port 8087
```

Open `http://localhost:8087` → **Get ticket**. Use `/claim` for the kiosk and `/v1` for the backup demo.

Gateway + device env live outside this README (see each package’s `.env.example`). Never commit real keys.

---

<div align="center">
  <sub>ETHGlobal Tokyo 2026 · Asp / AntiScalper Protocol</sub>
</div>
