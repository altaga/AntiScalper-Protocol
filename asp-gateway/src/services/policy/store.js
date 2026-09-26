/**
 * In-memory Asp policy store (hackathon). Restart clears state.
 * Holds petitions, human authorizations, and release claim nullifiers.
 */

const petitions = new Map();
const claimsByReleaseNullifier = new Map(); // `${release_id}::${nullifier}` → claim

function nowMs() {
  return Date.now();
}

function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createPetition({
  requester,
  target_hardware_id,
  command,
  max_amount,
  skill,
}) {
  const poh = skill?.proof_of_human || null;
  const required = Boolean(poh?.required);
  const freshness = Number(poh?.freshness_seconds || 300) * 1000;
  const petition_id = makeId('pet');
  const created_at = nowMs();
  const expires_at = created_at + freshness;

  // Dual-action: fixed release claim + fresh job approval bound to this petition.
  const release_id = poh?.release_id || null;
  const release_action = release_id ? `asp-release-${release_id}` : null;
  const job_action = `asp-job-${petition_id}`;

  const record = {
    petition_id,
    requester,
    target_hardware_id,
    command: Array.isArray(command) ? command.map(String) : [],
    max_amount: max_amount != null ? String(max_amount) : String(skill?.price || ''),
    release_id,
    status: required ? 'pending_human' : 'authorized',
    proof_of_human: poh,
    release_action,
    job_action,
    created_at,
    expires_at,
    authorized_at: required ? null : created_at,
    used_at: null,
    revoked_at: null,
    denied_at: null,
    nullifier: null,
    subject_ref: null,
  };

  petitions.set(petition_id, record);
  return record;
}

export function getPetition(petition_id) {
  return petitions.get(petition_id) || null;
}

export function listPetitions() {
  return Array.from(petitions.values());
}

export function touchExpiry(petition) {
  if (!petition) return { ok: false, error: 'not-found' };
  if (petition.status === 'used' || petition.status === 'revoked' || petition.status === 'denied') {
    return { ok: true, petition };
  }
  if (nowMs() > petition.expires_at) {
    petition.status = 'expired';
    return { ok: false, error: 'expired', petition };
  }
  return { ok: true, petition };
}

export function authorizePetition(petition_id, { nullifier, subject_ref }) {
  const petition = petitions.get(petition_id);
  if (!petition) return { ok: false, error: 'not-found' };

  const expiry = touchExpiry(petition);
  if (!expiry.ok) return expiry;

  if (petition.status === 'authorized') {
    return { ok: true, petition, already: true };
  }
  if (petition.status !== 'pending_human') {
    return { ok: false, error: `invalid-status:${petition.status}`, petition };
  }

  const release_id = petition.release_id;
  if (release_id && nullifier) {
    const key = `${release_id}::${String(nullifier).toLowerCase()}`;
    const existing = claimsByReleaseNullifier.get(key);
    if (existing && existing.used_at) {
      return { ok: false, error: 'claim-already-used', petition, claim: existing };
    }
    if (!existing) {
      claimsByReleaseNullifier.set(key, {
        release_id,
        nullifier: String(nullifier),
        petition_id,
        created_at: nowMs(),
        used_at: null,
      });
    }
  }

  petition.status = 'authorized';
  petition.authorized_at = nowMs();
  petition.nullifier = nullifier ? String(nullifier) : null;
  petition.subject_ref = subject_ref ? String(subject_ref) : null;
  // Refresh auth window from authorize moment
  const freshness = Number(petition.proof_of_human?.freshness_seconds || 300) * 1000;
  petition.expires_at = petition.authorized_at + freshness;

  return { ok: true, petition };
}

export function revokePetition(petition_id) {
  const petition = petitions.get(petition_id);
  if (!petition) return { ok: false, error: 'not-found' };
  if (petition.status === 'used') {
    return { ok: false, error: 'already-used', petition };
  }
  petition.status = 'revoked';
  petition.revoked_at = nowMs();
  return { ok: true, petition };
}

export function denyPetition(petition_id) {
  const petition = petitions.get(petition_id);
  if (!petition) return { ok: false, error: 'not-found' };
  if (petition.status === 'used') {
    return { ok: false, error: 'already-used', petition };
  }
  petition.status = 'denied';
  petition.denied_at = nowMs();
  return { ok: true, petition };
}

/**
 * Pre-dispatch gate for paid hire. Fail closed when skill requires PoH.
 */
export function assertHireAllowed({ skill, body, skipRequesterMatch = false }) {
  const required = Boolean(skill?.proof_of_human?.required);
  if (!required) {
    return { ok: true, petition: null };
  }

  const petition_id = body?.petition_id;
  if (!petition_id || typeof petition_id !== 'string') {
    return {
      ok: false,
      status: 403,
      error: 'human-proof-required',
      detail:
        'This skill requires Proof of Human. Create a petition, complete World verification, then hire with petition_id.',
    };
  }

  const petition = petitions.get(petition_id);
  if (!petition) {
    return { ok: false, status: 404, error: 'petition-not-found', detail: 'Unknown petition_id.' };
  }

  const expiry = touchExpiry(petition);
  if (!expiry.ok) {
    return {
      ok: false,
      status: 403,
      error: expiry.error,
      detail: 'Petition expired. Create a new petition and verify again.',
      petition,
    };
  }

  if (petition.status === 'revoked' || petition.status === 'denied') {
    return {
      ok: false,
      status: 403,
      error: petition.status,
      detail: `Petition is ${petition.status}; motor will not run.`,
      petition,
    };
  }

  if (petition.status !== 'authorized') {
    return {
      ok: false,
      status: 403,
      error: 'pending-human',
      detail: 'Petition is waiting for Proof of Human. Open the World verify link before paying.',
      petition,
    };
  }

  if (petition.used_at) {
    return {
      ok: false,
      status: 403,
      error: 'petition-already-used',
      detail: 'This authorization was already consumed.',
      petition,
    };
  }

  // Kiosk phone-pay: World nullifier binds the human; payer wallet may differ from PC session.
  if (
    !skipRequesterMatch &&
    petition.requester &&
    body.requester &&
    petition.requester !== body.requester
  ) {
    return {
      ok: false,
      status: 403,
      error: 'requester-mismatch',
      detail: 'Hire requester does not match the authorized petition.',
      petition,
    };
  }

  if (petition.target_hardware_id !== body.target_hardware_id) {
    return {
      ok: false,
      status: 403,
      error: 'scope-mismatch',
      detail: 'Hire target does not match petition scope.',
      petition,
    };
  }

  const cmd0 = Array.isArray(body.command) ? String(body.command[0]) : '';
  if (String(petition.command[0]) !== cmd0) {
    return {
      ok: false,
      status: 403,
      error: 'scope-mismatch',
      detail: 'Hire command does not match petition scope.',
      petition,
    };
  }

  if (petition.max_amount && skill?.price && Number(skill.price) > Number(petition.max_amount)) {
    return {
      ok: false,
      status: 403,
      error: 'overspend',
      detail: 'Skill price exceeds petition max_amount.',
      petition,
    };
  }

  if (petition.release_id && petition.nullifier) {
    const key = `${petition.release_id}::${String(petition.nullifier).toLowerCase()}`;
    const claim = claimsByReleaseNullifier.get(key);
    if (claim?.used_at) {
      return {
        ok: false,
        status: 403,
        error: 'claim-already-used',
        detail: 'This human already claimed this release.',
        petition,
      };
    }
  }

  return { ok: true, petition };
}

export function markPetitionUsed(petition_id) {
  const petition = petitions.get(petition_id);
  if (!petition) return { ok: false, error: 'not-found' };
  petition.status = 'used';
  petition.used_at = nowMs();
  if (petition.release_id && petition.nullifier) {
    const key = `${petition.release_id}::${String(petition.nullifier).toLowerCase()}`;
    const claim = claimsByReleaseNullifier.get(key);
    if (claim) claim.used_at = petition.used_at;
    else {
      claimsByReleaseNullifier.set(key, {
        release_id: petition.release_id,
        nullifier: petition.nullifier,
        petition_id,
        created_at: nowMs(),
        used_at: petition.used_at,
      });
    }
  }
  return { ok: true, petition };
}

/**
 * Hackathon demo helper — clears release claim nullifiers (and petitions)
 * so the same World identity can claim again.
 */
export function resetDemoClaims({ clearPetitions = true } = {}) {
  const claimsCleared = claimsByReleaseNullifier.size;
  const petitionsCleared = clearPetitions ? petitions.size : 0;
  claimsByReleaseNullifier.clear();
  if (clearPetitions) petitions.clear();
  return { ok: true, claimsCleared, petitionsCleared };
}
