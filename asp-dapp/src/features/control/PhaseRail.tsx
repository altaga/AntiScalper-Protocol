import React from 'react';
import type { ChatPhase } from '../../theme/tokens';
import { aspBrand } from './AspDemoChrome';

const STEPS: { id: string; label: string; match: ChatPhase[] }[] = [
  { id: 'request', label: 'Start', match: ['idle', 'requested'] },
  { id: 'poh', label: 'World ID', match: ['awaiting_human'] },
  { id: 'auth', label: 'Ready', match: ['authorized'] },
  { id: 'pay', label: 'Pay', match: ['awaiting_phone_pay', 'paying', 'executing'] },
  { id: 'done', label: 'Capsule', match: ['done'] },
];

const TERMINAL: ChatPhase[] = ['denied', 'revoked', 'error'];

function stepIndex(phase: ChatPhase): number {
  if (phase === 'idle') return 0;
  if (phase === 'requested') return 0;
  if (phase === 'awaiting_human') return 1;
  if (phase === 'authorized') return 2;
  if (phase === 'awaiting_phone_pay' || phase === 'paying' || phase === 'executing') return 3;
  if (phase === 'done') return 4;
  if (TERMINAL.includes(phase)) return -1;
  return 0;
}

type Props = { phase: ChatPhase };

export function PhaseRail({ phase }: Props) {
  if (TERMINAL.includes(phase)) {
    const label =
      phase === 'denied' ? 'Denied' : phase === 'revoked' ? 'Revoked' : 'Error';
    const color = phase === 'error' ? aspBrand.danger : '#B7791F';
    return (
      <div style={styles.terminal} role="status">
        <span style={{ ...styles.terminalDot, background: color }} />
        <span style={{ ...styles.terminalLabel, color }}>{label}</span>
        <span style={styles.terminalHint}>
          {phase === 'denied'
            ? 'This ticket already got a capsule'
            : phase === 'revoked'
              ? 'Claim cancelled — nothing dispensed'
              : 'Something failed — try again'}
        </span>
      </div>
    );
  }

  const current = stepIndex(phase);

  return (
    <ol style={styles.rail} aria-label="Checkout progress">
      {STEPS.map((step, i) => {
        const active = i === current;
        const complete = i < current || phase === 'done';
        return (
          <li key={step.id} style={styles.step}>
            <div
              style={{
                ...styles.dot,
                ...(complete ? styles.dotComplete : {}),
                ...(active ? styles.dotActive : {}),
              }}
              aria-current={active ? 'step' : undefined}
            >
              {complete && phase === 'done' && i === 4 ? '✓' : i + 1}
            </div>
            <span
              style={{
                ...styles.label,
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
  );
}

const styles: Record<string, React.CSSProperties> = {
  rail: {
    display: 'flex',
    alignItems: 'flex-start',
    listStyle: 'none',
    margin: 0,
    padding: 0,
    gap: 0,
    width: '100%',
  },
  step: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    position: 'relative',
    minWidth: 0,
  },
  dot: {
    width: 30,
    height: 30,
    borderRadius: 999,
    borderWidth: 1.5,
    borderStyle: 'solid',
    borderColor: aspBrand.lineStrong,
    background: aspBrand.paperCard,
    color: aspBrand.muted,
    fontSize: 13,
    fontWeight: 650,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
    fontFamily: aspBrand.font,
  },
  dotActive: {
    borderColor: aspBrand.ink,
    background: aspBrand.ink,
    color: '#fff',
  },
  dotComplete: {
    borderColor: aspBrand.ink,
    background: aspBrand.ink,
    color: '#fff',
  },
  label: {
    marginTop: 8,
    fontSize: aspBrand.type.rail,
    textAlign: 'center' as const,
    lineHeight: 1.25,
    fontFamily: aspBrand.font,
    padding: '0 2px',
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
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '12px 14px',
    borderRadius: 12,
    background: aspBrand.paper,
    border: `1px solid ${aspBrand.line}`,
  },
  terminalDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    flexShrink: 0,
  },
  terminalLabel: {
    fontSize: aspBrand.type.body,
    fontWeight: 650,
    fontFamily: aspBrand.font,
  },
  terminalHint: {
    fontSize: aspBrand.type.hint,
    color: aspBrand.muted,
    fontFamily: aspBrand.font,
  },
};
