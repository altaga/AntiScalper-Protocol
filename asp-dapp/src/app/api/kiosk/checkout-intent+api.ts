import { randomUUID } from 'crypto';
import { putLabIntent } from '../../../features/kiosk/labStore';
import {
  buildSlushPayLinks,
  DEFAULT_REGISTRY_NAME,
  LAB_AMOUNT,
  LAB_USDC,
  payReceiver,
} from '../../../features/kiosk/paymentLab';

type Body = {
  petition_id?: string;
  label?: string;
  message?: string;
};

/**
 * POST /api/kiosk/checkout-intent
 * Same Slush deep-link QR as lab, but bound to an authorized petition for full checkout.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json().catch(() => ({}))) as Body;
    const petition_id =
      typeof body.petition_id === 'string' && body.petition_id.trim()
        ? body.petition_id.trim()
        : null;
    if (!petition_id) {
      return Response.json({ ok: false, error: 'missing-petition_id' }, { status: 400 });
    }

    const receiver = payReceiver();
    const nonce = randomUUID();
    const links = buildSlushPayLinks({
      receiver,
      amount: LAB_AMOUNT,
      coinType: LAB_USDC,
      nonce,
      label: body.label || 'Asp capsule',
      message: body.message || `Petition ${petition_id}`,
    });

    const intent = putLabIntent({
      nonce,
      amount: LAB_AMOUNT,
      coinType: LAB_USDC,
      receiver,
      registryName: DEFAULT_REGISTRY_NAME,
      payUrl: links.deepLink,
      webUrl: links.webUrl,
      petition_id,
      status: 'pending',
      paymentTransactionDigest: null,
      created_at: Date.now(),
      paid_at: null,
    });

    return Response.json(
      {
        ok: true,
        via: 'dapp-api',
        nonce: intent.nonce,
        payUrl: intent.payUrl,
        deepLink: links.deepLink,
        webUrl: links.webUrl,
        amount: intent.amount,
        coinType: intent.coinType,
        receiver: intent.receiver,
        petition_id,
        intent: {
          nonce: intent.nonce,
          status: intent.status,
          payUrl: intent.payUrl,
          webUrl: intent.webUrl,
          amount: intent.amount,
          coinType: intent.coinType,
          receiver: intent.receiver,
          petition_id,
        },
      },
      { status: 201 }
    );
  } catch (e: any) {
    return Response.json(
      { ok: false, error: 'checkout-intent-failed', detail: String(e?.message || e) },
      { status: 500 }
    );
  }
}
