'use client';

// Gemeinsame Handy-Bedienfläche: Fernbedienung eines Workouts (Coach) und eines Feldes im Freien Training.
import type { RemoteCmd, RemoteStatus } from '@/lib/remote';
import { useState } from 'react';

const PHASE: Record<string, string> = {
  idle: 'Ready', summary: 'Overview', warmup: 'Warm-up', countdown: 'Get ready', work: 'Work',
  rest: 'Rest', roundRest: 'Round rest', finished: 'Done',
};
function fmt(s: number) {
  const n = Math.max(0, Math.floor(s));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
}

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
  const mainLabel = phase === 'idle' ? 'Open overview' : phase === 'summary' ? 'Start workout' : phase === 'finished' ? 'Finished' : st?.paused ? 'Resume' : 'Pause';
  return (
    <>
      <section className="rc-state" aria-live="polite">
        <div className="rc-name">{st?.name || 'Waiting for the screen'}</div>
        <div className="rc-phase">{PHASE[phase] || phase}{st && st.rounds > 1 && st.mode === 'timed' && running ? ` · Round ${st.round}/${st.rounds}` : ''}</div>
        <div className="rc-time">{st && (running || phase === 'finished') ? fmt(st.time) : '–:––'}</div>
      </section>
      <section className="rc-pad">
        <button type="button" disabled={!live || phase === 'finished' || phase === 'countdown'} className={`rc-main ${tap === 'toggle' ? 'is-tap' : ''}`} onClick={() => go({ t: 'toggle' }, 'toggle')}>
          {mainLabel}
        </button>
        {st?.mode === 'fortime' && phase === 'work' && (
          <div className="rc-groups">
            {Array.from({ length: st.groups }, (_, g) => (
              <button type="button" key={g} className={`rc-done ${tap === `g${g}` ? 'is-tap' : ''}`} onClick={() => go({ t: 'done', g }, `g${g}`)}>
                <small>{st.groups > 1 ? `Group ${g + 1}` : 'Station'}</small>Done
              </button>
            ))}
          </div>
        )}
        {st?.mode === 'timed' && phase === 'work' && (
          <button type="button" className={`rc-sec ${tap === 'skip' ? 'is-tap' : ''}`} onClick={() => go({ t: 'skip' }, 'skip')}>Next station</button>
        )}
        {(phase === 'rest' || phase === 'roundRest') && (
          <div className="rc-row">
            <button type="button" className="rc-sec" onClick={() => go({ t: 'adjust', s: -15 }, 'm')}>−15 s</button>
            <button type="button" className="rc-sec is-primary" onClick={() => go({ t: 'adjust', s: -999 }, 's')}>Skip rest</button>
            <button type="button" className="rc-sec" onClick={() => go({ t: 'adjust', s: 15 }, 'p')}>+15 s</button>
          </div>
        )}
        {phase !== 'idle' && (
          <button type="button" className="rc-stop" onClick={() => go({ t: 'stop' }, 'stop')}>{stopLabel || 'End and go back'}</button>
        )}
      </section>
    </>
  );
}
