# AGENT.md — Asp for agents & judges

Asp (AntiScalper Protocol) gates **limited physical releases** so agents can buy for humans without scalping the machine.

## Loop

```
World PoH → winner ticket (or /v1 on-the-spot)
    → kiosk claim
    → Payment Kit / Sui USDC settle
    → gateway authorizes one dispense
    → MQTT → motor once
    → Walrus receipt
```

Payment alone is not enough. PoH + burned ticket answer *who* and *once*.

## Packages that matter

| Package | Job |
|---|---|
| `asp-dapp` | Ticket UI, claim UI, backup demo, World session APIs |
| `asp-gateway` | Policy store, kiosk intents, x402 hire, MQTT dispatch |
| `asp-devices` | ESP32 Feather — subscribe action topic, spin motor, publish receipt |
| `asp-sui-facilitator` | Sponsored Sui gas for settlements |
| `@altaga/x402-sui` | x402 v2 client / server / facilitator schemes on Sui ([npm](https://www.npmjs.com/package/@altaga/x402-sui)) |

## Gateway surface (high level)

- `GET /asp/agent-guide.json` — live device / capability schema for agents
- `POST /asp/hire` — x402 payment-required actuation
- Kiosk routes under the dapp + gateway — checkout intent, status, complete (Payment Kit poll, then dispense)

Exact paths and env live in `asp-gateway` / `asp-dapp` source and `.env.example` files. Do not invent secrets; use placeholders.

## Demo routes (human UI)

| Route | Purpose |
|---|---|
| `/` | Get ticket (World PoH) |
| `/claim` | Redeem ticket + pay + dispense |
| `/v1` | Backup: PoH + pay + dispense without ticket |

## Rules agents must respect

1. One human entitlement → one capsule for this release.
2. Do not skip PoH or fabricate `paid=true`.
3. Wait for on-chain / Payment Kit settlement before assuming dispense.
4. Treat MQTT action as single-shot; double-fire is a bug, not a feature.

Booth humans: [`SIMULATOR.md`](./SIMULATOR.md). Product pitch: [`README.md`](./README.md).
