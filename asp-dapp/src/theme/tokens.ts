export const theme = {
  bg: '#F5F5F7',
  surface: '#FFFFFF',
  surfaceElevated: 'rgba(255,255,255,0.82)',
  text: '#1D1D1F',
  textSecondary: '#6E6E73',
  textTertiary: '#6E6E73',
  border: 'rgba(0,0,0,0.08)',
  borderStrong: 'rgba(0,0,0,0.12)',
  accent: '#0071E3',
  accentHover: '#0077ED',
  success: '#34C759',
  danger: '#FF3B30',
  warn: '#FF9F0A',
  userBubble: '#0071E3',
  assistantBubble: '#FFFFFF',
  shadow: '0 8px 30px rgba(0,0,0,0.06)',
  shadowSoft: '0 2px 12px rgba(0,0,0,0.04)',
  radius: 18,
  radiusSm: 12,
  font:
    '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", Helvetica, Arial, sans-serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  maxWidth: 760,
};

export type ChatRole = 'user' | 'assistant' | 'system';

export type ChatPhase =
  | 'idle'
  | 'requested'
  | 'awaiting_human'
  | 'authorized'
  | 'awaiting_phone_pay'
  | 'paying'
  | 'executing'
  | 'done'
  | 'denied'
  | 'revoked'
  | 'error';

export type PohCardPayload = {
  petition_id: string;
  device_name: string;
  command: string[];
  release_id?: string | null;
  status: string;
  preferred_action: string;
  job_action?: string;
  release_action?: string | null;
};

export type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  createdAt: number;
  poh?: PohCardPayload;
  phase?: ChatPhase;
  link?: { label: string; href: string };
};
