'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { ALL_DEFAULT_EXERCISES } from '@/lib/exercises';
import type { ExerciseSetting } from '@/lib/types';

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const loadSettings = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('exercise_settings')
      .select('*')
      .eq('user_id', user.id);

    const colors: Record<string, string> = {};
    // Start with defaults
    ALL_DEFAULT_EXERCISES.forEach((ex) => {
      colors[ex.name] = ex.color;
    });
    // Override with user settings
    if (data) {
      (data as ExerciseSetting[]).forEach((s) => {
        colors[s.exercise_name] = s.color;
      });
    }
    setSettings(colors);
  }, [supabase]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  function updateColor(name: string, color: string) {
    setSettings((prev) => ({ ...prev, [name]: color }));
    setSaved(false);
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
        <h2 className="font-oswald text-xl uppercase tracking-wider mb-6">
          Übungsfarben
        </h2>

        <div className="space-y-2">
          {/* HYROX */}
          <h3 className="font-oswald text-lg text-hclub-magenta uppercase tracking-wider mt-6 mb-3">
            HYROX Übungen
          </h3>
          {ALL_DEFAULT_EXERCISES.filter((e) => e.category === 'hyrox').map((exercise) => (
            <div
              key={exercise.name}
              className="flex items-center justify-between bg-hclub-dark border border-hclub-gray rounded-lg px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: settings[exercise.name] || exercise.color }}
                />
                <span className="text-white">{exercise.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={settings[exercise.name] || exercise.color}
                  onChange={(e) => updateColor(exercise.name, e.target.value)}
                  className="w-10 h-8 bg-transparent border border-hclub-gray rounded cursor-pointer"
                />
                <input
                  type="text"
                  value={settings[exercise.name] || exercise.color}
                  onChange={(e) => updateColor(exercise.name, e.target.value)}
                  className="w-24 px-2 py-1 bg-hclub-black border border-hclub-gray rounded text-sm text-gray-300
                             focus:outline-none focus:border-hclub-magenta"
                />
              </div>
            </div>
          ))}

          {/* Training */}
          <h3 className="font-oswald text-lg text-hclub-magenta uppercase tracking-wider mt-8 mb-3">
            Training Übungen
          </h3>
          {ALL_DEFAULT_EXERCISES.filter((e) => e.category === 'training').map((exercise) => (
            <div
              key={exercise.name}
              className="flex items-center justify-between bg-hclub-dark border border-hclub-gray rounded-lg px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: settings[exercise.name] || exercise.color }}
                />
                <span className="text-white">{exercise.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={settings[exercise.name] || exercise.color}
                  onChange={(e) => updateColor(exercise.name, e.target.value)}
                  className="w-10 h-8 bg-transparent border border-hclub-gray rounded cursor-pointer"
                />
                <input
                  type="text"
                  value={settings[exercise.name] || exercise.color}
                  onChange={(e) => updateColor(exercise.name, e.target.value)}
                  className="w-24 px-2 py-1 bg-hclub-black border border-hclub-gray rounded text-sm text-gray-300
                             focus:outline-none focus:border-hclub-magenta"
                />
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
