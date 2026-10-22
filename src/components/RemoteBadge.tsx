'use client';

import { useEffect, useState } from 'react';
import Qr from '@/components/Qr';
import { phoneAccessKnownBad, phoneUrlAsync } from '@/lib/remote';

// Kleiner QR-Kasten in der Ecke: Coach scannt und steuert das Training am Handy.
export default function RemoteBadge({ code }: { code: string | null }) {
  const [url, setUrl] = useState('');
  const [bad, setBad] = useState(false);
  useEffect(() => {
    if (!code) return;
    let alive = true;
    phoneUrlAsync(`/r/${code}`).then((u) => { if (alive) { setUrl(u); setBad(phoneAccessKnownBad()); } });
    return () => { alive = false; };
  }, [code]);
  if (!code || !url) return null;
  return (
    <div className="rb-badge" data-url={url}>
      <Qr value={url} size={112} label="Phone remote QR code" />
      <div className="rb-text">
        <b>Phone remote</b>
        <span>{bad ? 'Preview link without access token: phones will be asked to log in.' : 'Scan to run this workout from your phone'}</span>
      </div>
    </div>
  );
}
