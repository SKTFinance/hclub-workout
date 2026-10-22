// KI-Workout-Baukasten (21.10.2026, Samuel: „du schreibst die Übungen untereinander
// und er stellt daraus automatisiert Workouts zusammen").
//
// Zwei Hälften:
//   1. AI_WORKOUT_SCHEMA — das JSON, das Gemini liefern MUSS (responseSchema).
//   2. aiDraftToWorkout() — übersetzt diesen Entwurf in das BESTEHENDE Format der App
//      (workout_mode + WorkoutConfig). Es gibt kein neues Datenformat und keine neue
//      Tabelle: ein KI-Workout ist danach ein ganz normales Workout.
//
// Abbildung der Formate auf die beiden Modi der App:
//   AMRAP     → 'fortime' mit Rundentimer (forTimeRoundTimerEnabled)
//   FOR_TIME  → 'fortime' ohne Timer bzw. mit Time-Cap als Rundentimer; Runden über
//               forTimeTargetRounds (Gruppe beginnt den Zirkel von vorn, bis die Zahl erreicht ist)
//   EMOM      → 'timed', 60 s Arbeit / 0 s Pause, Minuten nacheinander in EINER Runde
//               (sonst schöbe die 3-s-Ansage zwischen den Runden die Minuten)
//   INTERVALS → 'timed' mit Arbeit/Pause/Runden/Rundenpause

import type { ExerciseEntry, ForTimeBlock, WorkoutConfig, WorkoutMode } from './types';

export type AiFormat = 'AMRAP' | 'FOR_TIME' | 'EMOM' | 'INTERVALS';

export interface AiExercise {
  name: string;
  reps?: number;
  distance?: string;
  seconds?: number;
  weight?: string;
}

export interface AiBlock {
  title?: string;
  format: AiFormat;
  minutes?: number;          // AMRAP-Dauer, EMOM-Minuten, Time-Cap bei FOR_TIME
  rounds?: number;           // FOR_TIME-Runden, INTERVALS-Runden
  workSeconds?: number;      // INTERVALS
  restSeconds?: number;      // INTERVALS
  stations: AiExercise[][];  // parallele Gruppen; meist genau eine
}

export interface AiDraft {
  name: string;
  /** Hyrox oder CrossFit (V3). Bestimmt Übungsauswahl der KI und Darstellung. */
  discipline?: 'hyrox' | 'crossfit';
  summary?: string;
  blocks: AiBlock[];
  restBetweenBlocksSeconds?: number;
  scaling?: string[];
  notes?: string[];
}

// Gemini responseSchema (OpenAPI-Teilmenge). Keine Union-Typen, alles optional außer Kern.
export const AI_WORKOUT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    name: { type: 'STRING', description: 'Short punchy workout name, max 28 chars' },
    summary: { type: 'STRING', description: 'One sentence, what the athlete does' },
    blocks: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING' },
          format: { type: 'STRING', enum: ['AMRAP', 'FOR_TIME', 'EMOM', 'INTERVALS'] },
          minutes: { type: 'INTEGER' },
          rounds: { type: 'INTEGER' },
          workSeconds: { type: 'INTEGER' },
          restSeconds: { type: 'INTEGER' },
          stations: {
            type: 'ARRAY',
            description: 'Parallel groups/stations. Usually exactly one group containing all movements in order.',
            items: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  name: { type: 'STRING', description: 'Movement name in English, title case, no numbers (e.g. "Wall Balls")' },
                  reps: { type: 'INTEGER' },
                  distance: { type: 'STRING', description: 'e.g. "500m", "1km", "20 cal"' },
                  seconds: { type: 'INTEGER' },
                  weight: { type: 'STRING', description: 'e.g. "24/16 kg", "9/6 kg", "60% 1RM"' },
                },
                required: ['name'],
              },
            },
          },
        },
        required: ['format', 'stations'],
      },
    },
    restBetweenBlocksSeconds: { type: 'INTEGER' },
    scaling: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Scaling options, short, without a "Scaled:" prefix, e.g. "Wall Balls 6/4 kg"' },
    notes: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['name', 'blocks'],
} as const;

export const AI_SYSTEM_PROMPT = `You are a CrossFit / HYROX head coach who turns a coach's rough notes into a precise, runnable workout for a gym timer app.

Input: free text, often one movement per line, maybe German, Spanish or English, with abbreviations (WB = Wall Balls, KBS = Kettlebell Swings, T2B = Toes to Bar, DU = Double Unders, BBJ = Burpee Broad Jump, Cal = calories, HSPU, C2B, etc).

Rules:
- Detect the format. Keywords: "AMRAP 12" / "12 min AMRAP" → AMRAP minutes 12. "For Time", "3 RFT", "3 rounds for time" → FOR_TIME rounds 3. "EMOM 10", "E2MOM" → EMOM (minutes = total minutes; for E2MOM still give total minutes and list each movement once). "Tabata" → exactly ONE INTERVALS block with workSeconds 20, restSeconds 10, rounds 8, all listed movements in the same station list (they alternate), never split per movement and never workSeconds above 120 for Tabata. "40/20 x 4" → INTERVALS work 40 rest 20 rounds 4.
- If the format is NOT stated: pick the most sensible one for the movement list and say so in summary. Default: AMRAP 12 for 3 to 6 movements, FOR_TIME for long chippers.
- Time cap for FOR_TIME goes into minutes.
- Several parts ("Part A ... Part B", "then", blank line between pieces with their own format) become several blocks, in order.
- Keep the coach's order. Every movement once per round. Movement names in English, Title Case, singular form as commonly written in CrossFit ("Wall Balls", "Pull-ups", "Burpees", "Row", "SkiErg", "Run", "Kettlebell Swings", "Box Jumps", "Thrusters", "Deadlifts", "Sled Push").
- Numbers go into reps / distance / seconds, never into name. Rowing / ski / bike calories: distance "15 cal".
- Rx weights (male/female) into weight, e.g. "24/16 kg". Convert lbs to kg rounded to common plates if given in lbs.
- Only use parallel stations (more than one inner array) when the coach clearly describes several groups working at the same time ("Group 1 / Group 2", "Station A / Station B").
- scaling: 1 to 3 short, practical scaling options (lighter weight, fewer reps, movement substitution). notes: only instructions the coach literally wrote that are not movements (e.g. "halve the distance every round"). Usually empty. Never describe the workout in notes.
- Never invent extra movements. Never output empty stations.
- Exception to "never invent": if the coach only DESCRIBES an idea ("30 minute hyrox engine with sled and wall balls", "short upper body burner with pauses") instead of listing movements, design a complete, sensible workout yourself that matches the description, including work/rest seconds, rounds, reps, distances and loads.
- Spoken notes may be messy ("forty seconds on twenty off, four rounds"). Turn spoken numbers into numbers.`;

export const DISCIPLINE_PROMPT: Record<'hyrox' | 'crossfit', string> = {
  hyrox: `Workout type: HYROX. Build a HYROX-style workout. Prefer the HYROX stations and running: Run, SkiErg, Sled Push, Sled Pull, Burpee Broad Jumps, Row, Farmers Carry, Sandbag Lunges, Wall Balls (plus Echo Bike / Kettlebell work as accessory). Distances in metres (e.g. "1000m" SkiErg, "50m" Sled Push). A classic CrossFit movement (barbell, gymnastics) is fine ONLY if the coach names it or it clearly fits as a single accessory.`,
  crossfit: `Workout type: CROSSFIT. Build a CrossFit-style workout with classic functional movements: barbell (Thrusters, Deadlifts, Cleans, Snatches, Front Squats), dumbbell/kettlebell, gymnastics (Pull-ups, Toes to Bar, Push-ups, Handstand Push-ups, Box Jumps, Double Unders), monostructural (Row, Echo Bike, Run). A HYROX station (Sled, SkiErg, Farmers Carry, Sandbag Lunges) is fine ONLY if the coach names it or it clearly fits as a single piece.`,
};

function cleanInt(n: unknown, min: number, max: number): number | undefined {
  const v = typeof n === 'number' ? Math.round(n) : parseInt(String(n ?? ''), 10);
  if (!Number.isFinite(v) || v < min) return undefined;
  return Math.min(v, max);
}

function cleanText(s: unknown, max = 60): string | undefined {
  if (typeof s !== 'string') return undefined;
  const t = s.trim().replace(/\s+/g, ' ');
  return t ? t.slice(0, max) : undefined;
}

// Validiert und kappt den KI-Entwurf. Alles, was nicht passt, fällt still weg —
// die Oberfläche zeigt danach nur, was wirklich ankam.
export function sanitizeDraft(raw: unknown): AiDraft {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const formats: AiFormat[] = ['AMRAP', 'FOR_TIME', 'EMOM', 'INTERVALS'];
  const blocks: AiBlock[] = (Array.isArray(r.blocks) ? r.blocks : [])
    .slice(0, 6)
    .map((b) => {
      const o = (b && typeof b === 'object' ? b : {}) as Record<string, unknown>;
      const format = formats.includes(o.format as AiFormat) ? (o.format as AiFormat) : 'AMRAP';
      const stations = (Array.isArray(o.stations) ? o.stations : [])
        .slice(0, 10)
        .map((g) => (Array.isArray(g) ? g : [])
          .slice(0, 20)
          .map((e) => {
            const x = (e && typeof e === 'object' ? e : {}) as Record<string, unknown>;
            const name = cleanText(x.name, 48);
            if (!name) return null;
            const ex: AiExercise = { name };
            const reps = cleanInt(x.reps, 1, 999);
            const distance = cleanText(x.distance, 16);
            const seconds = cleanInt(x.seconds, 1, 3600);
            const weight = cleanText(x.weight, 24);
            if (reps) ex.reps = reps;
            if (distance) ex.distance = distance;
            if (seconds) ex.seconds = seconds;
            if (weight) ex.weight = weight;
            return ex;
          })
          .filter((e): e is AiExercise => !!e))
        .filter((g) => g.length > 0);
      if (format === 'INTERVALS' && typeof o.workSeconds === 'number' && o.workSeconds >= 300 && /tabata/i.test(String(r.name || '') + String(r.summary || ''))) { o.workSeconds = 20; o.restSeconds = 10; }
      return {
        title: cleanText(o.title, 40),
        format,
        minutes: cleanInt(o.minutes, 1, 120),
        rounds: cleanInt(o.rounds, 1, 50),
        workSeconds: cleanInt(o.workSeconds, 5, 600),
        restSeconds: cleanInt(o.restSeconds, 0, 600) ?? (typeof o.restSeconds === 'number' ? 0 : undefined),
        stations,
      } as AiBlock;
    })
    .filter((b) => b.stations.length > 0);

  return {
    name: cleanText(r.name, 40) || 'New Workout',
    discipline: r.discipline === 'hyrox' || r.discipline === 'crossfit' ? r.discipline : undefined,
    summary: cleanText(r.summary, 200),
    blocks,
    restBetweenBlocksSeconds: cleanInt(r.restBetweenBlocksSeconds, 0, 900),
    scaling: (Array.isArray(r.scaling) ? r.scaling : [])
      .map((s) => cleanText(typeof s === 'string' ? s.replace(/^\s*scal(e|ed|ing)\s*:\s*/i, '') : s, 90))
      .filter(Boolean).slice(0, 4) as string[],
    notes: (Array.isArray(r.notes) ? r.notes : []).map((s) => cleanText(s, 120)).filter(Boolean).slice(0, 4) as string[],
  };
}

// Was der Coach ausdrücklich an Zeiten schreibt, gilt – auch wenn die KI sich vertut.
// Gemessen 22.10.: „40 sec work 20 rest, 3 rounds" kam als workSeconds 600 / rounds leer zurück.
export function applyExplicitTiming(draft: AiDraft, text: string): AiDraft {
  const t = ` ${String(text || '').toLowerCase().replace(/\n/g, ' ')} `;
  const sec = '(?:s|sec|secs|second|seconds|sek|sekunden|seg|segundos)\\b';
  // „40/20 x 4" oder „40/20s" – Lasten wie „24/16" bleiben unberührt.
  const pair = /(\d{2,3})\s*\/\s*(\d{1,3})\s*(?:x|×|s\b|sec)/.exec(t);
  const work = new RegExp(`(\\d{1,3})\\s*(?:${sec})?\\s*(?:on|work|arbeit|trabajo)\\b`).exec(t) || new RegExp(`(?:work|arbeit)\\s*(\\d{1,3})\\s*${sec}`).exec(t);
  const rest = new RegExp(`(\\d{1,3})\\s*(?:${sec})?\\s*(?:off|rest|pause|descanso)\\b`).exec(t) || new RegExp(`(?:rest|pause)\\s*(\\d{1,3})\\s*${sec}`).exec(t);
  const rounds = /(\d{1,2})\s*(?:rounds?|runden|rondas)\b/.exec(t) || /\d\s*[x×]\s*(\d{1,2})\b(?!\s*(?:kg|lb))/.exec(t);
  const b = draft.blocks[0];
  if (!b || b.format !== 'INTERVALS') return draft;
  let w = work ? parseInt(work[1], 10) : undefined;
  let r = rest ? parseInt(rest[1], 10) : undefined;
  if (pair && w === undefined && r === undefined) { w = parseInt(pair[1], 10); r = parseInt(pair[2], 10); }
  if (w && w >= 5 && w <= 600) b.workSeconds = w;
  if (r !== undefined && r >= 0 && r <= 600) b.restSeconds = r;
  if (rounds) { const n = parseInt(rounds[1], 10); if (n >= 1 && n <= 50) b.rounds = n; }
  // Unplausibel lange Arbeitsphasen ohne Minutenangabe im Text kappen.
  if ((b.workSeconds || 0) > 300 && !/\bmin/.test(t)) b.workSeconds = 40;
  return draft;
}

/** Fehlende Werte mit den Standardwerten füllen, die auch die Umwandlung nutzt (Editor zeigt echte Zahlen). */
export function withDefaults(draft: AiDraft): AiDraft {
  return {
    ...draft,
    blocks: draft.blocks.map((b) => {
      if (b.format === 'INTERVALS') return { ...b, workSeconds: b.workSeconds ?? 40, restSeconds: b.restSeconds ?? 20, rounds: b.rounds ?? 4 };
      if (b.format === 'AMRAP') return { ...b, minutes: b.minutes ?? 12 };
      if (b.format === 'EMOM') return { ...b, minutes: b.minutes ?? Math.max((b.stations[0]?.length || 1) * 3, 10) };
      return b;
    }),
  };
}

// Ein Timed-Workout kennt nur Übungsnamen. Wiederholungen und Gewicht wandern
// deshalb in den Namen — das Bild findet die Übung trotzdem per Stichwort.
export function timedLabel(e: AiExercise): string {
  const parts: string[] = [];
  if (e.distance) parts.push(e.distance);
  else if (e.reps) parts.push(String(e.reps));
  parts.push(e.name);
  let s = parts.join(' ');
  if (e.weight) s += ` @ ${e.weight}`;
  return s;
}

function toEntry(e: AiExercise): ExerciseEntry {
  const out: ExerciseEntry = { name: e.name };
  if (e.distance) out.distance = e.distance;
  else if (e.reps) out.reps = e.reps;
  else if (e.seconds) out.duration = e.seconds;
  if (e.weight) out.weight = e.weight;
  return out;
}

function noteEntries(lines: string[] | undefined, prefix = ''): ExerciseEntry[] {
  // Alle Zeilen in EINE Notiz: auf dem TV-Bildschirm ist ein ruhiger Kasten
  // besser lesbar als drei gelbe Streifen untereinander.
  const l = (lines || []).filter(Boolean);
  return l.length ? [{ name: `${prefix}${l.join(' · ')}`, isNote: true }] : [];
}

// Umkehrung (V3): ein gespeichertes Workout als bearbeitbarer Entwurf für den neuen Editor.
// Verlustarm für alles, was der Editor kennt; bei Timed-Workouts mit je Runde
// VERSCHIEDENEN Übungen zählt die erste Runde (Hinweis im Editor über adjustments).
function parseTimedLabel(raw: string): AiExercise {
  const [head, ...rest] = String(raw || '').split(' @ ');
  const weight = rest.length ? rest.join(' @ ').trim() : undefined;
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*(km|kcal|cal|m)?\s+(.+)$/i.exec(head);
  if (!m) return { name: head.trim() || 'Exercise', ...(weight ? { weight } : {}) };
  const unit = (m[2] || '').toLowerCase();
  const ex: AiExercise = { name: m[3].trim() };
  if (unit) ex.distance = unit === 'm' || unit === 'km' ? `${m[1]}${unit}` : `${m[1]} ${unit}`;
  else ex.reps = parseInt(m[1], 10);
  if (weight) ex.weight = weight;
  return ex;
}

export function workoutToDraft(w: { name: string; workout_mode?: WorkoutMode; config: WorkoutConfig }): AiDraft {
  const c = w.config;
  const groups = Math.max(1, c.numGroups || 1);
  const discipline = c.discipline;
  if (w.workout_mode === 'fortime' && c.forTimeBlocks?.length) {
    const timer = !!c.forTimeRoundTimerEnabled;
    const blocks: AiBlock[] = c.forTimeBlocks.map((b): AiBlock => ({
      format: timer ? 'AMRAP' : 'FOR_TIME',
      minutes: timer ? (c.forTimeRoundTimerMinutes || 12) : undefined,
      rounds: c.forTimeTargetRounds,
      stations: Array.from({ length: groups }, (_, g) => (b.exercises?.[g] || [])
        .filter((e) => !e.isNote && e.name?.trim())
        .map((e) => {
          const x: AiExercise = { name: e.name };
          if (e.distance) x.distance = e.distance;
          if (e.reps) x.reps = e.reps;
          if (e.duration) x.seconds = e.duration;
          if (e.weight) x.weight = e.weight;
          return x;
        })).filter((g) => g.length),
    })).filter((b) => b.stations.length);
    return { name: w.name, discipline, blocks, restBetweenBlocksSeconds: c.roundRestTime || undefined };
  }
  const isEmom = /^emom/i.test(c.formatLabel || '') || (c.numRounds === 1 && c.workTime === 60 && c.restTime === 0);
  const r0 = c.rounds?.[0] || {};
  if (isEmom) {
    const minutes = (r0[0] || []).length || 10;
    const stations = Array.from({ length: groups }, (_, g) => {
      const list = r0[g] || [];
      // Wiederholte Minutenfolge auf die Grundliste zurückführen.
      let p = list.length;
      for (let n = 1; n <= list.length; n++) if (list.every((x, i) => x === list[i % n])) { p = n; break; }
      return list.slice(0, p).map(parseTimedLabel);
    }).filter((g) => g.length);
    return { name: w.name, discipline, blocks: [{ format: 'EMOM', minutes, stations }] };
  }
  const stations = Array.from({ length: groups }, (_, g) => (r0[g] || []).map(parseTimedLabel)).filter((g) => g.length);
  return {
    name: w.name, discipline,
    blocks: [{ format: 'INTERVALS', workSeconds: c.workTime || 40, restSeconds: c.restTime ?? 20, rounds: c.numRounds || 1, stations }],
    restBetweenBlocksSeconds: c.roundRestTime || undefined,
  };
}

export interface ConvertedWorkout {
  name: string;
  workout_mode: WorkoutMode;
  config: WorkoutConfig;
  /** Was beim Umwandeln angepasst wurde (für den Hinweis in der Oberfläche). */
  adjustments: string[];
}

const BASE: Omit<WorkoutConfig, 'rounds'> = {
  numGroups: 1,
  numRounds: 1,
  workTime: 60,
  restTime: 0,
  roundRestTime: 0,
  warmupTime: 10,
};

export function aiDraftToWorkout(draft: AiDraft): ConvertedWorkout {
  const adjustments: string[] = [];
  const blocks = draft.blocks;
  if (blocks.length === 0) throw new Error('The AI did not return any movements.');

  // Die App kann pro Workout EINEN Modus. Gemischte Teile (z. B. EMOM + AMRAP)
  // laufen über den Modus des ersten Teils; die übrigen werden passend gemacht.
  const first = blocks[0];
  const timed = first.format === 'EMOM' || first.format === 'INTERVALS';

  if (!timed) {
    const amrapBlocks = blocks.filter((b) => b.format === 'AMRAP' || b.format === 'FOR_TIME');
    if (amrapBlocks.length < blocks.length) adjustments.push('Interval parts were converted to circuit blocks.');
    const numGroups = Math.max(1, ...amrapBlocks.map((b) => b.stations.length));
    const isAmrap = first.format === 'AMRAP';
    const minutes = first.minutes || (isAmrap ? 12 : undefined);
    const forTimeBlocks: ForTimeBlock[] = amrapBlocks.map((b, bIdx) => {
      const exercises: ForTimeBlock['exercises'] = {};
      for (let g = 0; g < numGroups; g++) {
        const list = (b.stations[g] || b.stations[0]).map(toEntry);
        // Skalierung und Notizen gelten für den ganzen Block → als Notiz an jede Gruppe.
        if (bIdx === 0) list.push(...noteEntries(draft.scaling, 'Scale: '), ...noteEntries(draft.notes));
        exercises[g] = list;
      }
      return { exercises };
    });
    if (amrapBlocks.some((b, i) => i > 0 && b.minutes && b.minutes !== minutes)) {
      adjustments.push(`All blocks use the ${minutes ?? 'same'}-minute timer.`);
    }
    const rounds: WorkoutConfig['rounds'] = { 0: {} };
    for (let g = 0; g < numGroups; g++) rounds[0][g] = [forTimeBlocks[0].exercises[g]?.[0]?.name || 'Run'];
    const config: WorkoutConfig = {
      ...BASE,
      numGroups,
      rounds,
      workTime: 0,
      roundRestTime: draft.restBetweenBlocksSeconds ?? (forTimeBlocks.length > 1 ? 90 : 0),
      forTimeBlocks,
      forTimeRoundTimerEnabled: !!minutes,
      forTimeRoundTimerMinutes: minutes || 12,
      formatLabel: isAmrap ? `AMRAP ${minutes}` : `For Time${first.rounds && first.rounds > 1 ? ` · ${first.rounds} rounds` : ''}${minutes ? ` · cap ${minutes}` : ''}`,
    };
    if (!isAmrap && first.rounds && first.rounds > 1) config.forTimeTargetRounds = first.rounds;
    if (draft.discipline) config.discipline = draft.discipline;
    return { name: draft.name, workout_mode: 'fortime', config, adjustments };
  }

  // ---- Timed (EMOM / Intervalle) ----
  const timedBlocks = blocks.filter((b) => b.format === 'EMOM' || b.format === 'INTERVALS');
  if (timedBlocks.length < blocks.length) adjustments.push('Circuit parts were converted to intervals.');
  const numGroups = Math.max(1, ...timedBlocks.map((b) => b.stations.length));
  const b = first;
  let workTime: number;
  let restTime: number;
  let numRounds: number;
  let roundRestTime: number;
  const rounds: WorkoutConfig['rounds'] = {};

  if (b.format === 'EMOM') {
    const minutes = b.minutes || Math.max(b.stations[0].length * 3, 10);
    workTime = 60;
    restTime = 0;
    roundRestTime = 0;
    numRounds = 1;
    rounds[0] = {};
    for (let g = 0; g < numGroups; g++) {
      const list = (b.stations[g] || b.stations[0]).map(timedLabel);
      rounds[0][g] = Array.from({ length: minutes }, (_, m) => list[m % list.length]);
    }
  } else {
    workTime = b.workSeconds || 40;
    restTime = b.restSeconds ?? 20;
    const r = b.rounds || 4;
    const list0 = b.stations[0].map(timedLabel);
    if (list0.length === 1) {
      // Tabata-artig: eine Übung, viele Runden → eine Runde mit r Durchgängen,
      // die Pause zwischen den Durchgängen ist die normale Pause.
      numRounds = 1;
      roundRestTime = 0;
      rounds[0] = {};
      for (let g = 0; g < numGroups; g++) {
        const l = (b.stations[g] || b.stations[0]).map(timedLabel);
        rounds[0][g] = Array.from({ length: r }, () => l[0]);
      }
    } else {
      numRounds = r;
      roundRestTime = draft.restBetweenBlocksSeconds ?? 60;
      for (let ri = 0; ri < r; ri++) {
        rounds[ri] = {};
        for (let g = 0; g < numGroups; g++) rounds[ri][g] = (b.stations[g] || b.stations[0]).map(timedLabel);
      }
    }
  }
  if (timedBlocks.length > 1) adjustments.push('Only the first interval part is timed; add the others as a second workout.');
  const config: WorkoutConfig = {
    ...BASE,
    numGroups,
    numRounds,
    workTime,
    restTime,
    roundRestTime,
    rounds,
    formatLabel: b.format === 'EMOM' ? `EMOM ${b.minutes || ''}`.trim() : `${workTime}/${restTime} × ${b.rounds || 4}`,
  };
  if (draft.discipline) config.discipline = draft.discipline;
  return { name: draft.name, workout_mode: 'timed', config, adjustments };
}
