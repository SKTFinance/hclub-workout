'use client';

// „Freies Training" auf dem TV (22.10.2026).
// Ohne laufendes Training: Bildschirmschoner mit QR-Code. Mitglieder scannen, bauen am Handy
// eine Übungsfolge (gern mit dem KI-Baukasten) und starten sie hier. Bis zu vier Sitzungen
// laufen gleichzeitig (1 / 2 / 4 Felder). Keine Anmeldung, keine Datenbank: Alles läuft über
// einen Realtime-Broadcast-Kanal mit dem TV-Code, jedes Feld ist die normale Live-Ansicht
// im iframe (Workout nur im sessionStorage dieses Fensters).

import { useCallback, useEffect, useRef, useState } from 'react';
import Qr from '@/components/Qr';
import { getExerciseImage } from '@/lib/exerciseImages';
import { newCode, openTv, phoneUrl, validCode, type RemoteCmd, type RemoteStatus } from '@/lib/remote';

interface Slot { sid: string; name: string; status: RemoteStatus | null; doneAt?: number }
const SLOTS = 4;
const REEL_A = ['Rowing', 'Skierg', 'Wall Balls', 'Burpee Broad Jump', 'Sled Push', 'Lunges', 'Bike', 'Kettlebell Swing'];
const REEL_B = ['Farmers Carry', 'Sandbag Lunges', 'Box Jump', 'Thruster', 'Pull Up', 'Run', 'Deadlift', 'Toes to Bar'];

function Cell({ slot, index, onCmd }: { slot: Slot; index: number; onCmd: (f: (cmd: RemoteCmd) => void) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [dim, setDim] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => setDim({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el); setDim({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    onCmd((cmd) => frame.current?.contentWindow?.postMessage({ hy: 'cmd', cmd }, window.location.origin));
  }, [onCmd]);
  const vw = dim.w < 700 ? Math.max(dim.w, 1) : 1280;
  const scale = dim.w / vw;
  const vh = dim.w ? dim.h / scale : 0;
  return (
    <div ref={box} className="tv-cell" data-slot={index}>
      {dim.w > 0 && (
        <iframe
          ref={frame}
          title={`Field ${index + 1}`}
          src={`/workout/free-${index}/live?embed=${index}`}
          style={{ width: vw, height: vh, transform: `scale(${scale})` }}
        />
      )}
    </div>
  );
}

export default function TvPage() {
  const [code, setCode] = useState<string | null>(null);
  const [slots, setSlots] = useState<(Slot | null)[]>(Array(SLOTS).fill(null));
  const [url, setUrl] = useState('');
  const [tick, setTick] = useState(0);
  const slotsRef = useRef(slots);
  slotsRef.current = slots;
  const tvRef = useRef<ReturnType<typeof openTv> | null>(null);
  const cmdFns = useRef<Record<number, (cmd: RemoteCmd) => void>>({});

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    let c = (q.get('code') || '').toUpperCase();
    if (!validCode(c)) { try { c = sessionStorage.getItem('hy_tvcode') || ''; } catch { c = ''; } }
    if (!validCode(c)) c = newCode(5);
    try { sessionStorage.setItem('hy_tvcode', c); } catch { /* egal */ }
    setCode(c);
    setUrl(phoneUrl(`/free/${c}`));
  }, []);

  const announce = useCallback(() => {
    const free = slotsRef.current.filter((s) => !s).length;
    tvRef.current?.send('tvstate', { free, active: SLOTS - free });
  }, []);

  const setSlot = useCallback((i: number, v: Slot | null) => {
    setSlots((prev) => { const n = [...prev]; n[i] = v; return n; });
  }, []);

  useEffect(() => {
    if (!code) return;
    const tv = openTv(code, (ev, raw) => {
      const p = raw as { sid?: string; workout?: unknown; cmd?: RemoteCmd };
      if (ev === 'hello') announce();
      if (ev === 'start' && p.sid && p.workout) {
        const cur = slotsRef.current;
        let i = cur.findIndex((s) => s?.sid === p.sid);       // dieselbe Person ersetzt ihr Feld
        if (i < 0) i = cur.findIndex((s) => !s);
        if (i < 0) { tv.send('assigned', { sid: p.sid, full: true }); return; }
        try { sessionStorage.setItem(`hybryd_free-${i}`, JSON.stringify(p.workout)); } catch { /* egal */ }
        setSlot(i, { sid: p.sid, name: String((p.workout as { name?: string }).name || 'Workout'), status: null });
        tv.send('assigned', { sid: p.sid, slot: i });
        setTimeout(announce, 50);
      }
      if (ev === 'cmd' && p.sid && p.cmd) {
        const i = slotsRef.current.findIndex((s) => s?.sid === p.sid);
        if (i < 0) return;
        if (p.cmd.t === 'stop') { setSlot(i, null); tv.send('ended', { sid: p.sid }); setTimeout(announce, 50); }
        else cmdFns.current[i]?.(p.cmd);
      }
    });
    tvRef.current = tv;
    const t = setInterval(announce, 5000);
    return () => { clearInterval(t); tvRef.current = null; tv.close(); };
  }, [code, announce, setSlot]);

  // Status der Felder (aus den iframes) → TV-Zustand → Handy
  useEffect(() => {
    function on(e: MessageEvent) {
      if (e.origin !== window.location.origin || e.data?.hy !== 'status') return;
      const i = Number(e.data.slot); const st = e.data.status as RemoteStatus | null;
      const cur = slotsRef.current[i];
      if (!cur || !st) return;
      tvRef.current?.send('status', { sid: cur.sid, status: st });
      if (st.phase === 'finished' && !cur.doneAt) setSlot(i, { ...cur, status: st, doneAt: Date.now() });
    }
    window.addEventListener('message', on);
    return () => window.removeEventListener('message', on);
  }, [setSlot]);

  // Fertige Felder nach 40 s freigeben.
  useEffect(() => {
    const t = setInterval(() => {
      setTick((n) => n + 1);
      slotsRef.current.forEach((s, i) => {
        if (s?.doneAt && Date.now() - s.doneAt > 40000) { setSlot(i, null); tvRef.current?.send('ended', { sid: s.sid }); setTimeout(announce, 50); }
      });
    }, 2000);
    return () => clearInterval(t);
  }, [announce, setSlot]);

  const active = slots.map((s, i) => (s ? i : -1)).filter((i) => i >= 0);
  const n = active.length;
  const layout = n <= 1 ? 'l1' : n === 2 ? 'l2' : 'l4';
  void tick;

  if (!code) return <main className="tv-root" />;

  if (n === 0) {
    const ring = (names: string[]) => [...names, ...names].map((nm, i) => (
      // eslint-disable-next-line @next/next/no-img-element
      <img key={i} src={getExerciseImage(nm)} alt="" draggable={false} />
    ));
    return (
      <main className="tv-root tv-saver">
        <div className="tv-reel tv-reel-a" aria-hidden="true"><div>{ring(REEL_A)}</div></div>
        <div className="tv-reel tv-reel-b" aria-hidden="true"><div>{ring(REEL_B)}</div></div>
        <div className="tv-veil" aria-hidden="true" />
        <div className="tv-saver-main">
          <div className="tv-saver-copy">
            <div className="tv-brand">HYB<span>RYD</span><em>Mallorca</em></div>
            <div className="tv-eyebrow"><i />Free training</div>
            <h1>Build it on your phone.<br />Run it on this screen.</h1>
            <ol className="tv-steps">
              <li><b>1</b>Scan the code</li>
              <li><b>2</b>Write your moves or let the AI build them</li>
              <li><b>3</b>Hit start. Up to four of you train at once.</li>
            </ol>
          </div>
          <div className="tv-qrcard">
            {url && <Qr value={url} size={320} label="Scan to start free training" />}
            <div className="tv-qrcode">Screen code <b>{code}</b></div>
          </div>
        </div>
      </main>
    );
  }

  const free = SLOTS - n;
  return (
    <main className={`tv-root tv-grid ${layout}`}>
      {active.map((i) => (
        <Cell key={slots[i]!.sid} slot={slots[i]!} index={i} onCmd={(f) => { cmdFns.current[i] = f; }} />
      ))}
      {layout === 'l4' && n === 3 && url && (
        <div className="tv-cell tv-join">
          <Qr value={url} size={200} />
          <div><b>Field free</b><span>Scan to add your session</span></div>
        </div>
      )}
      {free > 0 && layout !== 'l4' && url && (
        <div className="tv-pill">
          <Qr value={url} size={76} />
          <div><b>Join in</b><span>Scan, build, start</span></div>
        </div>
      )}
    </main>
  );
}
