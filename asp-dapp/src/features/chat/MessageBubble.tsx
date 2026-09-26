import React from 'react';
import { theme, type ChatMessage, type PohCardPayload } from '../../theme/tokens';

type Props = {
  message: ChatMessage;
  onVerify: (poh: PohCardPayload) => void;
  onRevoke?: (poh: PohCardPayload) => void;
  verifyingId?: string | null;
};

export function MessageBubble({ message, onVerify, onRevoke, verifyingId }: Props) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  if (isSystem) {
    return (
      <div style={styles.systemRow}>
        <span style={styles.systemText}>{message.text}</span>
      </div>
    );
  }

  return (
    <div style={{ ...styles.row, justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
      <div
        style={{
          ...styles.bubble,
          ...(isUser ? styles.userBubble : styles.assistantBubble),
        }}
      >
        {!isUser && <div style={styles.label}>Asp</div>}
        <div style={{ ...styles.text, color: isUser ? '#fff' : theme.text }}>{message.text}</div>

        {message.poh && (
          <div style={styles.pohCard}>
            <div style={styles.pohTitle}>Proof of Human required</div>
            <div style={styles.pohBody}>
              {message.poh.device_name} will not dispense until World Selfie Check authorizes this
              request.
            </div>
            <div style={styles.pohMeta}>
              <span>Status: {message.poh.status}</span>
              {message.poh.release_id ? <span>Release: {message.poh.release_id}</span> : null}
            </div>
            <div style={styles.pohActions}>
              <button
                type="button"
                style={{
                  ...styles.primaryBtn,
                  opacity: verifyingId === message.poh.petition_id ? 0.6 : 1,
                }}
                disabled={verifyingId === message.poh.petition_id || message.poh.status === 'authorized'}
                onClick={() => onVerify(message.poh!)}
              >
                {message.poh.status === 'authorized'
                  ? 'Verified'
                  : verifyingId === message.poh.petition_id
                    ? 'Opening World…'
                    : 'Verify with World'}
              </button>
              {onRevoke && message.poh.status === 'pending_human' ? (
                <button type="button" style={styles.ghostBtn} onClick={() => onRevoke(message.poh!)}>
                  Cancel
                </button>
              ) : null}
            </div>
            <a
              href={`#verify-${message.poh.petition_id}`}
              style={styles.verifyLink}
              onClick={(e) => {
                e.preventDefault();
                onVerify(message.poh!);
              }}
            >
              Or open verification link
            </a>
          </div>
        )}

        {message.link && (
          <a href={message.link.href} style={styles.extLink} target="_blank" rel="noreferrer">
            {message.link.label}
          </a>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  row: { display: 'flex', width: '100%', marginBottom: 14 },
  bubble: {
    maxWidth: 'min(92%, 560px)',
    padding: '12px 16px',
    borderRadius: theme.radius,
    boxShadow: theme.shadowSoft,
    fontFamily: theme.font,
  },
  userBubble: {
    background: theme.userBubble,
    borderBottomRightRadius: 6,
  },
  assistantBubble: {
    background: theme.assistantBubble,
    border: `1px solid ${theme.border}`,
    borderBottomLeftRadius: 6,
  },
  label: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 0.4,
    color: theme.textTertiary,
    marginBottom: 4,
    textTransform: 'uppercase' as const,
  },
  text: {
    fontSize: 15,
    lineHeight: 1.55,
    whiteSpace: 'pre-wrap' as const,
  },
  systemRow: {
    display: 'flex',
    justifyContent: 'center',
    margin: '8px 0 16px',
  },
  systemText: {
    fontSize: 12,
    color: theme.textTertiary,
    fontFamily: theme.font,
  },
  pohCard: {
    marginTop: 12,
    padding: 14,
    borderRadius: theme.radiusSm,
    background: 'rgba(0,113,227,0.06)',
    border: '1px solid rgba(0,113,227,0.18)',
  },
  pohTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: theme.text,
    marginBottom: 4,
  },
  pohBody: {
    fontSize: 13,
    lineHeight: 1.45,
    color: theme.textSecondary,
    marginBottom: 10,
  },
  pohMeta: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 10,
    fontSize: 11,
    color: theme.textTertiary,
    fontFamily: theme.mono,
    marginBottom: 12,
  },
  pohActions: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap' as const,
  },
  primaryBtn: {
    border: 'none',
    background: theme.accent,
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
    padding: '10px 16px',
    borderRadius: 980,
    cursor: 'pointer',
    fontFamily: theme.font,
  },
  ghostBtn: {
    border: `1px solid ${theme.borderStrong}`,
    background: 'transparent',
    color: theme.textSecondary,
    fontSize: 13,
    fontWeight: 500,
    padding: '10px 14px',
    borderRadius: 980,
    cursor: 'pointer',
    fontFamily: theme.font,
  },
  verifyLink: {
    display: 'inline-block',
    marginTop: 10,
    fontSize: 12,
    color: theme.accent,
    textDecoration: 'none',
    fontFamily: theme.font,
  },
  extLink: {
    display: 'inline-block',
    marginTop: 8,
    fontSize: 13,
    color: theme.accent,
  },
};

