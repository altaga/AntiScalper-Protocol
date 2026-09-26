/**
 * POST /api/world/enroll
 * Verify World uniqueness proof on the dapp (staging token + UA), then register winner on gateway.
 * Uses selfieCheckLegacy / World ID 3.0 — Self Check 4.0 sessions need integrity_bundle v2
 * which sandbox + pinned IDKit 4.2.x do not reliably produce.
 */
const GATEWAY =
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_GATEWAY_URL) ||
  'https://gateway.example.com';

const DEFAULT_ACTION = 'asp-enroll-tokyo2026-capsule-v1';

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json().catch(() => ({}));
    const idkitResponse = body.idkitResponse ?? body.proof ?? body.result ?? null;
    const action = String(body.action || DEFAULT_ACTION).trim() || DEFAULT_ACTION;
    const signal = body.signal != null ? String(body.signal) : 'asp-enroll';

    if (!idkitResponse || typeof idkitResponse !== 'object') {
      return Response.json({ ok: false, error: 'missing-idkit-response' }, { status: 400 });
    }

    const rpId = (process.env.WORLD_RP_ID || process.env.EXPO_PUBLIC_WORLD_RP_ID || '').trim();
    const appId = (process.env.WORLD_APP_ID || process.env.EXPO_PUBLIC_WORLD_APP_ID || '').trim();
    // Mandate historically verified against app_id; try both.
    const verifyIds = [appId, rpId].filter(
      (id) => id && (id.startsWith('rp_') || id.startsWith('app_'))
    );
    if (verifyIds.length === 0) {
      return Response.json({ ok: false, error: 'world-ids-missing' }, { status: 500 });
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'Asp-World-Enroll/1.0',
    };
    const stagingToken = (process.env.WORLD_STAGING_VERIFICATION_TOKEN || '').trim();
    if (stagingToken) headers['x-staging-verification-token'] = stagingToken;
    else console.warn('[enroll] WORLD_STAGING_VERIFICATION_TOKEN missing');

    const payload = {
      ...idkitResponse,
      action: action || (idkitResponse as any).action || DEFAULT_ACTION,
      signal: signal || (idkitResponse as any).signal || '',
      verification_level: (idkitResponse as any).verification_level || 'device',
    };

    let verified: any = null;
    let lastStatus = 0;
    let lastBody: any = null;
    let usedId = '';

    for (const id of verifyIds) {
      const url = `https://developer.world.org/api/v4/verify/${encodeURIComponent(id)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      let raw: any = null;
      try {
        raw = text ? JSON.parse(text) : null;
      } catch {
        raw = { non_json: text.slice(0, 400) };
      }
      lastStatus = res.status;
      lastBody = raw;
      usedId = id;
      console.log('[enroll] verify', id, res.status, JSON.stringify(raw).slice(0, 500));
      if (res.ok && raw?.success) {
        verified = raw;
        break;
      }
    }

    if (!verified) {
      return Response.json(
        {
          ok: false,
          error: 'world-verify-failed',
          detail: String(
            lastBody?.code || lastBody?.detail || lastBody?.message || `http-${lastStatus}`
          ),
          world: lastBody,
          verify_id: usedId,
          hint:
            lastStatus === 401 || lastStatus === 403
              ? 'Refresh WORLD_STAGING_VERIFICATION_TOKEN and restart expo.'
              : undefined,
        },
        { status: 403 }
      );
    }

    const responses = Array.isArray((idkitResponse as any).responses)
      ? (idkitResponse as any).responses
      : [];
    const nullifier =
      (idkitResponse as any).nullifier_hash ||
      responses.find((r: any) => r?.nullifier)?.nullifier ||
      responses.find((r: any) => r?.nullifier_hash)?.nullifier_hash ||
      verified?.nullifier_hash ||
      null;

    if (!nullifier) {
      return Response.json(
        {
          ok: false,
          error: 'missing-nullifier',
          detail: 'Enrollment requires a uniqueness nullifier from Selfie Check.',
        },
        { status: 400 }
      );
    }

    const base = String(GATEWAY).replace(/\/$/, '');
    const reg = await fetch(`${base}/asp/winners/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nullifier: String(nullifier),
        release_id: 'tokyo2026-capsule-v1',
        preverified: true,
      }),
    });
    const regData = await reg.json().catch(() => ({}));
    if (!reg.ok || !regData?.winner?.ticket) {
      return Response.json(
        {
          ok: false,
          error: regData?.error || 'register-failed',
          detail: regData?.detail || `Gateway register failed (${reg.status})`,
          register: regData,
        },
        { status: reg.status >= 400 ? reg.status : 502 }
      );
    }

    return Response.json({
      ok: true,
      via: 'dapp-verify+register',
      enroll_action: action,
      ...regData,
    });
  } catch (e: any) {
    return Response.json(
      { ok: false, error: 'enroll-proxy-failed', detail: String(e?.message || e) },
      { status: 500 }
    );
  }
}
