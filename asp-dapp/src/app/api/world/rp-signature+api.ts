import { signRequest } from '@worldcoin/idkit/signing';

/**
 * Server-only RP signature for IDKit. Never expose WORLD_RP_SIGNING_KEY to the client.
 * Uniqueness requests: pass { action }.
 * Session create/prove: omit action (World ID 4.0 session proofs).
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || '').trim();
    const session = Boolean(body.session);

    if (!session && !action) {
      return Response.json({ error: 'missing-action' }, { status: 400 });
    }

    const signingKeyHex = (process.env.WORLD_RP_SIGNING_KEY || '').trim();
    const rpId = (process.env.WORLD_RP_ID || process.env.EXPO_PUBLIC_WORLD_RP_ID || '').trim();

    if (!signingKeyHex || !rpId) {
      return Response.json(
        {
          error: 'world-misconfigured',
          message:
            'WORLD_RP_SIGNING_KEY and WORLD_RP_ID must be set on the dapp server for Proof of Human.',
        },
        { status: 500 }
      );
    }

    const signed = session
      ? signRequest({ signingKeyHex, ttl: 300 })
      : signRequest({ signingKeyHex, action, ttl: 300 });

    return Response.json({
      rp_id: rpId,
      action: session ? null : action,
      session: session || false,
      nonce: signed.nonce,
      created_at: signed.createdAt,
      expires_at: signed.expiresAt,
      signature: signed.sig,
      sig: signed.sig,
    });
  } catch (e: any) {
    return Response.json(
      { error: 'rp-sign-failed', message: String(e?.message || e) },
      { status: 500 }
    );
  }
}
