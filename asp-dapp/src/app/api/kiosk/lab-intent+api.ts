import { randomUUID } from 'crypto';
import { putLabIntent } from '../../../features/kiosk/labStore';
import {
  buildSlushPayLinks,
  DEFAULT_REGISTRY_NAME,
  LAB_AMOUNT,
  LAB_USDC,
  payReceiver,
} from '../../../features/kiosk/paymentLab';

/** POST /api/kiosk/lab-intent — Slush-only smoke test on the dapp server (no remote gateway). */
export async function POST(_request: Request): Promise<Response> {
  try {
    const receiver = payReceiver();
    const nonce = randomUUID();
    const links = buildSlushPayLinks({
      receiver,
      amount: LAB_AMOUNT,
      coinType: LAB_USDC,
      nonce,
      label: 'Asp lab',
    });

    const intent = putLabIntent({
      nonce,
      amount: LAB_AMOUNT,
      coinType: LAB_USDC,
      receiver,
      registryName: DEFAULT_REGISTRY_NAME,
      payUrl: links.deepLink,
      webUrl: links.webUrl,
      status: 'pending',
      paymentTransactionDigest: null,
      created_at: Date.now(),
      paid_at: null,
    });

    return Response.json(
      {
        ok: true,
        lab: true,
        via: 'dapp-api',
        nonce: intent.nonce,
        payUrl: intent.payUrl,
        deepLink: links.deepLink,
        webUrl: links.webUrl,
        amount: intent.amount,
        coinType: intent.coinType,
        receiver: intent.receiver,
        intent: {
          nonce: intent.nonce,
          status: intent.status,
          payUrl: intent.payUrl,
          webUrl: intent.webUrl,
          amount: intent.amount,
          coinType: intent.coinType,
          receiver: intent.receiver,
        },
      },
      { status: 201 }
    );
  } catch (e: any) {
    return Response.json(
      { ok: false, error: 'lab-intent-failed', detail: String(e?.message || e) },
      { status: 500 }
    );
  }
}
