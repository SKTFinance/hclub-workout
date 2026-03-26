'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import type { Workout } from '@/lib/types';

export default function DashboardPage() {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);
  const [trainerName, setTrainerName] = useState('');
  const router = useRouter();
  const supabase = createClient();

  const loadWorkouts = useCallback(async () => {
    const { data } = await supabase
      .from('workouts')
      .select('*')
      .order('updated_at', { ascending: false });
    if (data) setWorkouts(data as Workout[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadWorkouts();
  }, [loadWorkouts]);

  async function createWorkout() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const defaultConfig = {
      numGroups: 2,
      numRounds: 3,
      workTime: 60,
      restTime: 15,
      roundRestTime: 60,
      warmupTime: 30,
      rounds: {
        0: { 0: ['Wall Balls'], 1: ['SkiErg'] },
        1: { 0: ['Rowing'], 1: ['Sled Push'] },
        2: { 0: ['Burpees'], 1: ['Box Jumps'] },
      },
    };

    const { data, error } = await supabase
      .from('workouts')
      .insert({
        user_id: user.id,
        name: 'Neues Workout',
        trainer_name: trainerName || 'Trainer',
        config: defaultConfig,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating workout:', error);
      return;
    }
    if (data) {
      router.push(`/workout/${data.id}`);
    }
  }

  async function duplicateWorkout(workout: Workout) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from('workouts')
      .insert({
        user_id: user.id,
        name: `${workout.name} (Kopie)`,
        trainer_name: workout.trainer_name,
        config: workout.config,
      })
      .select()
      .single();

    if (error) {
      console.error('Error duplicating workout:', error);
      return;
    }
    if (data) {
      loadWorkouts();
    }
  }

  async function deleteWorkout(id: string) {
    if (!confirm('Workout wirklich löschen?')) return;
    await supabase.from('workouts').delete().eq('id', id);
    loadWorkouts();
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-hclub-black">
      {/* Header */}
      <header className="border-b border-hclub-gray">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="font-oswald text-3xl font-bold tracking-wider">
            H-<span className="text-hclub-magenta">CLUB</span>
          </h1>
          <div className="flex items-center gap-4">
            <a
              href="/settings"
              className="text-gray-400 hover:text-hclub-magenta transition-colors text-sm font-oswald uppercase tracking-wider"
            >
              Einstellungen
            </a>
            <button
              onClick={handleLogout}
              className="text-gray-400 hover:text-red-400 transition-colors text-sm font-oswald uppercase tracking-wider"
            >
              Abmelden
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <h2 className="font-oswald text-2xl uppercase tracking-wider">
              Meine Workouts
            </h2>
            {!loading && workouts.length > 0 && (
              <span className="bg-hclub-magenta/20 text-hclub-magenta text-sm font-oswald px-2.5 py-0.5 rounded-full">
                {workouts.length}
              </span>
            )}
          </div>
        </div>

        {/* Create new workout */}
        <div className="bg-hclub-dark border border-hclub-gray rounded-xl p-6 mb-8 fade-in-up" style={{ opacity: 0, animationDelay: '0s' }}>
          <h3 className="font-oswald text-xl uppercase tracking-wider mb-4">
            Neues Workout erstellen
          </h3>
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="block text-sm text-gray-400 mb-1 font-oswald uppercase tracking-wider">
                Trainer Name
              </label>
              <input
                type="text"
                value={trainerName}
                onChange={(e) => setTrainerName(e.target.value)}
                placeholder="Dein Name"
                className="w-full px-4 py-2 bg-hclub-black border border-hclub-gray rounded-lg
                           text-white placeholder-gray-500 focus:outline-none focus:border-hclub-magenta
                           transition-colors"
              />
            </div>
            <button
              onClick={createWorkout}
              className="px-6 py-2 bg-hclub-magenta hover:bg-hclub-magenta-dark text-white font-oswald
                         uppercase tracking-wider rounded-lg transition-colors whitespace-nowrap"
            >
              + Erstellen
            </button>
          </div>
        </div>

        {/* Workout list */}
        {loading ? (
          <div className="text-center text-gray-400 py-12">Laden...</div>
        ) : workouts.length === 0 ? (
          <div className="text-center text-gray-500 py-12">
            <p className="font-oswald text-xl uppercase">Noch keine Workouts</p>
            <p className="text-sm mt-2">Erstelle dein erstes Workout oben.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {workouts.map((workout, index) => (
              <div
                key={workout.id}
                className="bg-hclub-dark border border-hclub-gray rounded-xl p-5 card-gradient-border
                           transition-all duration-300 group fade-in-up"
                style={{ opacity: 0, animationDelay: `${0.1 + index * 0.08}s` }}
              >
                <h3 className="font-oswald text-lg uppercase tracking-wider mb-1">
                  {workout.name}
                </h3>
                <p className="text-gray-400 text-sm mb-3">
                  {workout.trainer_name} &bull;{' '}
                  {workout.config.numGroups} Gruppen &bull;{' '}
                  {workout.config.numRounds} Runden &bull;{' '}
                  {workout.config.workTime}s Arbeit
                </p>
                <p className="text-gray-500 text-xs mb-4">
                  {new Date(workout.updated_at).toLocaleDateString('de-DE', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => router.push(`/workout/${workout.id}`)}
                    className="flex-1 px-3 py-2 bg-hclub-gray hover:bg-hclub-magenta text-white text-sm
                               font-oswald uppercase tracking-wider rounded-lg transition-colors"
                  >
                    Bearbeiten
                  </button>
                  <button
                    onClick={() => {
                      window.open(`/workout/${workout.id}/live`, '_blank');
                    }}
                    className="flex-1 px-3 py-2 bg-hclub-magenta hover:bg-hclub-magenta-dark text-white text-sm
                               font-oswald uppercase tracking-wider rounded-lg transition-colors"
                  >
                    Starten
                  </button>
                  <button
                    onClick={() => duplicateWorkout(workout)}
                    className="px-3 py-2 bg-hclub-gray hover:bg-purple-900/60 text-gray-300 hover:text-purple-300 text-sm
                               font-oswald uppercase rounded-lg transition-colors"
                    title="Duplizieren"
                  >
                    Duplizieren
                  </button>
                  <button
                    onClick={() => deleteWorkout(workout.id)}
                    className="px-3 py-2 bg-red-900/30 hover:bg-red-900/60 text-red-400 text-sm
                               font-oswald uppercase rounded-lg transition-colors"
                  >
                    X
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
