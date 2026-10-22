// Bearbeitungs-Logik des Original-Editors (/workout/[id]/classic) als reine Funktionen
// (22.10.2026, Samuel: alle Funktionen des Original-Editors in den neuen Editor).
// Jede Funktion nimmt das Original-Datenformat (WorkoutConfig) und gibt eine NEUE Kopie
// zurück – dieselben Regeln wie im Original (Platzhalter „Wall Balls", mindestens eine
// Übung je Gruppe, Rotation beim Gruppen-Duplizieren, Symbol-Zuordnung beim Sortieren …).

import type { ExerciseEntry, ForTimeBlock, WorkoutConfig } from './types';

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x ?? null));

/** Original updateConfig: Werte setzen und fehlende Runden/Gruppen mit „Wall Balls" füllen. */
export function updateConfig(prev: WorkoutConfig, partial: Partial<WorkoutConfig>): WorkoutConfig {
  const next = { ...prev, ...partial };
  const rounds = { ...next.rounds };
  for (let r = 0; r < next.numRounds; r++) {
    if (!rounds[r]) rounds[r] = {};
    for (let g = 0; g < next.numGroups; g++) if (!rounds[r][g]) rounds[r][g] = ['Wall Balls'];
  }
  next.rounds = rounds;
  return next;
}

export function setExercise(prev: WorkoutConfig, r: number, g: number, i: number, name: string): WorkoutConfig {
  const rounds = clone(prev.rounds);
  if (!rounds[r]) rounds[r] = {};
  if (!rounds[r][g]) rounds[r][g] = [];
  rounds[r][g][i] = name;
  return { ...prev, rounds };
}

export function addExercise(prev: WorkoutConfig, r: number, g: number, name = 'Wall Balls'): WorkoutConfig {
  const rounds = clone(prev.rounds);
  if (!rounds[r]) rounds[r] = {};
  if (!rounds[r][g]) rounds[r][g] = [];
  rounds[r][g].push(name);
  return { ...prev, rounds };
}

export function removeExercise(prev: WorkoutConfig, r: number, g: number, i: number): WorkoutConfig {
  const rounds = clone(prev.rounds);
  if (rounds[r]?.[g]?.length > 1) rounds[r][g].splice(i, 1);
  return { ...prev, rounds };
}

export function reorderExercise(prev: WorkoutConfig, r: number, g: number, from: number, to: number): WorkoutConfig {
  if (from === to) return prev;
  const rounds = clone(prev.rounds);
  const list: string[] = rounds[r]?.[g];
  if (!Array.isArray(list) || from < 0 || to < 0 || from >= list.length || to >= list.length) return prev;
  const [moved] = list.splice(from, 1);
  list.splice(to, 0, moved);
  const iconOverrides = clone(prev.iconOverrides || {});
  const ov = iconOverrides[r]?.[g];
  if (ov && Object.keys(ov).length) {
    const order = list.map((_, i) => i);
    const [m] = order.splice(from, 1);
    order.splice(to, 0, m);
    const remapped: Record<number, string> = {};
    order.forEach((oldIdx, newIdx) => { if (ov[oldIdx] !== undefined) remapped[newIdx] = ov[oldIdx]; });
    iconOverrides[r][g] = remapped;
  }
  return { ...prev, rounds, iconOverrides };
}

/** Original duplicateGroup: Kopie direkt hinter der Gruppe, in ALLEN Runden, optional rotiert. */
export function duplicateGroup(prev: WorkoutConfig, g: number, rotateBy: number): WorkoutConfig {
  const n = prev.numGroups + 1;
  const rounds = clone(prev.rounds);
  const gts = clone(prev.groupTimeSettings || {});
  const icons = clone(prev.iconOverrides || {});
  const rotate = <T,>(arr: T[], by: number): T[] => {
    const len = arr.length;
    if (!len) return arr;
    const k = ((by % len) + len) % len;
    return k === 0 ? arr.slice() : arr.map((_, i) => arr[(i - k + len) % len]);
  };
  const at = g + 1;
  for (let r = 0; r < prev.numRounds; r++) {
    if (!rounds[r]) rounds[r] = {};
    for (let x = n - 1; x > at; x--) rounds[r][x] = rounds[r][x - 1];
    rounds[r][at] = rotate(clone(prev.rounds[r]?.[g] || ['Wall Balls']), rotateBy);
    if (gts[r]) {
      for (let x = n - 1; x > at; x--) { if (gts[r][x - 1] !== undefined) gts[r][x] = gts[r][x - 1]; else delete gts[r][x]; }
      if (gts[r][g] !== undefined) gts[r][at] = clone(gts[r][g]); else delete gts[r][at];
    }
    if (icons[r]) {
      for (let x = n - 1; x > at; x--) { if (icons[r][x - 1] !== undefined) icons[r][x] = icons[r][x - 1]; else delete icons[r][x]; }
      if (icons[r][g] !== undefined) {
        const src: Record<number, string> = icons[r][g];
        const len = (prev.rounds[r]?.[g] || []).length;
        const out: Record<number, string> = {};
        if (len > 0) {
          const k = ((rotateBy % len) + len) % len;
          Object.entries(src).forEach(([o, v]) => { out[(Number(o) + k) % len] = v as string; });
        }
        icons[r][at] = out;
      } else delete icons[r][at];
    }
  }
  return { ...prev, numGroups: n, rounds, groupTimeSettings: gts, iconOverrides: icons };
}

export function updateRoundSetting(prev: WorkoutConfig, r: number, field: 'workTime' | 'restTime', value: number | undefined): WorkoutConfig {
  const rs = { ...(prev.roundSettings || {}) };
  if (!rs[r]) rs[r] = {};
  if (value === undefined) {
    rs[r] = { ...rs[r] };
    delete rs[r][field];
    if (!Object.keys(rs[r]).length) delete rs[r];
  } else rs[r] = { ...rs[r], [field]: value };
  return { ...prev, roundSettings: rs };
}

export function updateGroupTimeSetting(prev: WorkoutConfig, r: number, g: number, field: 'workTime' | 'restTime', value: number | undefined): WorkoutConfig {
  const gts = clone(prev.groupTimeSettings || {});
  if (!gts[r]) gts[r] = {};
  if (!gts[r][g]) gts[r][g] = {};
  if (value === undefined) {
    delete gts[r][g][field];
    if (!Object.keys(gts[r][g]).length) delete gts[r][g];
    if (!Object.keys(gts[r]).length) delete gts[r];
  } else gts[r][g] = { ...gts[r][g], [field]: value };
  return { ...prev, groupTimeSettings: gts };
}

export function setIconOverride(prev: WorkoutConfig, r: number, g: number, i: number, key: string | null): WorkoutConfig {
  const o = clone(prev.iconOverrides || {});
  if (key === null) { if (o[r]?.[g]) delete o[r][g][i]; }
  else { if (!o[r]) o[r] = {}; if (!o[r][g]) o[r][g] = {}; o[r][g][i] = key; }
  return { ...prev, iconOverrides: o };
}

/** Original duplicateRound: Kopie direkt dahinter, samt Rundenzeiten, Gruppenzeiten, Symbolen. */
export function duplicateRound(prev: WorkoutConfig, r: number): WorkoutConfig {
  const n = prev.numRounds + 1;
  const rounds = clone(prev.rounds);
  const rs = clone(prev.roundSettings || {});
  const gts = clone(prev.groupTimeSettings || {});
  const icons = clone(prev.iconOverrides || {});
  for (let x = n - 1; x > r + 1; x--) {
    rounds[x] = rounds[x - 1];
    if (rs[x - 1]) rs[x] = rs[x - 1]; else delete rs[x];
    if (gts[x - 1]) gts[x] = gts[x - 1]; else delete gts[x];
    if (icons[x - 1]) icons[x] = icons[x - 1]; else delete icons[x];
  }
  rounds[r + 1] = clone(rounds[r]);
  if (rs[r]) rs[r + 1] = clone(rs[r]);
  if (gts[r]) gts[r + 1] = clone(gts[r]);
  if (icons[r]) icons[r + 1] = clone(icons[r]);
  return { ...prev, numRounds: n, rounds, roundSettings: rs, groupTimeSettings: gts, iconOverrides: icons };
}

/** Original randomFill: jede Position zufällig, keine Wiederholung direkt hintereinander, je Slot verschieden. */
export function randomFill(prev: WorkoutConfig, pool: string[]): WorkoutConfig {
  const rounds = clone(prev.rounds);
  for (let r = 0; r < prev.numRounds; r++) {
    if (!rounds[r]) rounds[r] = {};
    const prevEx: Record<number, string> = {};
    if (r > 0 && rounds[r - 1]) {
      for (let g = 0; g < prev.numGroups; g++) {
        const p = rounds[r - 1]?.[g];
        if (p && p.length) prevEx[g] = p[p.length - 1];
      }
    }
    const max = Math.max(...Array.from({ length: prev.numGroups }, (_, g) => rounds[r]?.[g]?.length || 1));
    for (let i = 0; i < max; i++) {
      const avail = [...pool];
      for (let k = avail.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [avail[k], avail[j]] = [avail[j], avail[k]]; }
      const used = new Set<string>();
      for (let g = 0; g < prev.numGroups; g++) {
        if (!rounds[r][g]) rounds[r][g] = [];
        if (i >= rounds[r][g].length) continue;
        const before = i === 0 ? prevEx[g] : rounds[r][g][i - 1];
        let pick = avail.find((x) => !used.has(x) && x !== before);
        if (!pick) pick = avail.find((x) => x !== before);
        if (!pick) pick = avail[0] || 'Wall Balls';
        rounds[r][g][i] = pick;
        used.add(pick);
      }
    }
  }
  return { ...prev, rounds };
}

// ---------- AMRAP (workout_mode 'fortime') ----------
export function getBlocks(c: WorkoutConfig): ForTimeBlock[] {
  if (c.forTimeBlocks && c.forTimeBlocks.length > 0) return c.forTimeBlocks;
  return [{ exercises: c.forTimeExercises || {} }];
}
export function setBlocks(prev: WorkoutConfig, blocks: ForTimeBlock[]): WorkoutConfig {
  return { ...prev, forTimeBlocks: blocks, forTimeExercises: blocks[0]?.exercises || {} };
}
export function addBlock(prev: WorkoutConfig): WorkoutConfig {
  const b: ForTimeBlock = { exercises: {} };
  for (let g = 0; g < prev.numGroups; g++) b.exercises[g] = [{ name: 'Wall Balls', reps: 10 }];
  return setBlocks(prev, [...getBlocks(prev), b]);
}
export function duplicateBlock(prev: WorkoutConfig, b: number): WorkoutConfig {
  const blocks = clone(getBlocks(prev));
  if (!blocks[b]) return prev;
  blocks.splice(b + 1, 0, clone(blocks[b]));
  return setBlocks(prev, blocks);
}
export function removeBlock(prev: WorkoutConfig, b: number): WorkoutConfig {
  const blocks = getBlocks(prev);
  if (blocks.length <= 1) return prev;
  return setBlocks(prev, blocks.filter((_, i) => i !== b));
}
function withGroup(prev: WorkoutConfig, b: number, g: number, fn: (list: ExerciseEntry[]) => ExerciseEntry[] | void): WorkoutConfig {
  const blocks = clone(getBlocks(prev));
  if (!blocks[b]) return prev;
  if (!blocks[b].exercises[g]) blocks[b].exercises[g] = [];
  const out = fn(blocks[b].exercises[g]);
  if (out) blocks[b].exercises[g] = out;
  return setBlocks(prev, blocks);
}
export function updateFt(prev: WorkoutConfig, b: number, g: number, i: number, upd: Partial<ExerciseEntry>): WorkoutConfig {
  return withGroup(prev, b, g, (l) => { l[i] = { ...l[i], ...upd }; });
}
export function addFt(prev: WorkoutConfig, b: number, g: number, name = 'Wall Balls'): WorkoutConfig {
  return withGroup(prev, b, g, (l) => { l.push({ name, reps: 10 }); });
}
export function addFtNote(prev: WorkoutConfig, b: number, g: number): WorkoutConfig {
  return withGroup(prev, b, g, (l) => { l.push({ name: '', isNote: true }); });
}
export function removeFt(prev: WorkoutConfig, b: number, g: number, i: number): WorkoutConfig {
  return withGroup(prev, b, g, (l) => { if (l.length > 1) l.splice(i, 1); });
}
export function moveFt(prev: WorkoutConfig, b: number, g: number, from: number, to: number): WorkoutConfig {
  if (from === to) return prev;
  return withGroup(prev, b, g, (l) => {
    if (to < 0 || to >= l.length || from < 0 || from >= l.length) return;
    const [m] = l.splice(from, 1);
    l.splice(to, 0, m);
  });
}
export function pasteFtGroup(prev: WorkoutConfig, b: number, g: number, exercises: ExerciseEntry[]): WorkoutConfig {
  return withGroup(prev, b, g, () => clone(exercises));
}
