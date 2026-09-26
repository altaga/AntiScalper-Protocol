import {
  createPaymentTransactionUri,
  DEFAULT_REGISTRY_NAME,
} from '@mysten/payment-kit';

const NETWORK = process.env.SUI_NETWORK === 'testnet' ? 'testnet' : 'mainnet';

/** Mainnet Payment Kit package (matches @mysten/payment-kit). */
const PAYMENT_KIT_PACKAGE =
  process.env.PAYMENT_KIT_PACKAGE ||
  '0xbc126f1535fba7d641cb9150ad9eae93b104972586ba20f3c60bfe0e53b69bc6';

const RPC_URLS =
  NETWORK === 'testnet'
    ? [
        process.env.SUI_RPC_URL,
        'https://fullnode.testnet.sui.io:443',
        'https://rpc-testnet.suiscan.xyz',
      ].filter(Boolean)
    : [
        process.env.SUI_RPC_URL,
        'https://rpc-mainnet.suiscan.xyz',
        'https://mainnet.sui.rpcpool.com',
        'https://fullnode.mainnet.sui.io:443',
      ].filter(Boolean);

export function buildSlushPayUrl({
  receiver,
  amount,
  coinType,
  nonce,
  label,
  message,
  registryName = DEFAULT_REGISTRY_NAME,
}) {
  const shortLabel = typeof label === 'string' && label.trim() ? label.trim().slice(0, 24) : undefined;
  const shortMessage =
    typeof message === 'string' && message.trim() ? message.trim().slice(0, 40) : undefined;
  const uriArgs = {
    receiverAddress: receiver,
    amount: BigInt(amount),
    coinType,
    nonce,
    registryName,
  };
  if (shortLabel) uriArgs.label = shortLabel;
  if (shortMessage) uriArgs.message = shortMessage;

  const suiUri = createPaymentTransactionUri(uriArgs);
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

async function rpc(method, params) {
  let lastErr;
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
  throw lastErr || new Error('Sui RPC failed');
}

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

  const data = Array.isArray(result?.data) ? result.data : [];
  const wantNonce = String(nonce);
  const wantReceiver = String(receiver || '').toLowerCase();
  const wantAmount = amount != null ? String(amount) : '';

  for (const ev of data) {
    const pj = ev?.parsedJson || ev?.parsed_json || {};
    const evNonce = String(pj.nonce ?? pj.payment_nonce ?? '');
    if (evNonce !== wantNonce) continue;

    const evReceiver = String(pj.receiver ?? pj.recipient ?? '').toLowerCase();
    const evAmount = String(pj.payment_amount ?? pj.amount ?? '');
    if (wantAmount && evAmount && evAmount !== wantAmount) continue;
    if (wantReceiver && evReceiver && evReceiver !== wantReceiver) continue;

    const digest = ev.id?.txDigest || ev.id?.tx_digest || null;
    return {
      nonce: evNonce,
      amount: evAmount || wantAmount,
      receiver: evReceiver || wantReceiver,
      paymentTransactionDigest: digest,
      event: ev,
    };
  }

  return null;
}

export { DEFAULT_REGISTRY_NAME };
