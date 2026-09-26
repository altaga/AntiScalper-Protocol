/**
 * Slush Payment Kit lab helpers — no @mysten/payment-kit (keeps Metro + @mysten/sui stable).
 */

export const LAB_USDC =
  '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';
export const LAB_AMOUNT = '2000';
export const DEFAULT_REGISTRY_NAME = 'default-payment-registry';

/** Mainnet Payment Kit package (from @mysten/payment-kit constants). */
const PAYMENT_KIT_PACKAGE =
  '0xbc126f1535fba7d641cb9150ad9eae93b104972586ba20f3c60bfe0e53b69bc6';

const RPC_URLS = [
  'https://rpc-mainnet.suiscan.xyz',
  'https://mainnet.sui.rpcpool.com',
  'https://fullnode.mainnet.sui.io:443',
];

export function payReceiver(): string {
  return (
    process.env.KIOSK_PAY_RECEIVER ||
    process.env.EXPO_PUBLIC_KIOSK_PAY_RECEIVER ||
    process.env.GATEWAY_ADDRESS ||
    '0x4fd0bb1b499dd9a00b757a26cf3a49ea0cf207e4732d9901e70f94a76cffe4de'
  ).trim();
}

/** Build Slush deep link (opens app) + HTTPS universal fallback. */
export function buildSlushPayLinks(params: {
  receiver: string;
  amount: string;
  coinType: string;
  nonce: string;
  label: string;
  message: string;
  registryName?: string;
}) {
  const q = new URLSearchParams({
    receiver: params.receiver,
    amount: String(params.amount),
    coinType: params.coinType,
    nonce: params.nonce,
    registry: params.registryName || DEFAULT_REGISTRY_NAME,
    label: params.label,
    message: params.message,
  });
  const query = q.toString();
  return {
    /** Custom scheme — opens Slush natively when installed (best for phone QR). */
    deepLink: `slush://pay?${query}`,
    /** Universal HTTPS link — app if installed, else Slush web. */
    webUrl: `https://my.slush.app/pay?${query}`,
    /** Payment Kit protocol URI. */
    suiPay: `sui:pay?${query}`,
  };
}

/** Primary pay URL for QR = Slush deep link. */
export function buildSlushPayUrl(params: Parameters<typeof buildSlushPayLinks>[0]) {
  return buildSlushPayLinks(params).deepLink;
}

async function rpc(method: string, params: unknown[]) {
  let lastErr: any;
  for (const url of RPC_URLS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error.message || JSON.stringify(json.error));
      return json.result;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('RPC failed');
}

/**
 * Look for a PaymentReceipt event matching this lab nonce.
 * Returns digest if found.
 */
export async function lookupPaid(intent: {
  nonce: string;
  amount: string;
  coinType: string;
  receiver: string;
}): Promise<{ paymentTransactionDigest: string } | null> {
  const eventType = `${PAYMENT_KIT_PACKAGE}::payment_kit::PaymentReceipt`;
  const result = await rpc('suix_queryEvents', [
    { MoveEventType: eventType },
    null,
    50,
    true, // descending — newest first
  ]);

  const data = Array.isArray(result?.data) ? result.data : [];
  for (const ev of data) {
    const pj = ev?.parsedJson || ev?.parsed_json || {};
    const nonce = String(pj.nonce ?? pj.payment_nonce ?? '');
    const receiver = String(pj.receiver ?? pj.recipient ?? '').toLowerCase();
    const amount = String(pj.payment_amount ?? pj.amount ?? '');
    if (nonce === intent.nonce) {
      const digest = ev.id?.txDigest || ev.id?.tx_digest || null;
      if (amount && amount !== String(intent.amount)) continue;
      if (receiver && receiver !== intent.receiver.toLowerCase()) continue;
      return { paymentTransactionDigest: digest || '' };
    }
  }
  return null;
}
