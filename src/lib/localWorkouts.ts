'use client';

// Vorschau-eigene Speicherung (V3, 22.10.2026).
// Auf der Vercel-VORSCHAU und lokal darf „Save workout" nicht in die Live-Tabelle
// hybryd_workouts schreiben (dort liegen Davids echte Workouts). Gespeichert wird dann
// im Browser (localStorage), mit eigener ID „local-…". Die Übersicht zeigt diese
// Workouts zusammen mit den gelesenen Live-Workouts an, die Live-Ansicht kann sie starten.
// In Produktion (NEXT_PUBLIC_VERCEL_ENV = production) bleibt alles wie bisher: Datenbank.

import type { Workout } from './types';
import type { AiDraft } from './aiWorkout';

export const USE_LOCAL_STORE = process.env.NEXT_PUBLIC_VERCEL_ENV !== 'production';

const KEY = 'hybryd_local_workouts_v1';

export interface LocalWorkout extends Workout {
  /** Der bearbeitbare Entwurf, aus dem das Workout entstand (für „Edit"). */
  draft?: AiDraft;
}

export function isLocalId(id: string | undefined | null): boolean {
  return !!id && id.startsWith('local-');
}

function readAll(): LocalWorkout[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeAll(list: LocalWorkout[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* voll oder gesperrt */ }
}

export function listLocalWorkouts(): LocalWorkout[] {
  return readAll().sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
}

export function getLocalWorkout(id: string): LocalWorkout | null {
  return readAll().find((w) => w.id === id) || null;
}

export function saveLocalWorkout(w: Omit<LocalWorkout, 'id' | 'created_at' | 'updated_at'> & { id?: string; created_at?: string }): LocalWorkout {
  const list = readAll();
  const now = new Date().toISOString();
  const id = w.id && isLocalId(w.id) ? w.id : `local-${Math.random().toString(36).slice(2, 10)}`;
  const prev = list.find((x) => x.id === id);
  const rec: LocalWorkout = { ...w, id, created_at: prev?.created_at || w.created_at || now, updated_at: now } as LocalWorkout;
  writeAll([rec, ...list.filter((x) => x.id !== id)]);
  return rec;
}

export function deleteLocalWorkout(id: string) {
  writeAll(readAll().filter((w) => w.id !== id));
}
