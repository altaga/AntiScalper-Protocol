import React, { useEffect, useState } from 'react';

type Props = {
  value: string;
  size?: number;
};

/**
 * Kiosk Slush pay QR — tuned for instant phone scans on a bright booth screen:
 * quiet zone ≥4 modules, pure black/white, ECC L (screen, no logo/damage).
 */
export function PayQr({ value, size = 256 }: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    setErr(null);
    (async () => {
      try {
        const QRCode = require('qrcode');
        const url = await QRCode.toDataURL(value, {
          width: size,
          margin: 4,
          errorCorrectionLevel: 'L',
          color: { dark: '#000000', light: '#FFFFFF' },
        });
        if (!cancelled) setSrc(url);
      } catch (e: any) {
        if (!cancelled) setErr(String(e?.message || e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (err) {
    return <p style={{ fontSize: 13, color: '#FF3B30' }}>QR failed: {err}</p>;
  }
  if (!src) {
    return (
      <div
        style={{
          width: size,
          height: size,
          background: '#FFFFFF',
          borderRadius: 0,
        }}
        aria-busy
      />
    );
  }
  return (
    <img
      src={src}
      width={size}
      height={size}
      alt="Slush pay QR"
      style={{
        display: 'block',
        background: '#FFFFFF',
        borderRadius: 0,
      }}
    />
  );
}
