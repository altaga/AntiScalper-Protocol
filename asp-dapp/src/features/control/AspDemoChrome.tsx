import React from 'react';
import logoDark from '../../assets/logo-dark.png';

export type AspRoute = 'signup' | 'kiosk' | 'v1';

/** Demo brand — monochrome protocol. No rental-lime, no Apple blue. */
export const aspBrand = {
  ink: '#111111',
  header: '#111111',
  paper: '#FAFAFA',
  paperCard: '#FFFFFF',
  line: 'rgba(17,17,17,0.1)',
  lineStrong: 'rgba(17,17,17,0.18)',
  muted: '#6B6B6B',
  danger: '#B42318',
  font: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Helvetica, Arial, sans-serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  /** Kiosk type — readable ~1 m, balanced (not oversized) */
  type: {
    eyebrow: 13,
    title: 38,
    lede: 17,
    body: 16,
    status: 17,
    button: 16,
    label: 14,
    hint: 14,
    meta: 13,
    ticket: 46,
    rail: 12,
    nav: 15,
    footer: 13,
  },
};

type ChromeProps = {
  active: AspRoute;
};

type FooterProps = {
  onReset?: () => void;
  resetBusy?: boolean;
  resetLabel?: string;
};

export function AspDemoChrome({ active }: ChromeProps) {
  return (
    <header style={styles.header}>
      <div style={styles.inner}>
        <a href="/" style={styles.brand} aria-label="Asp">
          <img src={logoDark} alt="Asp" style={styles.logo} />
        </a>

        <nav style={styles.nav} aria-label="Primary">
          <a
            href="/"
            aria-current={active === 'signup' ? 'page' : undefined}
            style={{
              ...styles.tab,
              ...(active === 'signup' ? styles.tabOn : null),
            }}
          >
            Get
          </a>
          <a
            href="/claim"
            aria-current={active === 'kiosk' ? 'page' : undefined}
            style={{
              ...styles.tab,
              ...(active === 'kiosk' ? styles.tabOn : null),
            }}
          >
            Claim
          </a>
        </nav>
      </div>
    </header>
  );
}

export function AspDemoFooter({ onReset, resetBusy, resetLabel = 'Reset demo' }: FooterProps) {
  return (
    <footer style={styles.footer}>
      <div style={styles.footerLeft}>
        <span style={styles.footerMuted}>Tokyo 2026</span>
        <span style={styles.dot} aria-hidden>
          ·
        </span>
        <a href="/v1" style={styles.footerLink} title="Backup demo — no ticket, claims on the spot">
          Backup demo
        </a>
      </div>
      {onReset ? (
        <button
          type="button"
          style={{
            ...styles.reset,
            opacity: resetBusy ? 0.45 : 1,
            cursor: resetBusy ? 'not-allowed' : 'pointer',
          }}
          disabled={resetBusy}
          onClick={onReset}
        >
          {resetBusy ? 'Resetting…' : resetLabel}
        </button>
      ) : null}
    </footer>
  );
}

const styles: Record<string, React.CSSProperties> = {
  header: {
    position: 'sticky',
    top: 0,
    zIndex: 40,
    background: aspBrand.header,
  },
  inner: {
    maxWidth: 960,
    margin: '0 auto',
    padding: '0 24px',
    minHeight: 96,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 24,
  },
  brand: {
    display: 'inline-flex',
    alignItems: 'center',
    textDecoration: 'none',
    flexShrink: 0,
  },
  logo: {
    width: 88,
    height: 88,
    display: 'block',
    objectFit: 'contain' as const,
  },
  nav: {
    display: 'flex',
    alignItems: 'stretch',
    height: 96,
    gap: 2,
  },
  tab: {
    display: 'inline-flex',
    alignItems: 'center',
    textDecoration: 'none',
    padding: '0 16px',
    fontSize: aspBrand.type.nav,
    fontWeight: 500,
    color: 'rgba(255,255,255,0.5)',
    borderBottom: '2px solid transparent',
    fontFamily: aspBrand.font,
  },
  tabOn: {
    color: '#fff',
    fontWeight: 650,
    borderBottom: '2px solid #fff',
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    padding: '10px 24px 32px',
    maxWidth: 560,
    width: '100%',
    margin: '0 auto',
    boxSizing: 'border-box' as const,
  },
  footerLeft: { display: 'flex', alignItems: 'center', gap: 8 },
  footerMuted: { fontSize: aspBrand.type.footer, color: aspBrand.muted, fontFamily: aspBrand.font },
  dot: { color: aspBrand.muted, fontSize: aspBrand.type.footer },
  footerLink: {
    fontSize: aspBrand.type.footer,
    color: aspBrand.muted,
    textDecoration: 'none',
    fontWeight: 650,
    fontFamily: aspBrand.font,
  },
  reset: {
    border: `1px solid ${aspBrand.lineStrong}`,
    background: aspBrand.paperCard,
    color: aspBrand.muted,
    borderRadius: 8,
    padding: '8px 12px',
    fontSize: aspBrand.type.footer,
    fontWeight: 600,
    fontFamily: aspBrand.font,
  },
};
