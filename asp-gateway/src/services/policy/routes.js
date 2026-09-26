import { Router } from 'express';
import { settings } from '../settings/settings.js';
import {
  authorizePetition,
  createPetition,
  denyPetition,
  getPetition,
  resetDemoClaims,
  revokePetition,
  touchExpiry,
} from './store.js';
import {
  assertWinnerCanClaim,
  bindWinnerSession,
  enrollWinner,
  enrollWinnerWithSession,
  getWinnerByTicket,
  listWinners,
  publicWinner,
  resetWinners,
} from './winners.js';
import { clearIntents } from '../kiosk/intentStore.js';
import { verifyWorldProof } from './pohVerify.js';

export const ENROLL_ACTION = 'asp-enroll-tokyo2026-capsule-v1';
export const RELEASE_ID = 'tokyo2026-capsule-v1';

function findSkill(target_hardware_id, command) {
  const cmd0 = Array.isArray(command) ? String(command[0]) : '';
  return settings.skills.find(
    (s) => s.target_hardware_id === target_hardware_id && String(s.command?.[0]) === cmd0
  );
}

function publicPetition(p) {
  if (!p) return null;
  return {
    petition_id: p.petition_id,
    status: p.status,
    requester: p.requester,
    target_hardware_id: p.target_hardware_id,
    command: p.command,
    max_amount: p.max_amount,
    release_id: p.release_id,
    proof_of_human: p.proof_of_human,
    release_action: p.release_action,
    job_action: p.job_action,
    created_at: p.created_at,
    expires_at: p.expires_at,
    authorized_at: p.authorized_at,
    used_at: p.used_at,
  };
}

export function createPolicyRouter() {
  const router = Router();

  // POST /asp/petition — create hire request; never MQTT
  router.post('/asp/petition', (req, res) => {
    const body = req.body || {};
    // Kiosk / QR checkout: requester optional — phone Slush is the payer; World nullifier is the human.
    const requesterRaw = typeof body.requester === 'string' ? body.requester.trim() : '';
    const target_hardware_id =
      typeof body.target_hardware_id === 'string' ? body.target_hardware_id.trim() : '';
    const command = Array.isArray(body.command) ? body.command.map(String) : [];

    if (!target_hardware_id || command.length === 0) {
      return res.status(400).json({
        ok: false,
        error: 'invalid-petition',
        expected: ['target_hardware_id', 'command'],
      });
    }

    const skill = findSkill(target_hardware_id, command);
    if (!skill) {
      return res.status(404).json({
        ok: false,
        error: 'unknown-skill',
        detail: `No skill for ${target_hardware_id} / ${command[0]}`,
      });
    }

    const petition = createPetition({
      requester: requesterRaw || 'kiosk',
      target_hardware_id,
      command,
      max_amount: body.max_amount != null ? body.max_amount : skill.price,
      skill,
    });

    const required = Boolean(skill.proof_of_human?.required);
    return res.status(201).json({
      ok: true,
      petition: publicPetition(petition),
      next: required
        ? {
            step: 'proof_of_human',
            message:
              'Device requires Proof of Human (Selfie Check) before payment or dispatch. Verify with World, then pay via Slush QR / POST /asp/kiosk/complete.',
            verify_url: '/asp/proof-of-human/verify',
            preferred_action: petition.release_action || petition.job_action,
            job_action: petition.job_action,
            release_action: petition.release_action,
            credential: skill.proof_of_human?.credential || 'selfie_check',
          }
        : {
            step: 'hire',
            message: 'No Proof of Human required. Proceed to Slush QR pay or POST /asp/hire.',
          },
    });
  });

  router.get('/asp/petition/:id', (req, res) => {
    const petition = getPetition(req.params.id);
    if (!petition) {
      return res.status(404).json({ ok: false, error: 'not-found' });
    }
    touchExpiry(petition);
    return res.json({ ok: true, petition: publicPetition(petition) });
  });

  // POST /asp/proof-of-human/verify — server validates World → authorized
  // Kiosk winners path: ticket + session proof + signal=petition_id (World ID 4.0 return).
  router.post('/asp/proof-of-human/verify', async (req, res) => {
    const body = req.body || {};
    const petition_id = typeof body.petition_id === 'string' ? body.petition_id : '';
    const idkitResponse = body.idkitResponse || body.proof || body.result || null;
    const ticket =
      typeof body.ticket === 'string' ? body.ticket.trim().toUpperCase() : '';

    if (!petition_id) {
      return res.status(400).json({ ok: false, error: 'missing-petition_id' });
    }

    const petition = getPetition(petition_id);
    if (!petition) {
      return res.status(404).json({ ok: false, error: 'petition-not-found' });
    }

    if (!petition.proof_of_human?.required) {
      return res.json({ ok: true, petition: publicPetition(petition), note: 'poh-not-required' });
    }

    const expectedEnvironment = (process.env.WORLD_ENVIRONMENT || '').trim() || undefined;
    const signal =
      body.signal != null
        ? String(body.signal)
        : petition.petition_id || '';

    // Enforce signal binding for kiosk (tamper-evident petition scope).
    if (signal && signal !== petition.petition_id) {
      return res.status(403).json({
        ok: false,
        error: 'signal-mismatch',
        detail: 'World signal must equal this petition_id.',
        petition: publicPetition(petition),
      });
    }

    // --- Winners / return path (ticket + same-human proof) ---
    if (ticket) {
      const winnerGate = assertWinnerCanClaim({ ticket });
      if (!winnerGate.ok) {
        return res.status(403).json({
          ok: false,
          error: winnerGate.error,
          detail:
            winnerGate.error === 'already-claimed'
              ? 'This winner ticket already redeemed a capsule.'
              : 'Winner ticket is not eligible.',
          winner: publicWinner(winnerGate.winner),
          petition: publicPetition(petition),
        });
      }

      const isSessionProof = Boolean(
        idkitResponse?.session_id ||
          (Array.isArray(idkitResponse?.responses) &&
            idkitResponse.responses.some((r) => r?.session_nullifier))
      );
      const recognitionAction =
        (typeof body.action === 'string' && body.action.trim()) || ENROLL_ACTION;

      const world = await verifyWorldProof(idkitResponse, {
        expectedEnvironment,
        // Sessions have no action; uniqueness recognition reuses the enroll action
        // so the nullifier matches signup (same person + same action).
        action: isSessionProof ? '' : recognitionAction,
        signal,
      });
      if (!world.verified) {
        return res.status(403).json({
          ok: false,
          error: 'world-verify-failed',
          detail: world.error || 'Winner verification failed',
          world: world.raw,
          petition: publicPetition(petition),
        });
      }

      let matched = null;
      if (isSessionProof) {
        const session_id =
          (typeof idkitResponse?.session_id === 'string' && idkitResponse.session_id.trim()) ||
          world.session_id ||
          '';
        const sessionGate = assertWinnerCanClaim({ ticket, session_id });
        if (!sessionGate.ok) {
          return res.status(403).json({
            ok: false,
            error: sessionGate.error,
            detail: 'Session proof does not match this winner ticket.',
            winner: publicWinner(sessionGate.winner),
            petition: publicPetition(petition),
          });
        }
        matched = sessionGate.winner;
      } else {
        const nullifierGate = assertWinnerCanClaim({
          ticket,
          nullifier: world.nullifier,
        });
        if (!nullifierGate.ok) {
          return res.status(403).json({
            ok: false,
            error: nullifierGate.error,
            detail:
              nullifierGate.error === 'nullifier-mismatch'
                ? 'World ID does not match the person who registered this ticket.'
                : 'Winner ticket is not eligible.',
            winner: publicWinner(nullifierGate.winner),
            petition: publicPetition(petition),
          });
        }
        matched = nullifierGate.winner;
      }

      const auth = authorizePetition(petition_id, {
        nullifier: matched.nullifier,
        subject_ref: matched.ticket,
      });
      if (!auth.ok) {
        return res.status(403).json({
          ok: false,
          error: auth.error,
          detail: auth.error || 'Authorization failed',
          petition: publicPetition(auth.petition),
        });
      }

      // Remember ticket on petition for dispense → mark claimed
      if (auth.petition) auth.petition.winner_ticket = ticket;

      return res.json({
        ok: true,
        mode: isSessionProof ? 'winner-session' : 'winner-nullifier',
        winner: publicWinner(matched),
        petition: publicPetition(auth.petition),
        next: {
          step: 'hire',
          message:
            'Winner verified (signal=petition). Pay via Slush QR / POST /asp/kiosk/complete.',
        },
      });
    }

    // --- Legacy uniqueness path (no ticket) ---
    const action =
      (typeof body.action === 'string' && body.action.trim()) ||
      petition.release_action ||
      petition.job_action ||
      '';
    const world = await verifyWorldProof(idkitResponse, {
      expectedEnvironment,
      action,
      signal,
    });

    if (!world.verified) {
      return res.status(403).json({
        ok: false,
        error: 'world-verify-failed',
        detail: world.error || 'Verification failed',
        world: world.raw,
        petition: publicPetition(petition),
      });
    }

    const auth = authorizePetition(petition_id, {
      nullifier: world.nullifier,
      subject_ref: world.nullifier,
    });

    if (!auth.ok) {
      const claimUsed = auth.error === 'claim-already-used';
      return res.status(403).json({
        ok: false,
        error: auth.error,
        detail: claimUsed
          ? 'This human already claimed this release (one person, one capsule). Motor stays idle.'
          : auth.error || 'Authorization failed',
        claim_already_used: claimUsed,
        petition: publicPetition(auth.petition),
      });
    }

    return res.json({
      ok: true,
      mode: 'uniqueness',
      petition: publicPetition(auth.petition),
      next: {
        step: 'hire',
        message: 'Human authorized. Pay via Slush QR / POST /asp/kiosk/complete.',
      },
    });
  });

  // --- Demo winners (signup → kiosk) ---
  // Preferred signup: one World session → ticket + session bound
  router.post('/asp/winners/enroll-session', async (req, res) => {
    const body = req.body || {};
    const idkitResponse = body.idkitResponse || body.proof || body.result || null;
    const expectedEnvironment = (process.env.WORLD_ENVIRONMENT || '').trim() || undefined;
    const signal = body.signal != null ? String(body.signal) : 'asp-winner-invite';

    const world = await verifyWorldProof(idkitResponse, {
      expectedEnvironment,
      action: '',
      signal,
    });
    if (!world.verified) {
      return res.status(403).json({
        ok: false,
        error: 'world-verify-failed',
        detail: world.error || 'Session verification failed',
        world: world.raw,
      });
    }

    const session_id =
      world.session_id ||
      (typeof idkitResponse?.session_id === 'string' && idkitResponse.session_id.trim()) ||
      '';
    if (!session_id) {
      return res.status(400).json({
        ok: false,
        error: 'missing-session_id',
        detail: 'IDKit session result must include session_id.',
      });
    }

    const enrolled = enrollWinnerWithSession({
      session_id,
      nullifier: world.nullifier || session_id,
      release_id: body.release_id || RELEASE_ID,
    });
    return res.status(enrolled.already ? 200 : 201).json({
      ok: true,
      ...enrolled,
      message: enrolled.already
        ? 'Already registered with this World session.'
        : 'Registered. Virtual ticket assigned — use it at the kiosk.',
    });
  });

  // Dapp already verified with World — register winner without a second portal call.
  router.post('/asp/winners/register', (req, res) => {
    const body = req.body || {};
    if (!body.preverified) {
      return res.status(400).json({ ok: false, error: 'preverified-required' });
    }
    const session_id = typeof body.session_id === 'string' ? body.session_id.trim() : '';
    const nullifier =
      typeof body.nullifier === 'string' && body.nullifier.trim()
        ? body.nullifier.trim()
        : '';

    // Preferred today: legacy uniqueness enroll (nullifier only).
    if (nullifier && !session_id) {
      const enrolled = enrollWinner({
        nullifier,
        release_id: body.release_id || RELEASE_ID,
      });
      return res.status(enrolled.already ? 200 : 201).json({
        ok: true,
        ...enrolled,
        via: 'preverified-register-nullifier',
      });
    }

    if (!session_id) {
      return res.status(400).json({ ok: false, error: 'missing-session_id-or-nullifier' });
    }
    const enrolled = enrollWinnerWithSession({
      session_id,
      nullifier: nullifier || session_id,
      release_id: body.release_id || RELEASE_ID,
    });
    return res.status(enrolled.already ? 200 : 201).json({
      ok: true,
      ...enrolled,
      via: 'preverified-register',
    });
  });

  router.post('/asp/winners/enroll', async (req, res) => {
    const body = req.body || {};
    const idkitResponse = body.idkitResponse || body.proof || body.result || null;
    const expectedEnvironment = (process.env.WORLD_ENVIRONMENT || '').trim() || undefined;
    const action =
      (typeof body.action === 'string' && body.action.trim()) || ENROLL_ACTION;
    const signal = body.signal != null ? String(body.signal) : 'asp-enroll';

    const world = await verifyWorldProof(idkitResponse, {
      expectedEnvironment,
      action,
      signal,
    });
    if (!world.verified) {
      return res.status(403).json({
        ok: false,
        error: 'world-verify-failed',
        detail: world.error || 'Enrollment verification failed',
        world: world.raw,
      });
    }
    if (!world.nullifier) {
      return res.status(403).json({
        ok: false,
        error: 'missing-nullifier',
        detail: 'Enrollment requires a uniqueness nullifier (not a session-only proof).',
      });
    }

    const enrolled = enrollWinner({
      nullifier: world.nullifier,
      release_id: body.release_id || RELEASE_ID,
    });
    return res.status(enrolled.already ? 200 : 201).json({
      ok: true,
      ...enrolled,
      enroll_action: action,
      message: enrolled.already
        ? 'Already enrolled. Create / reuse kiosk session for this ticket.'
        : 'Enrolled. Next: create a World session (kiosk pass) and bind it to this ticket.',
    });
  });

  router.post('/asp/winners/bind-session', async (req, res) => {
    const body = req.body || {};
    const ticket = typeof body.ticket === 'string' ? body.ticket.trim().toUpperCase() : '';
    const idkitResponse = body.idkitResponse || body.proof || body.result || null;
    if (!ticket) {
      return res.status(400).json({ ok: false, error: 'missing-ticket' });
    }
    const existing = getWinnerByTicket(ticket);
    if (!existing) {
      return res.status(404).json({ ok: false, error: 'unknown-ticket' });
    }

    const expectedEnvironment = (process.env.WORLD_ENVIRONMENT || '').trim() || undefined;
    const signal = body.signal != null ? String(body.signal) : ticket;
    const world = await verifyWorldProof(idkitResponse, {
      expectedEnvironment,
      action: '',
      signal,
    });
    if (!world.verified) {
      return res.status(403).json({
        ok: false,
        error: 'world-verify-failed',
        detail: world.error || 'Session verification failed',
        world: world.raw,
      });
    }

    const session_id =
      (typeof idkitResponse?.session_id === 'string' && idkitResponse.session_id.trim()) || '';
    if (!session_id) {
      return res.status(400).json({
        ok: false,
        error: 'missing-session_id',
        detail: 'IDKit session result must include session_id.',
      });
    }

    const bound = bindWinnerSession({ ticket, session_id });
    if (!bound.ok) {
      return res.status(400).json(bound);
    }
    return res.json({
      ok: true,
      ...bound,
      message: 'Kiosk pass bound. At the quiosco, enter this ticket and prove the same session.',
    });
  });

  router.get('/asp/winners', (_req, res) => {
    return res.json({ ok: true, winners: listWinners() });
  });

  router.get('/asp/winners/:ticket', (req, res) => {
    const winner = getWinnerByTicket(req.params.ticket);
    if (!winner) return res.status(404).json({ ok: false, error: 'unknown-ticket' });
    return res.json({ ok: true, winner: publicWinner(winner) });
  });

  router.post('/asp/proof-of-human/revoke', (req, res) => {
    const petition_id = typeof req.body?.petition_id === 'string' ? req.body.petition_id : '';
    if (!petition_id) {
      return res.status(400).json({ ok: false, error: 'missing-petition_id' });
    }
    const result = revokePetition(petition_id);
    if (!result.ok) {
      return res.status(400).json({ ok: false, error: result.error, petition: publicPetition(result.petition) });
    }
    return res.json({ ok: true, petition: publicPetition(result.petition) });
  });

  router.post('/asp/proof-of-human/deny', (req, res) => {
    const petition_id = typeof req.body?.petition_id === 'string' ? req.body.petition_id : '';
    if (!petition_id) {
      return res.status(400).json({ ok: false, error: 'missing-petition_id' });
    }
    const result = denyPetition(petition_id);
    if (!result.ok) {
      return res.status(400).json({ ok: false, error: result.error, petition: publicPetition(result.petition) });
    }
    return res.json({ ok: true, petition: publicPetition(result.petition) });
  });

  // POST /asp/demo/reset-claims — clear nullifier claim register for repeatable demo
  router.post('/asp/demo/reset-claims', (req, res) => {
    const clearPetitions = req.body?.clear_petitions !== false;
    const result = resetDemoClaims({ clearPetitions });
    const winners = resetWinners();
    const intentsCleared = clearIntents();
    return res.json({
      ok: true,
      ...result,
      ...winners,
      intentsCleared,
      message:
        'Demo claims + winners cleared. Same World identity can enroll and claim again (local demo store).',
    });
  });

  return router;
}
