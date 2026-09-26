import React, { useEffect, useRef, useState } from 'react';
import { theme } from '../../theme/tokens';

type RpContext = {
  rp_id: string;
  nonce: string;
  created_at: number;
  expires_at: number;
  signature: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: string;
  signal?: string;
  title?: string;
  subtitle?: string;
  /** Shown after server verify succeeds (demo stays on this panel until Close). */
  successTitle?: string;
  successSubtitle?: string;
  onVerified: (idkitResponse: unknown) => Promise<void> | void;
  onError?: (message: string) => void;
};

/**
 * Lazy-loads IDKit. RP signature is fetched once per open — do NOT put
 * parent callbacks in the effect deps or setState during verify remounts the widget
 * (kills IDKit's success checkmark even when backend verify already succeeded).
 */
export function WorldVerifyModal({
  open,
  onOpenChange,
  action,
  signal,
  title,
  subtitle,
  successTitle,
  successSubtitle,
  onVerified,
  onError,
}: Props) {
  const [rpContext, setRpContext] = useState<RpContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [Widget, setWidget] = useState<any>(null);
  const [preset, setPreset] = useState<any>(null);
  const [appId, setAppId] = useState('');
  const [environment, setEnvironment] = useState<'sandbox' | 'staging' | 'production'>('sandbox');
  const [phase, setPhase] = useState<'idle' | 'idkit' | 'success'>('idle');
  const holdOpenRef = useRef(false);

  const onVerifiedRef = useRef(onVerified);
  const onErrorRef = useRef(onError);
  const onOpenChangeRef = useRef(onOpenChange);
  onVerifiedRef.current = onVerified;
  onErrorRef.current = onError;
  onOpenChangeRef.current = onOpenChange;

  useEffect(() => {
    if (!open) {
      setRpContext(null);
      setLoading(false);
      setPhase('idle');
      holdOpenRef.current = false;
      return;
    }

    let cancelled = false;
    holdOpenRef.current = false;
    setPhase('idkit');
    setLoading(true);

    (async () => {
      try {
        // Metro web: dynamic import() creates an async chunk whose numeric module
        // IDs can desync from the main bundle ("Requiring unknown module N").
        // Static require() stays on the same module map (same pattern as dapp-kit).
        const idkit = require('@worldcoin/idkit');
        if (cancelled) return;
        setWidget(() => idkit.IDKitRequestWidget);
        const makePreset =
          idkit.selfieCheckLegacy || idkit.selfieCheck || idkit.deviceLegacy;
        setPreset(makePreset ? makePreset(signal ? { signal } : undefined) : undefined);

        const publicAppId = (process.env.EXPO_PUBLIC_WORLD_APP_ID || '').trim();
        const env = (process.env.EXPO_PUBLIC_WORLD_ENVIRONMENT || 'sandbox').trim() as
          | 'sandbox'
          | 'staging'
          | 'production';
        setAppId(publicAppId);
        setEnvironment(env);

        if (!publicAppId) {
          throw new Error('EXPO_PUBLIC_WORLD_APP_ID is missing (client bundle).');
        }

        const sigRes = await fetch('/api/world/rp-signature', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        });
        const sigBody = await sigRes.json().catch(() => ({}));
        if (!sigRes.ok) {
          throw new Error(
            sigBody?.message || sigBody?.error || `RP signature failed (${sigRes.status})`
          );
        }
        if (cancelled) return;
        setRpContext({
          rp_id: String(sigBody.rp_id),
          nonce: String(sigBody.nonce),
          created_at: Number(sigBody.created_at),
          expires_at: Number(sigBody.expires_at),
          signature: String(sigBody.signature || sigBody.sig),
        });
      } catch (e: any) {
        onErrorRef.current?.(String(e?.message || e));
        onOpenChangeRef.current(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // Only re-init when the modal opens or action/signal changes — never on parent setState.
  }, [open, action, signal]);

  if (!open) return null;

  return (
    <div style={styles.backdrop} onClick={() => onOpenChangeRef.current(false)}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <div>
            <div style={styles.title}>{title || 'World Selfie Check'}</div>
            <div style={styles.sub}>
              {phase === 'success'
                ? 'Verified. You can close this panel.'
                : subtitle ||
                  'The device is waiting for Proof of Human before it will run.'}
            </div>
          </div>
          <button type="button" style={styles.close} onClick={() => onOpenChangeRef.current(false)}>
            Close
          </button>
        </div>

        {phase === 'success' ? (
          <div style={styles.success}>
            <div style={styles.check}>✓</div>
            <div style={styles.successTitle}>{successTitle || 'World validated'}</div>
            <div style={styles.successSub}>
              {successSubtitle || 'Proof verified on the server. Close when you are ready.'}
            </div>
          </div>
        ) : loading || !rpContext || !Widget || !preset ? (
          <div style={styles.loading}>{loading ? 'Preparing verification…' : 'Loading World IDKit…'}</div>
        ) : (
          <Widget
            open={true}
            onOpenChange={(next: boolean) => {
              // IDKit closes itself after verify — hold open so our ✓ panel can show.
              if (!next && holdOpenRef.current) return;
              onOpenChangeRef.current(next);
            }}
            app_id={appId}
            action={action}
            rp_context={rpContext}
            allow_legacy_proofs={true}
            environment={environment}
            preset={preset}
            handleVerify={async (result: unknown) => {
              await onVerifiedRef.current(result);
              holdOpenRef.current = true;
              setPhase('success');
            }}
            onSuccess={() => {
              holdOpenRef.current = true;
              setPhase('success');
            }}
          />
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.35)',
    backdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: 16,
  },
  panel: {
    width: 'min(440px, 100%)',
    background: theme.surface,
    borderRadius: 24,
    boxShadow: theme.shadow,
    padding: 20,
    fontFamily: theme.font,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 16,
  },
  title: { fontSize: 18, fontWeight: 600, color: theme.text },
  sub: { fontSize: 13, color: theme.textSecondary, marginTop: 4, lineHeight: 1.4 },
  close: {
    border: `1px solid ${theme.border}`,
    background: theme.bg,
    borderRadius: 980,
    padding: '8px 12px',
    fontSize: 12,
    cursor: 'pointer',
    color: theme.textSecondary,
    height: 'fit-content',
  },
  loading: {
    padding: '28px 8px',
    textAlign: 'center' as const,
    color: theme.textSecondary,
    fontSize: 14,
  },
  success: {
    padding: '36px 8px',
    textAlign: 'center' as const,
  },
  check: {
    width: 56,
    height: 56,
    margin: '0 auto 12px',
    borderRadius: 999,
    background: '#12B76A',
    color: '#fff',
    fontSize: 28,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  successTitle: { fontSize: 18, fontWeight: 650, color: theme.text },
  successSub: { marginTop: 6, fontSize: 13, color: theme.textSecondary },
};
