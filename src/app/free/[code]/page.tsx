'use client';

// Freies Training am Handy (22.10.2026): ohne Konto eine kurze Übungsfolge bauen
// (mit KI-Baukasten), auf dem TV starten und von hier steuern. Nichts wird gespeichert.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { aiDraftToWorkout, type AiDraft } from '@/lib/aiWorkout';
import { openTv, validCode, type RemoteCmd, type RemoteStatus } from '@/lib/remote';
import RemotePad from '@/components/RemotePad';

const CHIPS = [
  { label: 'EMOM 10', add: 'EMOM 10 min\n' },
  { label: 'Tabata', add: 'Tabata 8 rounds\n' },
  { label: 'AMRAP 12', add: 'AMRAP 12 min\n' },
  { label: '40 / 20', add: 'Intervals 40s work 20s rest, 3 rounds\n' },
  { label: 'For time', add: '3 rounds for time\n' },
];

export default function FreePage() {
  const code = String(useParams().code || '').toUpperCase();
  const ok = validCode(code);
  const sid = useRef('');
  const tv = useRef<ReturnType<typeof openTv> | null>(null);
  const [text, setText] = useState('');
  const [draft, setDraft] = useState<AiDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [screen, setScreen] = useState<{ free: number; active: number } | null>(null);
  const [slot, setSlot] = useState<number | null>(null);
  const [st, setSt] = useState<RemoteStatus | null>(null);
  const [full, setFull] = useState(false);

  useEffect(() => {
    if (!ok) return;
    sid.current = (() => { try { return sessionStorage.getItem('hy_sid') || ''; } catch { return ''; } })() || Math.random().toString(36).slice(2, 10);
    try { sessionStorage.setItem('hy_sid', sid.current); } catch { /* egal */ }
    const t = openTv(code, (ev, raw) => {
      const p = raw as { sid?: string; slot?: number; full?: boolean; status?: RemoteStatus; free?: number; active?: number };
      if (ev === 'tvstate') setScreen({ free: p.free ?? 0, active: p.active ?? 0 });
      if (p.sid !== sid.current && ev !== 'tvstate') return;
      if (ev === 'assigned') { if (p.full) setFull(true); else { setFull(false); setSlot(p.slot ?? 0); } }
      if (ev === 'status' && p.status) setSt(p.status);
      if (ev === 'ended') { setSlot(null); setSt(null); }
    });
    tv.current = t;
    const hello = () => t.send('hello', { sid: sid.current });
    const t1 = setTimeout(hello, 700);
    const t2 = setInterval(hello, 6000);
    return () => { clearTimeout(t1); clearInterval(t2); tv.current = null; t.close(); };
  }, [code, ok]);

  const converted = useMemo(() => {
    if (!draft) return null;
    try { return aiDraftToWorkout(draft); } catch { return null; }
  }, [draft]);

  async function build() {
    if (text.trim().length < 3 || loading) return;
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/ai-workout', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-free-code': code }, body: JSON.stringify({ text }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.draft) throw new Error(data.error || 'Something went wrong. Try again.');
      setDraft(data.draft as AiDraft);
    } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong.'); }
    finally { setLoading(false); }
  }

  function start() {
    if (!converted) return;
    const w = {
      id: 'free', user_id: 'free', name: converted.name, trainer_name: 'Free training',
      config: { ...converted.config, warmupTime: 0 }, workout_mode: converted.workout_mode,
      is_public: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    };
    setFull(false);
    tv.current?.send('start', { sid: sid.current, workout: w });
  }

  if (!ok) return <main className="rc-root"><p className="rc-empty">This link is not valid.</p></main>;

  const live = screen !== null;
  if (slot !== null) {
    const phase = st?.phase || 'idle';
    const tone = phase === 'rest' || phase === 'roundRest' ? 'is-rest' : phase === 'work' ? 'is-work' : '';
    return (
      <main className={`rc-root ${tone}`}>
        <header className="rc-head">
          <div className="rc-brand">HYB<span>RYD</span> <em>Field {slot + 1}</em></div>
          <div className="rc-link is-live"><i />On screen</div>
        </header>
        <RemotePad st={st} live={live} send={(c: RemoteCmd) => tv.current?.send('cmd', { sid: sid.current, cmd: c })} stopLabel={phase === 'finished' ? 'Build a new one' : 'End and free my field'} />
      </main>
    );
  }

  return (
    <main className="rc-root fr-root">
      <header className="rc-head">
        <div className="rc-brand">HYB<span>RYD</span> <em>Free training</em></div>
        <div className={`rc-link ${live ? 'is-live' : ''}`}><i />{live ? `Screen ${code} · ${screen!.free} of 4 free` : 'Looking for screen…'}</div>
      </header>

      {!draft ? (
        <section className="fr-build">
          <h1>What are you training?</h1>
          <p>One movement per line. Add reps, distance or weight if you like. Quick starters:</p>
          <div className="fr-chips">
            {CHIPS.map((c) => <button key={c.label} type="button" onClick={() => setText((t) => (t.endsWith('\n') || !t ? t : t + '\n') + c.add)}>{c.label}</button>)}
          </div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} placeholder={'EMOM 10 min\n10 Wall Balls @ 9 kg\n12 Burpees\n200m Run'} aria-label="Your workout" />
          {error && <div className="fr-error" role="alert">{error}</div>}
          <button type="button" className="rc-main" disabled={loading || text.trim().length < 3} onClick={build}>{loading ? 'Building…' : 'Build my workout'}</button>
        </section>
      ) : (
        <section className="fr-build">
          <h1>{draft.name}</h1>
          {draft.summary && <p>{draft.summary}</p>}
          <ul className="fr-list">
            {draft.blocks.flatMap((b, bi) => b.stations.map((g, gi) => (
              <li key={`${bi}-${gi}`}>
                <small>{draft.blocks.length > 1 ? `Part ${String.fromCharCode(65 + bi)}` : ''} {b.format.replace('_', ' ')}{b.minutes ? ` · ${b.minutes} min` : ''}{b.rounds ? ` · ${b.rounds} rounds` : ''}</small>
                {g.map((e, ei) => <span key={ei}>{e.reps ? `${e.reps} ` : e.distance ? `${e.distance} ` : e.seconds ? `${e.seconds}s ` : ''}{e.name}{e.weight ? ` @ ${e.weight}` : ''}</span>)}
              </li>
            )))}
          </ul>
          {full && <div className="fr-error" role="alert">All four fields are in use. Try again when one frees up.</div>}
          <button type="button" className="rc-main" disabled={!live || !converted} onClick={start}>Start on screen</button>
          <button type="button" className="rc-stop" onClick={() => setDraft(null)}>Change my moves</button>
        </section>
      )}
    </main>
  );
}
