/**
 * Mainnet x402 hire smoke — payment path only.
 * Uses gateway keypair as buyer (self-pay 2000 USDC base units).
 * Does NOT print secrets.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { x402Client, x402HTTPClient, ExactSuiClientScheme } from '@altaga/x402-sui';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const procPath = path.resolve(__dirname, '../../VM/process.json');
const proc = JSON.parse(fs.readFileSync(procPath, 'utf8'));
const asp = proc.apps.find((a) => a.name === 'Asp-Mainnet-Gateway');
if (!asp?.env?.GATEWAY_PRIVATE_KEY) {
  console.error('Asp-Mainnet-Gateway env missing in process.json');
  process.exit(1);
}

const keypair = Ed25519Keypair.fromSecretKey(asp.env.GATEWAY_PRIVATE_KEY);
const buyer = keypair.getPublicKey().toSuiAddress();
const HIRE = 'https://gateway.example.com/asp/hire';
const FACILITATOR = 'https://facilitator.example.com';

const suiClient = new SuiGrpcClient({
  network: 'mainnet',
  baseUrl: 'https://fullnode.mainnet.sui.io:443',
});

const core = new x402Client().register(
  'exact:sui:mainnet',
  new ExactSuiClientScheme(suiClient, keypair)
);
const client = new x402HTTPClient(core);

const petition = {
  tx_id: `tx_live_${Date.now()}`,
  requester: buyer,
  target_hardware_id: 'Sub_A7C440A00001',
  command: ['DISPENSE_ONCE'],
};

console.log('Buyer/payTo wallet:', buyer);
console.log('POST', HIRE);
console.log('Petition:', JSON.stringify(petition));

const initial = await fetch(HIRE, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(petition),
});

console.log('Initial status:', initial.status);
if (initial.status !== 402) {
  console.error('Expected 402, got:', await initial.text());
  process.exit(1);
}

const paymentRequired = client.getPaymentRequiredResponse(
  (name) => initial.headers.get(name),
  await initial.json()
);
const acc = paymentRequired.accepts[0];
console.log('Challenge:', {
  network: acc.network,
  amount: acc.amount,
  asset: acc.asset?.slice(0, 20) + '…',
  payTo: acc.payTo,
  feePayer: acc.feePayer,
});

console.log('Creating sponsored payment via', FACILITATOR);
const paymentPayload = await client.createPaymentPayload(paymentRequired);
console.log('Payment payload created (buyer+sponsor signatures)');

const paid = await fetch(HIRE, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    ...client.encodePaymentSignatureHeader(paymentPayload),
  },
  body: JSON.stringify(petition),
});

const settlement = client.getPaymentSettleResponse((name) => paid.headers.get(name));
const text = await paid.text();
let json;
try {
  json = JSON.parse(text);
} catch {
  json = { raw: text.slice(0, 500) };
}

console.log('Paid status:', paid.status);
console.log('Settlement header digest:', settlement?.transactionDigest || settlement || '(none)');
console.log('Body.transaction:', json.transaction || '(none)');
console.log('Body.ok:', json.ok);
console.log('Body.error:', json.error || '(none)');
console.log('Body.detail:', json.detail || '(none)');
if (json.message) console.log('Body.message:', json.message);

if (settlement?.transactionDigest || json.transaction) {
  const dig = settlement?.transactionDigest || json.transaction;
  console.log('✅ ON-CHAIN SETTLE OK:', dig);
  console.log('Explorer: https://suiscan.xyz/mainnet/tx/' + dig);
  process.exit(0);
}

console.error('❌ No settlement digest — payment path failed');
console.error(JSON.stringify(json, null, 2).slice(0, 1500));
process.exit(1);
