'use client';

// Workout anlegen (V3, 22.10.2026). Samuel: „Wenn man ein Workout erzeugt … wirst du
// gefragt: Hyrox-Workout oder CrossFit-Workout", „Text reinschreiben, was man sich
// vorstellt", „vielleicht einen Sprechknopf", „Gruppen nicht schön dargestellt".
//
// Drei Schritte auf EINER Seite:
//   1. Art wählen (Hyrox / CrossFit)
//   2. Beschreiben: tippen oder sprechen. Die KI baut daraus Format, Zeiten, Pausen, Runden.
//      Alternativ „Start empty" ohne KI.
//   3. Editor: Teile, Gruppen (Spalten mit Stationsfarben), Übungen, Zeiten mit Stellrädern.
// Speichern: auf der Vorschau NUR im Browser (lib/localWorkouts), in Produktion in der DB.
// „Preview on screen" speichert nichts (localStorage → /workout/preview/live).

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getExerciseImage } from '@/lib/exerciseImages';
import { aiDraftToWorkout, type AiBlock, type AiDraft, type AiExercise, type AiFormat, type ConvertedWorkout } from '@/lib/aiWorkout';
import { DISCIPLINES, stationColor, type Discipline } from '@/lib/discipline';
import { HYROX_EXERCISES, TRAINING_EXERCISES } from '@/lib/exercises';
import { USE_LOCAL_STORE, getLocalWorkout, isLocalId, saveLocalWorkout } from '@/lib/localWorkouts';
import CrossTag from '@/components/CrossTag';

type Step = 'type' | 'describe' | 'edit';

const EXAMPLES: Record<Discipline, { label: string; text: string }[]> = {
  hyrox: [
    { label: 'Engine 40/20', text: '40 sec on, 20 off, 4 rounds\n1000m ski\n50m sled push\n20 wall balls 9/6\n200m run' },
    { label: 'Race simulation', text: 'For time\n1km run\n50m sled push\n50m sled pull\n80m burpee broad jumps\n1km row\n200m farmers carry 2x24\n100m sandbag lunges 20kg\n100 wall balls' },
    { label: '2 groups', text: '2 groups, 45 on 15 off, 3 rounds\nGroup 1: ski, sled push, wall balls\nGroup 2: row, sled pull, sandbag lunges' },
    { label: 'Just describe', text: '30 minute hyrox session, sled and wall balls, short rests, finish with a run' },
  ],
  crossfit: [
    { label: 'AMRAP', text: 'AMRAP 14\n500m row\n20 WB 9/6\n15 KBS 24/16\n10 burpees' },
    { label: 'EMOM', text: 'EMOM 12\n12 cal bike\n10 T2B\n8 DB snatch 22.5/15' },
    { label: 'For Time', text: '3 RFT, cap 18 min\n400m run\n21 thrusters 40/30\n12 pull-ups' },
    { label: 'Tabata', text: 'Tabata\nair squats' },
    { label: 'Just describe', text: '20 minute upper body burner, 45 seconds work 15 rest, pull-ups and push-ups' },
  ],
};

const MORE_MOVES: Record<Discipline, string[]> = {
  hyrox: ['SkiErg', 'Sled Push', 'Sled Pull', 'Burpee Broad Jumps', 'Row', 'Farmers Carry', 'Sandbag Lunges', 'Wall Balls', 'Run', 'Echo Bike', 'Kettlebell Swings'],
  crossfit: ['Thrusters', 'Deadlifts', 'Power Cleans', 'Snatches', 'Front Squats', 'Pull-ups', 'Toes to Bar', 'Push-ups', 'Handstand Push-ups', 'Box Jumps', 'Double Unders', 'Burpees', 'Wall Balls', 'Kettlebell Swings', 'Row', 'Echo Bike', 'Run'],
};

const FORMATS: { value: AiFormat; label: string; hint: string }[] = [
  { value: 'INTERVALS', label: 'Intervals', hint: 'Work / rest timer' },
  { value: 'EMOM', label: 'EMOM', hint: 'New move every minute' },
  { value: 'AMRAP', label: 'AMRAP', hint: 'Rounds in a time window' },
  { value: 'FOR_TIME', label: 'For Time', hint: 'Finish fast, optional cap' },
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

function fmtDuration(s: number): string {
  if (s <= 0) return '–';
  const m = Math.round(s / 60);
  return m < 1 ? `${s}s` : `${m} min`;
}

/** Geschätzte Dauer in Sekunden, null wenn offen (For Time ohne Cap). */
function estimate(c: ConvertedWorkout | null): number | null {
  if (!c) return null;
  const cfg = c.config;
  if (c.workout_mode === 'fortime') {
    if (!cfg.forTimeRoundTimerEnabled) return null;
    const blocks = cfg.forTimeBlocks?.length || 1;
    return blocks * (cfg.forTimeRoundTimerMinutes || 12) * 60 + Math.max(0, blocks - 1) * (cfg.roundRestTime || 0);
  }
  let total = 0;
  for (let r = 0; r < cfg.numRounds; r++) {
    const n = cfg.rounds[r]?.[0]?.length || 0;
    total += n * cfg.workTime + Math.max(0, n - 1) * cfg.restTime;
  }
  return total + Math.max(0, cfg.numRounds - 1) * (cfg.roundRestTime || 0);
}

function emptyDraft(d: Discipline): AiDraft {
  const moves: AiExercise[] = d === 'hyrox'
    ? [{ name: 'SkiErg', distance: '250m' }, { name: 'Sled Push', distance: '25m' }, { name: 'Wall Balls', reps: 15, weight: '9/6 kg' }]
    : [{ name: 'Thrusters', reps: 12, weight: '40/30 kg' }, { name: 'Pull-ups', reps: 10 }, { name: 'Burpees', reps: 8 }];
  return { name: 'New Workout', discipline: d, blocks: [{ format: 'INTERVALS', workSeconds: 40, restSeconds: 20, rounds: 3, stations: [moves] }] };
}

// ---------- Sprechen: Web Speech API, sonst Aufnahme an die KI ----------
type SR = { start: () => void; stop: () => void; abort: () => void; continuous: boolean; interimResults: boolean; lang: string;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null };

function getSR(): (new () => SR) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

function MicIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="2" />
      <path d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function Stepper({ label, value, unit, min, max, step = 1, placeholder, onChange }: {
  label: string; value: number | undefined; unit?: string; min: number; max: number; step?: number; placeholder?: string;
  onChange: (v: number | undefined) => void;
}) {
  const v = value ?? undefined;
  const set = (n: number) => onChange(Math.max(min, Math.min(max, n)));
  return (
    <div className="cw-step">
      <span className="cw-step-label">{label}</span>
      <div className="cw-step-ctl">
        <button type="button" aria-label={`Less ${label}`} onClick={() => set((v ?? (parseInt(placeholder || '0') || min)) - step)}>−</button>
        <input inputMode="numeric" value={v ?? ''} placeholder={placeholder} aria-label={label}
          onChange={(e) => { const n = parseInt(e.target.value); onChange(Number.isFinite(n) ? Math.min(max, n) : undefined); }} />
        {unit && <span className="cw-step-unit">{unit}</span>}
        <button type="button" aria-label={`More ${label}`} onClick={() => set((v ?? (parseInt(placeholder || '0') || min)) + step)}>+</button>
      </div>
    </div>
  );
}

function CreateWorkout() {
  const router = useRouter();
  const params = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const [step, setStep] = useState<Step>('type');
  const [disc, setDisc] = useState<Discipline>('hyrox');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<AiDraft | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [coach, setCoach] = useState('');
  const [listening, setListening] = useState<'off' | 'speech' | 'record'>('off');
  const srRef = useRef<SR | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const baseRef = useRef('');

  useEffect(() => { try { setCoach(localStorage.getItem('hclub_trainer_name') || ''); } catch { /* egal */ } }, []);
  function changeCoach(v: string) { setCoach(v); try { localStorage.setItem('hclub_trainer_name', v); } catch { /* egal */ } }

  // Einstieg: ?edit=local-… öffnet ein gespeichertes Vorschau-Workout im Editor,
  // ?d=hyrox|crossfit springt direkt zum Beschreiben.
  useEffect(() => {
    const e = params.get('edit');
    if (e && isLocalId(e)) {
      const w = getLocalWorkout(e);
      if (w?.draft) {
        setEditId(w.id);
        setDraft(w.draft);
        setDisc(w.draft.discipline || 'crossfit');
        setStep('edit');
        return;
      }
    }
    const d = params.get('d');
    if (d === 'hyrox' || d === 'crossfit') { setDisc(d); setStep('describe'); }
  }, [params]);

  const converted = useMemo(() => {
    if (!draft) return null;
    try { return aiDraftToWorkout({ ...draft, discipline: disc }); } catch { return null; }
  }, [draft, disc]);
  const est = estimate(converted);

  // ---------- KI ----------
  const generate = useCallback(async (audio?: { mime: string; data: string }) => {
    if (loading) return;
    if (!audio && text.trim().length < 3) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/ai-workout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, discipline: disc, audio }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.draft) throw new Error(data.error || 'Something went wrong. Try again.');
      setDraft({ ...(data.draft as AiDraft), discipline: disc });
      setStep('edit');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }, [loading, text, disc]);

  // ---------- Sprechen ----------
  function stopListening() {
    srRef.current?.stop();
    if (recRef.current && recRef.current.state !== 'inactive') recRef.current.stop();
  }
  async function startListening() {
    setError('');
    const SRC = getSR();
    if (SRC) {
      const sr = new SRC();
      sr.continuous = true;
      sr.interimResults = true;
      sr.lang = (typeof navigator !== 'undefined' && navigator.language) || 'en-US';
      baseRef.current = text.trim();
      sr.onresult = (e) => {
        let said = '';
        for (let i = 0; i < e.results.length; i++) said += e.results[i][0].transcript;
        const base = baseRef.current;
        setText(`${base}${base ? '\n' : ''}${said.trim()}`);
      };
      sr.onerror = (e) => { if (e.error !== 'aborted' && e.error !== 'no-speech') setError('Microphone not available. Allow access or type instead.'); };
      sr.onend = () => setListening('off');
      srRef.current = sr;
      try { sr.start(); setListening('speech'); } catch { setListening('off'); }
      return;
    }
    // Ohne Spracherkennung im Browser: aufnehmen und der KI direkt schicken.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (ev) => { if (ev.data.size) chunks.push(ev.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setListening('off');
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
        if (blob.size < 2000) return;
        const buf = new Uint8Array(await blob.arrayBuffer());
        let bin = '';
        for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        generate({ mime: blob.type || 'audio/webm', data: btoa(bin) });
      };
      recRef.current = rec;
      rec.start();
      setListening('record');
      setTimeout(() => { if (rec.state === 'recording') rec.stop(); }, 60000);
    } catch {
      setError('Microphone not available. Allow access or type instead.');
    }
  }
  useEffect(() => () => { srRef.current?.abort(); }, []);

  // ---------- Entwurf bearbeiten ----------
  function patchBlock(bIdx: number, patch: Partial<AiBlock>) {
    setDraft((d) => d && { ...d, blocks: d.blocks.map((b, i) => (i === bIdx ? { ...b, ...patch } : b)) });
  }
  function patchStations(bIdx: number, fn: (s: AiExercise[][]) => AiExercise[][]) {
    setDraft((d) => d && { ...d, blocks: d.blocks.map((b, i) => (i === bIdx ? { ...b, stations: fn(b.stations) } : b)) });
  }
  function patchExercise(bIdx: number, gIdx: number, eIdx: number, patch: Partial<AiExercise> | null) {
    patchStations(bIdx, (st) => st.map((g, gi) => {
      if (gi !== gIdx) return g;
      if (patch === null) return g.filter((_, ei) => ei !== eIdx);
      return g.map((e, ei) => (ei === eIdx ? { ...e, ...patch } : e));
    }));
  }
  function moveExercise(bIdx: number, gIdx: number, eIdx: number, dir: -1 | 1) {
    patchStations(bIdx, (st) => st.map((g, gi) => {
      if (gi !== gIdx) return g;
      const j = eIdx + dir;
      if (j < 0 || j >= g.length) return g;
      const n = [...g];
      [n[eIdx], n[j]] = [n[j], n[eIdx]];
      return n;
    }));
  }
  function addExercise(bIdx: number, gIdx: number, name?: string) {
    patchStations(bIdx, (st) => st.map((g, gi) => (gi === gIdx ? [...g, { name: name || MORE_MOVES[disc][0], reps: 10 }] : g)));
  }
  function addGroup(bIdx: number) {
    patchStations(bIdx, (st) => [...st, (st[st.length - 1] || []).map((e) => ({ ...e }))]);
  }
  function removeGroup(bIdx: number, gIdx: number) {
    patchStations(bIdx, (st) => (st.length > 1 ? st.filter((_, i) => i !== gIdx) : st));
  }
  function addPart() {
    setDraft((d) => d && { ...d, blocks: [...d.blocks, { ...d.blocks[d.blocks.length - 1], title: undefined, stations: [[{ name: MORE_MOVES[disc][0], reps: 10 }]] }] });
  }
  function removePart(bIdx: number) {
    setDraft((d) => d && d.blocks.length > 1 ? { ...d, blocks: d.blocks.filter((_, i) => i !== bIdx) } : d);
  }

  function preview() {
    if (!converted) return;
    const w = {
      id: 'preview', user_id: 'preview', name: converted.name,
      trainer_name: coach || 'Coach',
      config: { ...converted.config, warmupTime: 0 },
      workout_mode: converted.workout_mode, is_public: false,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    };
    try { localStorage.setItem('hybryd_preview_workout', JSON.stringify(w)); } catch { /* egal */ }
    window.open('/workout/preview/live', '_blank');
  }

  async function save() {
    if (!converted || !draft || saving) return;
    setSaving(true);
    setError('');
    if (USE_LOCAL_STORE) {
      // Vorschau: nur im Browser speichern, Live-Tabelle bleibt unberührt.
      const rec = saveLocalWorkout({
        id: editId || undefined, user_id: 'local', name: converted.name, trainer_name: coach || 'Coach',
        config: converted.config, workout_mode: converted.workout_mode, is_public: false,
        draft: { ...draft, discipline: disc },
      });
      setSaving(false);
      router.push(`/dashboard?saved=${rec.id}`);
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); setError('Please sign in again.'); return; }
    const { data, error: err } = await supabase.from('hybryd_workouts').insert({
      user_id: user.id, user_email: user.email, name: converted.name,
      trainer_name: coach || 'Trainer', config: converted.config,
      is_public: true, workout_mode: converted.workout_mode,
    }).select().single();
    setSaving(false);
    if (err || !data) { setError('Could not save. Try again.'); return; }
    router.push(`/dashboard?saved=${data.id}`);
  }

  const D = DISCIPLINES[disc];
  const discStyle = { ['--disc' as string]: D.accent, ['--disc-ink' as string]: D.ink } as React.CSSProperties;
  const stepNo = step === 'type' ? 0 : step === 'describe' ? 1 : 2;

  return (
    <div className="cw-root" style={discStyle} data-step={step}>
      <header className="cw-top">
        <button type="button" onClick={() => (step === 'edit' && !editId ? setStep('describe') : step === 'describe' ? setStep('type') : router.push('/dashboard'))} className="cw-back">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          {step === 'type' ? 'Workouts' : 'Back'}
        </button>
        <ol className="cw-steps" aria-label="Steps">
          {['Type', 'Describe', 'Edit'].map((s, i) => (
            <li key={s} className={i === stepNo ? 'is-on' : i < stepNo ? 'is-done' : ''}><span>{i + 1}</span>{s}</li>
          ))}
        </ol>
        <div className="cw-top-right">{step !== 'type' && <span className="cw-disc">{D.label}</span>}</div>
      </header>

      {/* ---------- 1. Art ---------- */}
      {step === 'type' && (
        <main className="cw-main cw-type">
          <h1 className="cw-h1">New workout</h1>
          <p className="cw-lead">What are you building today?</p>
          <div className="cw-tiles">
            {(['hyrox', 'crossfit'] as Discipline[]).map((d) => (
              <button key={d} type="button" className="cw-tile" data-d={d}
                style={{ ['--t' as string]: DISCIPLINES[d].accent }}
                onClick={() => { setDisc(d); setStep('describe'); }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={d === 'hyrox' ? '/exercises/sled-push.jpg' : '/exercises/thrusters.jpg'} alt="" />
                <span className="cw-tile-body">
                  <span className="cw-tile-tag">{DISCIPLINES[d].short}</span>
                  <span className="cw-tile-name">{DISCIPLINES[d].label}</span>
                  <span className="cw-tile-sub">{d === 'hyrox' ? 'Run, SkiErg, sleds, carries, wall balls' : 'Barbell, gymnastics, metcons'}</span>
                </span>
                <span className="cw-tile-go" aria-hidden="true">→</span>
              </button>
            ))}
          </div>
        </main>
      )}

      {/* ---------- 2. Beschreiben ---------- */}
      {step === 'describe' && (
        <main className="cw-main cw-describe">
          <h1 className="cw-h1">Describe your {D.label} workout</h1>
          <p className="cw-lead">List the movements or just say what you have in mind. Times, rests and rounds are set for you, and you can change everything after.</p>

          <div className={`cw-input ${listening !== 'off' ? 'is-listening' : ''}`}>
            <textarea
              className="cw-textarea"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generate(); }}
              placeholder={EXAMPLES[disc][0].text}
              rows={7}
              spellCheck={false}
              aria-label="Workout description"
            />
            <div className="cw-input-bar">
              <button type="button" className={`cw-mic ${listening !== 'off' ? 'is-on' : ''}`}
                onClick={() => (listening === 'off' ? startListening() : stopListening())}
                aria-pressed={listening !== 'off'}>
                <MicIcon />
                <span>{listening === 'speech' ? 'Listening… tap to stop' : listening === 'record' ? 'Recording… tap to build' : 'Speak'}</span>
              </button>
              <span className="cw-kbd">⌘ Enter</span>
            </div>
          </div>

          <div className="cw-chips" role="group" aria-label="Examples">
            {EXAMPLES[disc].map((ex) => (
              <button key={ex.label} type="button" className="cw-chip" onClick={() => setText(ex.text)}>{ex.label}</button>
            ))}
          </div>

          <div className="cw-row">
            <button type="button" className="cw-primary" onClick={() => generate()} disabled={loading || text.trim().length < 3}>
              {loading ? <><span className="cw-spin" aria-hidden="true" /> Creating workout</> : 'Create workout'}
            </button>
            <button type="button" className="cw-ghost" onClick={() => { setDraft(emptyDraft(disc)); setStep('edit'); }}>Start empty</button>
          </div>
          {error && <p className="cw-error" role="alert">{error}</p>}
          <p className="cw-fine">Created with AI from your words. Nothing is saved until you press Save.</p>
        </main>
      )}

      {/* ---------- 3. Editor ---------- */}
      {step === 'edit' && draft && (
        <main className="cw-main cw-edit">
          <div className="cw-edit-grid">
            <div className="cw-edit-col">
              <div className="cw-namebar">
                <input className="cw-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} aria-label="Workout name" />
                {draft.summary && <p className="cw-summary">{draft.summary}</p>}
              </div>

              {draft.blocks.map((b, bIdx) => (
                <section key={bIdx} className="cw-block">
                  <div className="cw-block-head">
                    <span className="cw-block-no">{draft.blocks.length > 1 ? `Part ${String.fromCharCode(65 + bIdx)}` : 'Format'}</span>
                    <div className="cw-seg" role="radiogroup" aria-label="Format">
                      {FORMATS.map((f) => (
                        <button key={f.value} type="button" role="radio" aria-checked={b.format === f.value}
                          className={b.format === f.value ? 'is-on' : ''} title={f.hint}
                          onClick={() => patchBlock(bIdx, { format: f.value })}>{f.label}</button>
                      ))}
                    </div>
                    {draft.blocks.length > 1 && (
                      <button type="button" className="cw-icon" aria-label="Remove part" onClick={() => removePart(bIdx)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
                      </button>
                    )}
                  </div>

                  <div className="cw-times">
                    {(b.format === 'AMRAP' || b.format === 'EMOM') && (
                      <Stepper label={b.format === 'EMOM' ? 'Minutes' : 'Time'} unit="min" min={1} max={120} value={b.minutes} placeholder="12" onChange={(v) => patchBlock(bIdx, { minutes: v })} />
                    )}
                    {b.format === 'FOR_TIME' && (
                      <Stepper label="Time cap" unit="min" min={1} max={120} value={b.minutes} placeholder="–" onChange={(v) => patchBlock(bIdx, { minutes: v })} />
                    )}
                    {b.format === 'INTERVALS' && (
                      <>
                        <Stepper label="Work" unit="s" min={5} max={600} step={5} value={b.workSeconds} placeholder="40" onChange={(v) => patchBlock(bIdx, { workSeconds: v })} />
                        <Stepper label="Rest" unit="s" min={0} max={600} step={5} value={b.restSeconds} placeholder="20" onChange={(v) => patchBlock(bIdx, { restSeconds: v })} />
                      </>
                    )}
                    {(b.format === 'FOR_TIME' || b.format === 'INTERVALS') && (
                      <Stepper label="Rounds" min={1} max={50} value={b.rounds} placeholder="1" onChange={(v) => patchBlock(bIdx, { rounds: v })} />
                    )}
                    {bIdx === 0 && (b.format === 'INTERVALS') && (b.rounds || 1) > 1 && (
                      <Stepper label="Round rest" unit="s" min={0} max={900} step={15} value={draft.restBetweenBlocksSeconds} placeholder="60" onChange={(v) => setDraft({ ...draft, restBetweenBlocksSeconds: v })} />
                    )}
                  </div>

                  <div className={`cw-groups n${Math.min(b.stations.length, 4)}`}>
                    {b.stations.map((g, gIdx) => (
                      <div key={gIdx} className="cw-group">
                        <div className="cw-group-head">
                          <span className="cw-group-name">{b.stations.length > 1 ? <>Group <b>{gIdx + 1}</b></> : 'Movements'}</span>
                          <span className="cw-group-count">{g.length}</span>
                          {b.stations.length > 1 && (
                            <button type="button" className="cw-icon" aria-label={`Remove group ${gIdx + 1}`} onClick={() => removeGroup(bIdx, gIdx)}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
                            </button>
                          )}
                        </div>
                        <ol className="cw-rows">
                          {g.map((ex, eIdx) => (
                            <li key={eIdx} className="cw-ex" style={{ ['--st' as string]: stationColor(eIdx) }}>
                              <span className="cw-ex-no">{eIdx + 1}</span>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img className="cw-ex-img" src={getExerciseImage(ex.name)} alt="" />
                              <div className="cw-ex-fields">
                                <div className="cw-ex-line1">
                                  <input className="cw-ex-amount" value={amountOf(ex)} placeholder="10" aria-label="Reps, distance or seconds"
                                    onChange={(e) => patchExercise(bIdx, gIdx, eIdx, { reps: undefined, distance: undefined, seconds: undefined, ...parseAmount(e.target.value) })} />
                                  <input className="cw-ex-name" value={ex.name} aria-label="Movement" list={`moves-${disc}`}
                                    onChange={(e) => patchExercise(bIdx, gIdx, eIdx, { name: e.target.value })} />
                                </div>
                                <div className="cw-ex-line2">
                                  <input className="cw-ex-load" value={ex.weight || ''} placeholder="+ load" aria-label="Load"
                                    onChange={(e) => patchExercise(bIdx, gIdx, eIdx, { weight: e.target.value || undefined })} />
                                  <CrossTag name={ex.name} discipline={disc} />
                                </div>
                              </div>
                              <div className="cw-ex-tools">
                                <button type="button" className="cw-icon" aria-label="Move up" disabled={eIdx === 0} onClick={() => moveExercise(bIdx, gIdx, eIdx, -1)}>
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 15l6-6 6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                </button>
                                <button type="button" className="cw-icon" aria-label={`Remove ${ex.name}`} onClick={() => patchExercise(bIdx, gIdx, eIdx, null)}>
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
                                </button>
                              </div>
                            </li>
                          ))}
                        </ol>
                        <button type="button" className="cw-add" onClick={() => addExercise(bIdx, gIdx)}>+ Movement</button>
                      </div>
                    ))}
                    {b.stations.length < 6 && (
                      <button type="button" className="cw-addgroup" onClick={() => addGroup(bIdx)}>
                        <span>+</span>Add group
                      </button>
                    )}
                  </div>
                </section>
              ))}
              <button type="button" className="cw-addpart" onClick={addPart}>+ Add part</button>

              <label className="cw-label" htmlFor="cw-scaling">Scaling <span>shown on screen</span></label>
              <textarea id="cw-scaling" className="cw-textarea cw-textarea-sm" rows={2}
                value={(draft.scaling || []).join('\n')}
                onChange={(e) => setDraft({ ...draft, scaling: e.target.value.split('\n') })}
                placeholder="One option per line, e.g. Wall Balls 6/4 kg" />
            </div>

            {/* Seitenleiste: Überblick + Aktionen */}
            <aside className="cw-side">
              <div className="cw-side-card">
                <div className="cw-side-disc"><span className="cw-disc">{D.label}</span>{converted?.config.formatLabel}</div>
                <div className="cw-side-time">{est === null ? 'Open' : fmtDuration(est)}<small>{est === null ? 'no time cap' : 'total'}</small></div>
                <dl className="cw-facts">
                  <div><dt>Groups</dt><dd>{converted?.config.numGroups ?? '–'}</dd></div>
                  <div><dt>Rounds</dt><dd>{converted ? (converted.workout_mode === 'timed' ? converted.config.numRounds : (converted.config.forTimeTargetRounds || converted.config.forTimeBlocks?.length || 1)) : '–'}</dd></div>
                  <div><dt>Moves</dt><dd>{draft.blocks.reduce((n, b) => n + (b.stations[0]?.length || 0), 0)}</dd></div>
                </dl>
                <label className="cw-coach">
                  <span>Coach on screen</span>
                  <input value={coach} onChange={(e) => changeCoach(e.target.value)} placeholder="Your name" maxLength={40} />
                </label>
                {converted && converted.adjustments.length > 0 && (
                  <ul className="cw-adjust">{converted.adjustments.map((a) => <li key={a}>{a}</li>)}</ul>
                )}
                <div className="cw-actions">
                  <button type="button" className="cw-ghost" onClick={preview} disabled={!converted}>Preview</button>
                  <button type="button" className="cw-primary" onClick={save} disabled={!converted || saving}>{saving ? 'Saving' : editId ? 'Save changes' : 'Save workout'}</button>
                </div>
                {error && <p className="cw-error" role="alert">{error}</p>}
                {USE_LOCAL_STORE && <p className="cw-fine">Preview build: workouts are saved in this browser only.</p>}
              </div>
            </aside>
          </div>
          <datalist id={`moves-${disc}`}>
            {[...MORE_MOVES[disc], ...HYROX_EXERCISES.map((e) => e.name), ...TRAINING_EXERCISES.map((e) => e.name)]
              .filter((v, i, a) => a.indexOf(v) === i).map((m) => <option key={m} value={m} />)}
          </datalist>
        </main>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <CreateWorkout />
    </Suspense>
  );
}
