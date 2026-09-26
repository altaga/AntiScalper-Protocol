import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PayQr } from '../control/PayQr';
import {
  createKioskLabIntent,
  getKioskLabIntent,
} from '../hire/gateway';
import { theme } from '../../theme/tokens';

const { toast } = require('react-hot-toast');

type LogLine = { t: string; msg: string; kind?: 'ok' | 'err' | 'info' };

function stamp() {
  return new Date().toISOString().slice(11, 23);
}

/**
 * Slush-only lab — no World, no petition, no motor.
 * Confirms unique-link Payment Kit: QR → phone pay → poll until paid.
 */
export function KioskLabPanel() {
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [payUrl, setPayUrl] = useState<string | null>(null);
  const [webUrl, setWebUrl] = useState<string | null>(null);
  const [nonce, setNonce] = useState<string | null>(null);
  const [amount, setAmount] = useState<string | null>(null);
  const [receiver, setReceiver] = useState<string | null>(null);
  const [intentStatus, setIntentStatus] = useState<string | null>(null);
  const [digest, setDigest] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);

  const logEnd = useRef<HTMLDivElement | null>(null);

  const push = useCallback((msg: string, kind: LogLine['kind'] = 'info') => {
    setLogs((prev) => [...prev.slice(-80), { t: stamp(), msg, kind }]);
  }, []);

  useEffect(() => {
    logEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const stepCreatePayLink = async () => {
    setBusy(true);
    setDigest(null);
      setPayUrl(null);
      setWebUrl(null);
      setNonce(null);
      setIntentStatus(null);
      try {
      push('POST /api/kiosk/lab-intent (dapp, no World)');
      const data = await createKioskLabIntent();
      const url = data.deepLink || data.payUrl || data.intent?.payUrl;
      const web = data.webUrl || data.intent?.webUrl || null;
      const n = data.nonce || data.intent?.nonce;
      if (!url || !n) throw new Error('Missing payUrl/nonce');
      setPayUrl(url);
      setWebUrl(web);
      setNonce(n);
      setAmount(data.amount || data.intent?.amount || null);
      setReceiver(data.receiver || data.intent?.receiver || null);
      setIntentStatus(data.intent?.status || 'pending');
      setPolling(true);
      push(`QR ready nonce=${n.slice(0, 8)}… amount=${data.amount}`, 'ok');
      push(url);
      toast.success('Scan with Slush');
    } catch (e: any) {
      push(String(e?.message || e), 'err');
      toast.error(e?.message || 'Lab intent failed');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!polling || !nonce) return;
    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      try {
        const data = await getKioskLabIntent(nonce);
        const st = data.intent?.status;
        setIntentStatus(st || null);
        if (st === 'paid' || st === 'dispensed') {
          const d = data.intent?.paymentTransactionDigest || null;
          setDigest(d);
          setPolling(false);
          push(`PAID — Payment Kit record found${d ? ` digest=${d}` : ''}`, 'ok');
          toast.success('Slush pay confirmed');
        }
      } catch {
        // keep polling
      }
    };

    void tick();
    const id = setInterval(() => void tick(), 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [polling, nonce, push]);

  return (
    <div style={styles.panel}>
      <div style={styles.head}>
        <div>
          <div style={styles.eyebrow}>Lab · Slush only</div>
          <h1 style={styles.title}>Unique-link phone pay</h1>
          <p style={styles.lede}>
            Sin World. Solo confirma el ciclo nuevo: QR → paga en Slush → poll Payment Kit hasta{' '}
            <strong>paid</strong>. Lab API en este dapp (no necesita deploy del gateway remoto).
            Receiver = gateway payTo.
          </p>
        </div>
      </div>

      <ol style={styles.steps}>
        <li>Create Slush QR (lab intent, no PoH)</li>
        <li>Scan / open with Slush on the phone and pay USDC</li>
        <li>This page polls every 2s until Payment Kit shows paid</li>
      </ol>

      <div style={styles.meta}>
        <div>
          <span style={styles.metaLabel}>Nonce</span>
          <div style={styles.metaVal}>{nonce ? `${nonce.slice(0, 13)}…` : '—'}</div>
        </div>
        <div>
          <span style={styles.metaLabel}>Status</span>
          <div style={styles.metaVal}>{intentStatus || '—'}</div>
        </div>
        <div>
          <span style={styles.metaLabel}>Amount</span>
          <div style={styles.metaVal}>{amount ? `${amount} atomic USDC` : '—'}</div>
        </div>
        <div>
          <span style={styles.metaLabel}>Poll</span>
          <div style={styles.metaVal}>{polling ? 'ON · 2s' : 'off'}</div>
        </div>
      </div>

      <div style={styles.actions}>
        <button
          type="button"
          style={styles.primary}
          disabled={busy}
          onClick={() => void stepCreatePayLink()}
        >
          Create Slush QR
        </button>
        {polling ? (
          <button
            type="button"
            style={styles.ghost}
            onClick={() => {
              setPolling(false);
              push('poll stopped');
            }}
          >
            Stop poll
          </button>
        ) : null}
      </div>

      {payUrl ? (
        <div style={styles.qrBox}>
          <div style={styles.qrTitle}>Scan → opens Slush</div>
          {receiver ? (
            <p style={styles.kioskHint}>receiver {receiver.slice(0, 10)}…{receiver.slice(-6)}</p>
          ) : null}
          <p style={styles.kioskHint}>deep link · slush://pay</p>
          <PayQr value={payUrl} size={256} />
          <a href={payUrl} style={styles.link}>
            Open in Slush
          </a>
          {webUrl ? (
            <a href={webUrl} target="_blank" rel="noreferrer" style={styles.linkMuted}>
              HTTPS fallback (my.slush.app)
            </a>
          ) : null}
          <button
            type="button"
            style={styles.copy}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(payUrl);
                toast.success('Deep link copied');
              } catch {
                toast.error('Copy failed');
              }
            }}
          >
            Copy slush:// link
          </button>
        </div>
      ) : null}

      {digest ? (
        <div style={styles.paidBox}>
          <div style={styles.qrTitle}>Slush pay OK</div>
          <a
            href={`https://suiscan.xyz/mainnet/tx/${digest}`}
            target="_blank"
            rel="noreferrer"
            style={styles.link}
          >
            {digest.slice(0, 14)}…{digest.slice(-8)}
          </a>
        </div>
      ) : null}

      <div style={styles.logBox} aria-label="Lab log">
        {logs.length === 0 ? (
          <div style={styles.logEmpty}>Logs appear here as you step through the Slush cycle.</div>
        ) : (
          logs.map((l, i) => (
            <div
              key={`${l.t}-${i}`}
              style={{
                ...styles.logLine,
                color:
                  l.kind === 'err'
                    ? theme.danger
                    : l.kind === 'ok'
                      ? theme.success
                      : theme.textSecondary,
              }}
            >
              <span style={styles.logTime}>{l.t}</span> {l.msg}
            </div>
          ))
        )}
        <div ref={logEnd} />
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    background: theme.surface,
    border: `1px solid ${theme.border}`,
    borderRadius: theme.radius,
    padding: 22,
    boxShadow: theme.shadowSoft,
  },
  head: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
    marginBottom: 16,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: 650,
    letterSpacing: 0.06,
    textTransform: 'uppercase' as const,
    color: theme.warn,
  },
  title: {
    margin: '4px 0 8px',
    fontSize: 24,
    fontWeight: 700,
    letterSpacing: -0.4,
  },
  lede: {
    margin: 0,
    fontSize: 14,
    lineHeight: 1.5,
    color: theme.textSecondary,
    maxWidth: 520,
  },
  code: {
    fontFamily: theme.mono,
    fontSize: 11,
    wordBreak: 'break-all' as const,
  },
  steps: {
    margin: '0 0 16px',
    paddingLeft: 18,
    fontSize: 13,
    color: theme.textSecondary,
    lineHeight: 1.55,
  },
  meta: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 10,
    marginBottom: 14,
    paddingTop: 12,
    borderTop: `1px solid ${theme.border}`,
  },
  metaLabel: {
    fontSize: 10,
    fontWeight: 650,
    color: theme.textTertiary,
    textTransform: 'uppercase' as const,
  },
  metaVal: {
    fontSize: 12,
    fontFamily: theme.mono,
    wordBreak: 'break-all' as const,
  },
  actions: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 8,
    marginBottom: 16,
  },
  primary: {
    border: 'none',
    background: theme.accent,
    color: '#fff',
    borderRadius: 980,
    padding: '10px 16px',
    fontSize: 13,
    fontWeight: 650,
    cursor: 'pointer',
    fontFamily: theme.font,
  },
  ghost: {
    border: `1px solid ${theme.borderStrong}`,
    background: 'transparent',
    color: theme.textSecondary,
    borderRadius: 980,
    padding: '10px 14px',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: theme.font,
  },
  qrBox: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 10,
    padding: 16,
    marginBottom: 14,
    borderRadius: theme.radiusSm,
    background: theme.bg,
    border: `1px solid ${theme.border}`,
  },
  paidBox: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 8,
    padding: 14,
    marginBottom: 14,
    borderRadius: theme.radiusSm,
    background: 'rgba(52,199,89,0.08)',
    border: '1px solid rgba(52,199,89,0.25)',
  },
  qrTitle: { fontSize: 14, fontWeight: 650 },
  kioskHint: {
    margin: 0,
    fontSize: 12,
    fontFamily: theme.mono,
    color: theme.textTertiary,
  },
  link: { color: theme.accent, fontSize: 13, fontWeight: 600, textDecoration: 'none' },
  linkMuted: {
    color: theme.textTertiary,
    fontSize: 12,
    fontWeight: 500,
    textDecoration: 'underline',
  },
  copy: {
    border: `1px solid ${theme.borderStrong}`,
    background: theme.surface,
    borderRadius: 980,
    padding: '8px 14px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: theme.font,
  },
  logBox: {
    marginTop: 4,
    padding: 12,
    borderRadius: theme.radiusSm,
    background: '#111',
    color: '#c8c8c8',
    fontFamily: theme.mono,
    fontSize: 11,
    maxHeight: 220,
    overflow: 'auto',
  },
  logEmpty: { color: '#666' },
  logLine: { marginBottom: 4, wordBreak: 'break-all' as const },
  logTime: { color: '#666', marginRight: 6 },
};
