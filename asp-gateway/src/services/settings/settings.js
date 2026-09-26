import 'dotenv/config';
import { readFileSync } from 'node:fs';

import { gatewayAuth } from '../mqtt/gatewayAuth.js';
import { gatewayWallet } from '../sui/wallet.js';

function readJson(pathFromHere) {
  const url = new URL(pathFromHere, import.meta.url);
  const raw = readFileSync(url, 'utf8').replace(/^\uFEFF/, '');
  return JSON.parse(raw);
}

const HTTP_HOST = process.env.ASP_GW_HOST || '0.0.0.0';
const HTTP_PORT = Number(process.env.ASP_GW_HTTP_PORT || 4790);
const FACILITATOR_URL = process.env.FACILITATOR_URL || 'http://localhost:8085';

const WALRUS_PUBLISHER_URL = process.env.WALRUS_PUBLISHER_URL || '';
const WALRUS_STORE_ENDPOINT =
  process.env.WALRUS_STORE_ENDPOINT || `${WALRUS_PUBLISHER_URL}/v1/blobs?epochs=1`;

const devicesRaw = readJson('../../../config/devices.json');

const skills = [];
for (const dev of devicesRaw) {
  for (const cap of dev.capabilities) {
    skills.push({
      ...cap,
      type: dev.type,
      execution_model: dev.type === 'ACTIVE' ? 'AGENTIC' : 'DETERMINISTIC',
      target_hardware_id: dev.id,
      price: String(cap.price !== undefined ? cap.price : (dev.price || '')),
      token: typeof dev.token === 'string' ? dev.token.trim() : '',
      asset: typeof dev.token === 'string' ? dev.token.trim() : '',
      proof_of_human: cap.proof_of_human || null,
      device_name: dev.name,
      device_description: dev.description,
    });
  }
}

const devices = devicesRaw.map(dev => ({
  id: dev.id,
  domain: dev.type === 'ACTIVE' ? 'active' : 'passive',
  name: dev.name,
  description: dev.description,
  type: dev.type,
  capabilities: dev.capabilities
}));

export const settings = {
  http: { host: HTTP_HOST, port: HTTP_PORT },
  facilitator: { url: FACILITATOR_URL },
  mqtt: { brokerUrl: process.env.MQTT_BROKER_URL || '' },
  sui: {
    rpcUrl: process.env.SUI_RPC_URL || '',
    privateKey: process.env.GATEWAY_PRIVATE_KEY || '',
    keypair: gatewayWallet.keypair,
    address: process.env.GATEWAY_ADDRESS || gatewayWallet.address,
  },
  walrus: { publisherUrl: WALRUS_PUBLISHER_URL, storeEndpoint: WALRUS_STORE_ENDPOINT },
  gateway: { id: gatewayAuth.id, role: gatewayAuth.role, jwt: gatewayAuth.jwt },
  devices,
  skills,
};
