'use client';

// EMOM-, Intervall- und Tabata-Ansicht (22.10.2026) im Stil der AMRAP-Stationsansicht.
//
// Reine Darstellung: Die Live-Seite zählt Zeit, Runde und Übung und reicht sie hier
// nur durch. Zwei Zustände sehen bewusst GANZ verschieden aus:
//   Arbeit — dunkles Petrol, leuchtende Karte mit Bild, riesige Zahl in Weiß.
//   Pause  — ruhige blaue Fläche, Zahl gedämpft, die KOMMENDE Übung steht im Mittelpunkt
//            („Next up"). So erkennt man im Raum aus zehn Metern, ob es gerade zählt.
// Animationen nur über transform/opacity; prefers-reduced-motion schaltet ab.

import { getExerciseImage } from '@/lib/exerciseImages';

export type IntervalPhase = 'work' | 'rest' | 'roundRest';

export interface IntervalGroup {
  items: string[];
  idx: number;
}

export interface IntervalStageProps {
  title: string;
  formatLabel: string;
  phase: IntervalPhase;
  kind: 'emom' | 'intervals';
  timeRemaining: number;
  phaseTotal: number;
  round: number; // 0-basiert
  totalRounds: number;
  groups: IntervalGroup[];
  isPaused: boolean;
  trainerName?: string;
  onSkip: () => void;
  onAdjust: (deltaSeconds: number) => void;
  onTogglePause: () => void;
}

function fmt(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

interface Parsed { value: string; unit: string; name: string; weight: string | null }

// Timed-Workouts kennen nur Übungsnamen; Menge und Last stehen im Namen
// („10 Wall Balls @ 9 kg", „200m Run"). Hier wieder auseinandernehmen.
function parseLabel(raw: string): Parsed {
  const [head, ...rest] = raw.split(' @ ');
  const weight = rest.length ? rest.join(' @ ').trim() : null;
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*(km|kcal|cal|min|sec|m|s|x)?\s+(.+)$/i.exec(head);
  if (!m) return { value: '', unit: '', name: head.trim(), weight };
  const unit = (m[2] || '').toLowerCase();
  return { value: m[1], unit: unit === 'x' || !unit ? 'reps' : unit, name: m[3].trim(), weight };
}

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12.5l4.2 4.2L19 7" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function IntervalStage(p: IntervalStageProps) {
  const isWork = p.phase === 'work';
  const maxItems = Math.max(1, ...p.groups.map((g) => g.items.length));
  const idx = Math.min(p.groups[0]?.idx ?? 0, maxItems - 1);
  const number = idx + 1;
  const pad = (n: number) => String(n).padStart(2, '0');
  const fill = p.phaseTotal > 0 ? Math.min(1, Math.max(0, p.timeRemaining / p.phaseTotal)) : 0;
  const lastCall = p.timeRemaining <= 5 && p.timeRemaining > 0;

  // Große Zählung: EMOM = Minute, sonst Runde (bei mehreren Runden) oder Intervall.
  const multiRound = p.totalRounds > 1;
  const counter = p.kind === 'emom'
    ? { label: isWork ? 'Minute' : 'Next minute', no: pad(number), of: pad(maxItems) }
    : multiRound
      ? { label: p.phase === 'roundRest' ? 'Next round' : 'Round', no: pad(p.round + 1), of: pad(p.totalRounds) }
      : { label: isWork ? 'Interval' : 'Next interval', no: pad(number), of: pad(maxItems) };
  const second = p.kind === 'intervals' && multiRound
    ? { label: isWork ? 'Station' : 'Next station', no: pad(number), of: pad(maxItems) }
    : null;

  const phaseWord = p.phase === 'work' ? 'Work' : p.phase === 'roundRest' ? 'Round rest' : 'Rest';
  const tone = isWork ? 'is-work' : 'is-rest';

  return (
    <div className={`workout-fullscreen iv-root ${tone}`} data-groups={p.groups.length} data-phase={p.phase}>
      {p.isPaused && (
        <button type="button" className="iv-pause" onClick={p.onTogglePause} aria-label="Resume">
          <span className="iv-pause-word">Paused</span>
          <span className="iv-pause-hint">Tap or press Space to resume</span>
        </button>
      )}

      <header className="iv-head">
        <div className="iv-head-left">
          <div className="iv-eyebrow"><span className="iv-live-dot" aria-hidden="true" />{p.formatLabel}</div>
          <div className="iv-title">{p.title}</div>
        </div>
        <div className="iv-head-right">
          <div className="iv-brand">HYB<span>RYD</span></div>
          <div className="iv-brand-sub">Mallorca</div>
        </div>
      </header>

      {/* ---------- Held: Minute/Runde · riesige Zeit · zweite Zählung ---------- */}
      <section className="iv-hero" key={p.phase}>
        <div className="iv-count">
          <div className="iv-count-label">{counter.label}</div>
          <div className="iv-count-line" key={counter.no}>
            <span className="iv-count-no">{counter.no}</span>
            <span className="iv-count-of">/{counter.of}</span>
          </div>
        </div>

        <div className="iv-clock">
          <div className="iv-phase"><span className="iv-phase-dot" aria-hidden="true" />{phaseWord}</div>
          <div className={`iv-time ${lastCall ? 'is-last' : ''}`} key={lastCall ? p.timeRemaining : 'steady'} aria-live="off">
            {fmt(p.timeRemaining)}
          </div>
        </div>

        <div className="iv-count iv-count-right">
          {second ? (
            <>
              <div className="iv-count-label">{second.label}</div>
              <div className="iv-count-line">
                <span className="iv-count-no">{second.no}</span>
                <span className="iv-count-of">/{second.of}</span>
              </div>
            </>
          ) : null}
        </div>
      </section>

      <div className="iv-bar" aria-hidden="true">
        <div className="iv-bar-fill" style={{ transform: `scaleX(${fill})` }} />
      </div>

      {/* ---------- Stationen je Gruppe ---------- */}
      <main className="iv-groups" key={`g-${p.phase}`}>
        {p.groups.map((g, gi) => {
          const items = g.items.length ? g.items : ['Exercise'];
          const at = Math.min(g.idx, items.length - 1);
          const cur = parseLabel(items[at]);
          const nextRaw = at + 1 < items.length ? items[at + 1] : null;
          const next = nextRaw ? parseLabel(nextRaw) : null;
          return (
            <section key={gi} className="iv-card" style={{ ['--i' as string]: gi }} aria-label={`Group ${gi + 1}`}>
              <div className="iv-card-head">
                <span className="iv-card-group">{p.groups.length > 1 ? <>Group <b>{gi + 1}</b></> : null}</span>
                {isWork && <span className="iv-card-tag">Now</span>}
              </div>

              <div className="iv-card-main">
                <div className="iv-img" key={`${at}-${p.phase}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={getExerciseImage(items[at])} alt="" draggable={false} />
                  <span className="iv-img-sheen" aria-hidden="true" />
                </div>
                <div className="iv-text" key={`t${at}-${p.phase}`}>
                  {!isWork && <div className="iv-up">Next up</div>}
                  <div className="iv-line">
                    {cur.value && (
                      <span className="iv-metric">{cur.value}<small>{cur.unit}</small></span>
                    )}
                    <span className="iv-name">{cur.name}</span>
                  </div>
                  {cur.weight && <span className="iv-weight">{cur.weight}</span>}
                </div>
              </div>

              <div className="iv-segs" aria-label={`${at} of ${items.length} done`}>
                {items.map((_, i) => (
                  <span key={i} className={`iv-seg ${i < at ? 'is-done' : i === at ? 'is-now' : ''}`} />
                ))}
              </div>

              {isWork && (
                <div className="iv-next">
                  <span className="iv-next-label">Next</span>
                  <span className="iv-next-name">
                    {next ? <>{next.value ? `${next.value} ` : ''}{next.name}</> : <><CheckIcon /> Last one</>}
                  </span>
                </div>
              )}
            </section>
          );
        })}
      </main>

      <footer className="iv-foot">
        <div className="iv-foot-left">
          <button type="button" onClick={p.onTogglePause} className="iv-icon-btn" aria-label={p.isPaused ? 'Resume' : 'Pause'}>
            {p.isPaused ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" /></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4.5" width="4" height="15" rx="1" /><rect x="14" y="4.5" width="4" height="15" rx="1" /></svg>
            )}
          </button>
          {p.trainerName ? <span className="iv-coach"><b>{p.trainerName}</b></span> : null}
        </div>
        <div className="iv-foot-right">
          {isWork ? (
            <button type="button" className="iv-btn" onClick={p.onSkip}>Skip <kbd>N</kbd></button>
          ) : (
            <>
              <button type="button" className="iv-btn" onClick={() => p.onAdjust(-15)}>−15s</button>
              <button type="button" className="iv-btn is-primary" onClick={p.onSkip}>Skip rest</button>
              <button type="button" className="iv-btn" onClick={() => p.onAdjust(15)}>+15s</button>
            </>
          )}
        </div>
      </footer>
    </div>
  );
}
