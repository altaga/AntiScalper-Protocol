# Asp — AntiScalper Protocol

<div align="center">
  <img src="images/logofinal.png" alt="Asp" width="42%"/>
</div>

**Fair physical releases when agents can buy.**

ETHGlobal Tokyo 2026. One eligible human. One capsule. Real machine.

Agents can hunt stock and pay faster than any queue. Venues still need answers that **payment alone cannot give**: who is allowed, what they may buy, and whether that entitlement is already burned. Asp is the checkout layer that answers those three questions before a motor ever spins.

---

## The problem (short)

A limited merch drop at a venue. Fans want an agent to grab a capsule. Scalpers and bots want the same.

| Question | Why money is not enough |
|---|---|
| **Who is entitled?** | A wallet is not a person |
| **What may they buy?** | One unit from *this* machine, this release |
| **Has it been used?** | Retry / second wallet / second agent must fail |

Without those checks, “pay → dispense” is just a faster scalper.

---

## Why these sponsors are load-bearing

Asp is not a stack resume. **World** and **Sui** each kill a failure mode payment alone cannot. Remove either and fair physical checkout collapses.

### 1. World — Proof of Human is the trust event

**Without World:** any wallet (or agent holding keys) can claim. Fair access dies.

**With World IDKit / Agents:**
- **Get ticket** — Selfie / PoH before the event → one winner code
- **Claim** — fresh human confirm at the kiosk before pay
- **Deny path** — cancelled, failed, or ineligible proof → **no pay, no motor**
- **Agent path** — agent may drive purchase, but a live human approval is still required before the protected action

This is the moment World asks for: a proportionate credential when access changes — including agent-mediated buys. Sandbox / event Agents proofs go through a real backend verify; we never invent `verified: true` on the client.

### 2. Sui — programmable payment + settlement

**Without Sui:** entitlement has nowhere honest to settle; the machine cannot wait on a real payment rail.

**With Sui (Payment Kit / Slush QR + x402 on the gateway):**
- USDC checkout the phone can finish at the booth
- Claim UI **waits on settlement**, not a fake `paid=true`
- Gateway only authorizes **one** dispense after settle
- `@altaga/x402-sui` keeps paid actuation explicit on the resource server

This is Sui as **DeFi & Payments** for physical checkout: payment flow, wallet UX, and settlement state — not a decorative chain badge.

---

## Demo in 60 seconds

| Step | Sponsor doing the work |
|---|---|
| 1. **Get ticket** (`/`) | **World** PoH → winner code |
| 2. **Claim** (`/claim`) | Ticket → **World** confirm → **Sui** pay (Slush) |
| 3. **Dispense** | Gateway settle → MQTT → motor **once** |

Backup (`/v1`): no pre-ticket — World → Sui pay → dispense on the spot. Same invariants.

Second claim with the same entitlement must fail. That beat is the product.

---

<div align="center">
  <img src="images/shot-ticket.png" alt="Asp — get a winner ticket" width="90%"/>
</div>
<div align="center">
  <i>World — Get ticket (Proof of Human → one-time code).</i>
</div>

<br/>

<div align="center">
  <img src="images/shot-claim.png" alt="Asp — claim capsule at kiosk" width="90%"/>
</div>
<div align="center">
  <i>World + Sui — Claim (ticket → PoH → Payment Kit → capsule).</i>
</div>

<br/>

<div align="center">
  <img src="images/shot-demo.png" alt="Asp — backup demo flow" width="90%"/>
</div>
<div align="center">
  <i>Backup path — same human gate + Sui pay + motor.</i>
</div>

---

## Partner map (ETHGlobal)

| Slot | Partner | What Asp proves |
|---|---|---|
| 1 | **World** | IDKit + Agents: fair scarce access; agent cannot act without live PoH |
| 2 | **Sui** | DeFi & Payments: USDC claim/settlement before physical actuation |

---

## Repo map

| Path | Role |
|---|---|
| [`asp-dapp`](asp-dapp) | Ticket, claim, backup demo, World session APIs |
| [`asp-gateway`](asp-gateway) | Policy, kiosk intents, x402, MQTT dispatch |
| [`asp-devices`](asp-devices) | Feather — one motor spin per authorized claim |
| [`asp-sui-facilitator`](asp-sui-facilitator) | Sponsored Sui gas |
| [`x402-examples`](x402-examples) | Minimal x402 smoke samples |

Endpoints for agents: [`AGENT.md`](./AGENT.md). Booth walkthrough: [`SIMULATOR.md`](./SIMULATOR.md).

---

## Quick start (local UI)

```bash
cd asp-dapp
npm install
npx expo start --web --port 8087
```

`/` Get ticket · `/claim` kiosk · `/v1` backup. Gateway + device env: each package’s `.env.example`. Never commit real keys.

---

<div align="center">
  <sub>ETHGlobal Tokyo 2026 · World · Sui</sub>
</div>
