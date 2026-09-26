/**
 * Demo-only: remember the last winner ticket in this browser so the kiosk
 * input autofills faster. Not a security handoff — real flow is ticket typed
 * at kiosk + World session prove (session lives on gateway).
 */

const KEY = 'asp.demoTicket.v1';

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function saveDemoTicket(ticket: string) {
  if (!canUseStorage()) return;
  const t = String(ticket || '').trim().toUpperCase();
  if (!t) return;
  try {
    window.localStorage.setItem(KEY, t);
  } catch {
    // ignore
  }
}

export function readDemoTicket(): string {
  if (!canUseStorage()) return '';
  try {
    return String(window.localStorage.getItem(KEY) || '')
      .trim()
      .toUpperCase();
  } catch {
    return '';
  }
}

export function clearDemoTicket() {
  if (!canUseStorage()) return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
