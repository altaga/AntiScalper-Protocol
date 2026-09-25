# AGENT.md: Asp System Deep Dive

For AI agents (and developers) reviewing the architecture, here is a precise breakdown of every major module and its critical files, along with the live production infrastructure endpoints. This repository also includes the **simulator packages** (`*-simulator`) which provide a fully functional Testnet reflection of the Mainnet architecture for safe testing.

## Technology Stack & Packages

Before diving into the modules, here is the core technology stack and standard packages powering the Asp ecosystem:
- **Blockchain & Economics**: [Sui Network](https://sui.io/) (Mainnet for production, Testnet for simulators), `@mysten/sui` TypeScript SDK, and our custom `@altaga/x402-sui` SDK for L402 payment negotiation.
- **Decentralized Storage**: [Walrus Network](https://walrus.xyz/) (used to store immutable hardware telemetry receipts).
- **AI & Orchestration**: AWS Bedrock (`us.meta.llama3-2-90b-instruct-v1:0` / Llama Maverick) for the cloud DApp agent, and [Ollama](https://ollama.com/) (`qwen2.5-coder:7b`) for localized edge AI nodes.
- **IoT & Networking**: MQTT over WebSockets (`mqtt.js`, custom `asp-ws` broker), and C++ Arduino Core for physical microcontrollers (ESP32 / M5Stack).
- **Backend Infrastructure**: Node.js, Express.js.
- **Frontend & Simulators**: React Native, Expo Router, NativeWind (Tailwind CSS).

---

## Module & File Breakdown

### A. `@altaga/x402-sui` (The Core Protocol SDK)
This is the foundational package that implements the x402 standard specifically for the Sui blockchain. It handles all the heavy lifting for PTB creation, gas sponsorship, and on-chain settlement.

**Full API documentation:** [npmjs.com/package/@altaga/x402-sui](https://www.npmjs.com/package/@altaga/x402-sui)

```bash
npm install @altaga/x402-sui
```

**Key Exports:**
- **`x402ResourceServer`**: Generates the `402 Payment Required` challenge payloads on the Gateway.
- **`x402Client`** / **`x402HTTPClient`**: Interprets 402 challenges and constructs PTB logic for Node.js agents.
- **`ExactSuiDappScheme`**: Browser-side scheme — integrates with connected Sui wallets (e.g., Suiet, Slush) to sign PTBs directly.
- **`x402Facilitator`** / **`ExactSuiFacilitatorScheme`**: Gas-sponsorship logic for the Facilitator service to dual-sign PTBs.
- **`ExactSuiServerScheme`**: Server-side verifier that unpacks and settles the signed payload on-chain.

---

### B. [`asp-gateway`](asp-gateway) (The x402 Barrier & Router)
Node.js + Express service. The x402 enforcement layer and MQTT protocol bridge.

- **[`src/index.js`](asp-gateway/src/index.js)**: Main entry point. Boots the HTTP server, MQTT broker, Walrus publisher, and Sui event listener.
- **[`src/app.js`](asp-gateway/src/app.js)**: Express app factory — registers all x402 routes.
- **[`src/services/settings/settings.js`](asp-gateway/src/services/settings/settings.js)**: Loads and validates [`config/devices.json`](asp-gateway/config/devices.json) at startup.
- **[`src/services/x402/routes.js`](asp-gateway/src/services/x402/routes.js)**: Exposes `POST /asp/hire` (x402 barrier) and `GET /asp/agent-guide.json` (dynamic schema).
- **[`src/services/dispatch/dispatcher.js`](asp-gateway/src/services/dispatch/dispatcher.js)**: Execution engine — publishes MQTT commands and waits for hardware receipts with timeout handling.
- **[`src/services/mqtt/broker.js`](asp-gateway/src/services/mqtt/broker.js)**: Manages the MQTT WebSocket connection and inbound telemetry routing.
- **[`src/services/walrus/publisher.js`](asp-gateway/src/services/walrus/publisher.js)**: Uploads MQTT receipts to Walrus in parallel with HTTP responses.
- **[`src/services/sui/listener.js`](asp-gateway/src/services/sui/listener.js)**: Listens to on-chain Sui events and dispatches MQTT commands from blockchain triggers.

**Device Registry ([`config/devices.json`](asp-gateway/config/devices.json)):**

All connected devices are defined in [`config/devices.json`](asp-gateway/config/devices.json). Each device entry specifies its `id`, `type` (`PASSIVE` or `ACTIVE`), USDC `price` per call, and its list of `capabilities` (commands). The Gateway auto-generates the `agent-guide.json` from this file dynamically at runtime.

---

### C. [`asp-dapp`](asp-dapp) (The Production Orchestrator UI)
Expo (React Native Web) application deployed via EAS. Connects a Sui wallet and orchestrates the full Agentic loop on **Mainnet**.

- **[`src/app/api/agent+api.ts`](asp-dapp/src/app/api/agent+api.ts)**: AWS Bedrock (Meta Llama 4 Maverick) LLM orchestration loop. Implements `DISCOVER_SKILLS` dynamic schema injection and multi-turn tool call resolution.
- **[`src/app/index.tsx`](asp-dapp/src/app/index.tsx)**: Main UI. Renders the Direct Control tab and the Agentic chat interface. Integrates `ExactSuiDappScheme` for browser wallet x402 signing.
- **[`src/app/_layout.tsx`](asp-dapp/src/app/_layout.tsx)**: Provider setup — `SuiClientProvider` (Mainnet), `WalletProvider`, `QueryClientProvider`.

---

### D. [`asp-sui-facilitator`](asp-sui-facilitator) (The Gas Station)
Minimal Node.js + Express microservice. Acts as the gas station for sponsored Sui transactions on **Mainnet**.

- **[`index.mjs`](asp-sui-facilitator/index.mjs)**: Exposes three endpoints:
  - `POST /sponsor` — Builds and co-signs the PTB with the facilitator keypair.
  - `POST /verify` — Validates a submitted payment payload.
  - `POST /settle` — Executes the final on-chain settlement.

Setup:
```bash
cd asp-sui-facilitator
npm install
cp .env.example .env   # Set FACILITATOR_PRIVATE_KEY
npm start
# Runs on port 8085 by default
```

---

### E. [`asp-devices`](asp-devices) (The Physical Edge)

#### Passive Node ([`asp-passive-node/`](asp-devices/asp-passive-node))
Arduino/C++ firmware for M5Stack or ESP32 devices.

- **[`Asp_Passive_Node.ino`](asp-devices/asp-passive-node/Asp_Passive_Node.ino)**: Main sketch. Connects to MQTT and routes incoming commands to hardware actuators.
- **[`MQTTManager.h`](asp-devices/asp-passive-node/MQTTManager.h)**: Handles MQTT connection, authentication (JWT), subscription, and reconnection logic.
- **[`AspNode.h`](asp-devices/asp-passive-node/AspNode.h)**: Command router — maps MQTT command strings to physical hardware actions (LEDs, buzzer, IMU reads, etc.).
- **[`AspOS.h`](asp-devices/asp-passive-node/AspOS.h)**: Device operating system abstraction — hardware initialization and pin management.
- **[`creds.h`](asp-devices/asp-passive-node/creds.h)**: WiFi and MQTT credentials (**excluded from repo** via `.gitignore`).

#### Active Node ([`asp-active-node/`](asp-devices/asp-active-node))
Node.js daemon for Jetson Nano or any Linux device with a local Ollama instance.

- **[`index.js`](asp-devices/asp-active-node/index.js)**: Connects to MQTT, subscribes to `asp/active/{DEVICE_ID}/intent`, forwards prompts to local Ollama (`qwen2.5-coder:7b`), and publishes results to `asp/active/{DEVICE_ID}/receipt`.

Setup:
```bash
cd asp-devices/asp-active-node
npm install
cp .env.example .env   # Set MQTT_BROKER_URL, MQTT_BROKER_JWT, DEVICE_ID
node index.js
# Requires Ollama running locally with qwen2.5-coder:7b pulled
```

---

### F. [`asp-ws`](asp-ws) (MQTT WebSocket Broker)
A custom WebSocket-to-MQTT bridge built with `ws` and `mqtt-packet`. Acts as the lightweight MQTT broker layer for the gateway when running locally, supporting JWT-authenticated client connections.

- **[`index.js`](asp-ws/index.js)**: Main broker — validates JWT tokens, routes MQTT packets between clients, and manages pub/sub state.

---

### G. [`x402-examples`](x402-examples) (Standalone Node.js Testing)
Pure Node.js boilerplate scripts for testing the x402 payment flow without any UI or Expo dependency.

- **[`Buyer/index.mjs`](x402-examples/Buyer/index.mjs)**: Simulates an Agent (`x402HTTPClient`) hitting an x402-protected seller endpoint. Reads `BUYER_SECRET` from `.env`.
- **[`Facilitator/index.mjs`](x402-examples/Facilitator/index.mjs)**: Runs a local Facilitator Gas Station on port `8085`. Reads `FACILITATOR_PRIVATE_KEY` from `.env`.
- **[`Seller/index.mjs`](x402-examples/Seller/index.mjs)**: Runs a minimal x402-protected Express server on port `4021` that returns `premium-data` after a verified payment.

Setup:
```bash
cd x402-examples
npm install
# Create Buyer/.env and Facilitator/.env from their respective .env.example files
# Run each service in a separate terminal:
node Facilitator/index.mjs   # Terminal 1
node Seller/index.mjs        # Terminal 2
node Buyer/index.mjs         # Terminal 3
```

### H. Simulators (The Testnet Sandbox)

A set of mirror packages deployed strictly on **Sui Testnet** that replicate the Mainnet hardware infrastructure.

- **[`asp-dapp-simulator`](asp-dapp-simulator)**: The unified Digital Twin interface. Combines the DApp Orchestrator logic with an integrated 3D WebGL robotic arm twin that receives MQTT intents and publishes Walrus receipts.
- **[`asp-gateway-simulator`](asp-gateway-simulator)**: A mirrored Gateway routing Testnet transactions.
- **[`asp-sui-facilitator-simulator`](asp-sui-facilitator-simulator)**: A mirrored gas station sponsoring Testnet transactions.

---

## Live Infrastructure Endpoints

All Testnet simulation services are **deployed and live**. Open these URLs directly in your browser to inspect the running system.

### Simulator Gateway — `gateway.example.com`

| Endpoint | Link | Returns |
|---|---|---|
| Health | `GET` [/asp/health](https://gateway.example.com/asp/health) | `{ok, gateway_address, uptime}` |
| Status | `GET` [/asp/status](https://gateway.example.com/asp/status) | Broker state, supervised device count, in-flight requests |
| Agent Guide | `GET` [/asp/agent-guide.json](https://gateway.example.com/asp/agent-guide.json) | Full live LLM-readable device schema (hardware targets, commands, pricing) |

### Sui Facilitator — `facilitator.example.com`

| Endpoint | Link | Returns |
|---|---|---|
| Health | `GET` [/health](https://facilitator.example.com/health) | `{"status":"ok"}` |
| Sponsor | `POST` [/sponsor](https://facilitator.example.com/sponsor) | Co-signed PTB (called automatically by DApp) |
| Settle | `POST` [/settle](https://facilitator.example.com/settle) | On-chain Testnet settlement (called automatically by DApp) |

 **[Full Simulator Setup & Testing Guide → SIMULATOR.md](./SIMULATOR.md)**
