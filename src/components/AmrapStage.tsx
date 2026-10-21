'use client';

// AMRAP-/Stationsansicht (21.10.2026, Samuel: „wo alle Stationen einfach nur
// untereinander stehen … der ist hässlich … cooler darstellen mit kleinen Bildern
// daneben, coole Animationen").
//
// Reine Darstellung. Der Zustand (aktuelle Station je Gruppe, Durchgänge, fertig)
// gehört weiter der Live-Seite — hier wird nichts gezählt, nur gezeigt und
// „Station erledigt" zurückgemeldet.
//
// Bewusst:
//  - Jede Station ist eine Karte mit Übungsbild, Menge groß, Name, Last.
//  - Die aktuelle Station je Gruppe leuchtet; erledigte treten zurück (Haken),
//    kommende bleiben lesbar. So sieht man im Raum sofort, wer wo steht.
//  - Schriftgrößen hängen über Container-Einheiten an der Spaltenbreite/-höhe,
//    damit dieselbe Ansicht auf dem Studio-TV und auf dem Handy trägt.
//  - Animationen nur über transform/opacity; prefers-reduced-motion schaltet ab.

import type { ExerciseEntry } from '@/lib/types';
import { getExerciseImage } from '@/lib/exerciseImages';

export interface AmrapStageProps {
  title: string;
  formatLabel: string;
  blockIndex: number;
  totalBlocks: number;
  numGroups: number;
  exercisesByGroup: Record<number, ExerciseEntry[]>;
  currentIndex: Record<number, number>;
  groupRounds: Record<number, number>;
  groupFinished: Record<number, boolean>;
  targetRounds?: number;
  roundTimer: { enabled: boolean; remaining: number; total: number };
  elapsed: number;
  isPaused: boolean;
  trainerName?: string;
  onAdvance: (groupIndex: number) => void;
  onTogglePause: () => void;
  onExit?: () => void;
}

function fmt(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function metric(ex: ExerciseEntry): { value: string; unit: string } | null {
  if (ex.distance) {
    const m = /^\s*([\d.,]+)\s*(.*)$/.exec(ex.distance);
    if (m) return { value: m[1], unit: (m[2] || '').trim() || 'm' };
    return { value: ex.distance, unit: '' };
  }
  if (ex.reps) return { value: String(ex.reps), unit: 'reps' };
  if (ex.duration) return { value: String(ex.duration), unit: 'sec' };
  return null;
}

function CheckIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12.5l4.2 4.2L19 7" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function AmrapStage(p: AmrapStageProps) {
  const groups = Array.from({ length: p.numGroups }, (_, g) => g);
  // Notizen, die in JEDER Gruppe gleich stehen (z. B. Skalierung aus dem KI-Baukasten),
  // einmal unten über die ganze Breite statt in jeder Spalte doppelt.
  const noteSets = groups.map((g) => (p.exercisesByGroup[g] || []).filter((e) => e.isNote && e.name.trim()).map((e) => e.name.trim()));
  const shared = p.numGroups > 1 ? (noteSets[0] || []).filter((n) => noteSets.every((set) => set.includes(n))) : [];
  const timerValue = p.roundTimer.enabled ? p.roundTimer.remaining : p.elapsed;
  const progress = p.roundTimer.enabled && p.roundTimer.total > 0
    ? 1 - p.roundTimer.remaining / p.roundTimer.total
    : 0;
  const urgent = p.roundTimer.enabled && p.roundTimer.remaining <= 30;
  const expired = p.roundTimer.enabled && p.roundTimer.remaining === 0;

  return (
    <div className="workout-fullscreen as-root" data-groups={p.numGroups}>
      {p.isPaused && (
        <button type="button" className="as-pause" onClick={p.onTogglePause} aria-label="Resume">
          <span className="as-pause-word">Paused</span>
          <span className="as-pause-hint">Tap or press Space to resume</span>
        </button>
      )}

      {/* ---------- Kopf: Format · großer Timer · Marke ---------- */}
      <header className="as-head">
        <div className="as-head-left">
          <div className="as-eyebrow">
            <span className="as-live-dot" aria-hidden="true" />
            {p.formatLabel}
            {p.totalBlocks > 1 && <span className="as-eyebrow-muted">Block {p.blockIndex + 1}/{p.totalBlocks}</span>}
          </div>
          <div className="as-title">{p.title}</div>
        </div>

        <div className={`as-timer-wrap ${urgent ? 'is-urgent' : ''} ${expired ? 'is-expired' : ''}`}>
          <div className="as-timer-label">{p.roundTimer.enabled ? 'Time left' : 'Time'}</div>
          <div className="as-timer" aria-live="off">{fmt(timerValue)}</div>
          {p.roundTimer.enabled && <div className="as-timer-sub">{fmt(p.elapsed)} elapsed</div>}
        </div>

        <div className="as-head-right">
          <div className="as-brand">HYB<span>RYD</span></div>
          <div className="as-brand-sub">Mallorca</div>
        </div>
      </header>
      <div className="as-progress" aria-hidden="true">
        <div className="as-progress-fill" style={{ transform: `scaleX(${Math.min(1, Math.max(0, progress))})` }} />
      </div>

      {/* ---------- Gruppen ---------- */}
      <main className="as-groups">
        {groups.map((g) => {
          const all = p.exercisesByGroup[g] || [];
          const stations = all.map((ex, i) => ({ ex, i })).filter((s) => !s.ex.isNote && s.ex.name.trim());
          const notes = all.filter((ex) => ex.isNote && ex.name.trim() && !shared.includes(ex.name.trim()));
          const cur = p.currentIndex[g] ?? 0;
          const finished = !!p.groupFinished[g];
          const rounds = p.groupRounds[g] || 0;
          const doneCount = finished ? stations.length : stations.filter((s) => s.i < cur).length;
          const roundNo = Math.min(rounds + 1, p.targetRounds || Infinity);

          return (
            <section key={g} className={`as-group ${finished ? 'is-finished' : ''}`} aria-label={`Group ${g + 1}`}>
              <div className="as-group-head">
                <div className="as-group-name">
                  {p.numGroups > 1 ? <>Group <b>{g + 1}</b></> : <>Circuit</>}
                </div>
                <div className="as-round" key={`r${rounds}`}>
                  <span className="as-round-label">Round</span>
                  <span className="as-round-no">{roundNo}</span>
                  {p.targetRounds ? <span className="as-round-of">/{p.targetRounds}</span> : null}
                </div>
              </div>
              <div className="as-segs" aria-label={`${doneCount} of ${stations.length} stations done`}>
                {stations.map((s) => (
                  <span key={s.i} className={`as-seg ${finished || s.i < cur ? 'is-done' : s.i === cur ? 'is-now' : ''}`} />
                ))}
              </div>

              <ol className="as-list" style={{ ['--n' as string]: Math.max(stations.length, 1), ['--n2' as string]: Math.max(Math.ceil(stations.length / 2), 1) }}>
                {stations.map(({ ex, i }, pos) => {
                  const state = finished || i < cur ? 'done' : i === cur ? 'now' : 'next';
                  const m = metric(ex);
                  const isNow = state === 'now';
                  return (
                    <li key={`${i}-${ex.name}`} className={`as-card is-${state}`} style={{ ['--i' as string]: pos }}>
                      <button
                        type="button"
                        className="as-card-btn"
                        onClick={() => isNow && p.onAdvance(g)}
                        disabled={!isNow}
                        aria-label={isNow ? `Complete ${ex.name}${p.numGroups > 1 ? ` for group ${g + 1}` : ''}` : ex.name}
                      >
                        <span className="as-img">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={getExerciseImage(ex.name)} alt="" loading="eager" draggable={false} />
                          <span className="as-img-sheen" aria-hidden="true" />
                          {state === 'done' && <span className="as-img-check"><CheckIcon size={20} /></span>}
                        </span>
                        <span className="as-body">
                          <span className="as-meta">
                            <span className="as-index">{String(pos + 1).padStart(2, '0')}</span>
                            {ex.weight && <span className="as-weight">{ex.weight}</span>}
                          </span>
                          <span className="as-line">
                            {m && (
                              <span className="as-metric">
                                {m.value}
                                {m.unit && <small>{m.unit}</small>}
                              </span>
                            )}
                            <span className="as-name">{ex.name}</span>
                          </span>
                        </span>
                        {isNow && <span className="as-now-tag">Now</span>}
                      </button>
                    </li>
                  );
                })}
              </ol>

              {notes.length > 0 && (
                <div className="as-notes">
                  {notes.map((n, k) => (
                    <p key={k} className="as-note">{n.name}</p>
                  ))}
                </div>
              )}

              {finished && (
                <div className="as-done" aria-live="polite">
                  <span className="as-done-icon"><CheckIcon size={34} /></span>
                  <span className="as-done-word">Done</span>
                </div>
              )}
            </section>
          );
        })}
      </main>

      {shared.length > 0 && (
        <div className="as-shared">
          {shared.map((n) => <p key={n} className="as-note">{n}</p>)}
        </div>
      )}

      {/* ---------- Fuß ---------- */}
      <footer className="as-foot">
        <div className="as-foot-left">
          <button type="button" onClick={p.onTogglePause} className="as-icon-btn" aria-label={p.isPaused ? 'Resume' : 'Pause'}>
            {p.isPaused ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" /></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4.5" width="4" height="15" rx="1" /><rect x="14" y="4.5" width="4" height="15" rx="1" /></svg>
            )}
          </button>
          {p.trainerName ? <span className="as-coach"><b>{p.trainerName}</b></span> : null}
        </div>
        <div className="as-hint">
          <span>Tap the glowing card</span>
          <span className="as-hint-keys">or press <kbd>1</kbd>{p.numGroups > 1 && <>–<kbd>{Math.min(p.numGroups, 9)}</kbd></>} when a station is done</span>
        </div>
      </footer>
    </div>
  );
}
