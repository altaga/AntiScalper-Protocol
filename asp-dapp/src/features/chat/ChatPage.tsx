import React, { useEffect, useRef, useState } from 'react';
import logoImage from '../../assets/logo.png';
import { MessageBubble } from './MessageBubble';
import { useAspChat } from './useAspChat';
import { WorldVerifyModal } from '../world/WorldVerifyModal';
import { theme } from '../../theme/tokens';

const { ConnectButton, useCurrentAccount, useSuiClient, useSignTransaction } = require('@mysten/dapp-kit');
const { x402Client } = require('@altaga/x402-sui/core/client');
const { x402HTTPClient } = require('@altaga/x402-sui/core/http');
const { ExactSuiDappScheme } = require('@altaga/x402-sui/sui/exact/client');
const { toast } = require('react-hot-toast');

export function ChatPage() {
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutateAsync: signTransaction } = useSignTransaction();
  const [input, setInput] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  const x402Fetch = async (url: string, init: RequestInit) => {
    if (!account) throw new Error('Wallet not connected');
    const coreClient = new x402Client().register(
      'exact:sui:mainnet',
      new ExactSuiDappScheme(suiClient, account.address, signTransaction)
    );
    const client = new x402HTTPClient(coreClient);
    return client.fetch(url, init);
  };

  const chat = useAspChat({
    accountAddress: account?.address || null,
    x402Fetch,
  });

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [chat.messages, chat.busy]);

  const onSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const value = input;
    setInput('');
    await chat.sendFreeText(value);
  };

  return (
    <div>
      <div style={styles.headerRow}>
        <div style={styles.brand}>
          <img src={logoImage} alt="Asp" style={styles.logo} />
          <div>
            <div style={styles.brandName}>Asp Chat</div>
            <div style={styles.brandSub}>PoH-gated device hire</div>
          </div>
        </div>
        <ConnectButton connectText="Connect wallet" />
      </div>

      <div ref={listRef} style={styles.messageList}>
        {chat.messages.map((m) => (
          <MessageBubble
            key={m.id}
            message={m}
            verifyingId={chat.worldOpen ? chat.activePoh?.petition_id : null}
            onVerify={chat.openWorldVerify}
            onRevoke={chat.cancelPoh}
          />
        ))}
      </div>

      <div style={styles.quickRow}>
        <button type="button" style={styles.chip} onClick={() => chat.requestCapsule()} disabled={chat.busy}>
          Request capsule
        </button>
        <button
          type="button"
          style={styles.chip}
          onClick={() => chat.activePoh && chat.openWorldVerify(chat.activePoh)}
          disabled={!chat.activePoh || chat.busy}
        >
          Verify World
        </button>
        <button type="button" style={styles.chipPrimary} onClick={() => chat.payAndDispense()} disabled={chat.busy}>
          Pay & dispense
        </button>
      </div>

      <form style={styles.composer} onSubmit={onSubmit}>
        <input
          style={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Message Asp…"
          disabled={chat.busy}
        />
        <button type="submit" style={styles.send} disabled={chat.busy || !input.trim()}>
          Send
        </button>
      </form>

      <WorldVerifyModal
        open={chat.worldOpen}
        onOpenChange={chat.setWorldOpen}
        action={chat.activePoh?.preferred_action || chat.activePoh?.job_action || 'asp-job-pending'}
        signal={account?.address}
        onVerified={async (result) => {
          try {
            await chat.onWorldProof(result);
            toast.success('World verification accepted');
          } catch (e: any) {
            toast.error(e?.message || 'Verify failed');
            throw e;
          }
        }}
        onError={(msg) => toast.error(msg)}
      />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  brand: { display: 'flex', alignItems: 'center', gap: 12 },
  logo: { width: 36, height: 36, borderRadius: 10 },
  brandName: { fontSize: 17, fontWeight: 650 },
  brandSub: { fontSize: 12, color: theme.textSecondary },
  messageList: { minHeight: 360, marginBottom: 12 },
  quickRow: { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: {
    border: `1px solid ${theme.borderStrong}`,
    background: theme.surface,
    borderRadius: 980,
    padding: '8px 14px',
    fontSize: 13,
    cursor: 'pointer',
  },
  chipPrimary: {
    border: 'none',
    background: theme.accent,
    color: '#fff',
    borderRadius: 980,
    padding: '8px 14px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  composer: {
    display: 'flex',
    gap: 10,
    background: theme.surface,
    border: `1px solid ${theme.border}`,
    borderRadius: 24,
    padding: 8,
  },
  input: {
    flex: 1,
    border: 'none',
    outline: 'none',
    background: 'transparent',
    fontSize: 15,
    padding: '10px 12px',
  },
  send: {
    border: 'none',
    background: theme.text,
    color: '#fff',
    borderRadius: 980,
    padding: '10px 18px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
};
