import { getLabIntent, patchLabIntent } from '../../../features/kiosk/labStore';
import { lookupPaid } from '../../../features/kiosk/paymentLab';

/**
 * GET /api/kiosk/status?nonce=… — poll Payment Kit for a dapp-local pay intent.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const nonce = (url.searchParams.get('nonce') || '').trim();
    if (!nonce) {
      return Response.json({ ok: false, error: 'missing-nonce' }, { status: 400 });
    }

    let intent = getLabIntent(nonce);
    if (!intent) {
      return Response.json({ ok: false, error: 'intent-not-found' }, { status: 404 });
    }

    if (intent.status === 'pending') {
      try {
        const record = await lookupPaid(intent);
        if (record) {
          intent = patchLabIntent(nonce, {
            status: 'paid',
            paymentTransactionDigest: record.paymentTransactionDigest || null,
            paid_at: Date.now(),
          })!;
        }
      } catch (err: any) {
        console.warn('[kiosk/status] lookupPaid', err?.message || err);
      }
    }

    return Response.json({
      ok: true,
      intent: {
        nonce: intent.nonce,
        status: intent.status,
        payUrl: intent.payUrl,
        webUrl: intent.webUrl,
        amount: intent.amount,
        coinType: intent.coinType,
        receiver: intent.receiver,
        paymentTransactionDigest: intent.paymentTransactionDigest,
        petition_id: intent.petition_id || null,
      },
    });
  } catch (e: any) {
    return Response.json(
      { ok: false, error: 'status-failed', detail: String(e?.message || e) },
      { status: 500 }
    );
  }
}
