// waits on hire settlement before advancing phases
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  completeKioskCheckout,
  createCheckoutPayIntent,
  createPetition,
  DISPENSE_ONCE,
  ENROLL_ACTION,
  GACHA_DEVICE_ID,
  getKioskLabIntent,
  getWinner,
  revokePetition,
  verifyProofOfHuman,
} from '../hire/gateway';
import type { ChatPhase, PohCardPayload } from '../../theme/tokens';

export const RELEASE_LABEL = 'Tokyo 2026 capsule';
export const DEVICE_LABEL = 'Event Gachapon';
export const PRICE_USDC = '0.002'; // 2000 atomic USDC (6 decimals)

export function useCheckoutFlow() {
  const [phase, setPhase] = useState<ChatPhase>('idle');
  const [busy, setBusy] = useState(false);
  const [statusText, setStatusText] = useState(
    'Enter your winner ticket from Get ticket, then tap Use ticket.'
  );
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [ticket, setTicket] = useState('');
  const [ticketReady, setTicketReady] = useState(false);
  const [activePoh, setActivePoh] = useState<PohCardPayload | null>(null);
  const [worldOpen, setWorldOpen] = useState(false);
  const [kioskPay, setKioskPay] = useState<{
    nonce: string;
    payUrl: string;
    webUrl?: string | null;
    amount: string;
    coinType: string;
    receiver: string;
  } | null>(null);
  const [lastHire, setLastHire] = useState<{
    tx_id?: string;
    suiDigest?: string | null;
    petition_id?: string | null;
    deviceReceipt?: unknown;
    gateway?: string | null;
    payer?: string | null;
    raw?: unknown;
  } | null>(null);

  const completeInFlight = useRef(false);
  const pollStop = useRef(false);
  /** Only true on reset/unmount — not when phase flips to executing mid-complete. */
  const abandonComplete = useRef(false);

  const startQrPay = useCallback(async (petition_id: string) => {
    setBusy(true);
    setErrorDetail(null);
    setStatusText('Creating Slush pay QR…');
    try {
      const data = await createCheckoutPayIntent(petition_id);
      const payUrl = data.deepLink || data.payUrl;
      if (!payUrl || !data.nonce) throw new Error('Missing payUrl/nonce');
      setKioskPay({
        nonce: data.nonce,
        payUrl,
        webUrl: data.webUrl || null,
        amount: data.amount,
        coinType: data.coinType,
        receiver: data.receiver,
      });
      completeInFlight.current = false;
      pollStop.current = false;
      abandonComplete.current = false;
      setPhase('awaiting_phone_pay');
      setStatusText(
        'Scan the QR with Slush on your phone. This PC waits — World ID already confirmed here.'
      );
    } catch (e: any) {
      setPhase('error');
      setErrorDetail(String(e?.message || e));
      setStatusText('Could not create the pay QR. Try Show pay QR again.');
    } finally {
      setBusy(false);
    }
  }, []);

  const loadTicket = useCallback(async (raw: string) => {
    const t = String(raw || '').trim().toUpperCase();
    setTicket(t);
    setTicketReady(false);
    setErrorDetail(null);
    if (!t) return;
    try {
      const data = await getWinner(t);
      if (!data.winner) {
        setErrorDetail('Unknown ticket.');
        setStatusText('Unknown ticket — open Get ticket on your phone and register first.');
        return;
      }
      if (data.winner.claimed_at) {
        setErrorDetail('This ticket already claimed a capsule.');
        setStatusText('Already redeemed — one ticket, one capsule.');
        return;
      }
      setTicketReady(true);
      setStatusText(`Ticket ${t} ready. Tap Start claim, then confirm with World ID.`);
    } catch (e: any) {
      setErrorDetail(String(e?.message || e));
      setStatusText('Unknown ticket — open Get ticket on your phone and register first.');
    }
  }, []);

  const requestCapsule = useCallback(async () => {
    if (busy) return;
    const t = ticket.trim().toUpperCase();
    if (!t) {
      setErrorDetail('Enter your winner ticket from Get ticket first.');
      setStatusText('Ticket required before you can claim.');
      return;
    }
    if (!ticketReady) {
      setErrorDetail('Use ticket first so we can load your World ID registration.');
      setStatusText('Enter your ticket and tap Use ticket before claiming.');
      return;
    }

    setBusy(true);
    setErrorDetail(null);
    setLastHire(null);
    setKioskPay(null);
    setPhase('requested');
    setStatusText('Preparing claim… capsule stays locked until you finish.');

    try {
      const data = await createPetition({
        target_hardware_id: GACHA_DEVICE_ID,
        command: [...DISPENSE_ONCE],
      });
      const petition = data.petition;
      const next = data.next;

      if (petition?.status === 'pending_human' || next?.step === 'proof_of_human') {
        const poh: PohCardPayload = {
          petition_id: petition.petition_id,
          device_name: DEVICE_LABEL,
          command: petition.command,
          release_id: petition.release_id,
          status: petition.status,
          preferred_action: next?.preferred_action || petition.release_action || petition.job_action,
          job_action: petition.job_action,
          release_action: petition.release_action,
        };
        setActivePoh(poh);
        setPhase('awaiting_human');
        setStatusText(
          'Next: confirm with World ID (same person as Get ticket), then pay on your phone.'
        );
      } else {
        const poh: PohCardPayload = {
          petition_id: petition.petition_id,
          device_name: DEVICE_LABEL,
          command: petition.command || [...DISPENSE_ONCE],
          release_id: petition.release_id,
          status: petition.status || 'authorized',
          preferred_action: petition.release_action || petition.job_action,
          job_action: petition.job_action,
          release_action: petition.release_action,
        };
        setActivePoh(poh);
        setPhase('authorized');
        setBusy(false);
        await startQrPay(poh.petition_id);
        return;
      }
    } catch (e: any) {
      setPhase('error');
      setErrorDetail(String(e?.message || e));
      setStatusText('Could not start the claim. Try Start claim again.');
    } finally {
      setBusy(false);
    }
  }, [busy, startQrPay, ticket, ticketReady]);

  const openWorldVerify = useCallback(() => {
    if (!activePoh || !ticketReady) return;
    setWorldOpen(true);
  }, [activePoh, ticketReady]);

  const onWorldProof = useCallback(
    async (idkitResponse: unknown) => {
      if (!activePoh?.petition_id) throw new Error('No active petition');
      if (!ticket) throw new Error('No winner ticket');
      try {
        const data = await verifyProofOfHuman(activePoh.petition_id, idkitResponse, {
          // Same enroll action as signup → same nullifier (recognize returning human).
          action: ENROLL_ACTION,
          signal: activePoh.petition_id,
          ticket: ticket.trim().toUpperCase(),
        });
        const petition = data.petition;
        const updated: PohCardPayload = {
          ...activePoh,
          status: petition?.status || 'authorized',
        };
        setActivePoh(updated);
        setPhase('authorized');
        setErrorDetail(null);
        // Keep World ✓ modal open for the demo — pay QR still starts underneath.
        setStatusText('Identity confirmed. Creating pay QR for your phone…');
        void startQrPay(updated.petition_id);
        return { ok: true as const, claimAlreadyUsed: false as const };
      } catch (e: any) {
        if (
          e?.claimAlreadyUsed ||
          e?.code === 'claim-already-used' ||
          e?.code === 'already-claimed'
        ) {
          setPhase('denied');
          setErrorDetail(String(e.message || e));
          setStatusText('Already claimed — this ticket already got a capsule.');
          setWorldOpen(false);
          return { ok: false as const, claimAlreadyUsed: true as const };
        }
        throw e;
      }
    },
    [activePoh, startQrPay, ticket]
  );

  useEffect(() => {
    if (phase !== 'awaiting_phone_pay' || !kioskPay?.nonce || !activePoh?.petition_id) return;
    if (completeInFlight.current) return;

    let stopPolling = false;
    pollStop.current = false;

    const finishDone = (opts: {
      tx_id?: string;
      suiDigest?: string | null;
      deviceReceipt?: unknown;
      gateway?: string | null;
      payer?: string | null;
      raw?: unknown;
      statusText: string;
      errorDetail?: string | null;
    }) => {
      if (abandonComplete.current) return;
      setPhase('done');
      setLastHire({
        tx_id: opts.tx_id,
        suiDigest: opts.suiDigest ?? null,
        petition_id: activePoh.petition_id,
        deviceReceipt: opts.deviceReceipt ?? null,
        gateway: opts.gateway ?? kioskPay.receiver,
        payer: opts.payer ?? null,
        raw: opts.raw,
      });
      setActivePoh((prev) => (prev ? { ...prev, status: 'used' } : prev));
      setKioskPay(null);
      setStatusText(opts.statusText);
      setErrorDetail(opts.errorDetail ?? null);
      setBusy(false);
    };

    const tick = async () => {
      if (stopPolling || pollStop.current || completeInFlight.current) return;
      try {
        const data = await getKioskLabIntent(kioskPay.nonce);
        const status = data.intent?.status;
        if (status !== 'paid' && status !== 'dispensed') return;

        const digest = data.intent?.paymentTransactionDigest || null;
        if (completeInFlight.current) return;
        completeInFlight.current = true;
        stopPolling = true;
        setBusy(true);
        setPhase('executing');
        setStatusText('Payment received — releasing capsule…');

        try {
          const out = await completeKioskCheckout({
            petition_id: activePoh.petition_id,
            nonce: kioskPay.nonce,
            amount: kioskPay.amount,
            coinType: kioskPay.coinType,
            receiver: kioskPay.receiver,
            payUrl: kioskPay.payUrl,
          });
          finishDone({
            tx_id: out.tx_id,
            suiDigest: out.transaction || digest,
            deviceReceipt: out.receipt ?? null,
            gateway: out.gateway || kioskPay.receiver,
            payer: out.payer || null,
            raw: out,
            statusText: 'Done. Payment settled and one capsule was released.',
          });
        } catch (e: any) {
          if (abandonComplete.current) return;
          const statusCode = e?.status;
          const code = e?.code || '';
          const msg = String(e?.message || e);

          // Motor often runs before MQTT receipt arrives — don't leave UI stuck / don't re-fire.
          if (
            statusCode === 504 ||
            code === 'esp32-no-receipt' ||
            /receipt timeout/i.test(msg)
          ) {
            finishDone({
              tx_id: `qr_${kioskPay.nonce.slice(0, 8)}`,
              suiDigest: digest,
              deviceReceipt: null,
              gateway: kioskPay.receiver,
              payer: null,
              raw: { note: 'dispensed-receipt-timeout', error: msg },
              statusText:
                'Done. Payment settled and dispense sent — check the tray (receipt was slow).',
              errorDetail: msg,
            });
            return;
          }

          if (statusCode === 404 || code === 'payment-not-found') {
            finishDone({
              tx_id: `pay_${kioskPay.nonce.slice(0, 8)}`,
              suiDigest: digest,
              deviceReceipt: null,
              gateway: kioskPay.receiver,
              payer: null,
              raw: { note: 'paid-on-chain', error: msg },
              statusText:
                statusCode === 404
                  ? 'Payment OK on-chain. Gateway needs /asp/kiosk/complete to release the capsule.'
                  : msg,
              errorDetail: msg,
            });
            return;
          }

          // Real failure — surface error; do not auto-retry (avoids double dispense).
          setPhase('error');
          setErrorDetail(msg);
          setStatusText('Payment seen but capsule failed. Use Reset demo before trying again.');
          setBusy(false);
          completeInFlight.current = false;
        }
      } catch {
        // keep polling
      }
    };

    void tick();
    const id = setInterval(() => void tick(), 2000);
    return () => {
      // Stop polling only — do NOT abandon an in-flight complete (phase→executing remounts this effect).
      stopPolling = true;
      pollStop.current = true;
      clearInterval(id);
    };
  }, [phase, kioskPay, activePoh?.petition_id]);

  const revoke = useCallback(async () => {
    if (!activePoh?.petition_id || busy) return;
    setBusy(true);
    try {
      await revokePetition(activePoh.petition_id);
      abandonComplete.current = true;
      completeInFlight.current = false;
      setPhase('revoked');
      setActivePoh(null);
      setKioskPay(null);
      setStatusText('Claim cancelled — nothing was released.');
      setErrorDetail(null);
    } catch (e: any) {
      setErrorDetail(String(e?.message || e));
      setStatusText('Could not cancel. Try again.');
    } finally {
      setBusy(false);
    }
  }, [activePoh, busy]);

  const reset = useCallback(() => {
    pollStop.current = true;
    completeInFlight.current = false;
    abandonComplete.current = true;
    setPhase('idle');
    setActivePoh(null);
    setWorldOpen(false);
    setLastHire(null);
    setKioskPay(null);
    setErrorDetail(null);
    setBusy(false);
    setTicket('');
    setTicketReady(false);
    setStatusText('Enter your winner ticket from Get ticket, then tap Use ticket.');
  }, []);

  const retryQr = useCallback(() => {
    if (!activePoh?.petition_id || activePoh.status !== 'authorized') return;
    void startQrPay(activePoh.petition_id);
  }, [activePoh, startQrPay]);

  // Safety net: if complete hangs after motor already ran, don't leave the kiosk on Working…
  useEffect(() => {
    if (phase !== 'executing') return;
    const id = setTimeout(() => {
      if (abandonComplete.current) return;
      setPhase('done');
      setBusy(false);
      setStatusText(
        'Done. Capsule command was sent — check the tray (screen waited too long for a receipt).'
      );
      setKioskPay(null);
      setActivePoh((prev) => (prev ? { ...prev, status: 'used' } : prev));
    }, 45_000);
    return () => clearTimeout(id);
  }, [phase]);

  return {
    phase,
    busy,
    statusText,
    errorDetail,
    ticket,
    setTicket,
    loadTicket,
    ticketReady,
    enrollAction: ENROLL_ACTION,
    activePoh,
    worldOpen,
    setWorldOpen,
    lastHire,
    kioskPay,
    requestCapsule,
    openWorldVerify,
    onWorldProof,
    retryQr,
    revoke,
    reset,
  };
}
