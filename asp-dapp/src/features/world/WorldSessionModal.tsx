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
  /** When set, prove an existing session (kiosk return). When omitted, create a new session. */
  existingSessionId?: string | null;
  signal?: string;
  title?: string;
  subtitle?: string;
  onVerified: (idkitResponse: unknown) => Promise<void> | void;
  onError?: (message: string) => void;
};

/**
 * World ID 4.0 session create / prove.
 * IDKitSessionWidget requires `constraints` (not `preset`).
 */
export function WorldSessionModal({
  open,
  onOpenChange,
  existingSessionId,
  signal,
  title,
  subtitle,
  onVerified,
  onError,
}: Props) {
  const [rpContext, setRpContext] = useState<RpContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [Widget, setWidget] = useState<any>(null);
  const [constraints, setConstraints] = useState<any>(null);
  const [appId, setAppId] = useState('');
  const [environment, setEnvironment] = useState<'sandbox' | 'staging' | 'production'>('sandbox');
  const [phase, setPhase] = useState<'idle' | 'idkit' | 'success'>('idle');
  const [debugLine, setDebugLine] = useState<string | null>(null);
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
      setDebugLine(null);
      holdOpenRef.current = false;
      return;
    }

    let cancelled = false;
    holdOpenRef.current = false;
    setPhase('idkit');
    setLoading(true);
    setDebugLine(null);

    (async () => {
      try {
        const idkit = require('@worldcoin/idkit');
        if (cancelled) return;

        try {
          idkit.setDebug?.(true);
        } catch {
          // optional
        }

        setWidget(() => idkit.IDKitSessionWidget);

        // Session widget wants ConstraintNode (WASM CredentialType).
        // Use `selfie` so World App opens face capture (proof_of_human shows a
        // "Sign in" sheet that hangs in sandbox sessions). Missing sybil_score
        // on the proof is patched server-side before /v4/verify.
        const credential = {
          type: 'selfie',
          ...(signal ? { signal: String(signal) } : {}),
        };
        const node = idkit.any ? idkit.any(credential) : credential;
        setConstraints(node);

        const publicAppId = (process.env.EXPO_PUBLIC_WORLD_APP_ID || '').trim();
        const envRaw = (process.env.EXPO_PUBLIC_WORLD_ENVIRONMENT || 'sandbox').trim();
        // IDKit accepts sandbox|staging|production; keep as configured.
        const env = (envRaw === 'staging' || envRaw === 'production' || envRaw === 'sandbox'
          ? envRaw
          : 'sandbox') as 'sandbox' | 'staging' | 'production';
        setAppId(publicAppId);
        setEnvironment(env);
        if (!publicAppId) {
          throw new Error('EXPO_PUBLIC_WORLD_APP_ID is missing (client bundle).');
        }

        const sigRes = await fetch('/api/world/rp-signature', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session: true }),
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
        const msg = String(e?.message || e);
        setDebugLine(msg);
        onErrorRef.current?.(msg);
        onOpenChangeRef.current(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, existingSessionId, signal]);

  if (!open) return null;

  const proving = Boolean(existingSessionId);

  return (
    <div style={styles.backdrop} onClick={() => onOpenChangeRef.current(false)}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <div>
            <div style={styles.title}>
              {title || (proving ? 'World session check' : 'Create World session')}
            </div>
            <div style={styles.sub}>
              {phase === 'success'
                ? 'Verified. You can close this panel.'
                : subtitle ||
                  (proving
                    ? 'Same human as signup — prove your saved session at the kiosk.'
                    : 'World ID 4.0 session pass for returning to the kiosk.')}
            </div>
          </div>
          <button type="button" style={styles.close} onClick={() => onOpenChangeRef.current(false)}>
            Close
          </button>
        </div>

        {debugLine ? <pre style={styles.debug}>{debugLine}</pre> : null}

        {phase === 'success' ? (
          <div style={styles.success}>
            <div style={styles.check}>✓</div>
            <div style={styles.successTitle}>Session OK</div>
            <div style={styles.successSub}>World session verified on server</div>
          </div>
        ) : loading || !rpContext || !Widget || !constraints ? (
          <div style={styles.loading}>{loading ? 'Preparing session…' : 'Loading World IDKit…'}</div>
        ) : (
          <Widget
            open={true}
            onOpenChange={(next: boolean) => {
              if (!next && holdOpenRef.current) return;
              onOpenChangeRef.current(next);
            }}
            app_id={appId}
            rp_context={rpContext}
            environment={environment}
            constraints={constraints}
            {...(existingSessionId ? { existing_session_id: existingSessionId } : {})}
            handleVerify={async (result: unknown) => {
              await onVerifiedRef.current(result);
              holdOpenRef.current = true;
              setPhase('success');
            }}
            onSuccess={() => {
              holdOpenRef.current = true;
              setPhase('success');
            }}
            onError={(errorCode: any, debugReport?: any) => {
              const msg = [
                String(errorCode || 'world-session-error'),
                debugReport?.error,
                debugReport?.request_id ? `request_id=${debugReport.request_id}` : null,
              ]
                .filter(Boolean)
                .join(' · ');
              setDebugLine(msg);
              onErrorRef.current?.(msg);
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
  debug: {
    margin: '0 0 12px',
    padding: 10,
    borderRadius: 10,
    background: 'rgba(255,59,48,0.08)',
    color: '#B42318',
    fontSize: 11,
    fontFamily: theme.mono,
    whiteSpace: 'pre-wrap' as const,
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
