/**
 * POST /api/world/enroll-session
 * Verify World session proof on the dapp (correct staging token + UA), then register winner on gateway.
 */
const GATEWAY =
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_GATEWAY_URL) ||
  'https://gateway.example.com';

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json().catch(() => ({}));
    const idkitResponse = body.idkitResponse ?? body.proof ?? body.result ?? null;
    const signal = body.signal ?? 'asp-winner-invite';

    if (!idkitResponse || typeof idkitResponse !== 'object') {
      return Response.json({ ok: false, error: 'missing-idkit-response' }, { status: 400 });
    }

    const rpId = (process.env.WORLD_RP_ID || process.env.EXPO_PUBLIC_WORLD_RP_ID || '').trim();
    const appId = (process.env.WORLD_APP_ID || process.env.EXPO_PUBLIC_WORLD_APP_ID || '').trim();
    const verifyIds = [rpId, appId].filter((id) => id && (id.startsWith('rp_') || id.startsWith('app_')));
    if (verifyIds.length === 0) {
      return Response.json({ ok: false, error: 'world-ids-missing' }, { status: 500 });
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'Asp-World-Enroll/1.0',
    };
    const stagingToken = (process.env.WORLD_STAGING_VERIFICATION_TOKEN || '').trim();
    if (stagingToken) headers['x-staging-verification-token'] = stagingToken;

    // Forward as-is (World ID 4.0). Sandbox selfie/session proofs often omit
    // sybil_score; World Self Check 4.0 schema requires an integer. Patch only
    // the schema field — ZK fields stay untouched.
    const payload: any = JSON.parse(JSON.stringify(idkitResponse));
    if (Array.isArray(payload.responses)) {
      payload.responses = payload.responses.map((r: any) => {
        if (!r || typeof r !== 'object') return r;
        if (r.sybil_score != null && r.sybil_score !== '') return r;
        const id = String(r.identifier || r.credential_type || r.type || '').toLowerCase();
        const looksSelfie =
          !id ||
          id.includes('selfie') ||
          id.includes('self') ||
          id.includes('face') ||
          id.includes('human');
        return looksSelfie ? { ...r, sybil_score: 0 } : r;
      });
    }
    let verified: any = null;
    let lastStatus = 0;
    let lastBody: any = null;
    let usedId = '';

    for (const id of verifyIds) {
      const url = `https://developer.world.org/api/v4/verify/${encodeURIComponent(id)}`;
      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
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
      console.log(
        '[enroll-session] verify',
        id,
        res.status,
        JSON.stringify(raw).slice(0, 500),
        'resp0=',
        JSON.stringify((payload as any)?.responses?.[0] || {}).slice(0, 300)
      );
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
          detail: String(lastBody?.code || lastBody?.detail || lastBody?.message || `http-${lastStatus}`),
          world: lastBody,
          verify_id: usedId,
        },
        { status: 403 }
      );
    }

    const session_id =
      (typeof (idkitResponse as any).session_id === 'string' &&
        (idkitResponse as any).session_id.trim()) ||
      '';
    if (!session_id) {
      return Response.json(
        { ok: false, error: 'missing-session_id', detail: 'IDKit session result missing session_id' },
        { status: 400 }
      );
    }

    const nullifier =
      (Array.isArray((idkitResponse as any).responses) &&
        (idkitResponse as any).responses
          .map((r: any) => r?.nullifier || r?.session_nullifier?.[0])
          .find(Boolean)) ||
      session_id;

    const base = String(GATEWAY).replace(/\/$/, '');

    // Prefer preverified register: dapp already verified with staging token + sybil patch.
    // Keep enroll-session as secondary (gateway re-verifies) for operators that want it.
    const reg = await fetch(`${base}/asp/winners/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id,
        nullifier: String(nullifier),
        release_id: 'tokyo2026-capsule-v1',
        preverified: true,
      }),
    });
    const regData = await reg.json().catch(() => ({}));
    if (reg.ok && regData?.winner?.ticket) {
      return Response.json({ ok: true, via: 'dapp-verify+register', ...regData });
    }

    console.warn('[enroll-session] register failed, trying gateway enroll-session', reg.status, regData);
    const gwRes = await fetch(`${base}/asp/winners/enroll-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Send patched payload so gateway verify sees sybil_score when needed.
      body: JSON.stringify({
        idkitResponse: payload,
        signal,
      }),
    });
    const gwText = await gwRes.text();
    let gwData: any = {};
    try {
      gwData = gwText ? JSON.parse(gwText) : {};
    } catch {
      gwData = { ok: false, error: 'gateway-non-json', detail: gwText.slice(0, 400) };
    }
    if (!gwRes.ok) {
      return Response.json(
        {
          ok: false,
          error: gwData?.error || regData?.error || 'enroll-failed',
          detail: gwData?.detail || regData?.detail || gwText.slice(0, 300),
          world: lastBody,
          register: regData,
          gateway: gwData,
        },
        { status: gwRes.status >= 400 ? gwRes.status : 502 }
      );
    }
    return Response.json({ ok: true, via: 'gateway-enroll-session', ...gwData });
  } catch (e: any) {
    return Response.json(
      { ok: false, error: 'enroll-proxy-failed', detail: String(e?.message || e) },
      { status: 500 }
    );
  }
}
