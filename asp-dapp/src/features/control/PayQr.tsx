import React, { useEffect, useState } from 'react';

type Props = {
  value: string;
  size?: number;
};

/** Web QR for kiosk booth — generates a data-URL via `qrcode`. */
export function PayQr({ value, size = 220 }: Props) {
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
          margin: 2,
          errorCorrectionLevel: 'M',
          color: { dark: '#1D1D1F', light: '#FFFFFF' },
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
          background: 'rgba(0,0,0,0.04)',
          borderRadius: 12,
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
      style={{ borderRadius: 12, display: 'block' }}
    />
  );
}
