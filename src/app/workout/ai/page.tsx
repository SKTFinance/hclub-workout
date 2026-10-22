'use client';

// KI-Workout-Baukasten (21.10.2026). Trainer tippt Übungen untereinander, die KI
// macht daraus einen Entwurf; der Entwurf ist hier frei editierbar und wird erst
// beim Speichern ein normales Workout (gleiches Format wie jedes andere).
// „Preview on screen" speichert NICHTS: der Entwurf geht über localStorage an
// /workout/preview/live.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getExerciseImage } from '@/lib/exerciseImages';
import { aiDraftToWorkout, type AiBlock, type AiDraft, type AiExercise, type AiFormat } from '@/lib/aiWorkout';

const EXAMPLES: { label: string; text: string }[] = [
  { label: 'AMRAP', text: 'AMRAP 14\n500m row\n20 WB 9/6\n15 KBS 24/16\n10 burpees' },
  { label: 'For Time', text: '3 RFT, cap 18 min\n400m run\n21 thrusters 40/30\n12 pull-ups' },
  { label: 'EMOM', text: 'EMOM 12\n12 cal bike\n10 T2B\n8 DB snatch 22.5/15' },
  { label: 'Tabata', text: 'Tabata\nair squats' },
  { label: 'Groups', text: '12 min AMRAP, 2 groups\nGroup 1: 250m ski, 15 box jumps, 20 lunges\nGroup 2: 50m sled push, 12 wall balls, 10 burpees' },
];

const FORMATS: { value: AiFormat; label: string }[] = [
  { value: 'AMRAP', label: 'AMRAP' },
  { value: 'FOR_TIME', label: 'For Time' },
  { value: 'EMOM', label: 'EMOM' },
  { value: 'INTERVALS', label: 'Intervals' },
];

function amountOf(e: AiExercise): string {
  if (e.distance) return e.distance;
  if (e.reps) return String(e.reps);
  if (e.seconds) return `${e.seconds}s`;
  return '';
}

function parseAmount(v: string): Pick<AiExercise, 'reps' | 'distance' | 'seconds'> {
  const t = v.trim();
  if (!t) return {};
  if (/^\d+$/.test(t)) return { reps: parseInt(t, 10) };
  const sec = /^(\d+)\s*(s|sec|secs|seconds)$/i.exec(t);
  if (sec) return { seconds: parseInt(sec[1], 10) };
  return { distance: t };
}

function SparkIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" fill="currentColor" />
      <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" fill="currentColor" opacity=".6" />
    </svg>
  );
}

export default function AiWorkoutPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<AiDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [coach, setCoach] = useState('');
  useEffect(() => { try { setCoach(localStorage.getItem('hclub_trainer_name') || ''); } catch { /* egal */ } }, []);
  function changeCoach(v: string) { setCoach(v); try { localStorage.setItem('hclub_trainer_name', v); } catch { /* egal */ } }
  const resultRef = useRef<HTMLDivElement>(null);

  // Entwurf überlebt ein Neuladen (nur in diesem Browser).
  useEffect(() => {
    try {
      const t = localStorage.getItem('hybryd_ai_text');
      if (t) setText(t);
      const d = localStorage.getItem('hybryd_ai_draft');
      if (d) setDraft(JSON.parse(d));
    } catch { /* egal */ }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem('hybryd_ai_text', text);
      if (draft) localStorage.setItem('hybryd_ai_draft', JSON.stringify(draft));
    } catch { /* egal */ }
  }, [text, draft]);

  const converted = useMemo(() => {
    if (!draft) return null;
    try { return aiDraftToWorkout(draft); } catch { return null; }
  }, [draft]);

  async function generate() {
    if (text.trim().length < 3 || loading) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/ai-workout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.draft) throw new Error(data.error || 'Something went wrong. Try again.');
      setDraft(data.draft as AiDraft);
      requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  function patchBlock(bIdx: number, patch: Partial<AiBlock>) {
    setDraft((d) => d && { ...d, blocks: d.blocks.map((b, i) => (i === bIdx ? { ...b, ...patch } : b)) });
  }
  function patchExercise(bIdx: number, gIdx: number, eIdx: number, patch: Partial<AiExercise> | null) {
    setDraft((d) => {
      if (!d) return d;
      const blocks = d.blocks.map((b, i) => {
        if (i !== bIdx) return b;
        const stations = b.stations.map((g, gi) => {
          if (gi !== gIdx) return g;
          if (patch === null) return g.filter((_, ei) => ei !== eIdx);
          return g.map((e, ei) => (ei === eIdx ? { ...e, ...patch } : e));
        });
        return { ...b, stations };
      });
      return { ...d, blocks };
    });
  }
  function addExercise(bIdx: number, gIdx: number) {
    setDraft((d) => d && {
      ...d,
      blocks: d.blocks.map((b, i) => i !== bIdx ? b : {
        ...b,
        stations: b.stations.map((g, gi) => (gi === gIdx ? [...g, { name: 'Burpees', reps: 10 }] : g)),
      }),
    });
  }

  function preview() {
    if (!converted) return;
    const w = {
      id: 'preview',
      user_id: 'preview',
      name: converted.name,
      trainer_name: (typeof window !== 'undefined' && localStorage.getItem('hclub_trainer_name')) || 'Coach',
      config: { ...converted.config, warmupTime: 0 },
      workout_mode: converted.workout_mode,
      is_public: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    try { localStorage.setItem('hybryd_preview_workout', JSON.stringify(w)); } catch { /* egal */ }
    window.open('/workout/preview/live', '_blank');
  }

  async function save() {
    if (!converted || saving) return;
    setSaving(true);
    setError('');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); setError('Please sign in again.'); return; }
    const { data, error: err } = await supabase.from('hybryd_workouts').insert({
      user_id: user.id,
      user_email: user.email,
      name: converted.name,
      trainer_name: localStorage.getItem('hclub_trainer_name') || 'Trainer',
      config: converted.config,
      is_public: true,
      workout_mode: converted.workout_mode,
    }).select().single();
    setSaving(false);
    if (err || !data) { setError('Could not save. Try again.'); return; }
    try { localStorage.removeItem('hybryd_ai_draft'); } catch { /* egal */ }
    router.push(`/workout/${data.id}`);
  }

  return (
    <div className="ai-root">
      <header className="ai-top">
        <button onClick={() => router.push('/dashboard')} className="ai-back">&larr; Back</button>
        <div className="ai-logo">HYB<span>RYD</span></div>
        <div className="ai-top-spacer" />
      </header>

      <main className="ai-main">
        {/* ---------- Eingabe ---------- */}
        <section className="ai-input">
          <div className="ai-eyebrow"><SparkIcon /> AI Workout Builder</div>
          <h1 className="ai-h1">Write it like<br />a whiteboard.</h1>
          <p className="ai-lead">One movement per line. Add the format if you have one in mind, or let the AI pick. Abbreviations like WB, KBS, T2B or RFT are fine.</p>

          <label htmlFor="ai-text" className="ai-label">Your movements</label>
          <textarea
            id="ai-text"
            className="ai-textarea"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generate(); }}
            placeholder={'AMRAP 14\n500m row\n20 wall balls 9/6\n15 KBS 24/16\n10 burpees'}
            rows={9}
            spellCheck={false}
          />
          <div className="ai-examples" role="group" aria-label="Examples">
            <span className="ai-examples-label">Try</span>
            {EXAMPLES.map((ex) => (
              <button key={ex.label} type="button" className="ai-chip" onClick={() => setText(ex.text)}>{ex.label}</button>
            ))}
          </div>
          <button type="button" className="ai-primary" onClick={generate} disabled={loading || text.trim().length < 3}>
            {loading ? <><span className="ai-spinner" aria-hidden="true" /> Building your workout</> : <><SparkIcon /> Build workout</>}
          </button>
          {error && <p className="ai-error" role="alert">{error}</p>}
        </section>

        {/* ---------- Ergebnis ---------- */}
        <section className="ai-result" ref={resultRef} aria-live="polite" aria-busy={loading}>
          {loading ? (
            <div className="ai-skeleton">
              <div className="ai-sk ai-sk-title" />
              <div className="ai-sk ai-sk-line" />
              {[0, 1, 2, 3].map((i) => <div key={i} className="ai-sk ai-sk-row" style={{ animationDelay: `${i * 90}ms` }} />)}
            </div>
          ) : !draft ? (
            <div className="ai-empty">
              <div className="ai-empty-stack" aria-hidden="true">
                {['wall-balls', 'rowing', 'kettlebell-swings'].map((s, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={s} src={`/exercises/${s}.jpg`} alt="" style={{ ['--k' as string]: i }} />
                ))}
              </div>
              <h2 className="ai-empty-title">Your workout appears here</h2>
              <p className="ai-empty-text">Format, rounds, reps, weights and scaling, ready to edit. Nothing is saved until you press Save.</p>
            </div>
          ) : (
            <div className="ai-draft">
              <div className="ai-draft-head">
                <input
                  className="ai-name"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  aria-label="Workout name"
                />
                <label className="ai-coach">
                  <span>Coach</span>
                  <input value={coach} onChange={(e) => changeCoach(e.target.value)} placeholder="Your name (shown on screen)" maxLength={40} />
                </label>
                {draft.summary && <p className="ai-summary">{draft.summary}</p>}
              </div>

              {draft.blocks.map((b, bIdx) => (
                <div key={bIdx} className="ai-block" style={{ ['--i' as string]: bIdx }}>
                  <div className="ai-block-head">
                    {draft.blocks.length > 1 && <span className="ai-block-no">Part {String.fromCharCode(65 + bIdx)}</span>}
                    <div className="ai-seg" role="radiogroup" aria-label="Format">
                      {FORMATS.map((f) => (
                        <button key={f.value} type="button" role="radio" aria-checked={b.format === f.value}
                          className={`ai-seg-btn ${b.format === f.value ? 'is-on' : ''}`}
                          onClick={() => patchBlock(bIdx, { format: f.value })}>
                          {f.label}
                        </button>
                      ))}
                    </div>
                    <div className="ai-params">
                      {(b.format === 'AMRAP' || b.format === 'EMOM' || b.format === 'FOR_TIME') && (
                        <label className="ai-param">
                          <span>{b.format === 'FOR_TIME' ? 'Cap' : 'Minutes'}</span>
                          <input type="number" min={1} max={120} value={b.minutes ?? ''} placeholder={b.format === 'FOR_TIME' ? 'none' : '12'}
                            onChange={(e) => patchBlock(bIdx, { minutes: parseInt(e.target.value) || undefined })} />
                        </label>
                      )}
                      {(b.format === 'FOR_TIME' || b.format === 'INTERVALS') && (
                        <label className="ai-param">
                          <span>Rounds</span>
                          <input type="number" min={1} max={50} value={b.rounds ?? ''} placeholder="1"
                            onChange={(e) => patchBlock(bIdx, { rounds: parseInt(e.target.value) || undefined })} />
                        </label>
                      )}
                      {b.format === 'INTERVALS' && (
                        <>
                          <label className="ai-param">
                            <span>Work s</span>
                            <input type="number" min={5} max={600} value={b.workSeconds ?? ''} placeholder="40"
                              onChange={(e) => patchBlock(bIdx, { workSeconds: parseInt(e.target.value) || undefined })} />
                          </label>
                          <label className="ai-param">
                            <span>Rest s</span>
                            <input type="number" min={0} max={600} value={b.restSeconds ?? ''} placeholder="20"
                              onChange={(e) => patchBlock(bIdx, { restSeconds: e.target.value === '' ? undefined : parseInt(e.target.value) })} />
                          </label>
                        </>
                      )}
                    </div>
                  </div>

                  <div className={`ai-groups ${b.stations.length > 1 ? 'is-multi' : ''}`}>
                    {b.stations.map((g, gIdx) => (
                      <div key={gIdx} className="ai-group">
                        {b.stations.length > 1 && <div className="ai-group-name">Group {gIdx + 1}</div>}
                        <ol className="ai-rows">
                          {g.map((ex, eIdx) => (
                            <li key={eIdx} className="ai-row" style={{ ['--i' as string]: eIdx }}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img className="ai-thumb" src={getExerciseImage(ex.name)} alt="" />
                              <input className="ai-amount" value={amountOf(ex)} placeholder="10"
                                aria-label="Reps, distance or seconds"
                                onChange={(e) => patchExercise(bIdx, gIdx, eIdx, { reps: undefined, distance: undefined, seconds: undefined, ...parseAmount(e.target.value) })} />
                              <input className="ai-ex-name" value={ex.name} aria-label="Movement"
                                onChange={(e) => patchExercise(bIdx, gIdx, eIdx, { name: e.target.value })} />
                              <input className="ai-weight" value={ex.weight || ''} placeholder="Load" aria-label="Load"
                                onChange={(e) => patchExercise(bIdx, gIdx, eIdx, { weight: e.target.value || undefined })} />
                              <button type="button" className="ai-x" aria-label={`Remove ${ex.name}`}
                                onClick={() => patchExercise(bIdx, gIdx, eIdx, null)}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
                              </button>
                            </li>
                          ))}
                        </ol>
                        <button type="button" className="ai-add" onClick={() => addExercise(bIdx, gIdx)}>+ Movement</button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              <label className="ai-label" htmlFor="ai-scaling">Scaling</label>
              <textarea id="ai-scaling" className="ai-textarea ai-textarea-sm" rows={3}
                value={(draft.scaling || []).join('\n')}
                onChange={(e) => setDraft({ ...draft, scaling: e.target.value.split('\n') })}
                placeholder="One option per line" />

              {converted && converted.adjustments.length > 0 && (
                <ul className="ai-adjust">
                  {converted.adjustments.map((a) => <li key={a}>{a}</li>)}
                </ul>
              )}

              <div className="ai-actions">
                <button type="button" className="ai-secondary" onClick={preview} disabled={!converted}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="4.5" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" /><path d="M9 20h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                  Preview on screen
                </button>
                <button type="button" className="ai-primary ai-primary-inline" onClick={save} disabled={!converted || saving}>
                  {saving ? 'Saving' : 'Save workout'}
                </button>
              </div>
              <p className="ai-fineprint">Saved workouts open in the editor, where you can fine-tune everything.</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
