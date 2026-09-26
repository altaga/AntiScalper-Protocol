import React from 'react';
import { ChatPage } from '../features/chat/ChatPage';
import { theme } from '../theme/tokens';

/** Agent chat path — same PoH-gated hire as Control. */
export default function ChatRoute() {
  return (
    <div style={styles.shell}>
      <div style={styles.nav}>
        <a href="/" style={styles.back}>
          ← Checkout
        </a>
        <a href="/lab" style={styles.lab}>
          World Lab
        </a>
        <a href="/kiosk" style={styles.lab}>
          Kiosk Lab
        </a>
      </div>
      <main style={styles.main}>
        <div style={styles.col}>
          <ChatPage />
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
    padding: '10px 20px',
    borderBottom: `1px solid ${theme.border}`,
  },
  back: { color: theme.accent, textDecoration: 'none', fontSize: 13, fontWeight: 600 },
  lab: { color: theme.textTertiary, textDecoration: 'none', fontSize: 13 },
  main: { display: 'flex', justifyContent: 'center', padding: '16px 16px 32px' },
  col: { width: '100%', maxWidth: theme.maxWidth },
};
