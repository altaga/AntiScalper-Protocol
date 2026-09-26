import React, { useCallback, useEffect, useState } from 'react';
import { WorldVerifyModal } from '../world/WorldVerifyModal';
import { ENROLL_ACTION, enrollWinner, resetDemoClaims } from '../hire/gateway';
import { clearDemoTicket, saveDemoTicket } from './aspDemoTicket';
import { AspDemoChrome, AspDemoFooter, aspBrand } from './AspDemoChrome';

const { toast } = require('react-hot-toast');

type Phase = 'ready' | 'working' | 'done' | 'error';

/**
 * Off-kiosk winner invite — World Selfie Check (legacy) → ticket.
 * Nullifier is the stable identity; ticket is what the human brings to the kiosk.
 */
export function SignupPage() {
  const [phase, setPhase] = useState<Phase>('ready');
  const [worldOpen, setWorldOpen] = useState(false);
  const [ticket, setTicket] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = 'Asp · Sign up';
  }, []);

  const onReset = async () => {
    setBusy(true);
    try {
      await resetDemoClaims();
      clearDemoTicket();
      setTicket(null);
      setPhase('ready');
      setDetail(null);
      toast.success('Demo cleared');
    } catch (e: any) {
      toast.error(e?.message || 'Reset failed');
    } finally {
      setBusy(false);
    }
  };

  const startWorld = () => {
    setDetail(null);
    setPhase('working');
    setWorldOpen(true);
  };

  const onVerified = useCallback(async (idkitResponse: unknown) => {
    setBusy(true);
    try {
      const out = await enrollWinner(idkitResponse, {
        action: ENROLL_ACTION,
        signal: 'asp-enroll',
      });
      const t = out.winner?.ticket;
      if (!t) throw new Error('No ticket returned');
      saveDemoTicket(t);
      setTicket(t);
      setPhase('done');
      // Keep World modal open on the ✓ panel for the demo — user closes it.
      toast.success(out.already ? `Welcome back — ${t}` : `Registered — ${t}`);
    } catch (e: any) {
      setPhase('error');
      const detailMsg = [e?.message, e?.code].filter(Boolean).join(' · ');
      setDetail(detailMsg || 'Sign up failed');
      toast.error(detailMsg || 'Sign up failed');
      throw e;
    } finally {
      setBusy(false);
    }
  }, []);

  const copyTicket = async () => {
    if (!ticket) return;
    try {
      await navigator.clipboard.writeText(ticket);
      toast.success('Ticket copied');
    } catch {
      toast.error('Could not copy');
    }
  };

  return (
    <div style={styles.shell}>
      <AspDemoChrome active="signup" />

      <div style={styles.stage}>
        <main style={styles.main}>
          {phase === 'done' && ticket ? (
            <>
              <p style={styles.eyebrow}>You&apos;re registered</p>
              <h1 style={styles.title}>Save this ticket</h1>
              <p style={styles.lede}>
                Copy it or take a photo. At the event kiosk PC, type this code — then confirm
                again with World ID so the machine knows it&apos;s still you.
              </p>

              <section style={styles.pass} aria-label="Winner ticket">
                <div style={styles.passTop}>
                  <span style={styles.passEvent}>Tokyo 2026</span>
                  <span style={styles.passKind}>Winner</span>
                </div>
                <div style={styles.passCode}>{ticket}</div>
                <div style={styles.passRule} aria-hidden />
                <p style={styles.passHint}>One ticket · one capsule · bring the code to the kiosk</p>
                <div style={styles.passActions}>
                  <button type="button" style={styles.secondary} onClick={() => void copyTicket()}>
                    Copy ticket
                  </button>
                  <a href="/" style={styles.primaryLink}>
                    Go to kiosk
                  </a>
                </div>
              </section>
            </>
          ) : (
            <>
              <p style={styles.eyebrow}>Step 1 · Before the event</p>
              <h1 style={styles.title}>Get your winner ticket</h1>
              <p style={styles.lede}>
                Confirm you&apos;re a real person with World ID on this phone. You&apos;ll get a
                short code — that code is what you bring to the kiosk. You can close this browser
                afterward.
              </p>

              <section style={styles.card}>
                <ol style={styles.list}>
                  <li style={styles.li}>
                    <strong>1. World ID</strong> — one face check on this phone
                  </li>
                  <li style={styles.li}>
                    <strong>2. Ticket</strong> — you receive a short code (e.g. WIN-····)
                  </li>
                  <li style={styles.li}>
                    <strong>3. Kiosk</strong> — type the code, confirm again, pay, get a capsule
                  </li>
                </ol>

                {phase === 'error' && detail ? <pre style={styles.error}>{detail}</pre> : null}

                <button
                  type="button"
                  style={styles.primary}
                  disabled={busy || phase === 'working'}
                  onClick={startWorld}
                >
                  {phase === 'working' ? 'Confirming with World…' : 'Confirm with World ID'}
                </button>
              </section>
            </>
          )}
        </main>

        <AspDemoFooter
          onReset={() => void onReset()}
          resetBusy={busy}
          resetLabel="Reset demo"
        />
      </div>

      <WorldVerifyModal
        open={worldOpen}
        onOpenChange={(open) => {
          setWorldOpen(open);
          if (!open && phase === 'working' && !ticket) setPhase('ready');
        }}
        action={ENROLL_ACTION}
        signal="asp-enroll"
        title="Confirm with World ID"
        subtitle="One face check creates your winner ticket. Bring the code to the kiosk — not this browser."
        successTitle="World validated"
        successSubtitle="You're registered. Close this panel to see your winner ticket."
        onVerified={onVerified}
        onError={(msg) => {
          setPhase('error');
          setDetail(msg);
          toast.error(msg);
        }}
      />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  shell: {
    minHeight: '100%',
    display: 'flex',
    flexDirection: 'column' as const,
    fontFamily: aspBrand.font,
    color: aspBrand.ink,
    background: aspBrand.paper,
  },
  stage: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    justifyContent: 'center',
    padding: '32px 0 8px',
  },
  main: {
    width: '100%',
    maxWidth: 480,
    margin: '0 auto',
    padding: '0 22px 20px',
  },
  eyebrow: {
    margin: 0,
    fontSize: aspBrand.type.eyebrow,
    fontWeight: 650,
    letterSpacing: 0.08,
    textTransform: 'uppercase' as const,
    color: aspBrand.muted,
  },
  title: {
    margin: '10px 0 10px',
    fontSize: aspBrand.type.title,
    fontWeight: 700,
    letterSpacing: -0.8,
    lineHeight: 1.06,
  },
  lede: {
    margin: 0,
    fontSize: aspBrand.type.lede,
    lineHeight: 1.5,
    color: aspBrand.muted,
  },
  card: {
    marginTop: 28,
    padding: 22,
    background: aspBrand.paperCard,
    border: `1px solid ${aspBrand.line}`,
    borderRadius: 18,
  },
  list: {
    margin: '0 0 20px',
    padding: 0,
    listStyle: 'none',
  },
  li: {
    fontSize: 14,
    lineHeight: 1.55,
    color: aspBrand.ink,
    marginBottom: 12,
  },
  error: {
    margin: '0 0 14px',
    padding: 12,
    borderRadius: 12,
    background: 'rgba(255,59,48,0.08)',
    color: '#B42318',
    fontSize: 12,
    fontFamily: aspBrand.mono || 'ui-monospace, monospace',
    whiteSpace: 'pre-wrap' as const,
  },
  primary: {
    width: '100%',
    border: 'none',
    borderRadius: 980,
    padding: '14px 18px',
    fontSize: 15,
    fontWeight: 650,
    cursor: 'pointer',
    background: aspBrand.ink,
    color: aspBrand.paper,
  },
  pass: {
    marginTop: 28,
    padding: 22,
    background: aspBrand.paperCard,
    border: `1px solid ${aspBrand.line}`,
    borderRadius: 18,
  },
  passTop: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: 16,
    fontSize: 12,
    fontWeight: 650,
    letterSpacing: 0.06,
    textTransform: 'uppercase' as const,
    color: aspBrand.muted,
  },
  passEvent: {},
  passKind: {},
  passCode: {
    fontSize: 36,
    fontWeight: 750,
    letterSpacing: 2,
    fontFamily: aspBrand.mono || 'ui-monospace, monospace',
    textAlign: 'center' as const,
  },
  passRule: {
    height: 1,
    background: aspBrand.line,
    margin: '18px 0 12px',
  },
  passHint: {
    margin: 0,
    fontSize: 13,
    color: aspBrand.muted,
    textAlign: 'center' as const,
  },
  passActions: {
    display: 'flex',
    gap: 10,
    marginTop: 18,
  },
  secondary: {
    flex: 1,
    border: `1px solid ${aspBrand.line}`,
    borderRadius: 980,
    padding: '12px 14px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    background: aspBrand.paper,
    color: aspBrand.ink,
  },
  primaryLink: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 980,
    padding: '12px 14px',
    fontSize: 14,
    fontWeight: 650,
    textDecoration: 'none',
    background: aspBrand.ink,
    color: aspBrand.paper,
  },
};
