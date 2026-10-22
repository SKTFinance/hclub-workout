'use client';

import { useMemo } from 'react';
import qrcode from '@/lib/vendor/qrcode';

// QR-Code als SVG (MIT-Bibliothek qrcode-generator, lokal eingebunden).
// Heller Grund mit ruhiger Zone, dunkle Module: scannt auch vom TV über mehrere Meter.
export default function Qr({ value, size = 220, label }: { value: string; size?: number; label?: string }) {
  const { n, path } = useMemo(() => {
    const q = qrcode(0, 'M');
    q.addData(value);
    q.make();
    const n = q.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + 4} ${r + 4}h1v1h-1z`;
    return { n, path: d };
  }, [value]);
  return (
    <svg data-url={value} width={size} height={size} viewBox={`0 0 ${n + 8} ${n + 8}`} role="img" aria-label={label || 'QR code'} shapeRendering="crispEdges">
      <rect width={n + 8} height={n + 8} rx="2.2" fill="#F4F8F9" />
      <path d={path} fill="#071317" />
    </svg>
  );
}
