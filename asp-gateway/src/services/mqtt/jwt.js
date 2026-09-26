export function decodeJwtPayload(jwt) {
  if (typeof jwt !== 'string' || jwt.length === 0) return null;

  const parts = jwt.split('.');
  if (parts.length !== 3) return null;

  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(Buffer.from(pad, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}
