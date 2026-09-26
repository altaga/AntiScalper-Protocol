// x402 hire helper for the dapp
const GATEWAY =
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_GATEWAY_URL) ||
  'https://gateway.example.com';

export function gatewayBaseUrl() {
  return String(GATEWAY).replace(/\/$/, '');
}

export async function createPetition(input: {
  requester?: string;
  target_hardware_id: string;
  command: string[];
}) {
  const res = await fetch(`${gatewayBaseUrl()}/asp/petition`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      // Kiosk: no PC wallet — placeholder so older gateways that still require requester accept the call.
      requester: input.requester || 'kiosk',
      target_hardware_id: input.target_hardware_id,
      command: input.command,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.detail || data?.error || `Petition failed (${res.status})`);
  }
  return data;
}

export async function getPetition(petition_id: string) {
  const res = await fetch(`${gatewayBaseUrl()}/asp/petition/${encodeURIComponent(petition_id)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Petition lookup failed (${res.status})`);
  return data;
}

export async function verifyProofOfHuman(
  petition_id: string,
  idkitResponse: unknown,
  opts?: { action?: string; signal?: string; ticket?: string }
) {
  const res = await fetch(`${gatewayBaseUrl()}/asp/proof-of-human/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      petition_id,
      idkitResponse,
      action: opts?.action,
      signal: opts?.signal,
      ticket: opts?.ticket,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(
      data?.detail || data?.error || `World verify failed (${res.status})`
    ) as Error & { code?: string; claimAlreadyUsed?: boolean };
    err.code = data?.error;
    err.claimAlreadyUsed = Boolean(data?.claim_already_used || data?.error === 'claim-already-used');
    throw err;
  }
  return data;
}

export const ENROLL_ACTION = 'asp-enroll-tokyo2026-capsule-v1';
export const RELEASE_ID = 'tokyo2026-capsule-v1';

/** Preferred signup: Selfie Check (legacy) uniqueness → ticket bound to nullifier. */
export async function enrollWinner(
  idkitResponse: unknown,
  opts?: { action?: string; signal?: string }
) {
  // Verify on this dapp (staging token + correct UA), then register on gateway.
  const res = await fetch(`/api/world/enroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      idkitResponse,
      action: opts?.action || ENROLL_ACTION,
      signal: opts?.signal || 'asp-enroll',
      release_id: RELEASE_ID,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.detail || data?.error || `Enroll failed (${res.status})`);
  }
  return data as {
    ok: boolean;
    already?: boolean;
    winner: {
      ticket: string;
      has_session: boolean;
      enrolled?: boolean;
      session_id?: string | null;
      enrolled_at: number;
      claimed_at: number | null;
    };
  };
}

/** @deprecated Prefer enrollWinner — sandbox Self Check 4.0 sessions need integrity_bundle v2. */
export async function enrollWinnerSession(
  idkitResponse: unknown,
  opts?: { signal?: string }
) {
  // Verify on this dapp (staging token + correct UA), then register on gateway.
  const res = await fetch(`/api/world/enroll-session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      idkitResponse,
      signal: opts?.signal || 'asp-winner-invite',
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.detail || data?.error || `Enroll session failed (${res.status})`);
  }
  return data as {
    ok: boolean;
    already?: boolean;
    winner: {
      ticket: string;
      has_session: boolean;
      session_id?: string | null;
      enrolled_at: number;
      claimed_at: number | null;
    };
  };
}

export async function enrollWinnerOnGateway(
  idkitResponse: unknown,
  opts?: { action?: string; signal?: string }
) {
  const res = await fetch(`${gatewayBaseUrl()}/asp/winners/enroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      idkitResponse,
      action: opts?.action || ENROLL_ACTION,
      signal: opts?.signal || 'asp-enroll',
      release_id: RELEASE_ID,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.detail || data?.error || `Enroll failed (${res.status})`);
  }
  return data as {
    ok: boolean;
    already?: boolean;
    winner: {
      ticket: string;
      has_session: boolean;
      session_id?: string | null;
      enrolled_at: number;
      claimed_at: number | null;
    };
  };
}

export async function bindWinnerSession(
  ticket: string,
  idkitResponse: unknown,
  opts?: { signal?: string }
) {
  const res = await fetch(`${gatewayBaseUrl()}/asp/winners/bind-session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ticket,
      idkitResponse,
      signal: opts?.signal || ticket,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.detail || data?.error || `Bind session failed (${res.status})`);
  }
  return data as {
    ok: boolean;
    winner: {
      ticket: string;
      has_session: boolean;
      session_id?: string | null;
    };
  };
}

export async function getWinner(ticket: string) {
  const res = await fetch(`${gatewayBaseUrl()}/asp/winners/${encodeURIComponent(ticket)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Winner lookup failed (${res.status})`);
  return data as { ok: boolean; winner: { ticket: string; has_session: boolean; session_id?: string | null; claimed_at: number | null } };
}

export async function listWinners() {
  const res = await fetch(`${gatewayBaseUrl()}/asp/winners`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Winners list failed (${res.status})`);
  return data as { ok: boolean; winners: Array<{ ticket: string; has_session: boolean; claimed_at: number | null }> };
}

export async function revokePetition(petition_id: string) {
  const res = await fetch(`${gatewayBaseUrl()}/asp/proof-of-human/revoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ petition_id }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Revoke failed (${res.status})`);
  return data;
}

/** Hackathon demo: clear release claim nullifiers so the same person can claim again. */
export async function resetDemoClaims() {
  const res = await fetch(`${gatewayBaseUrl()}/asp/demo/reset-claims`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clear_petitions: true }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.detail || data?.error || `Demo reset failed (${res.status})`);
  return data;
}

/** Kiosk: unique Slush Payment Kit pay link for an authorized petition. */
export async function createKioskIntent(petition_id: string) {
  const res = await fetch(`${gatewayBaseUrl()}/asp/kiosk/intent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ petition_id }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.detail || data?.error || `Kiosk intent failed (${res.status})`);
  }
  return data as {
    ok: boolean;
    nonce: string;
    payUrl: string;
    amount: string;
    coinType: string;
    receiver: string;
    intent: {
      nonce: string;
      status: string;
      payUrl: string;
      petition_id: string;
      amount: string;
      coinType: string;
      receiver: string;
    };
  };
}

/** Lab only: Slush pay link without World / petition — served by this dapp (no remote gateway deploy needed). */
export async function createKioskLabIntent() {
  const res = await fetch(`/api/kiosk/lab-intent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.detail || data?.error || `Kiosk lab intent failed (${res.status})`);
  }
  return data as {
    ok: boolean;
    lab?: boolean;
    nonce: string;
    payUrl: string;
    deepLink?: string;
    webUrl?: string;
    amount: string;
    coinType: string;
    receiver: string;
    intent: {
      nonce: string;
      status: string;
      payUrl: string;
      webUrl?: string;
      amount: string;
      coinType: string;
      receiver: string;
    };
  };
}

export async function getKioskLabIntent(nonce: string) {
  const res = await fetch(`/api/kiosk/status?nonce=${encodeURIComponent(nonce)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.detail || data?.error || `Kiosk lab poll failed (${res.status})`);
  }
  return data as {
    ok: boolean;
    intent: {
      nonce: string;
      status: string;
      payUrl?: string;
      paymentTransactionDigest?: string | null;
      amount?: string;
      receiver?: string;
      petition_id?: string | null;
    };
  };
}

export async function getKioskIntent(nonce: string) {
  const res = await fetch(`${gatewayBaseUrl()}/asp/kiosk/intent/${encodeURIComponent(nonce)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.detail || data?.error || `Kiosk poll failed (${res.status})`);
  }
  return data as {
    ok: boolean;
    intent: {
      nonce: string;
      status: string;
      payUrl?: string;
      paymentTransactionDigest?: string | null;
      payer?: string | null;
      receipt?: unknown;
      tx_id?: string | null;
      petition_id: string;
    };
  };
}

/** Checkout: Slush deep-link QR bound to an authorized petition (dapp API — same path as lab). */
export async function createCheckoutPayIntent(petition_id: string) {
  const res = await fetch(`/api/kiosk/checkout-intent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ petition_id }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.detail || data?.error || `Checkout pay intent failed (${res.status})`);
  }
  return data as {
    ok: boolean;
    nonce: string;
    payUrl: string;
    deepLink?: string;
    webUrl?: string;
    amount: string;
    coinType: string;
    receiver: string;
    petition_id: string;
  };
}

/** After Payment Kit paid — ask gateway to dispense (no second x402 charge). */
export async function completeKioskCheckout(input: {
  petition_id: string;
  nonce: string;
  amount: string;
  coinType: string;
  receiver: string;
  payer?: string;
  payUrl?: string;
}) {
  // Proxy via Metro so Cloudflare HTML 502s don't surface as opaque CORS failures.
  const res = await fetch(`/api/kiosk/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(
      data?.detail || data?.error || `Kiosk complete failed (${res.status})`
    ) as Error & { status?: number; code?: string };
    err.status = res.status;
    err.code = data?.error;
    throw err;
  }
  return data as {
    ok: boolean;
    tx_id?: string;
    petition_id?: string;
    receipt?: unknown;
    gateway?: string;
    payer?: string;
    transaction?: string | null;
    message?: string;
  };
}

export async function fetchAgentGuide() {
  const res = await fetch(`${gatewayBaseUrl()}/asp/agent-guide.json`);
  if (!res.ok) throw new Error(`agent-guide ${res.status}`);
  return res.json();
}

export const GACHA_DEVICE_ID = 'Sub_A7C440A00001';
export const DISPENSE_ONCE = ['DISPENSE_ONCE'] as const;
