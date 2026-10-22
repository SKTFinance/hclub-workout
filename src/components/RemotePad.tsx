'use client';

// Gemeinsame Handy-Bedienfläche: Fernbedienung eines Workouts (Coach) und eines Feldes im Freien Training.
// V3 (22.10.2026): Hybryd-Blau mit Leuchten, Art als kleines Schild, aktuelle Übung und Zeit groß,
// große Daumen-Knöpfe unten.
import type { RemoteCmd, RemoteStatus } from '@/lib/remote';
import { useState } from 'react';
import { DISCIPLINES, makeExerciseColors } from '@/lib/discipline';

const PHASE: Record<string, string> = {
  idle: 'Ready', summary: 'Overview', warmup: 'Warm-up', countdown: 'Get ready', work: 'Work',
  rest: 'Rest', roundRest: 'Round rest', finished: 'Done',
};
function fmt(s: number) {
  const n = Math.max(0, Math.floor(s));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
}

function PlayIcon() { return <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" /></svg>; }
function PauseIcon() { return <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4.5" width="4" height="15" rx="1" /><rect x="14" y="4.5" width="4" height="15" rx="1" /></svg>; }
function SkipIcon() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5 5v14l10-7zM17 5h2.5v14H17z" /></svg>; }

export default function RemotePad({ st, live, send, stopLabel }: {
  st: RemoteStatus | null; live: boolean; send: (c: RemoteCmd) => void; stopLabel?: string;
}) {
  const [tap, setTap] = useState('');
  function go(c: RemoteCmd, tag: string) {
    send(c);
    setTap(tag);
    try { navigator.vibrate?.(18); } catch { /* egal */ }
    setTimeout(() => setTap(''), 260);
  }
  const phase = st?.phase || 'idle';
  const running = ['work', 'rest', 'roundRest', 'warmup', 'countdown'].includes(phase);
  const isRest = phase === 'rest' || phase === 'roundRest';
  const paused = !!st?.paused;
  const mainLabel = phase === 'idle' ? 'Open overview' : phase === 'summary' ? 'Start workout' : phase === 'finished' ? 'Finished' : paused ? 'Resume' : 'Pause';
  const mainIcon = phase === 'idle' ? null : phase === 'summary' || paused ? <PlayIcon /> : phase === 'finished' ? null : <PauseIcon />;
  const now = (st?.now || []).filter((x) => x !== undefined);
  const colorOf = makeExerciseColors(now);
  const showNow = now.some(Boolean) && ['work', 'rest', 'roundRest', 'warmup', 'countdown', 'summary'].includes(phase);
  const disc = st?.disc ? DISCIPLINES[st.disc] : null;

  return (
    <>
      <section className={`rp-state ${isRest ? 'is-rest' : ''} ${paused ? 'is-paused' : ''}`} aria-live="polite">
        <div className="rp-tags">
          {disc && <span className="rp-disc" style={{ ['--k' as string]: disc.accent }}>{disc.label}</span>}
          <span className="rp-phase">{paused && running ? 'Paused' : (PHASE[phase] || phase)}</span>
          {st && st.rounds > 1 && st.mode === 'timed' && running && <span className="rp-round">Round {st.round}/{st.rounds}</span>}
        </div>
        <div className="rp-name">{st?.name || 'Waiting for the screen'}</div>
        <div className="rp-time">{st && ((running && phase !== 'countdown') || phase === 'finished') ? fmt(st.time) : '–:––'}</div>
      </section>

      {showNow && (
        <section className="rp-now" aria-label={isRest ? 'Next up' : 'Now'}>
          <div className="rp-now-label">{isRest || phase === 'summary' || phase === 'warmup' || phase === 'countdown' ? 'Next up' : 'Now'}</div>
          {now.map((n, g) => n ? (
            <div key={g} className="rp-ex" style={{ ['--st' as string]: colorOf(n) }}>
              {now.length > 1 && <span className="rp-ex-g">G{g + 1}</span>}
              <span className="rp-ex-dot" aria-hidden="true" />
              <span className="rp-ex-name">{n.split(' @ ')[0]}</span>
            </div>
          ) : null)}
        </section>
      )}

      <section className="rp-pad">
        {st?.mode === 'fortime' && phase === 'work' && (
          <div className="rp-groups">
            {Array.from({ length: st.groups }, (_, g) => (
              <button type="button" key={g} className={`rp-done ${tap === `g${g}` ? 'is-tap' : ''}`} onClick={() => go({ t: 'done', g }, `g${g}`)}>
                <small>{st.groups > 1 ? `Group ${g + 1}` : 'Station'}</small>Done
              </button>
            ))}
          </div>
        )}
        {isRest && (
          <div className="rp-row">
            <button type="button" className="rp-sec" onClick={() => go({ t: 'adjust', s: -15 }, 'm')}>−15 s</button>
            <button type="button" className="rp-sec is-strong" onClick={() => go({ t: 'adjust', s: -999 }, 's')}><SkipIcon />Skip rest</button>
            <button type="button" className="rp-sec" onClick={() => go({ t: 'adjust', s: 15 }, 'p')}>+15 s</button>
          </div>
        )}
        <div className="rp-row">
          <button type="button" disabled={!live || phase === 'finished' || phase === 'countdown'}
            className={`rp-main ${tap === 'toggle' ? 'is-tap' : ''} ${paused ? 'is-paused' : ''}`} onClick={() => go({ t: 'toggle' }, 'toggle')}>
            {mainIcon}{mainLabel}
          </button>
          {st?.mode === 'timed' && phase === 'work' && (
            <button type="button" className={`rp-skip ${tap === 'skip' ? 'is-tap' : ''}`} onClick={() => go({ t: 'skip' }, 'skip')} aria-label="Next station">
              <SkipIcon /><span>Next</span>
            </button>
          )}
        </div>
        {phase !== 'idle' && (
          <button type="button" className="rp-stop" onClick={() => go({ t: 'stop' }, 'stop')}>{stopLabel || 'End and go back'}</button>
        )}
      </section>
    </>
  );
}
