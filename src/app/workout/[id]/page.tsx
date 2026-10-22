'use client';

// Workout bearbeiten (V3, 22.10.2026): neuer Editor mit allen Funktionen des Originals.
// Der Original-Editor bleibt als unsichtbarer Rückfall unter /workout/[id]/classic.
// Speichern: Vorschau → nur im Browser (Live-Workouts werden als Kopie gespeichert),
// Produktion → wie das Original (update in hybryd_workouts).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Workout } from '@/lib/types';
import WorkoutEditor, { type EditorValue } from '@/components/WorkoutEditor';
import { USE_LOCAL_STORE, getLocalWorkout, isLocalId, saveLocalWorkout } from '@/lib/localWorkouts';

export default function EditWorkoutPage() {
  const id = String(useParams().id || '');
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [w, setW] = useState<Workout | null>(null);
  const [missing, setMissing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState('');
  const [library, setLibrary] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      if (isLocalId(id)) {
        const l = getLocalWorkout(id);
        if (l) setW(l); else setMissing(true);
        return;
      }
      const { data } = await supabase.from('hybryd_workouts').select('*').eq('id', id).single();
      if (data) setW(data as Workout); else setMissing(true);
    })();
    supabase.from('hybryd_exercise_library').select('name').order('name').then(({ data }) => {
      if (data) setLibrary(data.map((x: { name: string }) => x.name));
    });
  }, [id, supabase]);

  const persist = useCallback(async (v: EditorValue): Promise<string> => {
    setSaving(true);
    try { if (v.coach) localStorage.setItem('hclub_trainer_name', v.coach); } catch { /* egal */ }
    if (USE_LOCAL_STORE) {
      const rec = saveLocalWorkout({
        id: isLocalId(id) ? id : undefined, user_id: 'local', name: v.name, trainer_name: v.coach,
        config: v.config, workout_mode: v.mode, is_public: v.isPublic, draft: undefined,
      });
      setSaving(false);
      setNote(isLocalId(id) ? 'Saved in this browser.' : 'Saved as a copy in this browser. The original stays as it is.');
      if (rec.id !== id) router.replace(`/workout/${rec.id}`);
      return rec.id;
    }
    await supabase.from('hybryd_workouts').update({
      name: v.name, trainer_name: v.coach, config: v.config, is_public: v.isPublic, workout_mode: v.mode,
      updated_at: new Date().toISOString(),
    }).eq('id', id);
    setSaving(false);
    setNote('Saved.');
    return id;
  }, [id, router, supabase]);

  async function addToLibrary(name: string) {
    if (USE_LOCAL_STORE) return; // Vorschau: keine Schreibzugriffe auf Live-Tabellen
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('hybryd_exercise_library').upsert({ user_id: user.id, name, color: '#199DA9' }, { onConflict: 'user_id,name' });
    setLibrary((l) => [...l, name]);
  }

  if (missing) return <div className="cw-root"><main className="cw-main"><p className="cw-lead">Workout not found.</p></main></div>;
  if (!w) return <div className="cw-root"><main className="cw-main"><p className="cw-lead">Loading…</p></main></div>;

  return (
    <div className="cw-root" data-step="edit">
      <header className="cw-top">
        <button type="button" onClick={() => router.push('/dashboard')} className="cw-back">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Workouts
        </button>
        <div />
        <div className="cw-top-right"><span className="cw-logo">HYB<span>RYD</span></span></div>
      </header>
      <WorkoutEditor
        key={w.id}
        initial={{ name: w.name, mode: w.workout_mode || 'timed', isPublic: w.is_public ?? true, config: w.config, coach: w.trainer_name || '' }}
        saving={saving}
        savedNote={note}
        library={library}
        onCustomExercise={addToLibrary}
        onSave={(v) => { persist(v); }}
        onStart={async (v) => { const wid = await persist(v); window.open(`/workout/${wid}/live`, '_blank'); }}
      />
    </div>
  );
}
