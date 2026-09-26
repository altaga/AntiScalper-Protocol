import React from 'react';
import { WorldVerifyModal } from '../world/WorldVerifyModal';
import { GACHA_DEVICE_ID, resetDemoClaims } from '../hire/gateway';
import { PhaseRail } from './PhaseRail';
import { PayQr } from './PayQr';
import { AspDemoChrome, AspDemoFooter, aspBrand } from './AspDemoChrome';
import { clearDemoTicket, readDemoTicket, saveDemoTicket } from './aspDemoTicket';
import {
  DEVICE_LABEL,
  PRICE_USDC,
  RELEASE_LABEL,
  useCheckoutFlow,
} from './useCheckoutFlow';

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

function deviceReceiptStatus(receipt: unknown): string {
  if (!receipt || typeof receipt !== 'object') return '';
  const r = receipt as any;
  if (r.status) return String(r.status);
  if (r.ok === true) return 'ok';
  if (r.task) return String(r.task);
  return '';
}

export function CheckoutPage() {
  const flow = useCheckoutFlow();
  const [resetting, setResetting] = React.useState(false);
  const [ticketDraft, setTicketDraft] = React.useState('');
  const autoFilled = React.useRef(false);

  React.useEffect(() => {
    document.title = 'Asp · Claim';
  }, []);

  React.useEffect(() => {
    if (autoFilled.current) return;
    autoFilled.current = true;
    const t = readDemoTicket();
    if (!t) return;
    setTicketDraft(t);
    void flow.loadTicket(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once on mount
  }, []);

  const onResetDemo = async () => {
    if (resetting || flow.busy) return;
    setResetting(true);
    try {
      const out = await resetDemoClaims();
      clearDemoTicket();
      flow.reset();
      setTicketDraft('');
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
    Boolean(flow.ticketReady) &&
    (flow.phase === 'idle' ||
      flow.phase === 'error' ||
      flow.phase === 'revoked' ||
      flow.phase === 'denied');

  // After a successful claim the ticket is burned — no "Start claim again" on Done.

  const canVerify =
    !flow.busy &&
    flow.activePoh &&
    (flow.phase === 'awaiting_human' || flow.activePoh.status === 'pending_human');

  const canRetryQr =
    !flow.busy &&
    flow.activePoh?.status === 'authorized' &&
    (flow.phase === 'authorized' || flow.phase === 'error');

  const canRevoke =
    !flow.busy &&
    flow.activePoh &&
    (flow.phase === 'awaiting_human' ||
      flow.phase === 'authorized' ||
      flow.phase === 'awaiting_phone_pay');

  const statusLine =
    flow.phase === 'idle' && !flow.ticket
      ? 'Type your ticket from Get, then tap Use ticket.'
      : flow.statusText;

  return (
    <div style={styles.shell}>
      <AspDemoChrome active="kiosk" />

      <div style={styles.stage}>
        <main style={styles.main}>
          <header style={styles.hero}>
            <p style={styles.eyebrow}>{RELEASE_LABEL}</p>
            <h1 style={styles.title}>{DEVICE_LABEL}</h1>
            <p style={styles.lede}>
              Step 2 · At the event PC. Enter your ticket, confirm with World ID, pay on your
              phone with Slush — then one capsule comes out.
            </p>
          </header>

          <section style={styles.panel} aria-label="Checkout">
            <label style={styles.fieldLabel} htmlFor="asp-ticket">
              Ticket from Get
            </label>
            <div style={styles.ticketRow}>
              <input
                id="asp-ticket"
                style={styles.ticketInput}
                value={ticketDraft}
                placeholder="WIN-······"
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => {
                  const v = e.target.value.toUpperCase();
                  setTicketDraft(v);
                  if (v.trim()) saveDemoTicket(v);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void flow.loadTicket(ticketDraft);
                }}
                disabled={flow.busy}
              />
              <button
                type="button"
                style={styles.ticketBtn}
                disabled={flow.busy || !ticketDraft.trim()}
                onClick={() => {
                  saveDemoTicket(ticketDraft);
                  void flow.loadTicket(ticketDraft);
                }}
              >
                Use ticket
              </button>
            </div>

            {flow.alreadyClaimed ? (
              <div style={styles.claimedHero} role="alert" aria-label="Ticket already claimed">
                <div style={styles.claimedEyebrow}>Already claimed</div>
                <h2 style={styles.claimedTitle}>You cannot claim this ticket again</h2>
                <p style={styles.claimedLede}>
                  {flow.ticket ? (
                    <>
                      <strong>{flow.ticket}</strong> already redeemed one capsule. One ticket ·
                      one person · one capsule — no second claim.
                    </>
                  ) : (
                    <>
                      This ticket already redeemed one capsule. One ticket · one person · one
                      capsule — no second claim.
                    </>
                  )}
                </p>
                <div style={styles.claimedBadge}>No second claim</div>
                <p style={styles.claimedHint}>
                  Type a different ticket above and tap Use ticket — World ID will show again for
                  that person.
                </p>
              </div>
            ) : (
              <>
            {flow.ticket ? (
              <p style={styles.ticketStatus}>
                <strong>{flow.ticket}</strong>
                {flow.ticketReady
                  ? ' · ready'
                  : ' · look up this ticket with Use ticket'}
              </p>
            ) : (
              <p style={styles.ticketStatus}>
                No ticket yet — open Get on your phone if you don&apos;t have a code.
              </p>
            )}

            <div style={styles.railWrap}>
              <PhaseRail phase={flow.phase} />
            </div>

            <div style={styles.statusBlock}>
              <p style={styles.statusText}>{statusLine}</p>
              {flow.errorDetail ? <pre style={styles.errorBox}>{flow.errorDetail}</pre> : null}
            </div>

            <div style={styles.actions}>
              {canRequest ? (
                <button
                  type="button"
                  style={styles.primary}
                  disabled={flow.busy}
                  onClick={() => {
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

              {canRevoke ? (
                <button type="button" style={styles.ghost} onClick={() => void flow.revoke()}>
                  Cancel claim
                </button>
              ) : null}
            </div>

            {flow.phase === 'awaiting_phone_pay' && flow.kioskPay ? (
              <div style={styles.payBox} aria-label="Phone pay QR">
                <div style={styles.payTitle}>Pay on your phone</div>
                <p style={styles.payHint}>
                  Open Slush Wallet and scan this QR. This PC already confirmed you&apos;re human
                  — payment happens on the phone only.
                </p>
                <div style={styles.qrWrap}>
                  <PayQr value={flow.kioskPay.payUrl} size={256} />
                </div>
                <div style={styles.payLinks}>
                  <a href={flow.kioskPay.payUrl} style={styles.link}>
                    Open Slush
                  </a>
                  {flow.kioskPay.webUrl ? (
                    <a
                      href={flow.kioskPay.webUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={styles.link}
                    >
                      Pay in browser
                    </a>
                  ) : null}
                  <button
                    type="button"
                    style={styles.linkBtn}
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(flow.kioskPay!.payUrl);
                        toast.success('Link copied');
                      } catch {
                        toast.error('Copy failed');
                      }
                    }}
                  >
                    Copy pay link
                  </button>
                </div>
              </div>
            ) : null}

            {flow.phase === 'done' && flow.lastHire ? (
              <div style={styles.receipt} aria-label="Sui payment receipt">
                <div style={styles.receiptTitle}>Capsule released</div>
                <dl style={styles.receiptMeta}>
                  <div style={styles.metaItem}>
                    <dt style={styles.metaDt}>Sui</dt>
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
                    <dt style={styles.metaDt}>Device</dt>
                    <dd style={styles.metaDd}>
                      {deviceReceiptStatus(flow.lastHire.deviceReceipt) || 'ok'}
                    </dd>
                  </div>
                  <div style={styles.metaItem}>
                    <dt style={styles.metaDt}>Price</dt>
                    <dd style={styles.metaDd}>{PRICE_USDC} USDC</dd>
                  </div>
                </dl>
              </div>
            ) : null}

            <details style={styles.details}>
              <summary style={styles.summary}>Technical details</summary>
              <dl style={styles.meta}>
                <div style={styles.metaItem}>
                  <dt style={styles.metaDt}>Device</dt>
                  <dd style={styles.metaDd}>{GACHA_DEVICE_ID}</dd>
                </div>
                <div style={styles.metaItem}>
                  <dt style={styles.metaDt}>Command</dt>
                  <dd style={styles.metaDd}>DISPENSE_ONCE</dd>
                </div>
                <div style={styles.metaItem}>
                  <dt style={styles.metaDt}>Petition</dt>
                  <dd style={styles.metaDd}>{flow.activePoh?.petition_id || '—'}</dd>
                </div>
                <div style={styles.metaItem}>
                  <dt style={styles.metaDt}>Price</dt>
                  <dd style={styles.metaDd}>{PRICE_USDC} USDC</dd>
                </div>
              </dl>
            </details>
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

      <WorldVerifyModal
        open={flow.worldOpen}
        onOpenChange={flow.setWorldOpen}
        action={flow.enrollAction}
        signal={flow.activePoh?.petition_id || undefined}
        title="Confirm it's you"
        subtitle="Same World ID as when you got your ticket. This unlocks payment for one capsule."
        successTitle="World validated"
        successSubtitle="Same person as Get. Close this panel to continue to pay."
        onVerified={async (result) => {
          try {
            const out = await flow.onWorldProof(result);
            if (out?.claimAlreadyUsed) {
              toast.error('Already claimed — you cannot claim again');
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
  claimedHero: {
    padding: '8px 0 4px',
  },
  claimedEyebrow: {
    margin: 0,
    fontSize: aspBrand.type.eyebrow,
    fontWeight: 650,
    letterSpacing: 0.08,
    textTransform: 'uppercase' as const,
    color: '#B42318',
  },
  claimedTitle: {
    margin: '10px 0 10px',
    fontSize: 26,
    fontWeight: 700,
    letterSpacing: -0.6,
    lineHeight: 1.15,
  },
  claimedLede: {
    margin: '0 0 16px',
    fontSize: aspBrand.type.lede,
    lineHeight: 1.5,
    color: aspBrand.muted,
  },
  claimedBadge: {
    display: 'inline-block',
    marginBottom: 18,
    padding: '6px 12px',
    borderRadius: 980,
    border: `1px solid ${aspBrand.lineStrong}`,
    fontSize: 12,
    fontWeight: 650,
    letterSpacing: 0.04,
    textTransform: 'uppercase' as const,
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
  panel: {
    background: aspBrand.paperCard,
    border: `1px solid ${aspBrand.line}`,
    borderRadius: 16,
    padding: 20,
  },
  fieldLabel: {
    display: 'block',
    fontSize: aspBrand.type.label,
    fontWeight: 650,
    color: aspBrand.muted,
    marginBottom: 8,
  },
  ticketRow: { display: 'flex', gap: 8 },
  ticketInput: {
    flex: 1,
    border: `1px solid ${aspBrand.lineStrong}`,
    borderRadius: 12,
    padding: '14px 14px',
    fontSize: aspBrand.type.body,
    fontFamily: aspBrand.mono,
    letterSpacing: 1.5,
    background: aspBrand.paper,
    color: aspBrand.ink,
  },
  ticketBtn: {
    border: 'none',
    background: aspBrand.ink,
    color: '#fff',
    borderRadius: 12,
    padding: '0 18px',
    fontSize: aspBrand.type.button,
    fontWeight: 650,
    cursor: 'pointer',
    fontFamily: aspBrand.font,
  },
  ticketStatus: {
    margin: '10px 0 0',
    fontSize: aspBrand.type.hint,
    color: aspBrand.muted,
    lineHeight: 1.4,
  },
  railWrap: { marginTop: 18 },
  statusBlock: {
    marginTop: 18,
    paddingTop: 16,
    borderTop: `1px solid ${aspBrand.line}`,
  },
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
    borderRadius: 12,
    background: 'rgba(192,57,43,0.08)',
    border: '1px solid rgba(192,57,43,0.22)',
    color: aspBrand.danger,
    fontSize: aspBrand.type.meta,
    fontFamily: aspBrand.mono,
    whiteSpace: 'pre-wrap' as const,
  },
  actions: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 8,
    marginTop: 16,
  },
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
  ghost: {
    border: `1px solid ${aspBrand.lineStrong}`,
    background: 'transparent',
    color: aspBrand.muted,
    borderRadius: 12,
    padding: '13px 14px',
    fontSize: aspBrand.type.button,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: aspBrand.font,
  },
  payBox: {
    marginTop: 18,
    padding: 16,
    borderRadius: 16,
    border: `1px solid ${aspBrand.line}`,
    background: aspBrand.paper,
    textAlign: 'center' as const,
  },
  payTitle: { fontSize: aspBrand.type.body, fontWeight: 700 },
  payHint: {
    margin: '6px 0 14px',
    fontSize: aspBrand.type.hint,
    lineHeight: 1.45,
    color: aspBrand.muted,
  },
  qrWrap: {
    display: 'inline-block',
    // Extra white pad outside the QR quiet zone so UI chrome never crowds finders.
    padding: 16,
    background: '#FFFFFF',
    borderRadius: 8,
    border: `1px solid ${aspBrand.line}`,
  },
  payLinks: {
    display: 'flex',
    justifyContent: 'center',
    flexWrap: 'wrap' as const,
    gap: 14,
    marginTop: 14,
  },
  link: {
    color: aspBrand.ink,
    textDecoration: 'underline',
    fontWeight: 650,
    fontSize: aspBrand.type.hint,
  },
  linkBtn: {
    border: 'none',
    background: 'transparent',
    color: aspBrand.ink,
    fontWeight: 650,
    fontSize: aspBrand.type.hint,
    cursor: 'pointer',
    fontFamily: aspBrand.font,
    padding: 0,
    textDecoration: 'underline',
  },
  receipt: {
    marginTop: 18,
    padding: 14,
    borderRadius: 14,
    border: `1px solid ${aspBrand.line}`,
    background: aspBrand.paper,
  },
  receiptTitle: { fontSize: aspBrand.type.body, fontWeight: 700, marginBottom: 10 },
  receiptMeta: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 10,
    margin: 0,
  },
  details: {
    marginTop: 16,
    borderTop: `1px solid ${aspBrand.line}`,
    paddingTop: 10,
  },
  summary: {
    cursor: 'pointer',
    fontSize: aspBrand.type.meta,
    fontWeight: 650,
    color: aspBrand.muted,
    listStyle: 'none' as const,
  },
  meta: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 10,
    margin: '12px 0 0',
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
};
