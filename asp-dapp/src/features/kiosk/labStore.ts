/**
 * In-memory kiosk / checkout pay intents (Expo server process).
 * Same path that proved Slush QR + Payment Kit poll in lab.
 */

export type LabIntent = {
  nonce: string;
  amount: string;
  coinType: string;
  receiver: string;
  registryName: string;
  /** Slush deep link (slush://pay?…) — primary for QR. */
  payUrl: string;
  /** HTTPS universal fallback. */
  webUrl?: string;
  /** Checkout petition (null for lab-only smoke). */
  petition_id?: string | null;
  status: 'pending' | 'paid' | 'dispensed';
  paymentTransactionDigest: string | null;
  created_at: number;
  paid_at: number | null;
  dispensed_at?: number | null;
  receipt?: unknown;
  tx_id?: string | null;
  payer?: string | null;
};

const g = globalThis as typeof globalThis & { __aspKioskLabIntents?: Map<string, LabIntent> };

function map() {
  if (!g.__aspKioskLabIntents) g.__aspKioskLabIntents = new Map();
  return g.__aspKioskLabIntents;
}

export function putLabIntent(intent: LabIntent) {
  map().set(intent.nonce, intent);
  return intent;
}

export function getLabIntent(nonce: string) {
  return map().get(nonce) || null;
}

export function patchLabIntent(nonce: string, patch: Partial<LabIntent>) {
  const cur = map().get(nonce);
  if (!cur) return null;
  Object.assign(cur, patch);
  return cur;
}
