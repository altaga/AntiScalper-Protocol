/**
 * Fail-closed World ID verify. Never treat client onSuccess alone as auth.
 * World ID 4.0 docs: POST /api/v4/verify/{rp_id} with IDKit payload as-is.
 */

function extractNullifier(idkitResponse) {
  if (!idkitResponse || typeof idkitResponse !== 'object') return null;
  const responses = Array.isArray(idkitResponse.responses) ? idkitResponse.responses : [];
  for (const r of responses) {
    if (r?.nullifier) return String(r.nullifier);
    if (r?.nullifier_hash) return String(r.nullifier_hash);
    if (Array.isArray(r?.session_nullifier) && r.session_nullifier[0]) {
      return String(r.session_nullifier[0]);
    }
  }
  if (idkitResponse.nullifier_hash) return String(idkitResponse.nullifier_hash);
  return null;
}

function extractSessionId(idkitResponse) {
  if (!idkitResponse || typeof idkitResponse !== 'object') return null;
  if (typeof idkitResponse.session_id === 'string' && idkitResponse.session_id.trim()) {
    return idkitResponse.session_id.trim();
  }
  return null;
}

/**
 * @returns {{ verified: boolean, nullifier: string|null, session_id: string|null, raw: any, error?: string }}
 */
export async function verifyWorldProof(idkitResponse, { expectedEnvironment, action, signal } = {}) {
  const rpId = (process.env.WORLD_RP_ID || process.env.EXPO_PUBLIC_WORLD_RP_ID || '').trim();
  const appId = (process.env.WORLD_APP_ID || process.env.EXPO_PUBLIC_WORLD_APP_ID || '').trim();
  // Official IDKit guide uses {rp_id}; Mandate historically used {app_id}. Try both.
  const verifyIds = [];
  if (rpId && rpId.startsWith('rp_')) verifyIds.push(rpId);
  if (appId && appId.startsWith('app_')) verifyIds.push(appId);
  if (verifyIds.length === 0) {
    return {
      verified: false,
      nullifier: null,
      session_id: null,
      raw: null,
      error: 'WORLD_RP_ID / WORLD_APP_ID not configured for verify',
    };
  }

  if (!idkitResponse || typeof idkitResponse !== 'object') {
    return {
      verified: false,
      nullifier: null,
      session_id: null,
      raw: null,
      error: 'missing-idkit-response',
    };
  }

  const isSessionProof = Boolean(
    idkitResponse.session_id ||
      (Array.isArray(idkitResponse.responses) &&
        idkitResponse.responses.some((r) => r?.session_nullifier))
  );

  const resolvedAction =
    (typeof action === 'string' && action.trim()) || idkitResponse.action || '';
  const resolvedSignal =
    signal != null
      ? String(signal)
      : idkitResponse.signal != null
        ? String(idkitResponse.signal)
        : '';

  // Sessions / v4: forward as-is. Patch missing sybil_score on selfie-like
  // responses (World Self Check 4.0 schema requires an integer).
  const payloadBase = isSessionProof
    ? { ...idkitResponse }
    : {
        ...idkitResponse,
        ...(resolvedAction ? { action: resolvedAction } : {}),
        ...(resolvedSignal !== '' ? { signal: resolvedSignal } : {}),
      };
  const payload = JSON.parse(JSON.stringify(payloadBase));
  if (Array.isArray(payload.responses)) {
    payload.responses = payload.responses.map((r) => {
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

  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'Asp-Gateway-PoH/1.0',
  };
  const stagingToken = (process.env.WORLD_STAGING_VERIFICATION_TOKEN || '').trim();
  const envName = (expectedEnvironment || process.env.WORLD_ENVIRONMENT || '')
    .trim()
    .toLowerCase();
  // Sandbox/staging proofs need the portal window token (always attach when present).
  if (stagingToken) {
    headers['x-staging-verification-token'] = stagingToken;
  }

  let last = { response: null, raw: null, rawText: '', id: null };
  for (const id of verifyIds) {
    const url = `https://developer.world.org/api/v4/verify/${encodeURIComponent(id)}`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      const rawText = await response.text();
      let raw = null;
      try {
        raw = rawText ? JSON.parse(rawText) : null;
      } catch {
        last = { response, raw: rawText?.slice?.(0, 500) || null, rawText, id };
        continue;
      }
      last = { response, raw, rawText, id };
      if (response.ok && raw?.success) {
        const env = String(raw?.environment || idkitResponse?.environment || '').toLowerCase();
        const expected = String(expectedEnvironment || envName || '').toLowerCase();
        const envAliases = {
          sandbox: new Set(['sandbox', 'staging']),
          staging: new Set(['sandbox', 'staging']),
        };
        if (expected && env) {
          const okSet = envAliases[expected] || new Set([expected]);
          if (!okSet.has(env)) {
            return {
              verified: false,
              nullifier: extractNullifier(idkitResponse),
              session_id: extractSessionId(idkitResponse),
              raw,
              error: `environment-mismatch: got ${env}, expected ${expected}`,
            };
          }
        }
        return {
          verified: true,
          nullifier: extractNullifier(raw) || extractNullifier(idkitResponse),
          session_id: extractSessionId(idkitResponse) || extractSessionId(raw),
          raw,
        };
      }
    } catch (e) {
      last = {
        response: null,
        raw: null,
        rawText: String(e?.message || e),
        id,
      };
    }
  }

  return {
    verified: false,
    nullifier: extractNullifier(idkitResponse),
    session_id: extractSessionId(idkitResponse),
    raw: last.raw,
    error: String(
      last.raw?.code ||
        last.raw?.detail ||
        last.raw?.message ||
        (last.response ? `world-verify-http-${last.response.status}` : 'world-verify-failed')
    ),
  };
}
