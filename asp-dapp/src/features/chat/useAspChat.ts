import { useCallback, useRef, useState } from 'react';
import {
  createPetition,
  DISPENSE_ONCE,
  GACHA_DEVICE_ID,
  gatewayBaseUrl,
  revokePetition,
  verifyProofOfHuman,
} from '../hire/gateway';
import type { ChatMessage, ChatPhase, PohCardPayload } from '../../theme/tokens';

function uid(prefix = 'm') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

type HireDeps = {
  accountAddress: string | null;
  x402Fetch: (url: string, init: RequestInit) => Promise<Response>;
};

export function useAspChat({ accountAddress, x402Fetch }: HireDeps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text:
        'Hi — I am Asp. I can talk to machines on the network.\n\nWhen a device needs Proof of Human (like the Event Gachapon), it will block until you complete World Selfie Check. Payment alone is not enough.',
      createdAt: Date.now(),
    },
  ]);
  const [phase, setPhase] = useState<ChatPhase>('idle');
  const [busy, setBusy] = useState(false);
  const [activePoh, setActivePoh] = useState<PohCardPayload | null>(null);
  const [worldOpen, setWorldOpen] = useState(false);
  const scrollLock = useRef(false);

  const push = useCallback((msg: Omit<ChatMessage, 'id' | 'createdAt'> & { id?: string }) => {
    setMessages((prev) => [
      ...prev,
      { id: msg.id || uid(), createdAt: Date.now(), ...msg },
    ]);
  }, []);

  const requestCapsule = useCallback(async () => {
    if (!accountAddress) {
      push({
        role: 'assistant',
        text: 'Connect your Sui wallet first — the device binds authorization to the requester address.',
      });
      return;
    }
    if (busy) return;
    setBusy(true);
    setPhase('requested');
    push({ role: 'user', text: 'Request one capsule from the Event Gachapon.' });

    try {
      const data = await createPetition({
        requester: accountAddress,
        target_hardware_id: GACHA_DEVICE_ID,
        command: [...DISPENSE_ONCE],
      });
      const petition = data.petition;
      const next = data.next;

      if (petition?.status === 'pending_human' || next?.step === 'proof_of_human') {
        const poh: PohCardPayload = {
          petition_id: petition.petition_id,
          device_name: 'Event Gachapon',
          command: petition.command,
          release_id: petition.release_id,
          status: petition.status,
          preferred_action: next?.preferred_action || petition.release_action || petition.job_action,
          job_action: petition.job_action,
          release_action: petition.release_action,
        };
        setActivePoh(poh);
        setPhase('awaiting_human');
        push({
          role: 'assistant',
          text: 'The gachapon will not spin yet. It requires Proof of Human for this release — verify with World, then we can pay and dispense.',
          poh,
          phase: 'awaiting_human',
        });
      } else {
        setPhase('authorized');
        push({
          role: 'assistant',
          text: 'Petition ready (no PoH required for this skill). Say “pay” or tap Pay & dispense when you want to continue.',
        });
      }
    } catch (e: any) {
      setPhase('error');
      push({ role: 'assistant', text: `Could not create petition: ${e?.message || e}` });
    } finally {
      setBusy(false);
    }
  }, [accountAddress, busy, push]);

  const openWorldVerify = useCallback((poh: PohCardPayload) => {
    setActivePoh(poh);
    setWorldOpen(true);
  }, []);

  const onWorldProof = useCallback(
    async (idkitResponse: unknown) => {
      if (!activePoh?.petition_id) throw new Error('No active petition');
      const action =
        activePoh.preferred_action || activePoh.release_action || activePoh.job_action || undefined;
      const data = await verifyProofOfHuman(activePoh.petition_id, idkitResponse, {
        action,
        signal: accountAddress || undefined,
      });
      const petition = data.petition;
      const updated: PohCardPayload = {
        ...activePoh,
        status: petition?.status || 'authorized',
      };
      setActivePoh(updated);
      setPhase('authorized');
      setMessages((prev) =>
        prev.map((m) =>
          m.poh?.petition_id === updated.petition_id ? { ...m, poh: updated, phase: 'authorized' } : m
        )
      );
      push({
        role: 'assistant',
        text: 'Human verified. The device has authorized this petition. I can take payment and ask it to DISPENSE_ONCE now.',
        phase: 'authorized',
      });
    },
    [accountAddress, activePoh, push]
  );

  const payAndDispense = useCallback(async () => {
    if (!accountAddress) {
      push({ role: 'assistant', text: 'Connect your wallet to pay.' });
      return;
    }
    if (!activePoh || activePoh.status !== 'authorized') {
      push({
        role: 'assistant',
        text: 'Proof of Human is still required. Open Verify with World first — the device will refuse hire until then.',
      });
      if (activePoh) setWorldOpen(true);
      return;
    }
    if (busy) return;
    setBusy(true);
    setPhase('paying');
    push({ role: 'user', text: 'Pay and dispense.' });
    push({ role: 'assistant', text: 'Requesting payment challenge from the gateway…', phase: 'paying' });

    try {
      const targetUrl = `${gatewayBaseUrl()}/asp/hire`;
      const petitionPayload = {
        tx_id: `tx_${Date.now()}`,
        requester: accountAddress,
        target_hardware_id: GACHA_DEVICE_ID,
        command: [...DISPENSE_ONCE],
        petition_id: activePoh.petition_id,
      };

      setPhase('executing');
      const res = await x402Fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(petitionPayload),
      });

      const raw = await res.text();
      let data: any = null;
      try {
        data = JSON.parse(raw);
      } catch {
        data = { raw };
      }

      if (!res.ok) {
        const err = data?.error || raw.slice(0, 200);
        if (err === 'pending-human' || err === 'human-proof-required') {
          setPhase('awaiting_human');
          push({
            role: 'assistant',
            text: 'The device refused: Proof of Human is still required. Complete World verification, then try again.',
            poh: activePoh,
          });
          setWorldOpen(true);
          return;
        }
        setPhase('error');
        push({
          role: 'assistant',
          text: `Hire failed: ${data?.detail || err}`,
        });
        return;
      }

      setPhase('done');
      push({
        role: 'assistant',
        text: 'Done. Payment settled and the gachapon should have dispensed one capsule for this release.',
        phase: 'done',
      });
    } catch (e: any) {
      setPhase('error');
      push({ role: 'assistant', text: `Hire error: ${e?.message || e}` });
    } finally {
      setBusy(false);
    }
  }, [accountAddress, activePoh, busy, push, x402Fetch]);

  const cancelPoh = useCallback(
    async (poh: PohCardPayload) => {
      try {
        await revokePetition(poh.petition_id);
        setPhase('revoked');
        setActivePoh(null);
        push({
          role: 'assistant',
          text: 'Request revoked. The motor will not run for that petition.',
          phase: 'revoked',
        });
      } catch (e: any) {
        push({ role: 'assistant', text: `Could not revoke: ${e?.message || e}` });
      }
    },
    [push]
  );

  const sendFreeText = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;
      push({ role: 'user', text: trimmed });

      const lower = trimmed.toLowerCase();
      if (
        /capsule|gacha|gachapon|dispense|merch|claim/.test(lower) ||
        lower.includes('request')
      ) {
        await requestCapsule();
        return;
      }
      if (/pay|dispense|hire|buy/.test(lower) && activePoh) {
        await payAndDispense();
        return;
      }
      if (/verify|world|selfie|human/.test(lower) && activePoh) {
        openWorldVerify(activePoh);
        push({
          role: 'assistant',
          text: 'Opening World Selfie Check. The device stays blocked until verification succeeds.',
        });
        return;
      }

      // Lightweight agent path via Bedrock when configured
      setBusy(true);
      try {
        const res = await fetch('/api/agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: trimmed }),
        });
        const data = await res.json().catch(() => ({}));
        const reply =
          (typeof data?.message === 'string' && data.message.trim() && data.message) ||
          (typeof data?.detail === 'string' && data.detail.trim() && data.detail) ||
          (res.ok
            ? 'Understood.'
            : 'Agent is not available right now. Try “request a capsule” to run the device proof flow.');
        push({ role: 'assistant', text: String(reply) });

        const tools = Array.isArray(data?.tool_calls) ? data.tool_calls : [];
        const wantsDispense = tools.some(
          (t: any) =>
            t?.target_hardware_id === GACHA_DEVICE_ID &&
            Array.isArray(t?.command) &&
            t.command[0] === 'DISPENSE_ONCE'
        );
        if (wantsDispense) {
          await requestCapsule();
        }
      } catch (e: any) {
        push({
          role: 'assistant',
          text: `I can still help with the capsule flow. Try “request a capsule”. (${e?.message || e})`,
        });
      } finally {
        setBusy(false);
      }
    },
    [activePoh, busy, openWorldVerify, payAndDispense, push, requestCapsule]
  );

  return {
    messages,
    phase,
    busy,
    activePoh,
    worldOpen,
    setWorldOpen,
    scrollLock,
    requestCapsule,
    payAndDispense,
    openWorldVerify,
    onWorldProof,
    cancelPoh,
    sendFreeText,
  };
}
