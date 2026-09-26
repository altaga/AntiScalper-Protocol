import React from 'react';
import logoImage from '../assets/logo.png';
import { KioskLabPanel } from '../features/control/KioskLabPanel';
import { theme } from '../theme/tokens';

/** Isolated kiosk unique-link lab — hand-test Slush pay QR without touching product checkout. */
export default function KioskLabRoute() {
  return (
    <div style={styles.shell}>
      <div style={styles.nav}>
        <a href="/" style={styles.brand}>
          <img src={logoImage} alt="" style={styles.logo} />
          Asp
        </a>
        <div style={styles.links}>
          <a href="/" style={styles.link}>
            ← Checkout
          </a>
          <a href="/lab" style={styles.link}>
            World Lab
          </a>
          <a href="/chat" style={styles.link}>
            Chat
          </a>
        </div>
      </div>
      <main style={styles.main}>
        <div style={styles.col}>
          <KioskLabPanel />
        </div>
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  shell: {
    minHeight: '100vh',
    background: theme.bg,
    color: theme.text,
    fontFamily: theme.font,
  },
  nav: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 20px',
    borderBottom: `1px solid ${theme.border}`,
    background: theme.surfaceElevated,
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    fontSize: 17,
    fontWeight: 650,
    color: theme.text,
    textDecoration: 'none',
  },
  logo: { width: 28, height: 28, borderRadius: 8 },
  links: { display: 'flex', gap: 14 },
  link: { color: theme.accent, textDecoration: 'none', fontSize: 13, fontWeight: 600 },
  main: { display: 'flex', justifyContent: 'center', padding: '20px 16px 32px' },
  col: { width: '100%', maxWidth: theme.maxWidth },
};
