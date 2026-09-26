import React from 'react';
import { WorldVerifyModal } from '../world/WorldVerifyModal';
import { resetDemoClaims } from '../hire/gateway';
import { PayQr } from './PayQr';
import { AspDemoChrome, AspDemoFooter, aspBrand } from './AspDemoChrome';
import {
  DEVICE_LABEL,
  PRICE_USDC,
  RELEASE_LABEL,
  useDemoV1Flow,
} from './useDemoV1Flow';

const { toast } = require('react-hot-toast');

function shortDigest(d?: string | null) {
  if (!d) return '';
  if (d.length <= 18) return d;
  return `${d.slice(0, 10)}…${d.slice(-8)}`;
}

function shortAddr(a?: string | null) {
  if (!a) return '';
  if (a.length <= 14) return a;
  return `${a.slice(0, 8)}…${a.slice(-6)}`;
}

const STEPS = [
  { id: 'world', label: 'World ID' },
  { id: 'pay', label: 'Pay' },
  { id: 'motor', label: 'Capsule' },
  { id: 'tx', label: 'Receipt' },
] as const;

function stepIndex(phase: string): number {
  if (phase === 'idle' || phase === 'requested' || phase === 'awaiting_human') return 0;
  if (phase === 'authorized' || phase === 'awaiting_phone_pay') return 1;
  if (phase === 'paying' || phase === 'executing') return 2;
  if (phase === 'done') return 3;
  return -1;
}

/**
 * Demo v1 — emergency path (no tickets):
 * World Selfie → Slush QR → motor → Sui receipt.
 * Same chrome as final demo; flow unchanged.
 */
export function DemoV1Page() {
  const flow = useDemoV1Flow();
  const [resetting, setResetting] = React.useState(false);

  React.useEffect(() => {
    document.title = 'Asp · Demo v1';
  }, []);

  const onResetDemo = async () => {
    if (resetting || flow.busy) return;
    setResetting(true);
    try {
      const out = await resetDemoClaims();
      flow.reset();
      toast.success(
        `Demo reset — Get, Claim & Backup wiped (${out?.claimsCleared ?? 0} claims, ${out?.winnersCleared ?? 0} winners)`
      );
    } catch (e: any) {
      toast.error(e?.message || 'Reset failed');
    } finally {
      setResetting(false);
    }
  };

  const canRequest =
    !flow.busy &&
    flow.phase !== 'denied' &&
    (flow.phase === 'idle' ||
      flow.phase === 'error' ||
      flow.phase === 'revoked' ||
      flow.phase === 'done');

  const canVerify =
    !flow.busy &&
    flow.phase !== 'denied' &&
    flow.activePoh &&
    (flow.phase === 'awaiting_human' || flow.activePoh.status === 'pending_human');

  const canRetryQr =
    !flow.busy &&
    flow.activePoh?.status === 'authorized' &&
    (flow.phase === 'authorized' || flow.phase === 'error');

  const current = stepIndex(flow.phase);
  const terminal =
    flow.phase === 'denied' || flow.phase === 'revoked' || flow.phase === 'error';

  return (
    <div style={styles.shell}>
      <AspDemoChrome active="v1" />

      <div style={styles.stage}>
        <main style={styles.main}>
          <section style={styles.hero}>
            <p style={styles.eyebrow}>{RELEASE_LABEL} · backup path</p>
            <h1 style={styles.title}>{DEVICE_LABEL}</h1>
            <p style={styles.lede}>
              No ticket needed. Confirm with World ID on this PC, pay with Slush on your phone,
              then the machine releases one capsule.
            </p>
          </section>

          <section style={styles.panel}>
            {flow.phase === 'denied' ? (
              <div style={styles.deniedHero} role="alert" aria-label="Claim blocked">
                <div style={styles.deniedIcon}>✕</div>
                <div style={styles.deniedEyebrow}>Already claimed</div>
                <h2 style={styles.deniedTitle}>You cannot claim again</h2>
                <p style={styles.deniedLede}>
                  This World ID already redeemed a capsule for this release. One person · one
                  capsule — the machine stays locked.
                </p>
                <div style={styles.deniedBadge}>No second claim</div>
                {flow.errorDetail ? <p style={styles.deniedDetail}>{flow.errorDetail}</p> : null}
                <button
                  type="button"
                  style={styles.deniedReset}
                  disabled={flow.busy}
                  onClick={() => flow.reset()}
                >
                  Start over
                </button>
              </div>
            ) : (
              <>
                {!terminal ? (
                  <ol style={styles.rail} aria-label="Demo progress">
                    {STEPS.map((step, i) => {
                      const active = i === current;
                      const complete = i < current || flow.phase === 'done';
                      const dotStyle: React.CSSProperties = {
                        width: 30,
                        height: 30,
                        borderRadius: 999,
                        borderWidth: 1.5,
                        borderStyle: 'solid',
                        borderColor: active || complete ? aspBrand.ink : aspBrand.lineStrong,
                        background: active || complete ? aspBrand.ink : aspBrand.paperCard,
                        color: active || complete ? '#fff' : aspBrand.muted,
                        fontSize: 13,
                        fontWeight: 650,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1,
                        fontFamily: aspBrand.font,
                      };
                      return (
                        <li key={step.id} style={styles.step}>
                          <div style={dotStyle}>
                            {complete && flow.phase === 'done' && i === 3 ? '✓' : i + 1}
                          </div>
                          <span
                            style={{
                              ...styles.stepLabel,
                              color: active || complete ? aspBrand.ink : aspBrand.muted,
                              fontWeight: active ? 650 : 500,
                            }}
                          >
                            {step.label}
                          </span>
                          {i < STEPS.length - 1 ? (
                            <div
                              style={{
                                ...styles.connector,
                                background: i < current ? aspBrand.ink : aspBrand.lineStrong,
                              }}
                            />
                          ) : null}
                        </li>
                      );
                    })}
                  </ol>
                ) : (
                  <div style={styles.terminal} role="status">
                    <span style={styles.terminalLabel}>
                      {flow.phase === 'revoked' ? 'Revoked' : 'Error'}
                    </span>
                  </div>
                )}

                <div style={styles.statusBlock}>
                  <p style={styles.statusText}>{flow.statusText}</p>
                  {flow.errorDetail ? <pre style={styles.errorBox}>{flow.errorDetail}</pre> : null}
                </div>

                <p style={styles.priceLine}>{PRICE_USDC} USDC · pay on your phone with Slush</p>

                <div style={styles.actions}>
                  {canRequest ? (
                    <button
                      type="button"
                      style={styles.primary}
                      disabled={flow.busy}
                      onClick={() => {
                        if (flow.phase === 'done' || flow.phase === 'revoked') {
                          flow.reset();
                        }
                        void flow.requestCapsule();
                      }}
                    >
                      {flow.phase === 'idle' ? 'Start claim' : 'Start claim again'}
                    </button>
                  ) : null}

                  {canVerify ? (
                    <button
                      type="button"
                      style={styles.primary}
                      disabled={flow.busy}
                      onClick={() => flow.openWorldVerify()}
                    >
                      Confirm with World ID
                    </button>
                  ) : null}

                  {canRetryQr ? (
                    <button
                      type="button"
                      style={styles.secondary}
                      disabled={flow.busy}
                      onClick={() => flow.retryQr()}
                    >
                      Show pay QR again
                    </button>
                  ) : null}

                  {flow.busy && flow.phase !== 'awaiting_phone_pay' ? (
                    <button type="button" style={styles.primary} disabled>
                      Working…
                    </button>
                  ) : null}
                </div>

                {flow.phase === 'awaiting_phone_pay' && flow.kioskPay ? (
                  <div style={styles.kioskBox} aria-label="Slush pay QR">
                    <div style={styles.kioskTitle}>Pay on your phone</div>
                    <p style={styles.kioskHint}>
                      Open Slush Wallet and scan this QR. This PC already confirmed you&apos;re
                      human — payment stays on the phone.
                    </p>
                    <div style={styles.qrWrap}>
                      <PayQr value={flow.kioskPay.payUrl} size={256} />
                    </div>
                    <a href={flow.kioskPay.payUrl} style={styles.link}>
                      Open in Slush
                    </a>
                    <p style={styles.waitLine}>Waiting for payment… then the capsule releases.</p>
                  </div>
                ) : null}

                {flow.phase === 'executing' ? (
                  <div style={styles.motorBox} role="status">
                    <div style={styles.motorPulse} />
                    <p style={styles.motorText}>Payment received — releasing capsule…</p>
                  </div>
                ) : null}

                {flow.phase === 'done' && flow.lastHire ? (
                  <div style={styles.success} aria-label="Transaction result">
                    <div style={styles.successCheck}>✓</div>
                    <div style={styles.successTitle}>Capsule released</div>
                    <p style={styles.successLede}>
                      Payment settled on Sui and the gachapon was told to dispense one capsule.
                    </p>
                    <dl style={styles.receiptMeta}>
                      <div style={styles.metaItem}>
                        <dt style={styles.metaDt}>Sui digest</dt>
                        <dd style={styles.metaDd}>
                          {flow.lastHire.suiDigest ? (
                            <a
                              href={`https://suiscan.xyz/mainnet/tx/${flow.lastHire.suiDigest}`}
                              target="_blank"
                              rel="noreferrer"
                              style={styles.link}
                            >
                              {shortDigest(flow.lastHire.suiDigest)}
                            </a>
                          ) : (
                            '—'
                          )}
                        </dd>
                      </div>
                      <div style={styles.metaItem}>
                        <dt style={styles.metaDt}>Payer</dt>
                        <dd style={styles.metaDd}>{shortAddr(flow.lastHire.payer) || '—'}</dd>
                      </div>
                      <div style={styles.metaItem}>
                        <dt style={styles.metaDt}>Job</dt>
                        <dd style={styles.metaDd}>{flow.lastHire.tx_id || '—'}</dd>
                      </div>
                    </dl>
                    {flow.lastHire.suiDigest ? (
                      <a
                        href={`https://suiscan.xyz/mainnet/tx/${flow.lastHire.suiDigest}`}
                        target="_blank"
                        rel="noreferrer"
                        style={styles.receiptBtn}
                      >
                        Open on Suiscan
                      </a>
                    ) : null}
                  </div>
                ) : null}

                {flow.phase === 'done' && !flow.lastHire ? (
                  <div style={styles.success}>
                    <div style={styles.successCheck}>✓</div>
                    <div style={styles.successTitle}>Capsule released</div>
                    <p style={styles.successLede}>Look in the tray — your capsule should be out.</p>
                  </div>
                ) : null}
              </>
            )}
          </section>
        </main>

        <AspDemoFooter
          onReset={() => void onResetDemo()}
          resetBusy={resetting || flow.busy}
          resetLabel="Reset demo"
        />
      </div>

      {flow.worldAction ? (
        <WorldVerifyModal
          open={flow.worldOpen}
          onOpenChange={flow.setWorldOpen}
          action={flow.worldAction}
          signal={flow.worldSignal}
          successTitle="World validated"
          successSubtitle="Identity confirmed. Close this panel to continue to pay."
          onVerified={async (result) => {
            try {
              const out = await flow.onWorldProof(result);
              if (out?.claimAlreadyUsed) {
                toast.error('Already claimed');
                return;
              }
              toast.success('Identity confirmed — ready to pay');
            } catch (e: any) {
              toast.error(e?.message || 'Confirm failed');
              throw e;
            }
          }}
          onError={(msg) => toast.error(msg)}
        />
      ) : null}
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
  },
  main: {
    width: '100%',
    maxWidth: 520,
    margin: '0 auto',
    padding: '28px 22px 14px',
    boxSizing: 'border-box' as const,
    flex: 1,
  },
  hero: { marginBottom: 20 },
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
  panel: {
    background: aspBrand.paperCard,
    border: `1px solid ${aspBrand.line}`,
    borderRadius: 16,
    padding: 20,
  },
  rail: {
    display: 'flex',
    listStyle: 'none',
    margin: '0 0 18px',
    padding: 0,
    width: '100%',
  },
  step: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    position: 'relative',
    minWidth: 0,
  },
  stepLabel: {
    marginTop: 8,
    fontSize: aspBrand.type.rail,
    textAlign: 'center' as const,
    lineHeight: 1.25,
    fontFamily: aspBrand.font,
  },
  connector: {
    position: 'absolute',
    top: 14,
    left: 'calc(50% + 17px)',
    width: 'calc(100% - 34px)',
    height: 2,
    borderRadius: 1,
  },
  terminal: {
    padding: '12px 14px',
    borderRadius: 12,
    background: aspBrand.paper,
    border: `1px solid ${aspBrand.line}`,
    marginBottom: 14,
  },
  terminalLabel: { fontSize: aspBrand.type.body, fontWeight: 650 },
  statusBlock: { marginBottom: 12 },
  statusText: {
    margin: 0,
    fontSize: aspBrand.type.status,
    lineHeight: 1.45,
    color: aspBrand.ink,
    fontWeight: 500,
  },
  errorBox: {
    margin: '10px 0 0',
    padding: 12,
    borderRadius: 10,
    background: 'rgba(180,35,24,0.06)',
    border: '1px solid rgba(180,35,24,0.18)',
    color: aspBrand.danger,
    fontSize: aspBrand.type.meta,
    fontFamily: aspBrand.mono,
    whiteSpace: 'pre-wrap' as const,
  },
  priceLine: {
    margin: '0 0 16px',
    fontSize: aspBrand.type.hint,
    color: aspBrand.muted,
  },
  actions: { display: 'flex', flexWrap: 'wrap' as const, gap: 10, alignItems: 'center' },
  primary: {
    border: 'none',
    background: aspBrand.ink,
    color: '#fff',
    borderRadius: 12,
    padding: '13px 18px',
    fontSize: aspBrand.type.button,
    fontWeight: 650,
    cursor: 'pointer',
    fontFamily: aspBrand.font,
  },
  secondary: {
    border: `1px solid ${aspBrand.ink}`,
    background: 'transparent',
    color: aspBrand.ink,
    borderRadius: 12,
    padding: '13px 16px',
    fontSize: aspBrand.type.button,
    fontWeight: 650,
    cursor: 'pointer',
    fontFamily: aspBrand.font,
  },
  kioskBox: {
    marginTop: 18,
    padding: 16,
    borderRadius: 14,
    border: `1px solid ${aspBrand.line}`,
    background: aspBrand.paper,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 10,
  },
  kioskTitle: { fontSize: aspBrand.type.body, fontWeight: 650 },
  kioskHint: {
    margin: 0,
    fontSize: aspBrand.type.hint,
    lineHeight: 1.45,
    color: aspBrand.muted,
    textAlign: 'center' as const,
  },
  qrWrap: {
    padding: 16,
    background: '#FFFFFF',
    borderRadius: 8,
    border: `1px solid ${aspBrand.line}`,
  },
  waitLine: {
    margin: 0,
    fontSize: aspBrand.type.hint,
    color: aspBrand.muted,
  },
  motorBox: {
    marginTop: 18,
    padding: 18,
    borderRadius: 14,
    border: `1px solid ${aspBrand.lineStrong}`,
    background: aspBrand.paper,
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  motorPulse: {
    width: 12,
    height: 12,
    borderRadius: 999,
    background: aspBrand.ink,
    animation: 'aspPulse 1s ease-in-out infinite',
  },
  motorText: { margin: 0, fontSize: aspBrand.type.body, fontWeight: 600 },
  success: {
    marginTop: 18,
    padding: 18,
    borderRadius: 14,
    border: '1px solid rgba(52,199,89,0.35)',
    background: 'rgba(52,199,89,0.08)',
    textAlign: 'center' as const,
  },
  successCheck: {
    width: 42,
    height: 42,
    borderRadius: 999,
    background: '#34C759',
    color: '#fff',
    fontSize: 22,
    fontWeight: 700,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  successTitle: { fontSize: 20, fontWeight: 700, marginBottom: 6 },
  successLede: {
    margin: '0 0 14px',
    fontSize: aspBrand.type.lede,
    lineHeight: 1.45,
    color: aspBrand.muted,
  },
  deniedHero: {
    padding: '28px 18px 24px',
    textAlign: 'center' as const,
    borderRadius: 14,
    background: 'rgba(180,35,24,0.06)',
    border: '2px solid rgba(180,35,24,0.28)',
  },
  deniedIcon: {
    width: 72,
    height: 72,
    margin: '0 auto 16px',
    borderRadius: 999,
    background: aspBrand.danger,
    color: '#fff',
    fontSize: 36,
    fontWeight: 800,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1,
  },
  deniedEyebrow: {
    margin: 0,
    fontSize: aspBrand.type.eyebrow,
    fontWeight: 700,
    letterSpacing: 0.12,
    textTransform: 'uppercase' as const,
    color: aspBrand.danger,
  },
  deniedTitle: {
    margin: '10px 0 12px',
    fontSize: 34,
    fontWeight: 800,
    letterSpacing: -0.8,
    lineHeight: 1.1,
    color: aspBrand.ink,
  },
  deniedLede: {
    margin: '0 auto 18px',
    maxWidth: 380,
    fontSize: aspBrand.type.lede,
    lineHeight: 1.5,
    color: aspBrand.muted,
    fontWeight: 500,
  },
  deniedBadge: {
    display: 'inline-block',
    marginBottom: 14,
    padding: '10px 16px',
    borderRadius: 980,
    background: 'rgba(180,35,24,0.1)',
    border: '1px solid rgba(180,35,24,0.28)',
    color: aspBrand.danger,
    fontSize: aspBrand.type.body,
    fontWeight: 700,
  },
  deniedDetail: {
    margin: '0 auto 18px',
    maxWidth: 380,
    fontSize: aspBrand.type.hint,
    lineHeight: 1.45,
    color: aspBrand.danger,
  },
  deniedReset: {
    border: `1px solid ${aspBrand.lineStrong}`,
    background: aspBrand.paperCard,
    color: aspBrand.ink,
    borderRadius: 12,
    padding: '13px 20px',
    fontSize: aspBrand.type.button,
    fontWeight: 650,
    cursor: 'pointer',
    fontFamily: aspBrand.font,
  },
  receiptMeta: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 10,
    margin: '0 0 12px',
    textAlign: 'left' as const,
  },
  metaItem: { margin: 0, minWidth: 0 },
  metaDt: {
    fontSize: 11,
    fontWeight: 600,
    color: aspBrand.muted,
    textTransform: 'uppercase' as const,
    marginBottom: 2,
  },
  metaDd: {
    margin: 0,
    fontSize: aspBrand.type.meta,
    fontFamily: aspBrand.mono,
    color: aspBrand.ink,
    wordBreak: 'break-all' as const,
  },
  link: {
    color: aspBrand.ink,
    textDecoration: 'underline',
    fontWeight: 600,
    fontSize: aspBrand.type.hint,
  },
  receiptBtn: {
    display: 'inline-block',
    border: `1px solid ${aspBrand.lineStrong}`,
    background: aspBrand.paperCard,
    color: aspBrand.ink,
    borderRadius: 10,
    padding: '10px 14px',
    fontSize: aspBrand.type.hint,
    fontWeight: 600,
    textDecoration: 'none',
    fontFamily: aspBrand.font,
  },
};
