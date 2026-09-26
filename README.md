# Asp — AntiScalper Protocol

<div align="center">
  <img src="images/logofinal.png" alt="Asp" width="42%"/>
</div>

**Machines you can hire on Sui. Drops scalpers can't steal.**

ETHGlobal Tokyo 2026 · Partner slots: **World** + **Sui**

<div align="center">

**Fast links** · [Live demo](https://altaga-asp.expo.app) · [World](#world) · [Sui](#sui)

</div>

Asp puts real hardware on a paid HTTP rail. Agents hire machines with **x402**.  
When the release is scarce, the machine flips the other switch: **World Proof of Human** — then the human pays on Sui and the motor spins once.

---

## The problem

Limited capsule. Fans in line. Bots and wallets in the same line.

Money alone answers *paid?* — never *who?* or *already claimed?*

| Question | Why a naked pay fails |
|---|---|
| **Who?** | A hot wallet is not a person |
| **What?** | One unit from *this* machine, this release |
| **Once?** | Second face / second wallet / retry must die |

Asp’s answer is two sponsors sharing one stack:

1. **World** — the fairness switch (ticket ↔ zk nullifier ↔ same human at claim)
2. **Sui** — the money rail (**x402** to hire machines · **Payment Kit** when the human settles at the booth)

---

## The beat

```text
Win      World selfie → ticket WIN-… welded to your nullifier
Claim    Same human. Same nullifier. Or the petition dies.
Pay      Sui — Slush QR / Payment Kit at the kiosk
Spin     PaymentReceipt lands → MQTT → one motor turn
```

**The twist judges should feel:** machines on Asp are hireable over **x402** — agents included.  
*This* machine is PoH-gated. An agent can knock; it cannot skip World. So for the drop, the human walks up, proves, and **pays on Sui**. Scalpers don't get a faster lane. Agents don't get a backdoor.

---

## Architecture (big picture)

```mermaid
flowchart LR
  subgraph World["World"]
    IDKit[IDKit]
    Portal[verify]
  end

  subgraph Asp["Asp"]
    Dapp["Get / Claim"]
    GW[Gateway]
    Dev[Motor]
  end

  subgraph Sui["Sui"]
    PK[Payment Kit]
    X402[x402 hire]
  end

  Human((Human)) --> IDKit --> Dapp --> GW
  Human -->|Slush QR| PK --> GW
  Agent((Agent)) -->|HTTP 402| X402 --> GW
  GW -->|PoH ok + paid| Dev
```

| Package | Job |
|---|---|
| [`asp-dapp`](asp-dapp) | Ticket + claim UI · World verify · Slush QR poll |
| [`asp-gateway`](asp-gateway) | Petitions · PoH gate · kiosk complete · x402 hire |
| [`asp-devices`](asp-devices) | ESP32 — one spin per authorized action |
| [`asp-sui-facilitator`](asp-sui-facilitator) | Sponsored gas when hire settles over x402 |
| [`@altaga/x402-sui`](https://www.npmjs.com/package/@altaga/x402-sui) | Exact Sui x402 schemes |

---

## Demo surfaces

| Route | Flow |
|---|---|
| `/` **Get ticket** | World PoH → `WIN-…` code |
| `/claim` **Claim** | Ticket → World confirm → Slush QR → motor |
| `/v1` **Backup** | World → Slush → motor (no pre-ticket) |

<div align="center">
  <img src="images/shot-ticket.png" alt="Get ticket" width="90%"/>
</div>
<div align="center"><i>World — Get ticket</i></div>

<br/>

<div align="center">
  <img src="images/shot-claim.png" alt="Claim capsule" width="90%"/>
</div>
<div align="center"><i>World + Sui — Claim</i></div>

<br/>

<div align="center">
  <img src="images/shot-demo.png" alt="Backup demo" width="90%"/>
</div>
<div align="center"><i>Backup — same gates, no pre-ticket</i></div>

---

<a id="world"></a>

# Sponsor 1 — World (IDKit)

### Why World is essential

Without World, any hot wallet can claim. Fair scarce access dies.

World is the **zk credential that ties ticket → claim → same human**:

- enroll (ticket) binds a nullifier to `WIN-…`
- claim re-verifies against World’s portal; nullifier must match
- deny / cancel / fail ⇒ **no pay, no motor** (fail-closed)

### End-to-end World flow

```mermaid
sequenceDiagram
  autonumber
  actor H as Human
  participant UI as asp-dapp
  participant IDKit as World IDKit
  participant API as dapp /api/world/*
  participant Portal as World /api/v4/verify
  participant GW as asp-gateway

  Note over H,GW: A · Get ticket (/)
  H->>UI: Confirm with World ID
  UI->>API: POST /api/world/rp-signature
  API-->>UI: RP signature
  UI->>IDKit: Selfie / uniqueness
  IDKit-->>UI: proof
  UI->>API: POST /api/world/enroll
  API->>Portal: verify(app_id|rp_id)
  Portal-->>API: success + nullifier
  API->>GW: POST /asp/winners/register (preverified)
  GW-->>UI: ticket WIN-…
  UI-->>H: show ticket

  Note over H,GW: B · Claim confirm (/claim)
  H->>UI: enter ticket + Start claim
  UI->>GW: POST /asp/petition → pending_human
  UI->>IDKit: same enroll action, signal=petition_id
  IDKit-->>UI: proof
  UI->>API: POST /api/world/poh-verify
  API->>Portal: verify
  Portal-->>API: nullifier
  API->>GW: POST /asp/proof-of-human/authorize-preverified
  GW-->>UI: petition authorized (or deny)
```

### Deny paths (product proof)

| Error | Effect |
|---|---|
| `world-verify-failed` | Portal reject → no authorize |
| `nullifier-mismatch` | Different human than signup → no pay |
| `already-claimed` / `claim-already-used` | Entitlement burned → motor idle |
| `signal-mismatch` | Proof not bound to this petition |
| cancelled / expired IDKit | Protected action never starts |

### Code — fail-closed verify

Gateway never trusts client `onSuccess` alone:

```1:4:asp-gateway/src/services/policy/pohVerify.js
/**
 * Fail-closed World ID verify. Never treat client onSuccess alone as auth.
 * World ID 4.0 docs: POST /api/v4/verify/{rp_id} with IDKit payload as-is.
 */
```

```31:46:asp-gateway/src/services/policy/pohVerify.js
export async function verifyWorldProof(idkitResponse, { expectedEnvironment, action, signal } = {}) {
  const rpId = (process.env.WORLD_RP_ID || process.env.EXPO_PUBLIC_WORLD_RP_ID || '').trim();
  const appId = (process.env.WORLD_APP_ID || process.env.EXPO_PUBLIC_WORLD_APP_ID || '').trim();
  // Official IDKit guide uses {rp_id}; some RPs verify with {app_id}. Try both.
  const verifyIds = [];
  if (rpId && rpId.startsWith('rp_')) verifyIds.push(rpId);
  if (appId && appId.startsWith('app_')) verifyIds.push(appId);
  if (verifyIds.length === 0) {
    return {
      verified: false,
      nullifier: null,
      session_id: null,
      raw: null,
      error: 'WORLD_RP_ID / WORLD_APP_ID not configured for verify',
    };
  }
```

### Code — nullifier → one ticket

```21:47:asp-gateway/src/services/policy/winners.js
export function enrollWinner({ nullifier, release_id = 'tokyo2026-capsule-v1' }) {
  const key = String(nullifier || '').toLowerCase();
  if (!key) return { ok: false, error: 'missing-nullifier' };

  const existingTicket = ticketByNullifier.get(key);
  if (existingTicket) {
    const existing = winnersByTicket.get(existingTicket);
    return {
      ok: true,
      already: true,
      winner: publicWinner(existing),
    };
  }

  const ticket = makeTicket();
  const record = {
    ticket,
    nullifier: key,
    release_id: String(release_id || 'tokyo2026-capsule-v1'),
    // ...
  };
  winnersByTicket.set(ticket, record);
  ticketByNullifier.set(key, ticket);
  return { ok: true, already: false, winner: publicWinner(record) };
}
```

### Code — dapp verifies, then gateway authorizes (preferred claim path)

Fresh staging token lives on the dapp; gateway receives a **preverified** authorize:

```1:4:asp-dapp/src/app/api/world/poh-verify+api.ts
/**
 * POST /api/world/poh-verify
 * Verify World proof on the dapp (fresh staging token + UA), then authorize on gateway.
 * Avoids gateway-side World verify (stale/missing WORLD_STAGING_VERIFICATION_TOKEN → 403).
 */
```

```132:155:asp-dapp/src/app/api/world/poh-verify+api.ts
    const verified = await verifyWithWorld(idkitResponse, action, signal);
    if (!verified.ok) {
      return Response.json(verified, { status: verified.status || 403 });
    }
    // ...
    const gwRes = await fetch(`${base}/asp/proof-of-human/authorize-preverified`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        petition_id,
        ticket: ticket || undefined,
        nullifier: verified.nullifier,
        session_id: verified.session_id || undefined,
        signal,
        preverified: true,
      }),
    });
```

### World file map

| File | Role |
|---|---|
| [`asp-dapp/src/features/world/WorldVerifyModal.tsx`](asp-dapp/src/features/world/WorldVerifyModal.tsx) | IDKit Selfie UI + RP signature |
| [`asp-dapp/src/app/api/world/rp-signature+api.ts`](asp-dapp/src/app/api/world/rp-signature+api.ts) | Server-only RP sign |
| [`asp-dapp/src/app/api/world/enroll+api.ts`](asp-dapp/src/app/api/world/enroll+api.ts) | Signup verify → register winner |
| [`asp-dapp/src/app/api/world/poh-verify+api.ts`](asp-dapp/src/app/api/world/poh-verify+api.ts) | Claim verify → authorize-preverified |
| [`asp-gateway/src/services/policy/pohVerify.js`](asp-gateway/src/services/policy/pohVerify.js) | Fail-closed portal verify |
| [`asp-gateway/src/services/policy/winners.js`](asp-gateway/src/services/policy/winners.js) | Ticket ↔ nullifier registry |
| [`asp-gateway/src/services/policy/store.js`](asp-gateway/src/services/policy/store.js) | Petition `pending_human` → `authorized` |
| [`asp-gateway/src/services/policy/routes.js`](asp-gateway/src/services/policy/routes.js) | `/asp/winners/*`, `/asp/proof-of-human/*` |

---

<a id="sui"></a>

# Sponsor 2 — Sui (DeFi & Payments)

### Why Sui is essential

Asp is a machine economy. Settlement has to live on a chain the booth can wait on — not a `paid=true` checkbox.

Sui is that rail, two doors into the same gateway:

| Door | Who | How |
|---|---|---|
| **x402 hire** | Agents / apps | `POST /asp/hire` → 402 challenge → facilitator gas → skill runs |
| **Payment Kit** | Human at the booth | Slush QR → `PaymentReceipt` → kiosk complete → motor |

Same policy gate on both: if the skill is PoH-locked, World must authorize first.  
*This* capsule is locked. So the sexy demo you run live is **human + Slush on Sui** — while x402 stays lit as how machines get hired when the skill allows it.

### End-to-end Sui kiosk pay → motor

```mermaid
sequenceDiagram
  autonumber
  actor H as Human phone
  participant PC as asp-dapp /claim
  participant API as dapp /api/kiosk/*
  participant GW as asp-gateway
  participant PK as Sui Payment Kit
  participant MQTT as MQTT broker
  participant HW as Feather

  Note over PC,GW: Petition already authorized by World
  PC->>API: POST /api/kiosk/checkout-intent
  API->>GW: create intent + Slush URIs
  GW-->>PC: nonce + slush://pay?…
  PC-->>H: show QR (PayQr)
  H->>PK: pay USDC in Slush
  loop poll until settled
    PC->>API: GET /api/kiosk/status?nonce=
    API->>GW: lookupPaymentRecord
    GW->>PK: suix_queryEvents PaymentReceipt
    PK-->>GW: event or null
  end
  PC->>API: POST /api/kiosk/complete
  API->>GW: POST /asp/kiosk/complete
  GW->>GW: re-check PaymentReceipt + assertHireAllowed
  GW->>MQTT: asp/passive/{id}/action
  MQTT->>HW: DISPENSE_ONCE
  HW-->>GW: receipt
  GW-->>PC: ok + digest
```

### Code — Slush deep link from Payment Kit URI

```27:55:asp-gateway/src/services/kiosk/paymentKit.js
export function buildSlushPayUrl({
  receiver,
  amount,
  coinType,
  nonce,
  label,
  message,
  registryName = DEFAULT_REGISTRY_NAME,
}) {
  const suiUri = createPaymentTransactionUri({
    receiverAddress: receiver,
    amount: BigInt(amount),
    coinType,
    nonce,
    label,
    message,
    registryName,
  });
  const query = String(suiUri).includes('?')
    ? String(suiUri).slice(String(suiUri).indexOf('?') + 1)
    : '';
  // Deep link opens Slush natively on phone; HTTPS is universal fallback.
  return {
    deepLink: `slush://pay?${query}`,
    webUrl: `https://my.slush.app/pay?${query}`,
    suiPay: String(suiUri),
    /** Primary for QR / open = deep link */
    payUrl: `slush://pay?${query}`,
  };
}
```

### Code — wait on real settlement (not `paid=true`)

```77:117:asp-gateway/src/services/kiosk/paymentKit.js
/**
 * Resolve Payment Kit settlement via PaymentReceipt events.
 * Avoids SuiGrpcClient — that path was crashing the host (Cloudflare 502) on complete.
 */
export async function lookupPaymentRecord({ nonce, amount, coinType, receiver, registryName }) {
  void coinType;
  void registryName;
  const eventType = `${PAYMENT_KIT_PACKAGE}::payment_kit::PaymentReceipt`;
  const result = await rpc('suix_queryEvents', [
    { MoveEventType: eventType },
    null,
    80,
    true,
  ]);
  // … match nonce (+ amount / receiver) → digest or null
  return null;
}
```

### Code — dispense is PoH-gated

```149:192:asp-gateway/src/services/policy/store.js
export function assertHireAllowed({ skill, body, skipRequesterMatch = false }) {
  // …
  if (petition.status !== 'authorized') {
    // pending_human / expired / revoked / denied → block dispense
```

`POST /asp/kiosk/complete` calls `assertHireAllowed` **before** MQTT fires the motor.

### Sui deny paths

| Signal | Meaning |
|---|---|
| `payment-not-found` | QR not settled yet — keep polling |
| `pending-human` | Tried to pay before World authorize |
| `assertHireAllowed` fail | Scope / expiry / claim already used |
| `esp32-no-receipt` (504) | Motor path timed out |
| `lab-intent-no-dispense` | Lab QR never runs the motor |

### Sui file map

| File | Role |
|---|---|
| [`asp-gateway/src/services/kiosk/paymentKit.js`](asp-gateway/src/services/kiosk/paymentKit.js) | Slush URI + `PaymentReceipt` lookup |
| [`asp-gateway/src/services/kiosk/routes.js`](asp-gateway/src/services/kiosk/routes.js) | `/asp/kiosk/intent`, `/complete`, `/dispense` |
| [`asp-dapp/src/app/api/kiosk/checkout-intent+api.ts`](asp-dapp/src/app/api/kiosk/checkout-intent+api.ts) | Checkout QR intent |
| [`asp-dapp/src/app/api/kiosk/status+api.ts`](asp-dapp/src/app/api/kiosk/status+api.ts) | Poll settlement |
| [`asp-dapp/src/app/api/kiosk/complete+api.ts`](asp-dapp/src/app/api/kiosk/complete+api.ts) | Complete → gateway dispense |
| [`asp-dapp/src/features/control/PayQr.tsx`](asp-dapp/src/features/control/PayQr.tsx) | QR UI |
| [`asp-dapp/src/features/control/useCheckoutFlow.ts`](asp-dapp/src/features/control/useCheckoutFlow.ts) | Claim state machine |

---

## Combined product loop

```mermaid
stateDiagram-v2
  [*] --> GetTicket: World PoH
  GetTicket --> HasTicket: WIN-…
  HasTicket --> Petition: enter ticket at kiosk
  Petition --> PendingHuman: skill requires PoH
  PendingHuman --> Authorized: World confirm + nullifier match
  PendingHuman --> Denied: mismatch / cancel / fail
  Authorized --> WaitingPay: Slush QR shown
  WaitingPay --> WaitingPay: poll PaymentReceipt
  WaitingPay --> Dispensing: complete + assertHireAllowed
  Dispensing --> Done: MQTT receipt
  Dispensing --> FailDevice: timeout
  Denied --> [*]
  Done --> [*]: claim burned
  FailDevice --> [*]
```

**Second claim with the same entitlement must fail.** That beat is the product.

---

## Partner map (ETHGlobal)

| Slot | Partner | What Asp proves in code |
|---|---|---|
| 1 | **World** | Fairness switch — ticket↔nullifier · same human at claim · no PoH, no spin |
| 2 | **Sui** | Money rail — x402 hire for machines · Payment Kit / Slush when the human pays the drop |

---

## Quick start

```bash
# UI
cd asp-dapp && npm install && npx expo start --web --port 8087
# → http://localhost:8087   /claim   /v1

# Gateway (separate terminal)
cd asp-gateway && cp .env.example .env   # fill keys locally — never commit
npm install && npm start
```

Env templates: [`asp-dapp/.env.example`](asp-dapp/.env.example) (if present), [`asp-gateway/.env.example`](asp-gateway/.env.example).  
Booth steps: [`SIMULATOR.md`](./SIMULATOR.md). Machine hire / x402 surface: [`AGENT.md`](./AGENT.md).

---

<div align="center">
  <sub>ETHGlobal Tokyo 2026 · World · Sui · AntiScalper Protocol</sub>
</div>
