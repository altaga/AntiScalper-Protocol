import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { settings } from '../settings/settings.js';
import {
  assertHireAllowed,
  getPetition,
  markPetitionUsed,
  touchExpiry,
} from '../policy/store.js';
import { markWinnerClaimed } from '../policy/winners.js';
import {
  clearIntents,
  createIntent,
  getIntent,
  publicIntent,
  updateIntent,
} from './intentStore.js';
import {
  buildSlushPayUrl,
  DEFAULT_REGISTRY_NAME,
  lookupPaymentRecord,
} from './paymentKit.js';

const GACHA_DEFAULT_ID = 'Sub_A7C440A00001';

function findSkill(target_hardware_id, command) {
  const cmd0 = Array.isArray(command) ? String(command[0]) : '';
  return settings.skills.find(
    (s) => s.target_hardware_id === target_hardware_id && String(s.command?.[0]) === cmd0
  );
}

function nowMs() {
  return Date.now();
}

async function refreshPaidStatus(intent) {
  if (!intent) return null;
  if (intent.status === 'dispensed' || intent.status === 'paid') return intent;

  try {
    const record = await lookupPaymentRecord({
      nonce: intent.nonce,
      amount: intent.amount,
      coinType: intent.coinType,
      receiver: intent.receiver,
      registryName: intent.registryName,
    });
    if (record) {
      return updateIntent(intent.nonce, {
        status: 'paid',
        paymentTransactionDigest: record.paymentTransactionDigest || null,
        paid_at: intent.paid_at || nowMs(),
        paymentRecordKey: record.key || null,
      });
    }
  } catch (err) {
    console.warn('[KIOSK] getPaymentRecord failed:', err?.message || err);
  }
  return intent;
}

/**
 * Kiosk unique-link pay — parallel to x402 hire.
 * Phone pays via Slush Payment Kit; PC polls and dispenses without a second charge.
 */
export function createKioskRouter({ dispatch }) {
  const router = Router();

  function makePayIntent({ petition_id, amount, coinType, label, message }) {
    const receiver = settings.sui.address;
    if (!receiver || !String(receiver).startsWith('0x')) {
      const err = new Error('GATEWAY_ADDRESS is not configured.');
      err.code = 'gateway-address-missing';
      throw err;
    }
    const nonce = randomUUID();
    const registryName = DEFAULT_REGISTRY_NAME;
    const links = buildSlushPayUrl({
      receiver,
      amount,
      coinType,
      nonce,
      registryName,
      label,
      message,
    });
    return createIntent({
      nonce,
      petition_id: petition_id || null,
      amount: String(amount),
      coinType,
      receiver,
      registryName,
      payUrl: links.payUrl || links.deepLink,
      webUrl: links.webUrl,
      status: 'pending',
      lab: !petition_id,
      created_at: nowMs(),
      updated_at: nowMs(),
      paymentTransactionDigest: null,
      payer: null,
      receipt: null,
      tx_id: null,
      paid_at: null,
      dispensed_at: null,
    });
  }

  // POST /asp/kiosk/lab/intent — Slush-only smoke test (no World / no petition)
  router.post('/asp/kiosk/lab/intent', (req, res) => {
    const skill =
      findSkill(GACHA_DEFAULT_ID, ['DISPENSE_ONCE']) ||
      settings.skills.find((s) => s.price && s.token);

    if (!skill?.price || !skill?.token) {
      return res.status(500).json({
        ok: false,
        error: 'invalid-skill-config',
        detail: 'No priced skill available for lab pay link.',
      });
    }

    try {
      const intent = makePayIntent({
        petition_id: null,
        amount: skill.price,
        coinType: skill.token,
        label: 'Asp kiosk lab',
        message: 'Slush Payment Kit smoke test (no PoH)',
      });
      return res.status(201).json({
        ok: true,
        lab: true,
        intent: publicIntent(intent),
        payUrl: intent.payUrl,
        deepLink: intent.payUrl,
        webUrl: intent.webUrl || null,
        nonce: intent.nonce,
        amount: intent.amount,
        coinType: intent.coinType,
        receiver: intent.receiver,
        next: {
          step: 'phone_pay',
          message:
            'Lab only: scan Slush QR (slush://pay deep link), poll until paid. No World and no motor dispense on this path.',
        },
      });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: err.code || 'pay-url-failed',
        detail: String(err?.message || err),
      });
    }
  });

  // POST /asp/kiosk/intent — create unique Slush pay link for an authorized petition
  router.post('/asp/kiosk/intent', (req, res) => {
    const petition_id = typeof req.body?.petition_id === 'string' ? req.body.petition_id.trim() : '';
    if (!petition_id) {
      return res.status(400).json({ ok: false, error: 'missing-petition_id' });
    }

    const petition = getPetition(petition_id);
    if (!petition) {
      return res.status(404).json({ ok: false, error: 'petition-not-found' });
    }

    const expiry = touchExpiry(petition);
    if (!expiry.ok) {
      return res.status(403).json({
        ok: false,
        error: expiry.error,
        detail: 'Petition expired. Create a new petition and verify again.',
      });
    }

    if (petition.status !== 'authorized') {
      return res.status(403).json({
        ok: false,
        error: 'pending-human',
        detail: 'Petition must be authorized (Proof of Human) before creating a pay link.',
        status: petition.status,
      });
    }

    if (petition.used_at) {
      return res.status(403).json({
        ok: false,
        error: 'petition-already-used',
        detail: 'This authorization was already consumed.',
      });
    }

    const skill = findSkill(petition.target_hardware_id, petition.command);
    if (!skill?.price || !skill?.token) {
      return res.status(500).json({
        ok: false,
        error: 'invalid-skill-config',
        detail: 'Skill must define price and token.',
      });
    }

    try {
      const intent = makePayIntent({
        petition_id,
        amount: skill.price,
        coinType: skill.token,
        label: 'Asp capsule',
        message: `Petition ${petition_id}`,
      });
      return res.status(201).json({
        ok: true,
        intent: publicIntent(intent),
        payUrl: intent.payUrl,
        deepLink: intent.payUrl,
        webUrl: intent.webUrl || null,
        nonce: intent.nonce,
        amount: intent.amount,
        coinType: intent.coinType,
        receiver: intent.receiver,
        next: {
          step: 'phone_pay',
          message:
            'Show the QR / slush://pay deep link on the kiosk. Poll GET /asp/kiosk/intent/:nonce until paid, then POST /asp/kiosk/dispense.',
        },
      });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: err.code || 'pay-url-failed',
        detail: String(err?.message || err),
      });
    }
  });

  // GET /asp/kiosk/intent/:nonce — poll Payment Kit record
  router.get('/asp/kiosk/intent/:nonce', async (req, res) => {
    const nonce = typeof req.params.nonce === 'string' ? req.params.nonce.trim() : '';
    let intent = getIntent(nonce);
    if (!intent) {
      return res.status(404).json({ ok: false, error: 'intent-not-found' });
    }

    intent = (await refreshPaidStatus(intent)) || intent;
    return res.json({
      ok: true,
      intent: publicIntent(intent),
    });
  });

  // POST /asp/kiosk/dispense — verify payment again, then dispatch (no x402)
  router.post('/asp/kiosk/dispense', async (req, res) => {
    const nonce = typeof req.body?.nonce === 'string' ? req.body.nonce.trim() : '';
    if (!nonce) {
      return res.status(400).json({ ok: false, error: 'missing-nonce' });
    }

    let intent = getIntent(nonce);
    if (!intent) {
      return res.status(404).json({ ok: false, error: 'intent-not-found' });
    }

    // Idempotent: already dispensed for this nonce
    if (intent.status === 'dispensed' && intent.receipt) {
      return res.json({
        ok: true,
        message: 'already-dispensed',
        tx_id: intent.tx_id,
        petition_id: intent.petition_id,
        receipt: intent.receipt,
        gateway: intent.receiver,
        payer: intent.payer,
        transaction: intent.paymentTransactionDigest,
        intent: publicIntent(intent),
      });
    }

    intent = (await refreshPaidStatus(intent)) || intent;

    // Lab smoke intents have no petition — payment confirm only, no motor.
    if (!intent.petition_id || intent.lab) {
      return res.status(400).json({
        ok: false,
        error: 'lab-intent-no-dispense',
        detail:
          'This is a Slush lab pay link (no World / no petition). Payment confirm is enough — motor dispense stays on the full checkout path.',
        intent: publicIntent(intent),
      });
    }

    // Fail closed: must see on-chain PaymentRecord
    let record = null;
    try {
      record = await lookupPaymentRecord({
        nonce: intent.nonce,
        amount: intent.amount,
        coinType: intent.coinType,
        receiver: intent.receiver,
        registryName: intent.registryName,
      });
    } catch (err) {
      return res.status(502).json({
        ok: false,
        error: 'payment-lookup-failed',
        detail: String(err?.message || err),
      });
    }

    if (!record) {
      return res.status(402).json({
        ok: false,
        error: 'payment-not-found',
        detail: 'No Payment Kit record for this nonce yet. Keep the QR up and poll again.',
        intent: publicIntent(intent),
      });
    }

    intent = updateIntent(nonce, {
      status: 'paid',
      paymentTransactionDigest: record.paymentTransactionDigest || intent.paymentTransactionDigest,
      paid_at: intent.paid_at || nowMs(),
      paymentRecordKey: record.key || null,
    });

    const petition = getPetition(intent.petition_id);
    if (!petition) {
      return res.status(404).json({ ok: false, error: 'petition-not-found' });
    }

    const skill = findSkill(petition.target_hardware_id, petition.command);
    if (!skill) {
      return res.status(404).json({
        ok: false,
        error: 'unknown-skill',
        detail: `No skill for ${petition.target_hardware_id}`,
      });
    }

    // Phone payer may differ from PC-connected petition.requester
    const payer =
      (typeof req.body?.payer === 'string' && req.body.payer.trim()) ||
      intent.payer ||
      petition.requester;

    const tx_id =
      (typeof req.body?.tx_id === 'string' && req.body.tx_id.trim()) ||
      `kiosk_${intent.nonce.slice(0, 8)}_${Date.now().toString(36)}`;

    const hireBody = {
      tx_id,
      requester: payer,
      target_hardware_id: petition.target_hardware_id,
      command: [...petition.command],
      petition_id: petition.petition_id,
    };

    const gate = assertHireAllowed({
      skill,
      body: hireBody,
      skipRequesterMatch: true,
    });
    if (!gate.ok) {
      return res.status(gate.status || 403).json({
        ok: false,
        error: gate.error,
        detail: gate.detail,
      });
    }

    try {
      const receipt = await dispatch(hireBody, skill);
      if (gate.petition?.petition_id) {
        markPetitionUsed(gate.petition.petition_id);
      }

      // Align petition requester with phone payer when known
      if (gate.petition && payer && gate.petition.requester !== payer) {
        gate.petition.requester = payer;
      }

      intent = updateIntent(nonce, {
        status: 'dispensed',
        dispensed_at: nowMs(),
        payer,
        tx_id,
        receipt,
        paymentTransactionDigest:
          record.paymentTransactionDigest || intent.paymentTransactionDigest,
      });

      return res.json({
        ok: true,
        message: 'execution correct',
        tx_id,
        petition_id: petition.petition_id,
        target: petition.target_hardware_id,
        receipt,
        gateway: intent.receiver,
        payer,
        transaction: intent.paymentTransactionDigest,
        intent: publicIntent(intent),
      });
    } catch (e) {
      return res.status(504).json({
        ok: false,
        error: 'esp32-no-receipt',
        detail: e.message,
      });
    }
  });

  // POST /asp/kiosk/complete — stateless: verify Payment Kit by nonce + dispense (QR checkout)
  // Used when the dapp created the Slush deep link locally (proven lab path) then asks gateway to run the motor.
  router.post('/asp/kiosk/complete', async (req, res) => {
    const body = req.body || {};
    const petition_id = typeof body.petition_id === 'string' ? body.petition_id.trim() : '';
    const nonce = typeof body.nonce === 'string' ? body.nonce.trim() : '';
    const amount = body.amount != null ? String(body.amount) : '';
    const coinType = typeof body.coinType === 'string' ? body.coinType.trim() : '';
    const receiver =
      (typeof body.receiver === 'string' && body.receiver.trim()) || settings.sui.address;

    if (!petition_id || !nonce || !amount || !coinType) {
      return res.status(400).json({
        ok: false,
        error: 'missing-fields',
        expected: ['petition_id', 'nonce', 'amount', 'coinType'],
      });
    }

    let record = null;
    try {
      record = await lookupPaymentRecord({
        nonce,
        amount,
        coinType,
        receiver,
        registryName: DEFAULT_REGISTRY_NAME,
      });
    } catch (err) {
      return res.status(502).json({
        ok: false,
        error: 'payment-lookup-failed',
        detail: String(err?.message || err),
      });
    }

    if (!record) {
      return res.status(402).json({
        ok: false,
        error: 'payment-not-found',
        detail: 'No Payment Kit record for this nonce yet.',
      });
    }

    const petition = getPetition(petition_id);
    if (!petition) {
      return res.status(404).json({ ok: false, error: 'petition-not-found' });
    }

    const skill = findSkill(petition.target_hardware_id, petition.command);
    if (!skill) {
      return res.status(404).json({
        ok: false,
        error: 'unknown-skill',
        detail: `No skill for ${petition.target_hardware_id}`,
      });
    }

    const payer =
      (typeof body.payer === 'string' && body.payer.trim()) || petition.requester;
    const tx_id =
      (typeof body.tx_id === 'string' && body.tx_id.trim()) ||
      `qr_${nonce.slice(0, 8)}_${Date.now().toString(36)}`;

    const hireBody = {
      tx_id,
      requester: payer,
      target_hardware_id: petition.target_hardware_id,
      command: [...petition.command],
      petition_id: petition.petition_id,
    };

    const gate = assertHireAllowed({
      skill,
      body: hireBody,
      skipRequesterMatch: true,
    });
    if (!gate.ok) {
      return res.status(gate.status || 403).json({
        ok: false,
        error: gate.error,
        detail: gate.detail,
      });
    }

    try {
      const receipt = await dispatch(hireBody, skill);
      if (gate.petition?.petition_id) {
        markPetitionUsed(gate.petition.petition_id);
      }
      if (gate.petition?.winner_ticket) {
        markWinnerClaimed({
          ticket: gate.petition.winner_ticket,
          petition_id: gate.petition.petition_id,
        });
      }
      if (gate.petition && payer && gate.petition.requester !== payer) {
        gate.petition.requester = payer;
      }

      // Keep an intent row for idempotency if client retries
      createIntent({
        nonce,
        petition_id,
        amount,
        coinType,
        receiver,
        registryName: DEFAULT_REGISTRY_NAME,
        payUrl: body.payUrl || `slush://pay?nonce=${nonce}`,
        status: 'dispensed',
        lab: false,
        created_at: nowMs(),
        updated_at: nowMs(),
        paymentTransactionDigest: record.paymentTransactionDigest || null,
        payer,
        receipt,
        tx_id,
        paid_at: nowMs(),
        dispensed_at: nowMs(),
      });

      return res.json({
        ok: true,
        message: 'execution correct',
        tx_id,
        petition_id: petition.petition_id,
        target: petition.target_hardware_id,
        receipt,
        gateway: receiver,
        payer,
        transaction: record.paymentTransactionDigest || null,
      });
    } catch (e) {
      return res.status(504).json({
        ok: false,
        error: 'esp32-no-receipt',
        detail: e.message,
      });
    }
  });

  // Demo helper: also wipe kiosk intents when clearing claims
  router.post('/asp/kiosk/reset', (_req, res) => {
    const cleared = clearIntents();
    return res.json({ ok: true, intentsCleared: cleared });
  });

  return router;
}
