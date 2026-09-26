/**
 * POST /api/kiosk/complete
 * Browser → local Metro (no CORS) → gateway /asp/kiosk/complete.
 * Also re-checks PaymentReceipt via the proven lab RPC path before asking the motor to run.
 */
import { lookupPaid } from '../../../features/kiosk/paymentLab';

const GATEWAY =
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_GATEWAY_URL) ||
  'https://gateway.example.com';

type Body = {
  petition_id?: string;
  nonce?: string;
  amount?: string;
  coinType?: string;
  receiver?: string;
  payer?: string;
  payUrl?: string;
};

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json().catch(() => ({}))) as Body;
    const petition_id = typeof body.petition_id === 'string' ? body.petition_id.trim() : '';
    const nonce = typeof body.nonce === 'string' ? body.nonce.trim() : '';
    const amount = body.amount != null ? String(body.amount) : '';
    const coinType = typeof body.coinType === 'string' ? body.coinType.trim() : '';
    const receiver = typeof body.receiver === 'string' ? body.receiver.trim() : '';

    if (!petition_id || !nonce || !amount || !coinType || !receiver) {
      return Response.json(
        {
          ok: false,
          error: 'missing-fields',
          expected: ['petition_id', 'nonce', 'amount', 'coinType', 'receiver'],
        },
        { status: 400 }
      );
    }

    // Confirm on-chain before hitting gateway (same path as lab poll).
    const paid = await lookupPaid({ nonce, amount, coinType, receiver });
    if (!paid) {
      return Response.json(
        {
          ok: false,
          error: 'payment-not-found',
          detail: 'No Payment Kit receipt for this nonce yet.',
        },
        { status: 402 }
      );
    }

    const base = String(GATEWAY).replace(/\/$/, '');
    const res = await fetch(`${base}/asp/kiosk/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        petition_id,
        nonce,
        amount,
        coinType,
        receiver,
        payer: body.payer,
        payUrl: body.payUrl,
      }),
    });

    const text = await res.text();
    let data: any = {};
    try {
      data = JSON.parse(text);
    } catch {
      data = {
        ok: false,
        error: 'gateway-non-json',
        detail: text.slice(0, 400),
        status: res.status,
      };
    }

    if (!res.ok) {
      return Response.json(
        {
          ok: false,
          error: data?.error || `gateway-${res.status}`,
          detail: data?.detail || data?.message || text.slice(0, 400),
          paymentTransactionDigest: paid.paymentTransactionDigest || null,
        },
        { status: res.status >= 400 ? res.status : 502 }
      );
    }

    return Response.json({
      ...data,
      paymentTransactionDigest:
        data?.transaction || paid.paymentTransactionDigest || null,
    });
  } catch (e: any) {
    return Response.json(
      { ok: false, error: 'complete-proxy-failed', detail: String(e?.message || e) },
      { status: 500 }
    );
  }
}
