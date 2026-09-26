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
    'Enter your ticket, then continue.'
  );
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [ticket, setTicket] = useState('');
  const [ticketReady, setTicketReady] = useState(false);
  /** Ticket (or World) already redeemed — block claim UI; user can try another ticket. */
  const [alreadyClaimed, setAlreadyClaimed] = useState(false);
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
        'Scan the Slush QR on your phone. Identity is already verified here — payment settles on Sui.'
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
    setAlreadyClaimed(false);
    setErrorDetail(null);
    if (!t) return;

    // Drop any in-flight claim from a previous ticket.
    pollStop.current = true;
    completeInFlight.current = false;
    abandonComplete.current = true;
    setActivePoh(null);
    setKioskPay(null);
    setLastHire(null);
    setWorldOpen(false);

    try {
      const data = await getWinner(t);
      if (!data.winner) {
        setPhase('idle');
        setErrorDetail('Unknown ticket.');
        setStatusText('Unknown ticket — enroll with Get first to receive a code.');
        return;
      }
      if (data.winner.claimed_at) {
        setAlreadyClaimed(true);
        setPhase('denied');
        setErrorDetail(null);
        setStatusText('This ticket already claimed its capsule. Asp will not release another.');
        return;
      }

      // Fresh unused ticket → start claim so World ID shows immediately.
      setTicketReady(true);
      setBusy(true);
      setPhase('requested');
      setStatusText('Checking entitlement…');
      try {
        const petitionData = await createPetition({
          target_hardware_id: GACHA_DEVICE_ID,
          command: [...DISPENSE_ONCE],
        });
        const petition = petitionData.petition;
        const next = petitionData.next;
        const poh: PohCardPayload = {
          petition_id: petition.petition_id,
          device_name: DEVICE_LABEL,
          command: petition.command || [...DISPENSE_ONCE],
          release_id: petition.release_id,
          status: petition.status || 'pending_human',
          preferred_action:
            next?.preferred_action || petition.release_action || petition.job_action,
          job_action: petition.job_action,
          release_action: petition.release_action,
        };
        setActivePoh(poh);
        if (petition?.status === 'pending_human' || next?.step === 'proof_of_human') {
          setPhase('awaiting_human');
          setStatusText(
            'Confirm you are the same human who enrolled — then pay on Sui to release the capsule.'
          );
        } else {
          setPhase('authorized');
          setBusy(false);
          await startQrPay(poh.petition_id);
          return;
        }
      } catch (e: any) {
        setPhase('error');
        setErrorDetail(String(e?.message || e));
        setStatusText('Could not start claim. Tap Continue again.');
      } finally {
        setBusy(false);
      }
    } catch (e: any) {
      setPhase('idle');
      setErrorDetail(String(e?.message || e));
      setStatusText('Unknown ticket — enroll with Get first to receive a code.');
    }
  }, [startQrPay]);

  const requestCapsule = useCallback(async () => {
    if (busy) return;
    const t = ticket.trim().toUpperCase();
    if (!t) {
      setErrorDetail('Enter your ticket first.');
      setStatusText('A ticket is required before claim.');
      return;
    }
    if (!ticketReady) {
      setErrorDetail('Look up your ticket first.');
      setStatusText('Enter your ticket and tap Continue.');
      return;
    }
    // Re-run the same path as Use ticket (fresh petition + World).
    await loadTicket(t);
  }, [busy, loadTicket, ticket, ticketReady]);

  const openWorldVerify = useCallback(() => {
    if (!activePoh) return;
    setWorldOpen(true);
  }, [activePoh]);

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
        setStatusText('Identity confirmed. Creating Slush pay link…');
        void startQrPay(updated.petition_id);
        return { ok: true as const, claimAlreadyUsed: false as const };
      } catch (e: any) {
        if (
          e?.claimAlreadyUsed ||
          e?.code === 'claim-already-used' ||
          e?.code === 'already-claimed'
        ) {
          setPhase('denied');
          setAlreadyClaimed(true);
          setErrorDetail(null);
          setStatusText('This ticket already claimed its capsule. Asp will not release another.');
          setTicketReady(false);
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
      setTicketReady(false);
      setStatusText(opts.statusText);
      setErrorDetail(opts.errorDetail ?? null);
      setBusy(false);
    };

    const finishDeviceError = (opts: {
      suiDigest?: string | null;
      statusText: string;
      errorDetail?: string | null;
    }) => {
      if (abandonComplete.current) return;
      // Ticket is burned on the gateway once payment settles — don't fake Done.
      setPhase('denied');
      setLastHire({
        tx_id: `qr_${kioskPay.nonce.slice(0, 8)}`,
        suiDigest: opts.suiDigest ?? null,
        petition_id: activePoh.petition_id,
        deviceReceipt: null,
        gateway: kioskPay.receiver,
        payer: null,
        raw: { note: 'device-offline-after-pay', error: opts.errorDetail },
      });
      setActivePoh((prev) => (prev ? { ...prev, status: 'used' } : prev));
      setKioskPay(null);
      setTicketReady(false);
      setAlreadyClaimed(true);
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

          // Payment settled; motor offline/timeout. Ticket already burned server-side.
          if (
            statusCode === 504 ||
            code === 'esp32-no-receipt' ||
            /receipt timeout|MQTT disconnected/i.test(msg)
          ) {
            finishDeviceError({
              suiDigest: digest,
              statusText:
                'Payment settled — this ticket is used and cannot be claimed again. The machine did not confirm (offline or timeout).',
              errorDetail: msg,
            });
            setAlreadyClaimed(true);
            return;
          }

          if (statusCode === 404 || code === 'payment-not-found') {
            setPhase('error');
            setErrorDetail(msg);
            setStatusText(
              statusCode === 404
                ? 'Payment OK on-chain. Gateway needs /asp/kiosk/complete to release the capsule.'
                : msg
            );
            setBusy(false);
            completeInFlight.current = false;
            return;
          }

          // Real failure — surface error; do not auto-retry (avoids double dispense).
          setPhase('error');
          setErrorDetail(msg);
          setTicketReady(false);
          setAlreadyClaimed(true);
          setStatusText(
            'Payment settled — this ticket is used and cannot be claimed again. Capsule release failed.'
          );
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
    setAlreadyClaimed(false);
    setStatusText('Enter your ticket, then continue.');
  }, []);

  /** Clear this ticket so someone else can enter a different WIN-… (does not wipe the store). */
  const tryAnotherTicket = useCallback(() => {
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
    setAlreadyClaimed(false);
    setStatusText('Enter another unused ticket, then continue.');
  }, []);

  const retryQr = useCallback(() => {
    if (!activePoh?.petition_id || activePoh.status !== 'authorized') return;
    void startQrPay(activePoh.petition_id);
  }, [activePoh, startQrPay]);

  // Safety net: if complete hangs, don't leave the kiosk on Working…
  useEffect(() => {
    if (phase !== 'executing') return;
    const id = setTimeout(() => {
      if (abandonComplete.current) return;
      setPhase('error');
      setBusy(false);
      setTicketReady(false);
      setAlreadyClaimed(true);
      setKioskPay(null);
      setActivePoh((prev) => (prev ? { ...prev, status: 'used' } : prev));
      setStatusText(
        'Timed out waiting for the machine. If you already paid, this ticket is used and cannot be claimed again.'
      );
      setErrorDetail('complete-timeout');
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
    alreadyClaimed,
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
    tryAnotherTicket,
  };
}
