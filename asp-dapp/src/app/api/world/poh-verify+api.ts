/**
 * POST /api/world/poh-verify
 * Verify World proof on the dapp (fresh staging token + UA), then authorize on gateway.
 * Avoids gateway-side World verify (stale/missing WORLD_STAGING_VERIFICATION_TOKEN → 403).
 */
const GATEWAY =
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_GATEWAY_URL) ||
  'https://gateway.example.com';

const DEFAULT_ACTION = 'asp-enroll-tokyo2026-capsule-v1';

async function verifyWithWorld(idkitResponse: any, action: string, signal: string) {
  const rpId = (process.env.WORLD_RP_ID || process.env.EXPO_PUBLIC_WORLD_RP_ID || '').trim();
  const appId = (process.env.WORLD_APP_ID || process.env.EXPO_PUBLIC_WORLD_APP_ID || '').trim();
  const verifyIds = [appId, rpId].filter(
    (id) => id && (id.startsWith('rp_') || id.startsWith('app_'))
  );
  if (verifyIds.length === 0) {
    return { ok: false as const, status: 500, error: 'world-ids-missing' };
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'Asp-World-PoH/1.0',
  };
  const stagingToken = (process.env.WORLD_STAGING_VERIFICATION_TOKEN || '').trim();
  if (stagingToken) headers['x-staging-verification-token'] = stagingToken;
  else console.warn('[poh-verify] WORLD_STAGING_VERIFICATION_TOKEN missing');

  const isSessionProof = Boolean(
    idkitResponse?.session_id ||
      (Array.isArray(idkitResponse?.responses) &&
        idkitResponse.responses.some((r: any) => r?.session_nullifier))
  );

  const payload: any = isSessionProof
    ? JSON.parse(JSON.stringify(idkitResponse))
    : {
        ...idkitResponse,
        action: action || idkitResponse.action || DEFAULT_ACTION,
        signal: signal !== '' ? signal : idkitResponse.signal || '',
        verification_level: idkitResponse.verification_level || 'device',
      };

  // Do not invent sybil_score on uniqueness/legacy proofs — only patch session Self Check.
  if (isSessionProof && Array.isArray(payload.responses)) {
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
    console.log('[poh-verify] world', id, res.status, JSON.stringify(raw).slice(0, 400));
    if (res.ok && raw?.success) {
      const responses = Array.isArray(idkitResponse.responses) ? idkitResponse.responses : [];
      const nullifier =
        idkitResponse.nullifier_hash ||
        responses.find((r: any) => r?.nullifier)?.nullifier ||
        responses.find((r: any) => r?.nullifier_hash)?.nullifier_hash ||
        raw?.nullifier_hash ||
        null;
      return {
        ok: true as const,
        nullifier: nullifier ? String(nullifier) : null,
        session_id:
          typeof idkitResponse.session_id === 'string' ? idkitResponse.session_id.trim() : null,
        world: raw,
        verify_id: id,
      };
    }
  }

  return {
    ok: false as const,
    status: 403,
    error: 'world-verify-failed',
    detail: String(lastBody?.code || lastBody?.detail || lastBody?.message || `http-${lastStatus}`),
    world: lastBody,
    verify_id: usedId,
    hint:
      lastStatus === 401 || lastStatus === 403
        ? 'Refresh WORLD_STAGING_VERIFICATION_TOKEN in asp-dapp/.env and restart expo.'
        : undefined,
  };
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json().catch(() => ({}));
    const petition_id = typeof body.petition_id === 'string' ? body.petition_id.trim() : '';
    const idkitResponse = body.idkitResponse ?? body.proof ?? body.result ?? null;
    const ticket = typeof body.ticket === 'string' ? body.ticket.trim().toUpperCase() : '';
    const action = String(body.action || DEFAULT_ACTION).trim() || DEFAULT_ACTION;
    const signal =
      body.signal != null ? String(body.signal) : petition_id || '';

    if (!petition_id) {
      return Response.json({ ok: false, error: 'missing-petition_id' }, { status: 400 });
    }
    if (!idkitResponse || typeof idkitResponse !== 'object') {
      return Response.json({ ok: false, error: 'missing-idkit-response' }, { status: 400 });
    }

    const verified = await verifyWithWorld(idkitResponse, action, signal);
    if (!verified.ok) {
      return Response.json(verified, { status: verified.status || 403 });
    }
    if (!verified.nullifier && !verified.session_id) {
      return Response.json(
        { ok: false, error: 'missing-nullifier', detail: 'World proof had no nullifier/session' },
        { status: 400 }
      );
    }

    const base = String(GATEWAY).replace(/\/$/, '');
    const gwRes = await fetch(`${base}/asp/proof-of-human/authorize-preverified`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        petition_id,
        ticket: ticket || undefined,
        nullifier: verified.nullifier,
        session_id: verified.session_id || undefined,
        signal,
        preverified: true,
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
      console.warn('[poh-verify] gateway authorize failed', gwRes.status, gwData);
      return Response.json(
        {
          ok: false,
          error: gwData?.error || 'authorize-failed',
          detail: gwData?.detail || gwText.slice(0, 300),
          claim_already_used: Boolean(
            gwData?.claim_already_used || gwData?.error === 'already-claimed'
          ),
          gateway: gwData,
          world: verified.world,
        },
        { status: gwRes.status >= 400 ? gwRes.status : 502 }
      );
    }

    return Response.json({
      ok: true,
      via: 'dapp-verify+preverified-authorize',
      ...gwData,
    });
  } catch (e: any) {
    return Response.json(
      { ok: false, error: 'poh-proxy-failed', detail: String(e?.message || e) },
      { status: 500 }
    );
  }
}
