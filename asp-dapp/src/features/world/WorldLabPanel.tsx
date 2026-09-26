import React, { useCallback, useState } from 'react';
import { WorldVerifyModal } from './WorldVerifyModal';
import { theme } from '../../theme/tokens';

const TEST_ACTION = 'asp-release-tokyo2026-capsule-v1';

/**
 * Isolated World Selfie lab — no petition, hire, or wallet required.
 */
export function WorldLabPanel() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<'idle' | 'running' | 'ok' | 'fail'>('idle');
  const [log, setLog] = useState<string>('Ready. Open World, scan with Sandbox World App, complete Selfie.');

  const appId = (process.env.EXPO_PUBLIC_WORLD_APP_ID || '').trim() || '(missing EXPO_PUBLIC_WORLD_APP_ID)';
  const environment =
    (process.env.EXPO_PUBLIC_WORLD_ENVIRONMENT || 'sandbox').trim() || 'sandbox';

  // Stable callbacks — unstable ones used to remount IDKit mid-verify.
  const onError = useCallback((msg: string) => {
    setStatus('fail');
    setLog(`IDKit error: ${msg}`);
  }, []);

  const onVerified = useCallback(async (proof: unknown) => {
    setLog('Got IDKit proof. Posting to /api/world/verify-proof…');
    const res = await fetch('/api/world/verify-proof', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proof, action: TEST_ACTION, signal: 'asp-world-lab' }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success || !data.verified) {
      setStatus('fail');
      setLog(
        `Verify FAILED\n${JSON.stringify(
          {
            status: res.status,
            error: data.error,
            world: data.world,
            preview: data.preview,
            hint: data.hint,
          },
          null,
          2
        )}`
      );
      throw new Error(
        typeof data.error === 'string' ? data.error : JSON.stringify(data.error || data)
      );
    }
    setStatus('ok');
    setLog(
      `Verify OK\nnullifier: ${data.nullifier || '(none)'}\nenvironment: ${data.environment}\naction: ${data.action}`
    );
  }, []);

  return (
    <div style={styles.wrap}>
      <h2 style={styles.title}>World Lab</h2>
      <p style={styles.body}>
        Solo prueba IDKit + Selfie + verify en servidor. Sin hire, sin motor, sin petition de device.
      </p>

      <div style={styles.meta}>
        <div>
          <span style={styles.label}>app_id</span>
          <code style={styles.code}>{appId}</code>
        </div>
        <div>
          <span style={styles.label}>environment</span>
          <code style={styles.code}>{environment}</code>
        </div>
        <div>
          <span style={styles.label}>action</span>
          <code style={styles.code}>{TEST_ACTION}</code>
        </div>
        <div>
          <span style={styles.label}>status</span>
          <code style={styles.code}>{status}</code>
        </div>
      </div>

      {status === 'ok' ? (
        <div style={styles.okBanner}>
          <span style={styles.okCheck}>✓</span>
          Authenticated — World Selfie verified
        </div>
      ) : (
        <button
          type="button"
          style={styles.btn}
          onClick={() => {
            setStatus('running');
            setLog(
              'Opening IDKit… check console for [IDKit] Flow created / connectorURI (sandbox.world.org expected).'
            );
            setOpen(true);
          }}
        >
          Open World Selfie Check
        </button>
      )}

      <pre style={styles.log}>{log}</pre>

      <WorldVerifyModal
        open={open}
        onOpenChange={setOpen}
        action={TEST_ACTION}
        signal="asp-world-lab"
        onError={onError}
        onVerified={onVerified}
      />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    background: theme.surface,
    border: `1px solid ${theme.border}`,
    borderRadius: theme.radius,
    padding: 20,
    boxShadow: theme.shadowSoft,
  },
  title: { margin: 0, fontSize: 20, fontWeight: 650, letterSpacing: -0.3 },
  body: { margin: '8px 0 16px', color: theme.textSecondary, fontSize: 14, lineHeight: 1.45 },
  meta: {
    display: 'grid',
    gap: 10,
    marginBottom: 16,
  },
  label: {
    display: 'block',
    fontSize: 11,
    fontWeight: 600,
    color: theme.textTertiary,
    textTransform: 'uppercase' as const,
    marginBottom: 2,
  },
  code: {
    fontFamily: theme.mono,
    fontSize: 12,
    color: theme.text,
    wordBreak: 'break-all' as const,
  },
  btn: {
    border: 'none',
    background: theme.accent,
    color: '#fff',
    borderRadius: 980,
    padding: '12px 18px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: theme.font,
  },
  okBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '12px 16px',
    borderRadius: 980,
    background: 'rgba(18, 183, 106, 0.12)',
    color: '#027A48',
    fontSize: 14,
    fontWeight: 600,
    fontFamily: theme.font,
  },
  okCheck: {
    width: 22,
    height: 22,
    borderRadius: 999,
    background: '#12B76A',
    color: '#fff',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 13,
  },
  log: {
    marginTop: 16,
    padding: 14,
    borderRadius: theme.radiusSm,
    background: theme.bg,
    border: `1px solid ${theme.border}`,
    fontSize: 12,
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap' as const,
    fontFamily: theme.mono,
    color: theme.textSecondary,
    minHeight: 120,
  },
};
