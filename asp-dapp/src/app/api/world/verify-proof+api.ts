/**
 * Isolated World proof verify for the Lab tab (Selfie / uniqueness path).
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json().catch(() => ({}));
    const proof = body.proof ?? body.idkitResponse ?? body.result ?? null;
    const action = String(body.action || (proof as any)?.action || '').trim();
    const signal = body.signal ?? (proof as any)?.signal ?? '';

    if (!proof || typeof proof !== 'object') {
      return Response.json({ ok: false, error: 'missing-proof' }, { status: 400 });
    }

    // Verify against app_id (WORLD_APP_ID), not rp_id.
    const appId = (
      process.env.WORLD_APP_ID ||
      process.env.EXPO_PUBLIC_WORLD_APP_ID ||
      process.env.WORLD_RP_ID ||
      process.env.EXPO_PUBLIC_WORLD_RP_ID ||
      ''
    ).trim();
    if (!appId) {
      return Response.json(
        { ok: false, error: 'WORLD_APP_ID missing on dapp server' },
        { status: 500 }
      );
    }

    // Bare Node fetch without User-Agent gets HTML 403 from World edge.
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'Asp-World-Lab/1.0',
    };
    const stagingToken = (process.env.WORLD_STAGING_VERIFICATION_TOKEN || '').trim();
    // Production RP with staging/sandbox proofs → window token required.
    if (stagingToken) {
      headers['x-staging-verification-token'] = stagingToken;
    } else {
      console.warn('[world/verify-proof] WORLD_STAGING_VERIFICATION_TOKEN missing');
    }

    const envName = (process.env.EXPO_PUBLIC_WORLD_ENVIRONMENT || process.env.WORLD_ENVIRONMENT || '')
      .trim()
      .toLowerCase();

    const url = `https://developer.world.org/api/v4/verify/${encodeURIComponent(appId)}`;
    const payload = {
      ...proof,
      action: action || (proof as any).action || 'asp-release-tokyo2026-capsule-v1',
      signal: signal || '',
      verification_level: (proof as any).verification_level || 'device',
    };

    console.log(
      '[world/verify-proof] POST',
      url,
      'env=',
      envName,
      'token=',
      stagingToken ? 'yes' : 'no',
      'action=',
      payload.action
    );

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    const rawText = await response.text();
    console.log('[world/verify-proof] status', response.status, rawText.slice(0, 500));

    let raw: any = null;
    try {
      raw = rawText ? JSON.parse(rawText) : null;
    } catch {
      return Response.json(
        {
          ok: false,
          verified: false,
          error: 'world-verify-non-json',
          preview: rawText.slice(0, 400),
        },
        { status: 502 }
      );
    }

    // Success gate: HTTP ok AND success flag.
    if (!(response.ok && raw?.success)) {
      return Response.json(
        {
          ok: false,
          verified: false,
          error: raw?.code || raw?.detail || `world-verify-http-${response.status}`,
          world: raw,
          hint:
            response.status === 401 || response.status === 403
              ? 'Refresh WORLD_STAGING_VERIFICATION_TOKEN and restart expo.'
              : undefined,
        },
        { status: 400 }
      );
    }

    const responses = Array.isArray((proof as any).responses) ? (proof as any).responses : [];
    const nullifier =
      (proof as any).nullifier_hash ||
      responses.find((r: any) => r?.nullifier)?.nullifier ||
      responses.find((r: any) => r?.nullifier_hash)?.nullifier_hash ||
      raw?.nullifier_hash ||
      null;

    return Response.json({
      ok: true,
      success: true,
      verified: true,
      nullifier,
      environment: (proof as any).environment || raw?.environment || envName || null,
      action: payload.action,
      world: raw,
    });
  } catch (e: any) {
    return Response.json(
      { ok: false, error: 'verify-failed', message: String(e?.message || e) },
      { status: 500 }
    );
  }
}
