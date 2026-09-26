/**
 * Demo winners registry (in-memory).
 * Signup: World Selfie Check (legacy uniqueness) → virtual ticket bound to nullifier.
 * Kiosk: same person proves again (same enroll action → same nullifier) + signal=petition_id.
 * Optional: World ID 4.0 session_id bind when Self Check 4.0 sessions are available.
 */

const winnersByTicket = new Map(); // ticket → record
const ticketByNullifier = new Map(); // nullifier → ticket
const ticketBySession = new Map(); // session_id → ticket

function nowMs() {
  return Date.now();
}

function makeTicket() {
  const raw = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `WIN-${raw}`;
}

export function enrollWinner({ nullifier, release_id = 'tokyo2026-capsule-v1' }) {
  const key = String(nullifier || '').toLowerCase();
  if (!key) return { ok: false, error: 'missing-nullifier' };

  const existingTicket = ticketByNullifier.get(key);
  if (existingTicket) {
    const existing = winnersByTicket.get(existingTicket);
    return {
      ok: true,
      already: true,
      winner: publicWinner(existing),
    };
  }

  const ticket = makeTicket();
  const record = {
    ticket,
    nullifier: key,
    release_id: String(release_id || 'tokyo2026-capsule-v1'),
    session_id: null,
    enrolled_at: nowMs(),
    claimed_at: null,
    last_petition_id: null,
  };
  winnersByTicket.set(ticket, record);
  ticketByNullifier.set(key, ticket);
  return { ok: true, already: false, winner: publicWinner(record) };
}

/**
 * Preferred signup: one World session proof → ticket + session bound in a single step.
 */
export function enrollWinnerWithSession({
  session_id,
  nullifier,
  release_id = 'tokyo2026-capsule-v1',
}) {
  const sid = String(session_id || '').trim();
  if (!sid) return { ok: false, error: 'missing-session_id' };

  const existingBySession = getWinnerBySession(sid);
  if (existingBySession) {
    return { ok: true, already: true, winner: publicWinner(existingBySession) };
  }

  const key = String(nullifier || sid).toLowerCase();
  const existingByNullifier = ticketByNullifier.get(key);
  if (existingByNullifier) {
    const existing = winnersByTicket.get(existingByNullifier);
    if (existing && !existing.session_id) {
      existing.session_id = sid;
      ticketBySession.set(sid, existing.ticket);
      return { ok: true, already: true, winner: publicWinner(existing) };
    }
    return {
      ok: true,
      already: true,
      winner: publicWinner(existing),
    };
  }

  const ticket = makeTicket();
  const record = {
    ticket,
    nullifier: key,
    release_id: String(release_id || 'tokyo2026-capsule-v1'),
    session_id: sid,
    enrolled_at: nowMs(),
    claimed_at: null,
    last_petition_id: null,
  };
  winnersByTicket.set(ticket, record);
  ticketByNullifier.set(key, ticket);
  ticketBySession.set(sid, ticket);
  return { ok: true, already: false, winner: publicWinner(record) };
}

export function bindWinnerSession({ ticket, session_id }) {
  const t = String(ticket || '').trim().toUpperCase();
  const sid = String(session_id || '').trim();
  if (!t || !sid) return { ok: false, error: 'missing-ticket-or-session' };

  const record = winnersByTicket.get(t);
  if (!record) return { ok: false, error: 'unknown-ticket' };

  if (record.session_id && record.session_id !== sid) {
    return { ok: false, error: 'session-already-bound', winner: publicWinner(record) };
  }

  const prev = ticketBySession.get(sid);
  if (prev && prev !== t) {
    return { ok: false, error: 'session-bound-to-other-ticket' };
  }

  record.session_id = sid;
  ticketBySession.set(sid, t);
  return { ok: true, winner: publicWinner(record) };
}

export function getWinnerByTicket(ticket) {
  const t = String(ticket || '').trim().toUpperCase();
  return winnersByTicket.get(t) || null;
}

export function getWinnerBySession(session_id) {
  const sid = String(session_id || '').trim();
  const ticket = ticketBySession.get(sid);
  if (!ticket) return null;
  return winnersByTicket.get(ticket) || null;
}

export function assertWinnerCanClaim({ ticket, session_id, nullifier }) {
  const record = getWinnerByTicket(ticket);
  if (!record) return { ok: false, error: 'unknown-ticket' };
  if (record.claimed_at) {
    return { ok: false, error: 'already-claimed', winner: publicWinner(record) };
  }

  // Optional session gate (World ID 4.0 return pass).
  if (session_id) {
    if (!record.session_id) {
      return { ok: false, error: 'session-not-bound', winner: publicWinner(record) };
    }
    if (record.session_id !== String(session_id).trim()) {
      return { ok: false, error: 'session-mismatch', winner: publicWinner(record) };
    }
  }

  // Optional nullifier gate (legacy Selfie Check recognition).
  if (nullifier) {
    const got = String(nullifier).toLowerCase();
    if (!record.nullifier || record.nullifier !== got) {
      return { ok: false, error: 'nullifier-mismatch', winner: publicWinner(record) };
    }
  }

  return { ok: true, winner: record };
}

export function markWinnerClaimed({ ticket, petition_id }) {
  const record = getWinnerByTicket(ticket);
  if (!record) return { ok: false, error: 'unknown-ticket' };
  record.claimed_at = nowMs();
  record.last_petition_id = petition_id || record.last_petition_id;
  return { ok: true, winner: publicWinner(record) };
}

export function listWinners() {
  return Array.from(winnersByTicket.values()).map(publicWinner);
}

export function resetWinners() {
  const n = winnersByTicket.size;
  winnersByTicket.clear();
  ticketByNullifier.clear();
  ticketBySession.clear();
  return { ok: true, winnersCleared: n };
}

export function publicWinner(record) {
  if (!record) return null;
  return {
    ticket: record.ticket,
    release_id: record.release_id,
    /** True when a World ID 4.0 session is bound (optional). */
    has_session: Boolean(record.session_id),
    /** True when enrolled via nullifier and/or session — eligible for kiosk. */
    enrolled: Boolean(record.nullifier || record.session_id),
    session_id: record.session_id,
    enrolled_at: record.enrolled_at,
    claimed_at: record.claimed_at,
    nullifier_prefix: record.nullifier ? `${record.nullifier.slice(0, 10)}…` : null,
  };
}
