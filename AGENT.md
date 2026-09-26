# AGENT.md — Asp for agents & judges

Asp (AntiScalper Protocol) = **fair limited physical checkout** when an agent buys for a human.

## Why World + Sui matter to an agent

| Partner | What the agent cannot fake |
|---|---|
| **World** | Live Proof of Human / Agents verify — denied proof ⇒ no protected action |
| **Sui** | Real USDC settlement (Payment Kit / x402) — no settle ⇒ no dispense |

Policy (one unit, this machine, this release) sits on top of those two rails. Payment alone is not authorization. PoH + burned entitlement + settle ⇒ one MQTT motor spin.

## Loop

```
World PoH → winner ticket (or /v1 on-the-spot)
    → claim
    → Sui / Payment Kit settle
    → gateway authorizes one dispense
    → MQTT → motor once
    → receipt
```

## Packages

| Package | Job |
|---|---|
| `asp-dapp` | Ticket / claim / backup UI + World APIs |
| `asp-gateway` | Policy, kiosk intents, x402 hire, MQTT |
| `asp-devices` | ESP32 Feather motor + receipt |
| `asp-sui-facilitator` | Sponsored Sui gas |
| `@altaga/x402-sui` | x402 v2 on Sui ([npm](https://www.npmjs.com/package/@altaga/x402-sui)) |

## Surfaces

- `GET /asp/agent-guide.json` — live capability schema
- `POST /asp/hire` — x402 payment-required actuation
- UI: `/` Get · `/claim` Redeem · `/v1` Backup (PoH + pay + dispense)

## Agent rules

1. One human entitlement → one capsule for this release.
2. Do not skip PoH; do not invent `paid=true`.
3. Wait for settlement before assuming dispense.
4. MQTT action is single-shot.

Humans: [`SIMULATOR.md`](./SIMULATOR.md). Pitch: [`README.md`](./README.md).
