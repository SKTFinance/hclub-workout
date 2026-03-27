'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { ALL_DEFAULT_EXERCISES } from '@/lib/exercises';
import type { ExerciseSetting } from '@/lib/types';

interface CustomExercise {
  name: string;
  color: string;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [customExercises, setCustomExercises] = useState<CustomExercise[]>([]);
  const [newExerciseName, setNewExerciseName] = useState('');
  const [newExerciseColor, setNewExerciseColor] = useState('#FF00FF');
  const [editingExercise, setEditingExercise] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const router = useRouter();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const supabase = useMemo(() => createClient(), []);

  const defaultExerciseNames = useMemo(
    () => new Set(ALL_DEFAULT_EXERCISES.map((e) => e.name)),
    []
  );

  const loadSettings = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('exercise_settings')
      .select('*')
      .eq('user_id', user.id);

    const colors: Record<string, string> = {};
    const custom: CustomExercise[] = [];

    // Start with defaults
    ALL_DEFAULT_EXERCISES.forEach((ex) => {
      colors[ex.name] = ex.color;
    });
    // Override with user settings and detect custom exercises
    if (data) {
      (data as ExerciseSetting[]).forEach((s) => {
        colors[s.exercise_name] = s.color;
        if (!defaultExerciseNames.has(s.exercise_name)) {
          custom.push({ name: s.exercise_name, color: s.color });
        }
      });
    }
    setSettings(colors);
    setCustomExercises(custom);
  }, [supabase, defaultExerciseNames]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  function updateColor(name: string, color: string) {
    setSettings((prev) => ({ ...prev, [name]: color }));
    setSaved(false);
  }

  async function addCustomExercise() {
    const trimmed = newExerciseName.trim();
    if (!trimmed) return;

    // Check for duplicates
    if (defaultExerciseNames.has(trimmed) || customExercises.some((e) => e.name === trimmed)) {
      alert('Diese Übung existiert bereits.');
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from('exercise_settings')
      .upsert(
        { user_id: user.id, exercise_name: trimmed, color: newExerciseColor },
        { onConflict: 'user_id,exercise_name' }
      );

    setCustomExercises((prev) => [...prev, { name: trimmed, color: newExerciseColor }]);
    setSettings((prev) => ({ ...prev, [trimmed]: newExerciseColor }));
    setNewExerciseName('');
    setNewExerciseColor('#FF00FF');
  }

  async function deleteCustomExercise(exerciseName: string) {
    if (!confirm(`"${exerciseName}" wirklich löschen?`)) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from('exercise_settings')
      .delete()
      .eq('user_id', user.id)
      .eq('exercise_name', exerciseName);

    setCustomExercises((prev) => prev.filter((e) => e.name !== exerciseName));
    setSettings((prev) => {
      const next = { ...prev };
      delete next[exerciseName];
      return next;
    });
  }

  async function startRename(exerciseName: string) {
    setEditingExercise(exerciseName);
    setEditName(exerciseName);
  }

  async function confirmRename(oldName: string) {
    const trimmed = editName.trim();
    if (!trimmed || trimmed === oldName) {
      setEditingExercise(null);
      return;
    }

    if (defaultExerciseNames.has(trimmed) || customExercises.some((e) => e.name === trimmed)) {
      alert('Eine Übung mit diesem Namen existiert bereits.');
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const color = settings[oldName] || '#FF00FF';

    // Delete old entry, insert new one
    await supabase
      .from('exercise_settings')
      .delete()
      .eq('user_id', user.id)
      .eq('exercise_name', oldName);

    await supabase
      .from('exercise_settings')
      .upsert(
        { user_id: user.id, exercise_name: trimmed, color },
        { onConflict: 'user_id,exercise_name' }
      );

    setCustomExercises((prev) =>
      prev.map((e) => (e.name === oldName ? { name: trimmed, color } : e))
    );
    setSettings((prev) => {
      const next = { ...prev };
      delete next[oldName];
      next[trimmed] = color;
      return next;
    });
    setEditingExercise(null);
  }

  async function saveSettings() {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Upsert all settings
    const entries = Object.entries(settings).map(([exercise_name, color]) => ({
      user_id: user.id,
      exercise_name,
      color,
    }));

    for (const entry of entries) {
      await supabase
        .from('exercise_settings')
        .upsert(entry, { onConflict: 'user_id,exercise_name' });
    }

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function renderExerciseRow(exerciseName: string, defaultColor: string, isCustom: boolean) {
    const isEditing = editingExercise === exerciseName;

    return (
      <div
        key={exerciseName}
        className="flex items-center justify-between bg-hclub-dark border border-hclub-gray rounded-lg px-4 py-3"
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div
            className="w-4 h-4 rounded-full shrink-0"
            style={{ backgroundColor: settings[exerciseName] || defaultColor }}
          />
          {isEditing ? (
            <div className="flex items-center gap-2 flex-1">
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') confirmRename(exerciseName);
                  if (e.key === 'Escape') setEditingExercise(null);
                }}
                autoFocus
                className="flex-1 px-2 py-1 bg-hclub-black border border-hclub-magenta rounded text-sm text-white
                           focus:outline-none"
              />
              <button
                onClick={() => confirmRename(exerciseName)}
                className="text-green-400 hover:text-green-300 text-sm font-oswald uppercase"
              >
                OK
              </button>
              <button
                onClick={() => setEditingExercise(null)}
                className="text-gray-400 hover:text-gray-300 text-sm font-oswald uppercase"
              >
                Abb.
              </button>
            </div>
          ) : (
            <span className="text-white truncate">{exerciseName}</span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          <input
            type="color"
            value={settings[exerciseName] || defaultColor}
            onChange={(e) => updateColor(exerciseName, e.target.value)}
            className="w-10 h-8 bg-transparent border border-hclub-gray rounded cursor-pointer"
          />
          <input
            type="text"
            value={settings[exerciseName] || defaultColor}
            onChange={(e) => updateColor(exerciseName, e.target.value)}
            className="w-24 px-2 py-1 bg-hclub-black border border-hclub-gray rounded text-sm text-gray-300
                       focus:outline-none focus:border-hclub-magenta"
          />
          {isCustom && !isEditing && (
            <>
              <button
                onClick={() => startRename(exerciseName)}
                className="px-2 py-1 text-blue-400 hover:text-blue-300 text-xs font-oswald uppercase"
                title="Umbenennen"
              >
                Umben.
              </button>
              <button
                onClick={() => deleteCustomExercise(exerciseName)}
                className="px-2 py-1 text-red-400 hover:text-red-300 text-xs font-oswald uppercase"
                title="Löschen"
              >
                X
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-hclub-black">
      <header className="border-b border-hclub-gray">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/dashboard')}
              className="text-gray-400 hover:text-white transition-colors font-oswald uppercase tracking-wider text-sm"
            >
              &larr; Zurück
            </button>
            <h1 className="font-oswald text-2xl font-bold tracking-wider">
              Einstellungen
            </h1>
          </div>
          <button
            onClick={saveSettings}
            disabled={saving}
            className="px-5 py-2 bg-hclub-magenta hover:bg-hclub-magenta-dark text-white font-oswald
                       uppercase tracking-wider rounded-lg transition-colors text-sm disabled:opacity-50"
          >
            {saving ? 'Speichern...' : saved ? 'Gespeichert!' : 'Speichern'}
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Add custom exercise */}
        <div className="bg-hclub-dark border border-hclub-gray rounded-xl p-5 mb-8">
          <h2 className="font-oswald text-xl uppercase tracking-wider mb-4">
            Eigene Übung hinzufügen
          </h2>
          <div className="flex gap-3 items-end flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs text-gray-400 mb-1 font-oswald uppercase tracking-wider">
                Name
              </label>
              <input
                type="text"
                value={newExerciseName}
                onChange={(e) => setNewExerciseName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addCustomExercise();
                }}
                placeholder="z.B. Kettlebell Clean"
                className="w-full px-4 py-2 bg-hclub-black border border-hclub-gray rounded-lg text-white
                           placeholder-gray-500 focus:outline-none focus:border-hclub-magenta transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1 font-oswald uppercase tracking-wider">
                Farbe
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={newExerciseColor}
                  onChange={(e) => setNewExerciseColor(e.target.value)}
                  className="w-10 h-10 bg-transparent border border-hclub-gray rounded cursor-pointer"
                />
                <input
                  type="text"
                  value={newExerciseColor}
                  onChange={(e) => setNewExerciseColor(e.target.value)}
                  className="w-24 px-2 py-2 bg-hclub-black border border-hclub-gray rounded-lg text-sm text-gray-300
                             focus:outline-none focus:border-hclub-magenta"
                />
              </div>
            </div>
            <button
              onClick={addCustomExercise}
              className="px-6 py-2 bg-hclub-magenta hover:bg-hclub-magenta-dark text-white font-oswald
                         uppercase tracking-wider rounded-lg transition-colors whitespace-nowrap"
            >
              + Hinzufügen
            </button>
          </div>
        </div>

        {/* Custom exercises */}
        {customExercises.length > 0 && (
          <div className="mb-8">
            <h3 className="font-oswald text-lg text-hclub-magenta uppercase tracking-wider mb-3">
              Eigene Übungen
            </h3>
            <div className="space-y-2">
              {customExercises.map((exercise) =>
                renderExerciseRow(exercise.name, exercise.color, true)
              )}
            </div>
          </div>
        )}

        {/* HYROX exercises */}
        <h2 className="font-oswald text-xl uppercase tracking-wider mb-6">
          Übungsfarben
        </h2>

        <div className="space-y-2">
          <h3 className="font-oswald text-lg text-hclub-magenta uppercase tracking-wider mt-6 mb-3">
            HYROX Übungen
          </h3>
          {ALL_DEFAULT_EXERCISES.filter((e) => e.category === 'hyrox').map((exercise) =>
            renderExerciseRow(exercise.name, exercise.color, false)
          )}

          {/* Training */}
          <h3 className="font-oswald text-lg text-hclub-magenta uppercase tracking-wider mt-8 mb-3">
            Training Übungen
          </h3>
          {ALL_DEFAULT_EXERCISES.filter((e) => e.category === 'training').map((exercise) =>
            renderExerciseRow(exercise.name, exercise.color, false)
          )}
        </div>
      </main>
    </div>
  );
}
