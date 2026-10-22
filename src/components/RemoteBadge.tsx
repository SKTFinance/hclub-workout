'use client';

import { useEffect, useState } from 'react';
import Qr from '@/components/Qr';
import { phoneUrl } from '@/lib/remote';

// Kleiner QR-Kasten in der Ecke: Coach scannt und steuert das Training am Handy.
export default function RemoteBadge({ code }: { code: string | null }) {
  const [url, setUrl] = useState('');
  useEffect(() => { if (code) setUrl(phoneUrl(`/r/${code}`)); }, [code]);
  if (!code || !url) return null;
  return (
    <div className="rb-badge">
      <Qr value={url} size={112} label="Phone remote QR code" />
      <div className="rb-text"><b>Phone remote</b><span>Scan to run this workout from your phone</span></div>
    </div>
  );
}
