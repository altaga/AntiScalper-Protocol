import { useCallback, useEffect, useRef, useState } from 'react';
import {
  completeKioskCheckout,
  createCheckoutPayIntent,
  createPetition,
  DISPENSE_ONCE,
  GACHA_DEVICE_ID,
  getKioskLabIntent,
  revokePetition,
  verifyProofOfHuman,
} from '../hire/gateway';
import type { ChatPhase, PohCardPayload } from '../../theme/tokens';

export const RELEASE_LABEL = 'Tokyo 2026 capsule';
export const DEVICE_LABEL = 'Event Gachapon';
export const PRICE_USDC = '0.002'; // 2000 atomic USDC (6 decimals)

/**
 * Demo v1 — pre-ticket / pre-session flow that already worked:
 * petition → World Selfie (uniqueness) → Slush QR → motor → Sui receipt.
 */
export function useDemoV1Flow() {
  const [phase, setPhase] = useState<ChatPhase>('idle');
  const [busy, setBusy] = useState(false);
  const [statusText, setStatusText] = useState(
    'Tap Start claim. Confirm with World ID, pay with Slush on your phone, then get one capsule.'
  );
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
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
      setStatusText('Scan the QR with Slush on your phone. This PC waits — World ID already confirmed here.');
    } catch (e: any) {
      setPhase('error');
      setErrorDetail(String(e?.message || e));
      setStatusText('Could not create the pay QR. Try Show pay QR again.');
    } finally {
      setBusy(false);
    }
  }, []);

  const requestCapsule = useCallback(async () => {
    if (busy) return;
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
        setStatusText('Next: confirm with World ID on this PC, then pay on your phone.');
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
  }, [busy, startQrPay]);

  const openWorldVerify = useCallback(() => {
    if (!activePoh) return;
    setWorldOpen(true);
  }, [activePoh]);

  const onWorldProof = useCallback(
    async (idkitResponse: unknown) => {
      if (!activePoh?.petition_id) throw new Error('No active petition');
      const action =
        activePoh.preferred_action || activePoh.release_action || activePoh.job_action || undefined;
      try {
        // Uniqueness path (no ticket). Gateway requires signal === petition_id.
        const data = await verifyProofOfHuman(activePoh.petition_id, idkitResponse, {
          action,
          signal: activePoh.petition_id,
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
          setStatusText(
            'Already claimed — this World ID already got a capsule. You cannot claim again.'
          );
          setActivePoh((prev) => (prev ? { ...prev, status: 'denied' as any } : prev));
          setWorldOpen(false);
          return { ok: false as const, claimAlreadyUsed: true as const };
        }
        throw e;
      }
    },
    [activePoh, startQrPay]
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

    const finishDeviceError = (opts: {
      suiDigest?: string | null;
      statusText: string;
      errorDetail?: string | null;
    }) => {
      if (abandonComplete.current) return;
      setPhase('error');
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

          if (
            statusCode === 504 ||
            code === 'esp32-no-receipt' ||
            /receipt timeout|MQTT disconnected/i.test(msg)
          ) {
            finishDeviceError({
              suiDigest: digest,
              statusText:
                'Payment settled — claim used. You cannot claim again. The machine did not confirm (offline or timeout).',
              errorDetail: msg,
            });
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

          setPhase('error');
          setErrorDetail(msg);
          setStatusText(
            'Payment settled — claim used. You cannot claim again. Capsule release failed.'
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
    setStatusText(
      'Tap Start claim. Confirm with World ID, pay with Slush on your phone, then get one capsule.'
    );
  }, []);

  const retryQr = useCallback(() => {
    if (!activePoh?.petition_id || activePoh.status !== 'authorized') return;
    void startQrPay(activePoh.petition_id);
  }, [activePoh, startQrPay]);

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

  const worldAction =
    activePoh?.preferred_action || activePoh?.release_action || activePoh?.job_action || '';

  return {
    phase,
    busy,
    statusText,
    errorDetail,
    activePoh,
    worldAction,
    worldSignal: activePoh?.petition_id || '',
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
