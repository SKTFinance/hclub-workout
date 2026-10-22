// Gestaltungssystem V3 (22.10.2026): Hyrox und CrossFit sind zwei getrennte Welten.
//
// Samuel: „CrossFit und Hyrox, das sollten wir nicht vermischen … im Zweifel soll bei
// beiden Modi auch mal eine Übung der anderen Art möglich sein. Die sollen in der Anzeige
// anders dargestellt sein." und „Im Workout alles in Hellblau … ich kann nichts
// unterscheiden."
//
// Deshalb hier an EINER Stelle:
//  - die Art eines Workouts (Hyrox / CrossFit) mit Akzentfarbe und Kurzzeichen,
//  - die Art einer einzelnen Übung (Hyrox-Station oder klassische Übung),
//  - die Stationsfarben, damit jede Übung im Ablauf eine eigene Farbe trägt.

export type Discipline = 'hyrox' | 'crossfit';

export const DISCIPLINES: Record<Discipline, { label: string; short: string; accent: string; ink: string; tagline: string }> = {
  hyrox: { label: 'Hyrox', short: 'HX', accent: '#F5C84B', ink: '#1a1405', tagline: 'Run · Ski · Sled · Row · Carry · Wall balls' },
  crossfit: { label: 'CrossFit', short: 'CF', accent: '#FF6B57', ink: '#200805', tagline: 'Barbell · Gymnastics · Monostructural' },
};

// Die acht Hyrox-Stationen plus Laufen. Alles andere zählt als klassische (CrossFit-)Übung.
const HYROX_PATTERNS: RegExp[] = [
  /\bski\s*-?\s*erg\b|\bski\b/i,
  /\bsled\b/i,
  /burpee\s*broad\s*jump|\bbbj\b/i,
  /\brow(ing|er)?\b/i,
  /farmer'?s?\s*carry|\bfarmers?\b/i,
  /sandbag\s*lunge/i,
  /\bwall\s*balls?\b|\bwb\b/i,
  /\brun(ning)?\b|\d+\s*m\s*run/i,
];

export function exerciseKind(name: string): Discipline {
  const n = (name || '').toLowerCase();
  return HYROX_PATTERNS.some((r) => r.test(n)) ? 'hyrox' : 'crossfit';
}

// Übungen, die in BEIDEN Welten zu Hause sind (Rudern, Laufen, Wall Balls, Burpees,
// Kettlebell, Echo Bike …): nie als „fremd" markieren.
const SHARED_PATTERNS: RegExp[] = [
  /\brow(ing|er)?\b/i, /\brun(ning)?\b|\d+\s*m\s*run/i, /\bwall\s*balls?\b|\bwb\b/i,
  /\bburpees?\b(?!\s*broad)/i, /kettlebell|\bkb\b/i, /echo\s*bike|assault|air\s*bike|\bbike\b/i,
  /\blunges?\b(?!.*sandbag)/i, /box\s*(jump|step)/i, /jump\s*rope|double\s*unders?|\bdu\b/i,
];

/**
 * Art einer Übung, wenn sie NICHT zur Art des Workouts gehört (dann wird sie anders
 * dargestellt), sonst null. Gemeinsame Übungen sind nie fremd.
 */
export function crossoverKind(name: string, workout: Discipline | undefined): Discipline | null {
  if (!workout || !name) return null;
  const n = name.toLowerCase();
  const hyroxOnly = HYROX_PATTERNS.some((r) => r.test(n)) && !SHARED_PATTERNS.some((r) => r.test(n));
  const shared = SHARED_PATTERNS.some((r) => r.test(n));
  if (workout === 'crossfit') return hyroxOnly ? 'hyrox' : null;
  return !hyroxOnly && !shared && !HYROX_PATTERNS.some((r) => r.test(n)) ? 'crossfit' : null;
}

/** true, wenn die Übung nicht zur Art des Workouts gehört (soll anders aussehen). */
export function isCrossover(name: string, workout: Discipline | undefined): boolean {
  return crossoverKind(name, workout) !== null;
}

// Stationsfarben: gleiche Helligkeit, klar verschiedene Farbtöne, auf dunklem Grund
// lesbar. Reihenfolge so, dass Nachbarn sich stark unterscheiden.
// Passend zum Hybryd-Blau (#22BFCC), aber klar davon und voneinander unterscheidbar:
// gleiche Helligkeit, kühle Grundstimmung, kein Türkis (das ist die Markenfarbe),
// kein reines Gelb/Koralle (Kennfarben Hyrox/CrossFit).
export const STATION_COLORS = [
  '#6EE7A8', // mint
  '#A99BFF', // lavendel
  '#FFB27A', // aprikose
  '#7CB8FF', // kornblume
  '#F58FD0', // orchidee
  '#C4E86B', // limette
  '#9FE3FF', // eisblau
  '#FF9C9C', // rosé
];

/** Übungsname ohne Menge/Last („12 cal Echo Bike @ 20 kg" → „echo bike"). */
export function exerciseKey(raw: string): string {
  return String(raw || '').split(' @ ')[0].replace(/^\s*\d+(?:[.,]\d+)?\s*(km|kcal|cal|m|x|s|sec)?\s+/i, '').trim().toLowerCase();
}

/**
 * Farbe je ÜBUNG statt je Position (Samuel-Foto 22.10. 11:35: drei Gruppen, alle an
 * Station 2 → alle gleich gefärbt). Jede verschiedene Übung des Workouts bekommt in
 * Reihenfolge des ersten Auftretens eine eigene Farbe; dieselbe Übung bleibt überall gleich.
 */
export function makeExerciseColors(names: string[]): (name: string) => string {
  const keys: string[] = [];
  for (const n of names) { const k = exerciseKey(n); if (k && !keys.includes(k)) keys.push(k); }
  return (name: string) => stationColor(Math.max(0, keys.indexOf(exerciseKey(name))));
}

export function stationColor(i: number): string {
  return STATION_COLORS[((i % STATION_COLORS.length) + STATION_COLORS.length) % STATION_COLORS.length];
}

/**
 * Art eines gespeicherten Workouts. Neue Workouts tragen `config.discipline`;
 * ältere werden aus ihren Übungen geschätzt (Mehrheit entscheidet).
 */
export function workoutDiscipline(config: { discipline?: Discipline; rounds?: Record<number, Record<number, string[]>>; forTimeBlocks?: { exercises: Record<number, { name: string }[]> }[]; amrapBlocks?: { exercises: Record<number, { name: string }[]> }[] } | null | undefined): Discipline {
  if (!config) return 'crossfit';
  if (config.discipline === 'hyrox' || config.discipline === 'crossfit') return config.discipline;
  const names: string[] = [];
  Object.values(config.rounds || {}).forEach((r) => Object.values(r || {}).forEach((g) => (g || []).forEach((n) => names.push(n))));
  [...(config.forTimeBlocks || []), ...(config.amrapBlocks || [])].forEach((b) =>
    Object.values(b.exercises || {}).forEach((g) => (g || []).forEach((e) => names.push(e.name))));
  if (!names.length) return 'crossfit';
  const hx = names.filter((n) => exerciseKind(n) === 'hyrox').length;
  return hx * 2 >= names.length ? 'hyrox' : 'crossfit';
}

// Fokuspunkt der Übungsbilder: Personen stehen meist im oberen Drittel. „center 22%"
// verhindert abgeschnittene Köpfe bei breiten Ausschnitten (Echo Bike, 22.10.).
// Nachtrag 22.10. 11:35: „center 15%" schnitt Bilder mit tief stehender Person (Sled Pull)
// ab. Alle Übungsbilder sind 4:3; wo die Box ein anderes Format hat, zeigt die Live-Ansicht
// das Bild jetzt ganz (contain) vor einer unscharfen Kopie. Für 4:3-Boxen reicht „center".
export const IMAGE_FOCUS = 'center';
