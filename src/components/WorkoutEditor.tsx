'use client';

// Neuer Workout-Editor (V3, 22.10.2026) – arbeitet direkt im ORIGINAL-Datenformat
// (workout_mode 'timed' | 'fortime' + WorkoutConfig), damit alte Workouts unverändert
// weiterlaufen und die Coaches im H-Club keine Umstellung merken.
// Samuel 12:26: alle Funktionen des Original-Editors, aber im schönen Editor;
// Grundlegendes sichtbar, Fortgeschrittenes in „More settings" bzw. im Menü (…) je Runde/Gruppe.
// Die Bearbeitungsregeln stammen 1:1 aus dem Original (lib/workoutOps.ts).

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ExerciseEntry, WorkoutConfig, WorkoutMode } from '@/lib/types';
import * as ops from '@/lib/workoutOps';
import { getExerciseImage } from '@/lib/exerciseImages';
import { HYROX_EXERCISES, TRAINING_EXERCISES } from '@/lib/exercises';
import { ICON_PICKER_OPTIONS, exerciseIconMap, getExerciseIcon } from '@/lib/exerciseIcons';
import { DISCIPLINES, makeExerciseColors, workoutDiscipline, type Discipline } from '@/lib/discipline';
import CrossTag from '@/components/CrossTag';

export interface EditorValue {
  name: string;
  mode: WorkoutMode;
  isPublic: boolean;
  config: WorkoutConfig;
  coach: string;
}

const ALL = [...HYROX_EXERCISES, ...TRAINING_EXERCISES].map((e) => e.name);

function Stepper({ label, value, unit, min, max, step = 1, placeholder, onChange, testId }: {
  label: string; value: number | undefined; unit?: string; min: number; max: number; step?: number; placeholder?: string;
  onChange: (v: number | undefined) => void; testId?: string;
}) {
  const base = value ?? (parseInt(placeholder || '') || min);
  const set = (n: number) => onChange(Math.max(min, Math.min(max, n)));
  return (
    <div className="cw-step" data-test={testId}>
      <span className="cw-step-label">{label}</span>
      <div className="cw-step-ctl">
        <button type="button" aria-label={`Less ${label}`} onClick={() => set(base - step)}>−</button>
        <input inputMode="numeric" value={value ?? ''} placeholder={placeholder} aria-label={label}
          onChange={(e) => { const n = parseInt(e.target.value); onChange(Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : undefined); }} />
        {unit && <span className="cw-step-unit">{unit}</span>}
        <button type="button" aria-label={`More ${label}`} onClick={() => set(base + step)}>+</button>
      </div>
    </div>
  );
}

/** Kleines Menü (…) – schließt bei Klick daneben. */
function Menu({ label, children }: { label: string; children: (close: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const on = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', on);
    return () => document.removeEventListener('mousedown', on);
  }, [open]);
  return (
    <div className="we-menu" ref={ref}>
      <button type="button" className="we-menu-btn" aria-label={label} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
      </button>
      {open && <div className="we-menu-pop" role="menu">{children(() => setOpen(false))}</div>}
    </div>
  );
}

function amountOf(e: ExerciseEntry): string {
  if (e.distance) return e.distance;
  if (e.reps) return String(e.reps);
  if (e.duration) return `${e.duration}s`;
  return '';
}
function parseAmount(v: string): Partial<ExerciseEntry> {
  const t = v.trim();
  if (!t) return { reps: undefined, distance: undefined, duration: undefined };
  if (/^\d+$/.test(t)) return { reps: parseInt(t, 10), distance: undefined, duration: undefined };
  const s = /^(\d+)\s*(s|sec|secs|seconds)$/i.exec(t);
  if (s) return { duration: parseInt(s[1], 10), reps: undefined, distance: undefined };
  return { distance: t, reps: undefined, duration: undefined };
}

export function estimateSeconds(mode: WorkoutMode, c: WorkoutConfig): number | null {
  if (mode === 'fortime') {
    if (!c.forTimeRoundTimerEnabled) return null;
    const n = ops.getBlocks(c).length || 1;
    return n * (c.forTimeRoundTimerMinutes || 12) * 60 + Math.max(0, n - 1) * (c.roundRestTime || 0) + (c.warmupTime || 0);
  }
  let s = c.warmupTime || 0;
  for (let r = 0; r < c.numRounds; r++) {
    const n = c.rounds?.[r]?.[0]?.length || 0;
    const w = c.roundSettings?.[r]?.workTime ?? c.workTime;
    const p = c.roundSettings?.[r]?.restTime ?? c.restTime;
    s += n * w + Math.max(0, n - 1) * p;
  }
  return s + Math.max(0, c.numRounds - 1) * (c.roundRestTime || 0);
}

export default function WorkoutEditor({ initial, onSave, onStart, onPreview, saving, savedNote, library = [], onCustomExercise }: {
  initial: EditorValue;
  onSave: (v: EditorValue) => void;
  onStart?: (v: EditorValue) => void;
  onPreview?: (v: EditorValue) => void;
  saving?: boolean;
  savedNote?: string;
  library?: string[];
  onCustomExercise?: (name: string) => void;
}) {
  const [v, setV] = useState<EditorValue>(() => ({ ...initial, config: ops.updateConfig(initial.config, {}) }));
  const [more, setMore] = useState(false);
  const [roundTimes, setRoundTimes] = useState<Record<number, boolean>>({});
  const [groupTimes, setGroupTimes] = useState<Record<string, boolean>>({});
  const [dupFor, setDupFor] = useState<{ r: number; g: number; by: number } | null>(null);
  const [iconFor, setIconFor] = useState<string | null>(null);
  const [clip, setClip] = useState<{ exercises: ExerciseEntry[]; label: string } | null>(null);
  const [drag, setDrag] = useState<{ k: string; i: number } | null>(null);

  const c = v.config;
  const timed = v.mode !== 'fortime';
  const set = (fn: (c: WorkoutConfig) => WorkoutConfig) => setV((p) => ({ ...p, config: fn(p.config) }));
  const disc: Discipline = workoutDiscipline(c);
  const est = estimateSeconds(v.mode, c);
  const blocks = ops.getBlocks(c);
  const moves = useMemo(() => Array.from(new Set([...ALL, ...library])), [library]);

  // Farbe je Übung wie auf dem TV
  const colorOf = useMemo(() => {
    const names: string[] = [];
    if (timed) Object.values(c.rounds || {}).forEach((r) => Object.values(r || {}).forEach((g) => (g || []).forEach((n) => names.push(n))));
    else blocks.forEach((b) => Object.values(b.exercises || {}).forEach((g) => (g || []).forEach((e) => { if (!e.isNote) names.push(e.name); })));
    return makeExerciseColors(names);
  }, [c, timed, blocks]);

  function changeName(r: number, g: number, i: number, name: string) {
    set((x) => ops.setExercise(x, r, g, i, name));
  }
  function commitCustom(name: string) {
    const n = name.trim();
    if (n && !ALL.includes(n) && !library.includes(n)) onCustomExercise?.(n);
  }

  // ---------- Kopf ----------
  const head = (
    <div className="cw-namebar">
      <input className="cw-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} aria-label="Workout name" />
    </div>
  );

  // ---------- Grundeinstellungen ----------
  const basics = (
    <section className="cw-block we-basics">
      <div className="cw-block-head">
        <span className="cw-block-no">Mode</span>
        <div className="cw-seg" role="radiogroup" aria-label="Workout mode">
          <button type="button" role="radio" aria-checked={timed} className={timed ? 'is-on' : ''} onClick={() => setV({ ...v, mode: 'timed' })}>Timed</button>
          <button type="button" role="radio" aria-checked={!timed} className={!timed ? 'is-on' : ''} onClick={() => setV((p) => {
            // Noch keine AMRAP-Runde: mit den Übungen der ersten Timed-Runde vorbelegen statt leer.
            const has = (p.config.forTimeBlocks || []).some((b) => Object.values(b.exercises || {}).some((l) => (l || []).length));
            if (has) return { ...p, mode: 'fortime' };
            const ex: Record<number, ExerciseEntry[]> = {};
            for (let g = 0; g < p.config.numGroups; g++) ex[g] = (p.config.rounds?.[0]?.[g] || ['Wall Balls']).map((name) => ({ name, reps: 10 }));
            return { ...p, mode: 'fortime', config: ops.setBlocks(p.config, [{ exercises: ex }]) };
          })}>AMRAP</button>
        </div>
        <div className="ed-disc" role="radiogroup" aria-label="Type">
          {(['hyrox', 'crossfit'] as Discipline[]).map((d) => (
            <button key={d} type="button" role="radio" aria-checked={disc === d} className={disc === d ? 'is-on' : ''}
              style={{ ['--k' as string]: DISCIPLINES[d].accent }} onClick={() => set((x) => ({ ...x, discipline: d }))}>
              <i aria-hidden="true" />{DISCIPLINES[d].label}
            </button>
          ))}
        </div>
      </div>
      <div className="cw-times">
        <Stepper label="Groups" min={1} max={10} value={c.numGroups} onChange={(n) => set((x) => ops.updateConfig(x, { numGroups: n ?? 1 }))} testId="groups" />
        {timed ? (
          <>
            <Stepper label="Rounds" min={1} max={20} value={c.numRounds} onChange={(n) => set((x) => ops.updateConfig(x, { numRounds: n ?? 1 }))} testId="rounds" />
            <Stepper label="Work" unit="s" min={5} max={600} step={5} value={c.workTime} onChange={(n) => set((x) => ({ ...x, workTime: n ?? 60 }))} testId="work" />
            <Stepper label="Rest" unit="s" min={0} max={600} step={5} value={c.restTime} onChange={(n) => set((x) => ({ ...x, restTime: n ?? 0 }))} testId="rest" />
          </>
        ) : (
          <div className="cw-step">
            <span className="cw-step-label">Timer per round</span>
            <div className="we-timer">
              <button type="button" role="switch" aria-checked={!!c.forTimeRoundTimerEnabled} className={`we-switch ${c.forTimeRoundTimerEnabled ? 'is-on' : ''}`}
                onClick={() => set((x) => ({ ...x, forTimeRoundTimerEnabled: !x.forTimeRoundTimerEnabled, forTimeRoundTimerMinutes: x.forTimeRoundTimerMinutes || 12 }))}><i /></button>
              {c.forTimeRoundTimerEnabled && (
                <Stepper label="Minutes" unit="min" min={1} max={120} value={c.forTimeRoundTimerMinutes || 12} onChange={(n) => set((x) => ({ ...x, forTimeRoundTimerMinutes: n ?? 12 }))} />
              )}
            </div>
          </div>
        )}
      </div>

      <button type="button" className={`we-more ${more ? 'is-open' : ''}`} aria-expanded={more} onClick={() => setMore((m) => !m)}>
        More settings
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {more && (
        <div className="we-more-body">
          <div className="cw-times">
            <Stepper label="Warm-up" unit="s" min={0} max={300} step={5} value={c.warmupTime} onChange={(n) => set((x) => ({ ...x, warmupTime: n ?? 0 }))} testId="warmup" />
            <Stepper label="Round rest" unit="s" min={0} max={600} step={15} value={c.roundRestTime} onChange={(n) => set((x) => ({ ...x, roundRestTime: n ?? 0 }))} testId="roundrest" />
            {!timed && (
              <Stepper label="Target rounds" min={1} max={50} value={c.forTimeTargetRounds} placeholder="–" onChange={(n) => set((x) => ({ ...x, forTimeTargetRounds: n }))} />
            )}
          </div>
          <div className="we-more-row">
            <label className="cw-coach">
              <span>Coach on screen</span>
              <input value={v.coach} onChange={(e) => setV({ ...v, coach: e.target.value })} placeholder="Your name" maxLength={40} />
            </label>
            <button type="button" role="switch" aria-checked={v.isPublic} className="we-toggle" onClick={() => setV({ ...v, isPublic: !v.isPublic })}>
              <span className={`we-switch ${v.isPublic ? 'is-on' : ''}`}><i /></span>
              Public <small>other trainers can see it</small>
            </button>
            {timed && (
              <button type="button" className="cw-ghost we-random" onClick={() => set((x) => ops.randomFill(x, ALL))}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h3l10 10h3M4 17h3l3-3m4-4l3-3h3M17 4l3 3-3 3M17 14l3 3-3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                Fill randomly
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );

  // ---------- Timed: Runden ----------
  function timedRound(r: number) {
    const rs = c.roundSettings?.[r];
    const w = rs?.workTime ?? c.workTime;
    const p = rs?.restTime ?? c.restTime;
    return (
      <section key={r} className="cw-block we-round" data-round={r}>
        <div className="we-round-head">
          <h3 className="we-round-title">Round {r + 1}</h3>
          <span className="we-round-meta">{w}s work · {p}s rest{rs ? ' · custom' : ''}</span>
          <Menu label={`Round ${r + 1} options`}>
            {(close) => (
              <>
                <button type="button" role="menuitem" onClick={() => { set((x) => ops.duplicateRound(x, r)); close(); }}>Copy round</button>
                <button type="button" role="menuitem" onClick={() => { setRoundTimes((s) => ({ ...s, [r]: !s[r] })); close(); }}>Round times…</button>
              </>
            )}
          </Menu>
        </div>
        {roundTimes[r] && (
          <div className="we-inline">
            <Stepper label="Work this round" unit="s" min={5} max={600} step={5} value={rs?.workTime} placeholder={String(c.workTime)} onChange={(n) => set((x) => ops.updateRoundSetting(x, r, 'workTime', n))} />
            <Stepper label="Rest this round" unit="s" min={0} max={600} step={5} value={rs?.restTime} placeholder={String(c.restTime)} onChange={(n) => set((x) => ops.updateRoundSetting(x, r, 'restTime', n))} />
            <button type="button" className="cw-add" onClick={() => { set((x) => ops.updateRoundSetting(ops.updateRoundSetting(x, r, 'workTime', undefined), r, 'restTime', undefined)); }}>Reset</button>
          </div>
        )}
        <div className={`cw-groups n${Math.min(c.numGroups, 4)}`}>
          {Array.from({ length: c.numGroups }, (_, g) => {
            const list = c.rounds?.[r]?.[g] || [];
            const gk = `${r}-${g}`;
            const gt = c.groupTimeSettings?.[r]?.[g];
            return (
              <div key={g} className="cw-group" data-group={g}>
                <div className="cw-group-head">
                  <span className="cw-group-name">Group <b>{g + 1}</b></span>
                  <span className="cw-group-count">{list.length}</span>
                  {gt && <span className="we-chip">{gt.workTime ?? w}s / {gt.restTime ?? p}s</span>}
                  <Menu label={`Group ${g + 1} options`}>
                    {(close) => (
                      <>
                        <button type="button" role="menuitem" onClick={() => { setDupFor({ r, g, by: 0 }); close(); }}>Duplicate group…</button>
                        <button type="button" role="menuitem" onClick={() => { setGroupTimes((s) => ({ ...s, [gk]: !s[gk] })); close(); }}>Group times…</button>
                      </>
                    )}
                  </Menu>
                </div>
                {dupFor && dupFor.r === r && dupFor.g === g && (
                  <div className="we-inline we-dup">
                    <Stepper label="Shift order by" min={0} max={Math.max(0, list.length - 1)} value={dupFor.by} onChange={(n) => setDupFor({ ...dupFor, by: n ?? 0 })} />
                    <span className="we-hint">0 = exact copy · 1 = each move one position later. Copies into all rounds.</span>
                    <div className="we-inline-actions">
                      <button type="button" className="cw-add" onClick={() => setDupFor(null)}>Cancel</button>
                      <button type="button" className="we-small-primary" onClick={() => { set((x) => ops.duplicateGroup(x, g, dupFor.by)); setDupFor(null); }}>Duplicate</button>
                    </div>
                  </div>
                )}
                {groupTimes[gk] && (
                  <div className="we-inline">
                    <Stepper label="Work" unit="s" min={5} max={600} step={5} value={gt?.workTime} placeholder={String(w)} onChange={(n) => set((x) => ops.updateGroupTimeSetting(x, r, g, 'workTime', n))} />
                    <Stepper label="Rest" unit="s" min={0} max={600} step={5} value={gt?.restTime} placeholder={String(p)} onChange={(n) => set((x) => ops.updateGroupTimeSetting(x, r, g, 'restTime', n))} />
                    <button type="button" className="cw-add" onClick={() => set((x) => ops.updateGroupTimeSetting(ops.updateGroupTimeSetting(x, r, g, 'workTime', undefined), r, g, 'restTime', undefined))}>Reset</button>
                  </div>
                )}
                <ol className="cw-rows">
                  {list.map((name, i) => {
                    const ov = c.iconOverrides?.[r]?.[g]?.[i];
                    const Icon = ov ? (exerciseIconMap[ov] || getExerciseIcon(name)) : getExerciseIcon(name);
                    const ik = `${r}-${g}-${i}`;
                    return (
                      <li key={i} className={`cw-ex we-ex ${drag?.k === gk && drag.i === i ? 'is-drag' : ''}`} style={{ ['--st' as string]: colorOf(name) }}
                        onDragOver={(e) => { if (drag?.k === gk) e.preventDefault(); }}
                        onDrop={(e) => { e.preventDefault(); if (drag?.k === gk) set((x) => ops.reorderExercise(x, r, g, drag.i, i)); setDrag(null); }}>
                        <span className="we-grip" draggable onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; setDrag({ k: gk, i }); }} onDragEnd={() => setDrag(null)} title="Drag to reorder" aria-hidden="true">
                          <svg width="12" height="16" viewBox="0 0 12 20" fill="currentColor"><circle cx="3" cy="4" r="1.6" /><circle cx="9" cy="4" r="1.6" /><circle cx="3" cy="10" r="1.6" /><circle cx="9" cy="10" r="1.6" /><circle cx="3" cy="16" r="1.6" /><circle cx="9" cy="16" r="1.6" /></svg>
                        </span>
                        <span className="cw-ex-no">{i + 1}</span>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img className="cw-ex-img" src={getExerciseImage(name)} alt="" />
                        <div className="cw-ex-fields">
                          <input className="cw-ex-name" value={name} aria-label="Exercise" list="we-moves"
                            onChange={(e) => changeName(r, g, i, e.target.value)} onBlur={(e) => commitCustom(e.target.value)} />
                          <div className="cw-ex-line2"><CrossTag name={name} discipline={disc} /></div>
                        </div>
                        <div className="we-ex-tools">
                          <button type="button" className="cw-icon we-icon-btn" aria-label="Choose symbol" onClick={() => setIconFor(iconFor === ik ? null : ik)}><Icon size={20} /></button>
                          <button type="button" className="cw-icon" aria-label="Move up" disabled={i === 0} onClick={() => set((x) => ops.reorderExercise(x, r, g, i, i - 1))}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 15l6-6 6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                          </button>
                          <button type="button" className="cw-icon" aria-label={`Remove ${name}`} disabled={list.length <= 1} onClick={() => set((x) => ops.removeExercise(x, r, g, i))}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
                          </button>
                        </div>
                        {iconFor === ik && (
                          <div className="we-icons" role="listbox" aria-label="Symbols">
                            <button type="button" className={!ov ? 'is-on' : ''} onClick={() => { set((x) => ops.setIconOverride(x, r, g, i, null)); setIconFor(null); }}>Auto</button>
                            {ICON_PICKER_OPTIONS.map(({ key, label, Component }) => (
                              <button key={key} type="button" title={label} className={ov === key ? 'is-on' : ''} onClick={() => { set((x) => ops.setIconOverride(x, r, g, i, key)); setIconFor(null); }}>
                                <Component size={28} />
                              </button>
                            ))}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ol>
                <button type="button" className="cw-add" onClick={() => set((x) => ops.addExercise(x, r, g, 'Wall Balls'))}>+ Exercise</button>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  // ---------- AMRAP: Runden (Blöcke) ----------
  function amrapBlock(b: number) {
    const block = blocks[b];
    return (
      <section key={b} className="cw-block we-round" data-block={b}>
        <div className="we-round-head">
          <h3 className="we-round-title">{blocks.length > 1 ? `Round ${b + 1}` : 'AMRAP'}</h3>
          <Menu label={`Round ${b + 1} options`}>
            {(close) => (
              <>
                <button type="button" role="menuitem" onClick={() => { set((x) => ops.duplicateBlock(x, b)); close(); }}>Copy round</button>
                {blocks.length > 1 && <button type="button" role="menuitem" className="is-danger" onClick={() => { set((x) => ops.removeBlock(x, b)); close(); }}>Remove round</button>}
              </>
            )}
          </Menu>
        </div>
        <div className={`cw-groups n${Math.min(c.numGroups, 4)}`}>
          {Array.from({ length: c.numGroups }, (_, g) => {
            const list = block?.exercises?.[g] || [];
            const gk = `a${b}-${g}`;
            return (
              <div key={g} className="cw-group" data-group={g}>
                <div className="cw-group-head">
                  <span className="cw-group-name">Group <b>{g + 1}</b></span>
                  <span className="cw-group-count">{list.filter((e) => !e.isNote).length}</span>
                  <Menu label={`Group ${g + 1} options`}>
                    {(close) => (
                      <>
                        <button type="button" role="menuitem" onClick={() => { setClip({ exercises: JSON.parse(JSON.stringify(list)), label: `Round ${b + 1} · Group ${g + 1}` }); close(); }}>Copy group</button>
                        <button type="button" role="menuitem" disabled={!clip} onClick={() => { if (clip) set((x) => ops.pasteFtGroup(x, b, g, clip.exercises)); close(); }}>
                          Paste group{clip ? ` (${clip.label})` : ''}
                        </button>
                        <button type="button" role="menuitem" onClick={() => { set((x) => ops.addFtNote(x, b, g)); close(); }}>Add note</button>
                      </>
                    )}
                  </Menu>
                </div>
                <ol className="cw-rows">
                  {list.map((ex, i) => ex.isNote ? (
                    <li key={i} className="we-note">
                      <input value={ex.name} placeholder="Note shown on screen" aria-label="Note" onChange={(e) => set((x) => ops.updateFt(x, b, g, i, { name: e.target.value }))} />
                      <button type="button" className="cw-icon" aria-label="Remove note" disabled={list.length <= 1} onClick={() => set((x) => ops.removeFt(x, b, g, i))}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
                      </button>
                    </li>
                  ) : (
                    <li key={i} className={`cw-ex we-ex ${drag?.k === gk && drag.i === i ? 'is-drag' : ''}`} style={{ ['--st' as string]: colorOf(ex.name) }}
                      onDragOver={(e) => { if (drag?.k === gk) e.preventDefault(); }}
                      onDrop={(e) => { e.preventDefault(); if (drag?.k === gk) set((x) => ops.moveFt(x, b, g, drag.i, i)); setDrag(null); }}>
                      <span className="we-grip" draggable onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; setDrag({ k: gk, i }); }} onDragEnd={() => setDrag(null)} title="Drag to reorder" aria-hidden="true">
                        <svg width="12" height="16" viewBox="0 0 12 20" fill="currentColor"><circle cx="3" cy="4" r="1.6" /><circle cx="9" cy="4" r="1.6" /><circle cx="3" cy="10" r="1.6" /><circle cx="9" cy="10" r="1.6" /><circle cx="3" cy="16" r="1.6" /><circle cx="9" cy="16" r="1.6" /></svg>
                      </span>
                      <span className="cw-ex-no">{i + 1}</span>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img className="cw-ex-img" src={getExerciseImage(ex.name)} alt="" />
                      <div className="cw-ex-fields">
                        <div className="cw-ex-line1">
                          <input className="cw-ex-amount" value={amountOf(ex)} placeholder="10" aria-label="Reps, distance or seconds"
                            onChange={(e) => set((x) => ops.updateFt(x, b, g, i, parseAmount(e.target.value)))} />
                          <input className="cw-ex-name" value={ex.name} aria-label="Exercise" list="we-moves"
                            onChange={(e) => set((x) => ops.updateFt(x, b, g, i, { name: e.target.value }))} onBlur={(e) => commitCustom(e.target.value)} />
                        </div>
                        <div className="cw-ex-line2">
                          <input className="cw-ex-load" value={ex.weight || ''} placeholder="+ load" aria-label="Load"
                            onChange={(e) => set((x) => ops.updateFt(x, b, g, i, { weight: e.target.value || undefined }))} />
                          <CrossTag name={ex.name} discipline={disc} />
                        </div>
                      </div>
                      <div className="we-ex-tools">
                        <button type="button" className="cw-icon" aria-label="Move up" disabled={i === 0} onClick={() => set((x) => ops.moveFt(x, b, g, i, i - 1))}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 15l6-6 6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        </button>
                        <button type="button" className="cw-icon" aria-label={`Remove ${ex.name}`} disabled={list.length <= 1} onClick={() => set((x) => ops.removeFt(x, b, g, i))}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
                        </button>
                      </div>
                    </li>
                  ))}
                </ol>
                <button type="button" className="cw-add" onClick={() => set((x) => ops.addFt(x, b, g))}>+ Exercise</button>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  const groupsTotal = c.numGroups;
  const roundsTotal = timed ? c.numRounds : blocks.length;
  return (
    <main className="cw-main cw-edit we-root">
      <div className="cw-edit-grid">
        <div className="cw-edit-col">
          {head}
          {basics}
          {timed ? Array.from({ length: c.numRounds }, (_, r) => timedRound(r)) : blocks.map((_, b) => amrapBlock(b))}
          {!timed && <button type="button" className="cw-addpart" onClick={() => set((x) => ops.addBlock(x))}>+ Add round</button>}
          {clip && !timed && <p className="cw-fine">Clipboard: {clip.label}. Paste it from any group menu (…).</p>}
        </div>
        <aside className="cw-side">
          <div className="cw-side-card">
            <div className="cw-side-disc"><span className="cw-disc" style={{ ['--disc' as string]: DISCIPLINES[disc].accent }}>{DISCIPLINES[disc].label}</span>{timed ? 'Timed' : 'AMRAP'}</div>
            <div className="cw-side-time">{est === null ? 'Open' : `${Math.max(1, Math.round(est / 60))} min`}<small>{est === null ? 'no timer' : 'incl. warm-up'}</small></div>
            <dl className="cw-facts">
              <div><dt>Groups</dt><dd>{groupsTotal}</dd></div>
              <div><dt>Rounds</dt><dd>{roundsTotal}</dd></div>
              <div><dt>Warm-up</dt><dd>{c.warmupTime || 0}s</dd></div>
            </dl>
            <div className="cw-actions">
              {onPreview && <button type="button" className="cw-ghost" onClick={() => onPreview(v)}>Preview</button>}
              <button type="button" className="cw-primary" onClick={() => onSave(v)} disabled={saving}>{saving ? 'Saving' : 'Save'}</button>
              {onStart && <button type="button" className="cw-ghost" onClick={() => onStart(v)}>Start on screen</button>}
            </div>
            {savedNote && <p className="cw-fine">{savedNote}</p>}
          </div>
        </aside>
      </div>
      <datalist id="we-moves">{moves.map((m) => <option key={m} value={m} />)}</datalist>
    </main>
  );
}
