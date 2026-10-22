'use client';

// Handy-Fernbedienung (22.10.2026): steuert das Training auf dem TV live per Realtime-Broadcast.
// Öffentlich erreichbar (Code im Link), schreibt nichts in die Datenbank.

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { connectRemote, validCode, type RemoteStatus } from '@/lib/remote';
import RemotePad from '@/components/RemotePad';

export default function RemotePage() {
  const code = String(useParams().code || '').toUpperCase();
  const ok = validCode(code);
  const [st, setSt] = useState<RemoteStatus | null>(null);
  const [live, setLive] = useState(false);
  const link = useRef<ReturnType<typeof connectRemote> | null>(null);

  useEffect(() => {
    if (!ok) return;
    const l = connectRemote(code, setSt, setLive);
    link.current = l;
    return () => { link.current = null; l.close(); };
  }, [code, ok]);

  if (!ok) return <main className="rc-root"><p className="rc-empty">This remote link is not valid.</p></main>;
  const phase = st?.phase || 'idle';
  const tone = phase === 'rest' || phase === 'roundRest' ? 'is-rest' : phase === 'work' ? 'is-work' : '';
  return (
    <main className={`rc-root ${tone}`}>
      <header className="rc-head">
        <div className="rc-brand">HYB<span>RYD</span> <em>Remote</em></div>
        <div className={`rc-link ${live ? 'is-live' : ''}`}><i />{live ? 'Connected to screen' : 'Looking for screen…'}</div>
      </header>
      <RemotePad st={st} live={live} send={(c) => link.current?.send(c)} />
    </main>
  );
}
