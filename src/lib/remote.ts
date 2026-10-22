'use client';

// Fernbedienung und TV-Kanal über Supabase Realtime BROADCAST (22.10.2026).
// Kein Tabellenzugriff, nichts wird gespeichert: Nachrichten leben nur, solange beide
// Seiten den Kanal offen haben. Der Kanalname enthält einen zufälligen Code; wer den Code
// (per QR) hat, darf steuern. Für eine echte Freigabe an Mitglieder reicht das, es gibt
// keine Daten, die man darüber lesen könnte.

import { useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

export type RemoteCmd =
  | { t: 'toggle' }          // Start / Pause / Weiter
  | { t: 'skip' }            // Station/Intervall überspringen (Timed)
  | { t: 'done'; g: number } // AMRAP: Station in Gruppe g erledigt
  | { t: 'stop' }            // Abbrechen (zurück zum Anfang)
  | { t: 'adjust'; s: number };

export interface RemoteStatus {
  name: string;
  mode: string;
  phase: string;
  time: number;
  round: number;
  rounds: number;
  groups: number;
  paused: boolean;
  label: string; // aktuelle Übung, kurz
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newCode(len = 6): string {
  const a = new Uint8Array(len);
  crypto.getRandomValues(a);
  return Array.from(a, (x) => ALPHABET[x % ALPHABET.length]).join('');
}
export function validCode(c: string): boolean {
  return /^[A-Z2-9]{4,12}$/.test(c);
}

function open(name: string, onMsg: (event: string, payload: unknown) => void, events: string[]) {
  const sb = createClient();
  const ch: RealtimeChannel = sb.channel(name, { config: { broadcast: { self: false, ack: false } } });
  for (const ev of events) ch.on('broadcast', { event: ev }, (m) => onMsg(ev, m.payload));
  ch.subscribe();
  return { ch, close: () => { sb.removeChannel(ch); } };
}

// Gastgeber (TV): empfängt Befehle, sendet Status.
export function useRemoteHost(code: string | null, status: RemoteStatus | null, onCmd: (c: RemoteCmd) => void) {
  const chRef = useRef<RealtimeChannel | null>(null);
  const cmdRef = useRef(onCmd);
  cmdRef.current = onCmd;
  const statusRef = useRef(status);
  statusRef.current = status;

  useEffect(() => {
    if (!code) return;
    const h = open(`hy-rc-${code}`, (ev, payload) => {
      if (ev === 'cmd') cmdRef.current(payload as RemoteCmd);
      if (ev === 'hello' && statusRef.current) chRef.current?.send({ type: 'broadcast', event: 'status', payload: statusRef.current });
    }, ['cmd', 'hello']);
    chRef.current = h.ch;
    return () => { chRef.current = null; h.close(); };
  }, [code]);

  // Status etwa einmal pro Sekunde, sobald er sich ändert.
  const key = status ? `${status.phase}|${status.time}|${status.round}|${status.paused}|${status.label}` : '';
  useEffect(() => {
    if (!code || !chRef.current || !statusRef.current) return;
    chRef.current.send({ type: 'broadcast', event: 'status', payload: statusRef.current });
  }, [code, key]);
}

// Fernbedienung (Handy): sendet Befehle, empfängt Status.
export function connectRemote(code: string, onStatus: (s: RemoteStatus) => void, onState: (live: boolean) => void) {
  let last = 0;
  const h = open(`hy-rc-${code}`, (ev, payload) => {
    if (ev === 'status') { last = Date.now(); onStatus(payload as RemoteStatus); onState(true); }
  }, ['status']);
  const hello = () => h.ch.send({ type: 'broadcast', event: 'hello', payload: {} });
  const t1 = setTimeout(hello, 800);
  const t2 = setInterval(() => { if (Date.now() - last > 4000) { hello(); onState(false); } }, 3000);
  return {
    send: (c: RemoteCmd) => h.ch.send({ type: 'broadcast', event: 'cmd', payload: c }),
    close: () => { clearTimeout(t1); clearInterval(t2); h.close(); },
  };
}

// Link für das Handy (QR). Auf der geschützten Vorschau braucht das Handy den Freigabe-Token
// (_vercel_share); er kommt über ?vs=… in die TV-Adresse und wird hier weitergereicht.
export function phoneUrl(path: string, extraQuery = ''): string {
  if (typeof window === 'undefined') return path;
  let vs = '';
  try {
    const q = new URLSearchParams(window.location.search);
    vs = q.get('vs') || localStorage.getItem('hy_vs') || sessionStorage.getItem('hy_vs') || '';
    if (vs) localStorage.setItem('hy_vs', vs);
  } catch { /* egal */ }
  const add = extraQuery || (vs ? `_vercel_share=${encodeURIComponent(vs)}` : '');
  return `${window.location.origin}${path}${add ? `${path.includes('?') ? '&' : '?'}${add}` : ''}`;
}

// Wie phoneUrl, holt aber zuerst beim Server den Schutz-Umgehungsparameter
// (/api/phone-access). Damit braucht das Handy auf der Vorschau keinen Vercel-Login,
// auch wenn der TV ohne ?vs=… geöffnet wurde.
let accessCache: Promise<string> | null = null;
export async function phoneUrlAsync(path: string): Promise<string> {
  if (typeof window === 'undefined') return path;
  const host = window.location.hostname;
  const isVercelPreview = host.endsWith('.vercel.app');
  if (!isVercelPreview) return phoneUrl(path);
  if (!accessCache) {
    accessCache = fetch('/api/phone-access', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : { query: '' }))
      .then((j: { query?: string }) => {
        const q = j.query || '';
        // Freigabe merken: kommt der TV später ohne Cookie zurück, gilt sie weiter.
        const m = /_vercel_share=([^&]+)/.exec(q);
        if (m) { try { localStorage.setItem('hy_vs', decodeURIComponent(m[1])); } catch { /* egal */ } }
        return q;
      })
      .catch(() => '');
  }
  const q = await accessCache;
  const url = phoneUrl(path, q);
  // Ohne Freigabe landet ein Handy auf der Vercel-Anmeldung. Das sichtbar machen,
  // statt einen QR-Code zu zeigen, der nicht funktioniert.
  phoneAccessOk = /x-vercel-protection-bypass=|_vercel_share=/.test(url);
  return url;
}

/** false = Vorschau ohne Freigabe-Token: der QR-Code würde am Handy die Vercel-Anmeldung zeigen. */
export let phoneAccessOk = true;
export function phoneAccessKnownBad(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.hostname.endsWith('.vercel.app') && !phoneAccessOk;
}

// ---------- Freies Training: ein Kanal je TV-Code ----------
export interface TvHandlers { onEvent: (event: string, payload: unknown) => void }
export function openTv(code: string, onEvent: TvHandlers['onEvent']) {
  const h = open(`hy-tv-${code}`, onEvent, ['hello', 'tvstate', 'start', 'assigned', 'status', 'cmd', 'ended']);
  return {
    send: (event: string, payload: unknown) => h.ch.send({ type: 'broadcast', event, payload }),
    close: h.close,
  };
}
