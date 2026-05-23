'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import type { Workout, WorkoutMode } from '@/lib/types';

type FilterMode = 'mine' | 'all' | 'favorites';
type SortMode = 'date' | 'name';
type ViewMode = 'grid' | 'list';

const PAGE_SIZE = 12;

export default function DashboardPage() {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);
  const [trainerName, setTrainerName] = useState('');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<FilterMode>('mine');
  const [sortMode, setSortMode] = useState<SortMode>('date');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [workoutMode, setWorkoutMode] = useState<WorkoutMode>('timed');
  const [typeFilter, setTypeFilter] = useState<WorkoutMode | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const router = useRouter();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const supabase = useMemo(() => createClient(), []);

  // Load saved trainer name from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('hclub_trainer_name');
    if (saved) setTrainerName(saved);
  }, []);

  // Save trainer name when it changes
  useEffect(() => {
    if (trainerName) localStorage.setItem('hclub_trainer_name', trainerName);
  }, [trainerName]);

  const loadFavorites = useCallback(async () => {
    const { data } = await supabase.from('workout_favorites').select('workout_id');
    if (data) {
      setFavorites(new Set(data.map((f: { workout_id: string }) => f.workout_id)));
    }
  }, [supabase]);

  const loadWorkouts = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) setCurrentUserId(user.id);

    let query = supabase.from('workouts').select('*');

    if (filterMode === 'mine' && user) {
      query = query.eq('user_id', user.id);
    }
    // 'all' and 'favorites' load everything (RLS handles visibility)

    if (sortMode === 'date') {
      query = query.order('updated_at', { ascending: false });
    } else {
      query = query.order('name', { ascending: true });
    }

    const { data } = await query;
    if (data) setWorkouts(data as Workout[]);
    setLoading(false);
  }, [supabase, filterMode, sortMode]);

  useEffect(() => {
    loadWorkouts();
    loadFavorites();
  }, [loadWorkouts, loadFavorites]);

  useEffect(() => { setPage(0); }, [filterMode, sortMode, typeFilter, searchQuery]);

  const displayedWorkouts = useMemo(() => {
    let filtered = workouts;

    // Favorites filter
    if (filterMode === 'favorites') {
      filtered = filtered.filter(w => favorites.has(w.id));
    }

    // Type filter
    if (typeFilter !== 'all') {
      filtered = filtered.filter(w => (w.workout_mode || 'timed') === typeFilter);
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(w =>
        w.name.toLowerCase().includes(q) ||
        w.trainer_name.toLowerCase().includes(q)
      );
    }

    return filtered;
  }, [workouts, filterMode, favorites, typeFilter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(displayedWorkouts.length / PAGE_SIZE));
  const pagedWorkouts = displayedWorkouts.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  async function toggleFavorite(workoutId: string) {
    const isFav = favorites.has(workoutId);
    if (isFav) {
      await supabase.from('workout_favorites').delete().eq('workout_id', workoutId);
      setFavorites(prev => { const next = new Set(prev); next.delete(workoutId); return next; });
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from('workout_favorites').insert({ user_id: user.id, workout_id: workoutId });
      setFavorites(prev => new Set(prev).add(workoutId));
    }
  }

  async function createWorkout() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    let defaultConfig;
    if (workoutMode === 'timed') {
      defaultConfig = {
        numGroups: 2, numRounds: 3, workTime: 60, restTime: 15, roundRestTime: 60, warmupTime: 30,
        rounds: { 0: { 0: ['Wall Balls'], 1: ['SkiErg'] }, 1: { 0: ['Rowing'], 1: ['Sled Push'] }, 2: { 0: ['Burpees'], 1: ['Box Jumps'] } },
      };
    } else if (workoutMode === 'amrap') {
      defaultConfig = {
        numGroups: 1, numRounds: 1, workTime: 60, restTime: 0, roundRestTime: 0, warmupTime: 30,
        rounds: { 0: { 0: ['Wall Balls'] } },
        amrapTotalTime: 1200,
        amrapExercises: { 0: [{ name: 'Wall Balls', reps: 20 }, { name: 'Burpees', reps: 10 }, { name: 'Box Jumps', reps: 15 }] },
      };
    } else {
      defaultConfig = {
        numGroups: 1, numRounds: 1, workTime: 0, restTime: 0, roundRestTime: 0, warmupTime: 10,
        rounds: { 0: { 0: ['Burpees'] } },
        forTimeExercises: { 0: [{ name: 'Burpees', distance: '50m' }, { name: 'Rowing', distance: '500m' }, { name: 'Wall Balls', reps: 20 }] },
      };
    }

    const { data, error } = await supabase.from('workouts').insert({
      user_id: user.id, user_email: user.email, name: 'Neues Workout',
      trainer_name: trainerName || 'Trainer', config: defaultConfig,
      is_public: false, workout_mode: workoutMode,
    }).select().single();

    if (error) { console.error('Error creating workout:', error); return; }
    if (data) router.push(`/workout/${data.id}`);
  }

  async function duplicateWorkout(workout: Workout) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from('workouts').insert({
      user_id: user.id, user_email: user.email,
      name: `${workout.name} (Kopie)`, trainer_name: trainerName || workout.trainer_name,
      config: workout.config, is_public: false, workout_mode: workout.workout_mode || 'timed',
    }).select().single();
    if (!error) loadWorkouts();
  }

  async function deleteWorkout(id: string) {
    if (!confirm('Workout wirklich loeschen?')) return;
    await supabase.from('workouts').delete().eq('id', id);
    loadWorkouts();
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  function getModeLabel(mode?: WorkoutMode): string {
    switch (mode) { case 'amrap': return 'AMRAP'; case 'fortime': return 'For Time'; default: return 'Zeit'; }
  }
  function getModeColor(mode?: WorkoutMode): string {
    switch (mode) { case 'amrap': return 'text-orange-400'; case 'fortime': return 'text-cyan-400'; default: return 'text-green-400'; }
  }

  function renderWorkoutCard(workout: Workout, index: number) {
    const isOwn = workout.user_id === currentUserId;
    const isFav = favorites.has(workout.id);

    if (viewMode === 'list') {
      return (
        <div key={workout.id}
          className="bg-hclub-dark border border-hclub-gray rounded-lg px-4 py-3 flex items-center gap-4 hover:border-hclub-magenta/30 transition-colors fade-in-up"
          style={{ opacity: 0, animationDelay: `${index * 0.03}s` }}>
          <button onClick={() => toggleFavorite(workout.id)}
            className={`text-lg shrink-0 ${isFav ? 'text-yellow-400' : 'text-gray-600 hover:text-yellow-400'} transition-colors`}>
            {isFav ? '\u2605' : '\u2606'}
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-oswald uppercase tracking-wider truncate">{workout.name}</span>
              <span className={`text-[10px] font-oswald uppercase px-1.5 py-0 rounded ${getModeColor(workout.workout_mode)} bg-white/5`}>
                {getModeLabel(workout.workout_mode)}
              </span>
              {workout.is_public && <span className="text-[10px] text-green-400 bg-green-400/10 px-1.5 rounded font-oswald uppercase">Pub</span>}
            </div>
            <div className="text-gray-500 text-xs truncate">
              {workout.trainer_name}
              {!isOwn && workout.user_email && ` (${workout.user_email})`}
              {' '}&bull; {new Date(workout.updated_at).toLocaleDateString('de-DE')}
            </div>
          </div>
          <div className="flex gap-1 shrink-0">
            {isOwn && (
              <button onClick={() => router.push(`/workout/${workout.id}`)}
                className="px-2 py-1 bg-hclub-gray hover:bg-hclub-magenta text-white text-xs font-oswald uppercase rounded transition-colors">Edit</button>
            )}
            <button onClick={() => window.open(`/workout/${workout.id}/live`, '_blank')}
              className="px-2 py-1 bg-hclub-magenta hover:bg-hclub-magenta-dark text-white text-xs font-oswald uppercase rounded transition-colors">Start</button>
            <button onClick={() => duplicateWorkout(workout)}
              className="px-2 py-1 bg-hclub-gray hover:bg-purple-900/60 text-gray-400 text-xs font-oswald uppercase rounded transition-colors">Kopie</button>
            {isOwn && (
              <button onClick={() => deleteWorkout(workout.id)}
                className="px-2 py-1 bg-red-900/30 hover:bg-red-900/60 text-red-400 text-xs font-oswald uppercase rounded transition-colors">X</button>
            )}
          </div>
        </div>
      );
    }

    return (
      <div key={workout.id}
        className="bg-hclub-dark border border-hclub-gray rounded-xl p-5 card-gradient-border transition-all duration-300 group fade-in-up"
        style={{ opacity: 0, animationDelay: `${0.1 + index * 0.05}s` }}>
        <div className="flex items-start justify-between mb-1">
          <h3 className="font-oswald text-lg uppercase tracking-wider flex-1 truncate">{workout.name}</h3>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => toggleFavorite(workout.id)}
              className={`text-lg ${isFav ? 'text-yellow-400' : 'text-gray-600 hover:text-yellow-400'} transition-colors`}>
              {isFav ? '\u2605' : '\u2606'}
            </button>
            <span className={`text-xs font-oswald uppercase px-2 py-0.5 rounded ${getModeColor(workout.workout_mode)} bg-white/5`}>
              {getModeLabel(workout.workout_mode)}
            </span>
          </div>
        </div>
        <p className="text-gray-400 text-sm mb-1">
          {workout.trainer_name}
          {workout.workout_mode === 'timed' && (
            <> &bull; {workout.config.numGroups}G &bull; {workout.config.numRounds}R &bull; {workout.config.workTime}s</>
          )}
          {workout.workout_mode === 'amrap' && workout.config.amrapTotalTime && (
            <> &bull; {Math.floor(workout.config.amrapTotalTime / 60)} Min AMRAP</>
          )}
        </p>
        {!isOwn && workout.user_email && (
          <p className="text-gray-500 text-xs mb-1">von {workout.user_email}</p>
        )}
        <div className="flex items-center gap-2 mb-3">
          {workout.is_public && (
            <span className="text-xs text-green-400 bg-green-400/10 px-2 py-0.5 rounded font-oswald uppercase">Oeffentlich</span>
          )}
          <span className="text-gray-500 text-xs">
            {new Date(workout.updated_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <div className="flex gap-2 flex-wrap">
          {isOwn && (
            <button onClick={() => router.push(`/workout/${workout.id}`)}
              className="flex-1 px-3 py-2 bg-hclub-gray hover:bg-hclub-magenta text-white text-sm font-oswald uppercase tracking-wider rounded-lg transition-colors">Bearbeiten</button>
          )}
          <button onClick={() => window.open(`/workout/${workout.id}/live`, '_blank')}
            className="flex-1 px-3 py-2 bg-hclub-magenta hover:bg-hclub-magenta-dark text-white text-sm font-oswald uppercase tracking-wider rounded-lg transition-colors">Starten</button>
          <button onClick={() => duplicateWorkout(workout)}
            className="px-3 py-2 bg-hclub-gray hover:bg-purple-900/60 text-gray-300 hover:text-purple-300 text-sm font-oswald uppercase rounded-lg transition-colors">Kopie</button>
          {isOwn && (
            <button onClick={() => deleteWorkout(workout.id)}
              className="px-3 py-2 bg-red-900/30 hover:bg-red-900/60 text-red-400 text-sm font-oswald uppercase rounded-lg transition-colors">X</button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-hclub-black">
      <header className="border-b border-hclub-gray">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="font-oswald text-3xl font-bold tracking-wider">
            H-<span className="text-hclub-magenta">CLUB</span>
          </h1>
          <div className="flex items-center gap-4">
            <a href="/settings" className="text-gray-400 hover:text-hclub-magenta transition-colors text-sm font-oswald uppercase tracking-wider">Einstellungen</a>
            <button onClick={handleLogout} className="text-gray-400 hover:text-red-400 transition-colors text-sm font-oswald uppercase tracking-wider">Abmelden</button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Search + Filter bar */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Workout suchen..."
              className="w-full px-4 py-2 bg-hclub-dark border border-hclub-gray rounded-lg text-white text-sm
                         placeholder-gray-500 focus:outline-none focus:border-hclub-magenta transition-colors" />
          </div>

          {/* Filter tabs */}
          <div className="flex bg-hclub-dark rounded-lg border border-hclub-gray overflow-hidden">
            {(['mine', 'all', 'favorites'] as FilterMode[]).map((f) => (
              <button key={f} onClick={() => setFilterMode(f)}
                className={`px-3 py-2 text-xs font-oswald uppercase tracking-wider transition-colors ${
                  filterMode === f ? 'bg-hclub-magenta text-white' : 'text-gray-400 hover:text-white'
                }`}>
                {f === 'mine' ? 'Meine' : f === 'all' ? 'Alle' : '\u2605'}
              </button>
            ))}
          </div>

          {/* Type filter */}
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as WorkoutMode | 'all')}
            className="px-3 py-2 bg-hclub-dark border border-hclub-gray rounded-lg text-xs text-gray-300 font-oswald uppercase focus:outline-none focus:border-hclub-magenta">
            <option value="all">Alle Typen</option>
            <option value="timed">Zeitbasiert</option>
            <option value="amrap">AMRAP</option>
            <option value="fortime">For Time</option>
          </select>

          {/* Sort */}
          <select value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="px-3 py-2 bg-hclub-dark border border-hclub-gray rounded-lg text-xs text-gray-300 font-oswald uppercase focus:outline-none focus:border-hclub-magenta">
            <option value="date">Neueste</option>
            <option value="name">Name A-Z</option>
          </select>

          {/* View toggle */}
          <div className="flex bg-hclub-dark rounded-lg border border-hclub-gray overflow-hidden">
            <button onClick={() => setViewMode('grid')}
              className={`px-2.5 py-2 text-xs transition-colors ${viewMode === 'grid' ? 'bg-hclub-magenta text-white' : 'text-gray-400 hover:text-white'}`}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="0" y="0" width="6" height="6" rx="1"/><rect x="8" y="0" width="6" height="6" rx="1"/><rect x="0" y="8" width="6" height="6" rx="1"/><rect x="8" y="8" width="6" height="6" rx="1"/></svg>
            </button>
            <button onClick={() => setViewMode('list')}
              className={`px-2.5 py-2 text-xs transition-colors ${viewMode === 'list' ? 'bg-hclub-magenta text-white' : 'text-gray-400 hover:text-white'}`}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="0" y="0" width="14" height="3" rx="1"/><rect x="0" y="5.5" width="14" height="3" rx="1"/><rect x="0" y="11" width="14" height="3" rx="1"/></svg>
            </button>
          </div>
        </div>

        {/* Count */}
        {!loading && (
          <div className="text-gray-500 text-xs font-oswald uppercase tracking-wider mb-4">
            {displayedWorkouts.length} Workout{displayedWorkouts.length !== 1 ? 's' : ''}
            {searchQuery && ` fuer "${searchQuery}"`}
          </div>
        )}

        {/* Create new workout */}
        <div className="bg-hclub-dark border border-hclub-gray rounded-xl p-5 mb-8 fade-in-up" style={{ opacity: 0, animationDelay: '0s' }}>
          <h3 className="font-oswald text-lg uppercase tracking-wider mb-3">Neues Workout</h3>
          <div className="flex gap-3 items-end flex-wrap">
            <div className="flex-1 min-w-[150px]">
              <label className="block text-xs text-gray-400 mb-1 font-oswald uppercase tracking-wider">Trainer</label>
              <input type="text" value={trainerName} onChange={(e) => setTrainerName(e.target.value)}
                placeholder="Dein Name"
                className="w-full px-3 py-2 bg-hclub-black border border-hclub-gray rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-hclub-magenta transition-colors" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1 font-oswald uppercase tracking-wider">Modus</label>
              <select value={workoutMode} onChange={(e) => setWorkoutMode(e.target.value as WorkoutMode)}
                className="px-3 py-2 bg-hclub-black border border-hclub-gray rounded-lg text-white text-sm focus:outline-none focus:border-hclub-magenta transition-colors">
                <option value="timed">Zeitbasiert</option>
                <option value="amrap">AMRAP</option>
                <option value="fortime">For Time</option>
              </select>
            </div>
            <button onClick={createWorkout}
              className="px-5 py-2 bg-hclub-magenta hover:bg-hclub-magenta-dark text-white font-oswald uppercase tracking-wider rounded-lg transition-colors whitespace-nowrap text-sm">
              + Erstellen
            </button>
          </div>
        </div>

        {/* Workout list */}
        {loading ? (
          <div className="text-center text-gray-400 py-12">Laden...</div>
        ) : displayedWorkouts.length === 0 ? (
          <div className="text-center text-gray-500 py-12">
            <p className="font-oswald text-xl uppercase">Keine Workouts gefunden</p>
            <p className="text-sm mt-2">
              {filterMode === 'favorites' ? 'Markiere Workouts mit dem Stern als Favorit.' :
               searchQuery ? 'Keine Ergebnisse fuer deine Suche.' :
               'Erstelle dein erstes Workout oben.'}
            </p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {pagedWorkouts.map((w, i) => renderWorkoutCard(w, i))}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {pagedWorkouts.map((w, i) => renderWorkoutCard(w, i))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-8">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
              className="px-3 py-1.5 bg-hclub-dark border border-hclub-gray rounded-lg text-sm font-oswald uppercase text-gray-400 hover:text-white disabled:opacity-30 transition-colors">
              &larr;
            </button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              const pageNum = totalPages <= 7 ? i : (page < 3 ? i : page > totalPages - 4 ? totalPages - 7 + i : page - 3 + i);
              return (
                <button key={pageNum} onClick={() => setPage(pageNum)}
                  className={`w-8 h-8 rounded-lg text-sm font-oswald transition-colors ${
                    page === pageNum ? 'bg-hclub-magenta text-white' : 'bg-hclub-dark border border-hclub-gray text-gray-400 hover:text-white'
                  }`}>
                  {pageNum + 1}
                </button>
              );
            })}
            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
              className="px-3 py-1.5 bg-hclub-dark border border-hclub-gray rounded-lg text-sm font-oswald uppercase text-gray-400 hover:text-white disabled:opacity-30 transition-colors">
              &rarr;
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
