/**
 * In-memory kiosk payment intents (hackathon). Restart clears state.
 * Unique nonce → Slush Payment Kit pay link; PC polls until paid, then dispenses.
 */

const intents = new Map(); // nonce → intent

function nowMs() {
  return Date.now();
}

export function createIntent(record) {
  intents.set(record.nonce, record);
  return record;
}

export function getIntent(nonce) {
  return intents.get(nonce) || null;
}

export function updateIntent(nonce, patch) {
  const intent = intents.get(nonce);
  if (!intent) return null;
  Object.assign(intent, patch, { updated_at: nowMs() });
  return intent;
}

export function clearIntents() {
  const n = intents.size;
  intents.clear();
  return n;
}

export function publicIntent(intent) {
  if (!intent) return null;
  return {
    nonce: intent.nonce,
    petition_id: intent.petition_id,
    status: intent.status,
    amount: intent.amount,
    coinType: intent.coinType,
    receiver: intent.receiver,
    registryName: intent.registryName,
    payUrl: intent.payUrl,
    webUrl: intent.webUrl || null,
    paymentTransactionDigest: intent.paymentTransactionDigest || null,
    payer: intent.payer || null,
    receipt: intent.receipt || null,
    tx_id: intent.tx_id || null,
    created_at: intent.created_at,
    paid_at: intent.paid_at || null,
    dispensed_at: intent.dispensed_at || null,
  };
}
