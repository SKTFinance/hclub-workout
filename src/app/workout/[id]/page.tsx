'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter, useParams } from 'next/navigation';
import type { Workout, WorkoutConfig, WorkoutMode, ExerciseEntry, LibraryExercise } from '@/lib/types';
import { HYROX_EXERCISES, TRAINING_EXERCISES } from '@/lib/exercises';
import { ICON_PICKER_OPTIONS, exerciseIconMap, getExerciseIcon } from '@/lib/exerciseIcons';

const ALL_EXERCISES = [...HYROX_EXERCISES, ...TRAINING_EXERCISES];

export default function WorkoutEditorPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const supabase = useMemo(() => createClient(), []);

  const [workout, setWorkout] = useState<Workout | null>(null);
  const [name, setName] = useState('');
  const [trainerName, setTrainerName] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [workoutMode, setWorkoutMode] = useState<WorkoutMode>('timed');
  const [config, setConfig] = useState<WorkoutConfig>({
    numGroups: 2,
    numRounds: 3,
    workTime: 60,
    restTime: 15,
    roundRestTime: 60,
    warmupTime: 30,
    rounds: {},
  });
  const [saving, setSaving] = useState(false);
  const [customExercise, setCustomExercise] = useState('');
  const [expandedRoundSettings, setExpandedRoundSettings] = useState<Record<number, boolean>>({});
  const [expandedGroupSettings, setExpandedGroupSettings] = useState<Record<string, boolean>>({});
  // Local string states for number inputs
  const [groupsInput, setGroupsInput] = useState(String(config.numGroups));
  const [roundsInput, setRoundsInput] = useState(String(config.numRounds));
  const [roundRestInput, setRoundRestInput] = useState(String(config.roundRestTime));
  const [warmupInput, setWarmupInput] = useState(String(config.warmupTime));
  const [iconPickerOpen, setIconPickerOpen] = useState<{ round: number; group: number; ex: number } | null>(null);
  // Exercise library
  const [libraryExercises, setLibraryExercises] = useState<LibraryExercise[]>([]);

  const loadWorkout = useCallback(async () => {
    const { data } = await supabase
      .from('workouts')
      .select('*')
      .eq('id', id)
      .single();

    if (data) {
      const w = data as Workout;
      setWorkout(w);
      setName(w.name);
      setTrainerName(w.trainer_name);
      setIsPublic(w.is_public || false);
      setWorkoutMode(w.workout_mode || 'timed');
      setConfig(w.config);
      setGroupsInput(String(w.config.numGroups));
      setRoundsInput(String(w.config.numRounds));
      setRoundRestInput(String(w.config.roundRestTime));
      setWarmupInput(String(w.config.warmupTime));
    }
  }, [supabase, id]);

  const loadLibrary = useCallback(async () => {
    const { data } = await supabase
      .from('exercise_library')
      .select('*')
      .order('name');
    if (data) setLibraryExercises(data as LibraryExercise[]);
  }, [supabase]);

  useEffect(() => {
    loadWorkout();
    loadLibrary();
  }, [loadWorkout, loadLibrary]);

  // Save custom exercises to library automatically
  async function saveToLibrary(exerciseName: string) {
    if (ALL_EXERCISES.find(e => e.name === exerciseName)) return; // skip built-in
    if (libraryExercises.find(e => e.name === exerciseName)) return; // already saved

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('exercise_library').upsert({
      user_id: user.id,
      name: exerciseName,
      color: '#FF00FF',
    }, { onConflict: 'user_id,name' });

    loadLibrary();
  }

  function updateConfig(partial: Partial<WorkoutConfig>) {
    setConfig((prev) => {
      const next = { ...prev, ...partial };
      const rounds = { ...next.rounds };
      for (let r = 0; r < next.numRounds; r++) {
        if (!rounds[r]) rounds[r] = {};
        for (let g = 0; g < next.numGroups; g++) {
          if (!rounds[r][g]) rounds[r][g] = ['Wall Balls'];
        }
      }
      next.rounds = rounds;
      return next;
    });
  }

  function setExercise(roundIndex: number, groupIndex: number, exerciseIndex: number, exerciseName: string) {
    setConfig((prev) => {
      const rounds = JSON.parse(JSON.stringify(prev.rounds));
      if (!rounds[roundIndex]) rounds[roundIndex] = {};
      if (!rounds[roundIndex][groupIndex]) rounds[roundIndex][groupIndex] = [];
      rounds[roundIndex][groupIndex][exerciseIndex] = exerciseName;
      return { ...prev, rounds };
    });
  }

  function addExerciseToGroup(roundIndex: number, groupIndex: number) {
    setConfig((prev) => {
      const rounds = JSON.parse(JSON.stringify(prev.rounds));
      if (!rounds[roundIndex]) rounds[roundIndex] = {};
      if (!rounds[roundIndex][groupIndex]) rounds[roundIndex][groupIndex] = [];
      rounds[roundIndex][groupIndex].push('Wall Balls');
      return { ...prev, rounds };
    });
  }

  function removeExerciseFromGroup(roundIndex: number, groupIndex: number, exerciseIndex: number) {
    setConfig((prev) => {
      const rounds = JSON.parse(JSON.stringify(prev.rounds));
      if (rounds[roundIndex]?.[groupIndex]?.length > 1) {
        rounds[roundIndex][groupIndex].splice(exerciseIndex, 1);
      }
      return { ...prev, rounds };
    });
  }

  function addCustomExercise(roundIndex: number, groupIndex: number) {
    if (!customExercise.trim()) return;
    const trimmed = customExercise.trim();
    setConfig((prev) => {
      const rounds = JSON.parse(JSON.stringify(prev.rounds));
      if (!rounds[roundIndex]) rounds[roundIndex] = {};
      if (!rounds[roundIndex][groupIndex]) rounds[roundIndex][groupIndex] = [];
      rounds[roundIndex][groupIndex].push(trimmed);
      return { ...prev, rounds };
    });
    saveToLibrary(trimmed);
    setCustomExercise('');
  }

  function updateRoundSetting(roundIndex: number, field: 'workTime' | 'restTime', value: number | undefined) {
    setConfig((prev) => {
      const roundSettings = { ...(prev.roundSettings || {}) };
      if (!roundSettings[roundIndex]) roundSettings[roundIndex] = {};
      if (value === undefined) {
        delete roundSettings[roundIndex][field];
        if (Object.keys(roundSettings[roundIndex]).length === 0) {
          delete roundSettings[roundIndex];
        }
      } else {
        roundSettings[roundIndex] = { ...roundSettings[roundIndex], [field]: value };
      }
      return { ...prev, roundSettings };
    });
  }

  function updateGroupTimeSetting(roundIndex: number, groupIndex: number, field: 'workTime' | 'restTime', value: number | undefined) {
    setConfig((prev) => {
      const gts = JSON.parse(JSON.stringify(prev.groupTimeSettings || {}));
      if (!gts[roundIndex]) gts[roundIndex] = {};
      if (!gts[roundIndex][groupIndex]) gts[roundIndex][groupIndex] = {};
      if (value === undefined) {
        delete gts[roundIndex][groupIndex][field];
        if (Object.keys(gts[roundIndex][groupIndex]).length === 0) {
          delete gts[roundIndex][groupIndex];
        }
        if (Object.keys(gts[roundIndex]).length === 0) {
          delete gts[roundIndex];
        }
      } else {
        gts[roundIndex][groupIndex] = { ...gts[roundIndex][groupIndex], [field]: value };
      }
      return { ...prev, groupTimeSettings: gts };
    });
  }

  function toggleRoundSettings(roundIndex: number) {
    setExpandedRoundSettings((prev) => ({ ...prev, [roundIndex]: !prev[roundIndex] }));
  }

  function toggleGroupSettings(roundIndex: number, groupIndex: number) {
    const key = `${roundIndex}-${groupIndex}`;
    setExpandedGroupSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function getIconOverrideKey(roundIndex: number, groupIndex: number, exerciseIndex: number): string | undefined {
    return config.iconOverrides?.[roundIndex]?.[groupIndex]?.[exerciseIndex];
  }

  function setIconOverride(roundIndex: number, groupIndex: number, exerciseIndex: number, iconKey: string | null) {
    setConfig((prev) => {
      const overrides = JSON.parse(JSON.stringify(prev.iconOverrides || {}));
      if (iconKey === null) {
        if (overrides[roundIndex]?.[groupIndex]) {
          delete overrides[roundIndex][groupIndex][exerciseIndex];
        }
      } else {
        if (!overrides[roundIndex]) overrides[roundIndex] = {};
        if (!overrides[roundIndex][groupIndex]) overrides[roundIndex][groupIndex] = {};
        overrides[roundIndex][groupIndex][exerciseIndex] = iconKey;
      }
      return { ...prev, iconOverrides: overrides };
    });
  }

  function duplicateRound(roundIndex: number) {
    setConfig((prev) => {
      const newNumRounds = prev.numRounds + 1;
      const rounds = JSON.parse(JSON.stringify(prev.rounds));
      const roundSettings = JSON.parse(JSON.stringify(prev.roundSettings || {}));
      const groupTimeSettings = JSON.parse(JSON.stringify(prev.groupTimeSettings || {}));
      const iconOverrides = JSON.parse(JSON.stringify(prev.iconOverrides || {}));

      // Shift all rounds after the duplicated one
      for (let r = newNumRounds - 1; r > roundIndex + 1; r--) {
        rounds[r] = rounds[r - 1];
        if (roundSettings[r - 1]) roundSettings[r] = roundSettings[r - 1];
        else delete roundSettings[r];
        if (groupTimeSettings[r - 1]) groupTimeSettings[r] = groupTimeSettings[r - 1];
        else delete groupTimeSettings[r];
        if (iconOverrides[r - 1]) iconOverrides[r] = iconOverrides[r - 1];
        else delete iconOverrides[r];
      }

      // Copy the round
      rounds[roundIndex + 1] = JSON.parse(JSON.stringify(rounds[roundIndex]));
      if (roundSettings[roundIndex]) {
        roundSettings[roundIndex + 1] = JSON.parse(JSON.stringify(roundSettings[roundIndex]));
      }
      if (groupTimeSettings[roundIndex]) {
        groupTimeSettings[roundIndex + 1] = JSON.parse(JSON.stringify(groupTimeSettings[roundIndex]));
      }
      if (iconOverrides[roundIndex]) {
        iconOverrides[roundIndex + 1] = JSON.parse(JSON.stringify(iconOverrides[roundIndex]));
      }

      return {
        ...prev,
        numRounds: newNumRounds,
        rounds,
        roundSettings,
        groupTimeSettings,
        iconOverrides,
      };
    });
    setRoundsInput(String(config.numRounds + 1));
  }

  function randomFill() {
    setConfig((prev) => {
      const rounds = JSON.parse(JSON.stringify(prev.rounds));
      const exercisePool = ALL_EXERCISES.map((e) => e.name);

      for (let r = 0; r < prev.numRounds; r++) {
        if (!rounds[r]) rounds[r] = {};
        const prevRoundExercises: Record<number, string> = {};
        if (r > 0 && rounds[r - 1]) {
          for (let g = 0; g < prev.numGroups; g++) {
            const prevEx = rounds[r - 1]?.[g];
            if (prevEx && prevEx.length > 0) {
              prevRoundExercises[g] = prevEx[prevEx.length - 1];
            }
          }
        }

        const maxExercisesInRound = Math.max(
          ...Array.from({ length: prev.numGroups }, (_, g) =>
            (rounds[r]?.[g]?.length || 1)
          )
        );

        for (let exIdx = 0; exIdx < maxExercisesInRound; exIdx++) {
          const available = [...exercisePool];
          for (let i = available.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [available[i], available[j]] = [available[j], available[i]];
          }

          const usedInSlot = new Set<string>();
          for (let g = 0; g < prev.numGroups; g++) {
            if (!rounds[r][g]) rounds[r][g] = [];
            if (exIdx >= rounds[r][g].length) continue;
            const prevExForGroup = exIdx === 0 ? prevRoundExercises[g] : rounds[r][g][exIdx - 1];
            let chosen = available.find((ex) => !usedInSlot.has(ex) && ex !== prevExForGroup);
            if (!chosen) chosen = available.find((ex) => ex !== prevExForGroup);
            if (!chosen) chosen = available[0] || 'Wall Balls';
            rounds[r][g][exIdx] = chosen;
            usedInSlot.add(chosen);
          }
        }
      }
      return { ...prev, rounds };
    });
  }

  // AMRAP exercise helpers
  function updateAmrapExercise(groupIndex: number, exIndex: number, updates: Partial<ExerciseEntry>) {
    setConfig((prev) => {
      const amrapExercises = JSON.parse(JSON.stringify(prev.amrapExercises || {}));
      if (!amrapExercises[groupIndex]) amrapExercises[groupIndex] = [];
      amrapExercises[groupIndex][exIndex] = { ...amrapExercises[groupIndex][exIndex], ...updates };
      return { ...prev, amrapExercises };
    });
  }

  function addAmrapExercise(groupIndex: number) {
    setConfig((prev) => {
      const amrapExercises = JSON.parse(JSON.stringify(prev.amrapExercises || {}));
      if (!amrapExercises[groupIndex]) amrapExercises[groupIndex] = [];
      amrapExercises[groupIndex].push({ name: 'Wall Balls', reps: 10 });
      return { ...prev, amrapExercises };
    });
  }

  function removeAmrapExercise(groupIndex: number, exIndex: number) {
    setConfig((prev) => {
      const amrapExercises = JSON.parse(JSON.stringify(prev.amrapExercises || {}));
      if (amrapExercises[groupIndex]?.length > 1) {
        amrapExercises[groupIndex].splice(exIndex, 1);
      }
      return { ...prev, amrapExercises };
    });
  }

  // ForTime exercise helpers
  function updateForTimeExercise(groupIndex: number, exIndex: number, updates: Partial<ExerciseEntry>) {
    setConfig((prev) => {
      const forTimeExercises = JSON.parse(JSON.stringify(prev.forTimeExercises || {}));
      if (!forTimeExercises[groupIndex]) forTimeExercises[groupIndex] = [];
      forTimeExercises[groupIndex][exIndex] = { ...forTimeExercises[groupIndex][exIndex], ...updates };
      return { ...prev, forTimeExercises };
    });
  }

  function addForTimeExercise(groupIndex: number) {
    setConfig((prev) => {
      const forTimeExercises = JSON.parse(JSON.stringify(prev.forTimeExercises || {}));
      if (!forTimeExercises[groupIndex]) forTimeExercises[groupIndex] = [];
      forTimeExercises[groupIndex].push({ name: 'Wall Balls', reps: 10 });
      return { ...prev, forTimeExercises };
    });
  }

  function removeForTimeExercise(groupIndex: number, exIndex: number) {
    setConfig((prev) => {
      const forTimeExercises = JSON.parse(JSON.stringify(prev.forTimeExercises || {}));
      if (forTimeExercises[groupIndex]?.length > 1) {
        forTimeExercises[groupIndex].splice(exIndex, 1);
      }
      return { ...prev, forTimeExercises };
    });
  }

  async function saveWorkout() {
    setSaving(true);
    await supabase
      .from('workouts')
      .update({
        name,
        trainer_name: trainerName,
        config,
        is_public: isPublic,
        workout_mode: workoutMode,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    setSaving(false);
  }

  function startWorkout() {
    saveWorkout().then(() => {
      window.open(`/workout/${id}/live`, '_blank');
    });
  }

  // Ensure rounds structure
  useEffect(() => {
    if (config.numRounds > 0 && config.numGroups > 0) {
      const rounds = { ...config.rounds };
      let changed = false;
      for (let r = 0; r < config.numRounds; r++) {
        if (!rounds[r]) { rounds[r] = {}; changed = true; }
        for (let g = 0; g < config.numGroups; g++) {
          if (!rounds[r][g]) { rounds[r][g] = ['Wall Balls']; changed = true; }
        }
      }
      if (changed) setConfig((prev) => ({ ...prev, rounds }));
    }
  }, [config.numRounds, config.numGroups, config.rounds]);

  // Build combined exercise options (built-in + library)
  const allExerciseOptions = useMemo(() => {
    const builtIn = ALL_EXERCISES.map(e => e.name);
    const fromLib = libraryExercises.map(e => e.name).filter(n => !builtIn.includes(n));
    return { builtIn, fromLib };
  }, [libraryExercises]);

  function renderExerciseSelect(value: string, onChange: (v: string) => void) {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 px-3 py-2 bg-hclub-black border border-hclub-gray rounded-lg
                   text-white text-sm focus:outline-none focus:border-hclub-magenta"
      >
        <optgroup label="HYROX">
          {HYROX_EXERCISES.map((ex) => (
            <option key={ex.name} value={ex.name}>{ex.name}</option>
          ))}
        </optgroup>
        <optgroup label="Training">
          {TRAINING_EXERCISES.map((ex) => (
            <option key={ex.name} value={ex.name}>{ex.name}</option>
          ))}
        </optgroup>
        {allExerciseOptions.fromLib.length > 0 && (
          <optgroup label="Bibliothek">
            {allExerciseOptions.fromLib.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </optgroup>
        )}
        {!ALL_EXERCISES.find((e) => e.name === value) && !allExerciseOptions.fromLib.includes(value) && (
          <option value={value}>{value}</option>
        )}
      </select>
    );
  }

  if (!workout) {
    return (
      <div className="min-h-screen bg-hclub-black flex items-center justify-center text-gray-400">
        Laden...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-hclub-black">
      {/* Header */}
      <header className="border-b border-hclub-gray sticky top-0 bg-hclub-black z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/dashboard')}
              className="text-gray-400 hover:text-white transition-colors font-oswald uppercase tracking-wider text-sm"
            >
              &larr; Zurueck
            </button>
            <h1 className="font-oswald text-2xl font-bold tracking-wider">
              H-<span className="text-hclub-magenta">CLUB</span>
            </h1>
          </div>
          <div className="flex gap-3">
            <button
              onClick={saveWorkout}
              disabled={saving}
              className="px-5 py-2 bg-hclub-gray hover:bg-gray-600 text-white font-oswald uppercase
                         tracking-wider rounded-lg transition-colors text-sm disabled:opacity-50"
            >
              {saving ? 'Speichern...' : 'Speichern'}
            </button>
            <button
              onClick={startWorkout}
              className="px-5 py-2 bg-hclub-magenta hover:bg-hclub-magenta-dark text-white font-oswald
                         uppercase tracking-wider rounded-lg transition-colors text-sm"
            >
              Starten
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Basic info */}
        <div className="grid md:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm text-gray-400 mb-1 font-oswald uppercase tracking-wider">
              Workout Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 bg-hclub-dark border border-hclub-gray rounded-lg text-white
                         focus:outline-none focus:border-hclub-magenta transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1 font-oswald uppercase tracking-wider">
              Trainer Name
            </label>
            <input
              type="text"
              value={trainerName}
              onChange={(e) => setTrainerName(e.target.value)}
              className="w-full px-4 py-2 bg-hclub-dark border border-hclub-gray rounded-lg text-white
                         focus:outline-none focus:border-hclub-magenta transition-colors"
            />
          </div>
        </div>

        {/* Mode & visibility */}
        <div className="grid md:grid-cols-3 gap-4 mb-8">
          <div>
            <label className="block text-sm text-gray-400 mb-1 font-oswald uppercase tracking-wider">
              Workout-Modus
            </label>
            <select
              value={workoutMode}
              onChange={(e) => setWorkoutMode(e.target.value as WorkoutMode)}
              className="w-full px-4 py-2 bg-hclub-dark border border-hclub-gray rounded-lg text-white
                         focus:outline-none focus:border-hclub-magenta transition-colors"
            >
              <option value="timed">Zeitbasiert (Timer)</option>
              <option value="amrap">AMRAP (Wiederholungen)</option>
              <option value="fortime">Distanz/Wiederholungen (For Time)</option>
            </select>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                className="w-5 h-5 accent-hclub-magenta rounded"
              />
              <span className="text-sm font-oswald uppercase tracking-wider text-gray-300">
                Oeffentlich (andere Trainer sehen es)
              </span>
            </label>
          </div>
        </div>

        {/* ===================== TIMED MODE ===================== */}
        {workoutMode === 'timed' && (
          <>
            {/* Timing settings */}
            <div className="bg-hclub-dark border border-hclub-gray rounded-xl p-5 mb-8">
              <h3 className="font-oswald text-lg uppercase tracking-wider mb-4">
                Zeiteinstellungen
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1 font-oswald uppercase">Gruppen</label>
                  <input type="text" inputMode="numeric" pattern="[0-9]*" value={groupsInput}
                    onChange={(e) => { setGroupsInput(e.target.value); const val = parseInt(e.target.value); if (!isNaN(val) && val >= 1 && val <= 6) updateConfig({ numGroups: val }); }}
                    onBlur={() => { const val = parseInt(groupsInput); const c = isNaN(val) || val < 1 ? 1 : Math.min(6, val); setGroupsInput(String(c)); updateConfig({ numGroups: c }); }}
                    className="w-full px-3 py-2 bg-hclub-black border border-hclub-gray rounded-lg text-white text-center focus:outline-none focus:border-hclub-magenta" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1 font-oswald uppercase">Runden</label>
                  <input type="text" inputMode="numeric" pattern="[0-9]*" value={roundsInput}
                    onChange={(e) => { setRoundsInput(e.target.value); const val = parseInt(e.target.value); if (!isNaN(val) && val >= 1 && val <= 20) updateConfig({ numRounds: val }); }}
                    onBlur={() => { const val = parseInt(roundsInput); const c = isNaN(val) || val < 1 ? 1 : Math.min(20, val); setRoundsInput(String(c)); updateConfig({ numRounds: c }); }}
                    className="w-full px-3 py-2 bg-hclub-black border border-hclub-gray rounded-lg text-white text-center focus:outline-none focus:border-hclub-magenta" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1 font-oswald uppercase">Rundenpause (s)</label>
                  <input type="text" inputMode="numeric" pattern="[0-9]*" value={roundRestInput}
                    onChange={(e) => { setRoundRestInput(e.target.value); const val = parseInt(e.target.value); if (!isNaN(val) && val >= 0) updateConfig({ roundRestTime: Math.min(600, val) }); }}
                    onBlur={() => { const val = parseInt(roundRestInput); const c = isNaN(val) || val < 0 ? 0 : Math.min(600, val); setRoundRestInput(String(c)); updateConfig({ roundRestTime: c }); }}
                    className="w-full px-3 py-2 bg-hclub-black border border-hclub-gray rounded-lg text-white text-center focus:outline-none focus:border-hclub-magenta" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1 font-oswald uppercase">Warmup (s)</label>
                  <input type="text" inputMode="numeric" pattern="[0-9]*" value={warmupInput}
                    onChange={(e) => { setWarmupInput(e.target.value); const val = parseInt(e.target.value); if (!isNaN(val) && val >= 0) updateConfig({ warmupTime: Math.min(300, val) }); }}
                    onBlur={() => { const val = parseInt(warmupInput); const c = isNaN(val) || val < 0 ? 0 : Math.min(300, val); setWarmupInput(String(c)); updateConfig({ warmupTime: c }); }}
                    className="w-full px-3 py-2 bg-hclub-black border border-hclub-gray rounded-lg text-white text-center focus:outline-none focus:border-hclub-magenta" />
                </div>
              </div>
            </div>

            {/* Random fill button */}
            <div className="flex justify-center mb-8">
              <button onClick={randomFill}
                className="px-8 py-3 bg-purple-900/40 hover:bg-hclub-magenta border border-purple-500/50 hover:border-hclub-magenta
                           text-purple-300 hover:text-white font-oswald text-lg uppercase tracking-wider rounded-xl transition-all duration-300">
                Zufaellig befuellen
              </button>
            </div>

            {/* Rounds editor */}
            {Array.from({ length: config.numRounds }, (_, roundIndex) => {
              const roundHasCustomSettings = config.roundSettings?.[roundIndex] &&
                Object.keys(config.roundSettings[roundIndex]).length > 0;
              const isExpanded = expandedRoundSettings[roundIndex];
              const effectiveWorkTime = config.roundSettings?.[roundIndex]?.workTime ?? config.workTime;
              const effectiveRestTime = config.roundSettings?.[roundIndex]?.restTime ?? config.restTime;

              return (
              <div key={roundIndex} className="mb-8">
                <div className="flex items-center gap-3 mb-4">
                  <h3 className="font-oswald text-xl uppercase tracking-wider text-hclub-magenta">
                    Runde {roundIndex + 1}
                  </h3>
                  <button
                    onClick={() => toggleRoundSettings(roundIndex)}
                    className={`text-xs px-3 py-1 rounded-lg font-oswald uppercase tracking-wider transition-colors border ${
                      roundHasCustomSettings
                        ? 'border-hclub-magenta text-hclub-magenta bg-hclub-magenta/10'
                        : 'border-hclub-gray text-gray-400 hover:text-white hover:border-gray-500'
                    }`}
                  >
                    {isExpanded ? 'Zeiten' : 'Zeiten'}
                    {roundHasCustomSettings && ' *'}
                  </button>
                  {roundHasCustomSettings && !isExpanded && (
                    <span className="text-xs text-gray-500 font-oswald">
                      {effectiveWorkTime}s / {effectiveRestTime}s
                    </span>
                  )}
                  <button
                    onClick={() => duplicateRound(roundIndex)}
                    className="text-xs px-3 py-1 rounded-lg font-oswald uppercase tracking-wider transition-colors border
                               border-hclub-gray text-gray-400 hover:text-purple-300 hover:border-purple-500 hover:bg-purple-900/20"
                    title="Runde kopieren"
                  >
                    Runde kopieren
                  </button>
                </div>

                {isExpanded && (
                  <div className="bg-hclub-dark/50 border border-hclub-gray/50 rounded-lg p-4 mb-4 flex flex-wrap gap-4 items-end">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1 font-oswald uppercase">Arbeitszeit (s)</label>
                      <input type="number" min={5} max={600} step={5} value={effectiveWorkTime}
                        onChange={(e) => { const val = parseInt(e.target.value) || config.workTime; updateRoundSetting(roundIndex, 'workTime', val === config.workTime ? undefined : val); }}
                        className="w-24 px-3 py-2 bg-hclub-black border border-hclub-gray rounded-lg text-white text-center text-sm focus:outline-none focus:border-hclub-magenta" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1 font-oswald uppercase">Pause (s)</label>
                      <input type="number" min={0} max={300} step={5} value={effectiveRestTime}
                        onChange={(e) => { const val = parseInt(e.target.value) || 0; updateRoundSetting(roundIndex, 'restTime', val === config.restTime ? undefined : val); }}
                        className="w-24 px-3 py-2 bg-hclub-black border border-hclub-gray rounded-lg text-white text-center text-sm focus:outline-none focus:border-hclub-magenta" />
                    </div>
                    {roundHasCustomSettings && (
                      <button onClick={() => { setConfig((prev) => { const rs = { ...(prev.roundSettings || {}) }; delete rs[roundIndex]; return { ...prev, roundSettings: rs }; }); }}
                        className="text-xs text-red-400 hover:text-red-300 font-oswald uppercase px-3 py-2">Zuruecksetzen</button>
                    )}
                  </div>
                )}

                <div className={`grid gap-4 grid-cols-1 ${config.numGroups >= 2 ? 'sm:grid-cols-2' : ''} ${config.numGroups >= 3 ? 'lg:grid-cols-3' : ''} ${config.numGroups >= 4 ? 'xl:grid-cols-4' : ''}`}>
                  {Array.from({ length: config.numGroups }, (_, groupIndex) => {
                    const groupKey = `${roundIndex}-${groupIndex}`;
                    const groupHasCustomTime = config.groupTimeSettings?.[roundIndex]?.[groupIndex] &&
                      Object.keys(config.groupTimeSettings[roundIndex][groupIndex]).length > 0;
                    const isGroupExpanded = expandedGroupSettings[groupKey];
                    const groupWorkTime = config.groupTimeSettings?.[roundIndex]?.[groupIndex]?.workTime ?? effectiveWorkTime;
                    const groupRestTime = config.groupTimeSettings?.[roundIndex]?.[groupIndex]?.restTime ?? effectiveRestTime;

                    return (
                    <div key={groupIndex} className="bg-hclub-dark border border-hclub-gray rounded-xl p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-oswald text-sm uppercase tracking-wider text-gray-400">
                          Gruppe {groupIndex + 1}
                        </h4>
                        <button
                          onClick={() => toggleGroupSettings(roundIndex, groupIndex)}
                          className={`text-[10px] px-2 py-0.5 rounded font-oswald uppercase tracking-wider transition-colors border ${
                            groupHasCustomTime
                              ? 'border-cyan-500 text-cyan-400 bg-cyan-500/10'
                              : 'border-hclub-gray/50 text-gray-500 hover:text-gray-300'
                          }`}
                        >
                          {groupHasCustomTime ? `${groupWorkTime}s/${groupRestTime}s` : 'Zeit'}
                        </button>
                      </div>

                      {isGroupExpanded && (
                        <div className="bg-hclub-black/50 border border-hclub-gray/30 rounded-lg p-3 mb-3 flex flex-wrap gap-3 items-end">
                          <div>
                            <label className="block text-[10px] text-gray-500 mb-1 font-oswald uppercase">Arbeit (s)</label>
                            <input type="number" min={5} max={600} step={5} value={groupWorkTime}
                              onChange={(e) => { const val = parseInt(e.target.value) || effectiveWorkTime; updateGroupTimeSetting(roundIndex, groupIndex, 'workTime', val === effectiveWorkTime ? undefined : val); }}
                              className="w-20 px-2 py-1 bg-hclub-black border border-hclub-gray rounded text-white text-center text-xs focus:outline-none focus:border-cyan-500" />
                          </div>
                          <div>
                            <label className="block text-[10px] text-gray-500 mb-1 font-oswald uppercase">Pause (s)</label>
                            <input type="number" min={0} max={300} step={5} value={groupRestTime}
                              onChange={(e) => { const val = parseInt(e.target.value) || 0; updateGroupTimeSetting(roundIndex, groupIndex, 'restTime', val === effectiveRestTime ? undefined : val); }}
                              className="w-20 px-2 py-1 bg-hclub-black border border-hclub-gray rounded text-white text-center text-xs focus:outline-none focus:border-cyan-500" />
                          </div>
                          {groupHasCustomTime && (
                            <button onClick={() => { updateGroupTimeSetting(roundIndex, groupIndex, 'workTime', undefined); updateGroupTimeSetting(roundIndex, groupIndex, 'restTime', undefined); }}
                              className="text-[10px] text-red-400 hover:text-red-300 font-oswald uppercase px-2 py-1">Reset</button>
                          )}
                        </div>
                      )}

                      {(config.rounds[roundIndex]?.[groupIndex] || []).map((exercise, exIdx) => {
                        const overrideKey = getIconOverrideKey(roundIndex, groupIndex, exIdx);
                        const IconComponent = overrideKey
                          ? (exerciseIconMap[overrideKey] || getExerciseIcon(exercise))
                          : getExerciseIcon(exercise);
                        const isPickerOpen =
                          iconPickerOpen?.round === roundIndex &&
                          iconPickerOpen?.group === groupIndex &&
                          iconPickerOpen?.ex === exIdx;
                        return (
                        <div key={exIdx} className="mb-2">
                          <div className="flex gap-2">
                            <button type="button"
                              onClick={() => setIconPickerOpen(isPickerOpen ? null : { round: roundIndex, group: groupIndex, ex: exIdx })}
                              title="Icon waehlen"
                              className={`flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-lg border transition-colors ${
                                isPickerOpen ? 'border-hclub-magenta bg-hclub-magenta/10'
                                : overrideKey ? 'border-hclub-magenta/50 bg-hclub-dark'
                                : 'border-hclub-gray bg-hclub-black hover:border-gray-500'
                              }`}>
                              <IconComponent size={22} color={isPickerOpen ? '#e91e8c' : '#9ca3af'} />
                            </button>
                            {renderExerciseSelect(exercise, (v) => setExercise(roundIndex, groupIndex, exIdx, v))}
                            <button onClick={() => removeExerciseFromGroup(roundIndex, groupIndex, exIdx)}
                              className="px-2 text-red-400 hover:text-red-300 text-sm" title="Entfernen">x</button>
                          </div>
                          {isPickerOpen && (
                            <div className="mt-1 p-2 bg-hclub-black border border-hclub-magenta/40 rounded-lg">
                              <div className="grid grid-cols-6 gap-1">
                                {ICON_PICKER_OPTIONS.map(({ key, label, Component }) => (
                                  <button key={key} type="button" title={label}
                                    onClick={() => { setIconOverride(roundIndex, groupIndex, exIdx, key === '__generic__' ? null : key); setIconPickerOpen(null); }}
                                    className={`flex items-center justify-center w-9 h-9 rounded border transition-colors ${
                                      (overrideKey === key) || (!overrideKey && key === '__generic__' && getExerciseIcon(exercise) === Component)
                                        ? 'border-hclub-magenta bg-hclub-magenta/20' : 'border-hclub-gray/40 hover:border-hclub-magenta/60 hover:bg-hclub-dark'
                                    }`}>
                                    <Component size={20} color="#9ca3af" />
                                  </button>
                                ))}
                              </div>
                              {overrideKey && (
                                <button type="button"
                                  onClick={() => { setIconOverride(roundIndex, groupIndex, exIdx, null); setIconPickerOpen(null); }}
                                  className="mt-1 text-xs text-gray-500 hover:text-red-400 font-oswald uppercase">Reset</button>
                              )}
                            </div>
                          )}
                        </div>
                        );
                      })}
                      <div className="flex gap-2 mt-2">
                        <button onClick={() => addExerciseToGroup(roundIndex, groupIndex)}
                          className="text-xs text-hclub-magenta hover:text-white transition-colors font-oswald uppercase">+ Uebung</button>
                      </div>
                      <div className="flex gap-2 mt-2">
                        <input type="text" value={customExercise}
                          onChange={(e) => setCustomExercise(e.target.value)}
                          placeholder="Eigene Uebung..."
                          className="flex-1 px-2 py-1 bg-hclub-black border border-hclub-gray rounded text-white text-xs focus:outline-none focus:border-hclub-magenta"
                          onKeyDown={(e) => { if (e.key === 'Enter') addCustomExercise(roundIndex, groupIndex); }} />
                        <button onClick={() => addCustomExercise(roundIndex, groupIndex)}
                          className="text-xs text-hclub-magenta hover:text-white px-2">+</button>
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>
              );
            })}
          </>
        )}

        {/* ===================== AMRAP MODE ===================== */}
        {workoutMode === 'amrap' && (
          <>
            <div className="bg-hclub-dark border border-hclub-gray rounded-xl p-5 mb-8">
              <h3 className="font-oswald text-lg uppercase tracking-wider mb-4 text-orange-400">
                AMRAP Einstellungen
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1 font-oswald uppercase">Gesamtzeit (Min)</label>
                  <input type="number" min={1} max={120}
                    value={Math.floor((config.amrapTotalTime || 1200) / 60)}
                    onChange={(e) => { const val = Math.max(1, Math.min(120, parseInt(e.target.value) || 20)); setConfig(p => ({ ...p, amrapTotalTime: val * 60 })); }}
                    className="w-full px-3 py-2 bg-hclub-black border border-hclub-gray rounded-lg text-white text-center focus:outline-none focus:border-orange-400" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1 font-oswald uppercase">Gruppen</label>
                  <input type="number" min={1} max={6}
                    value={config.numGroups}
                    onChange={(e) => { const val = Math.max(1, Math.min(6, parseInt(e.target.value) || 1)); updateConfig({ numGroups: val }); }}
                    className="w-full px-3 py-2 bg-hclub-black border border-hclub-gray rounded-lg text-white text-center focus:outline-none focus:border-orange-400" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1 font-oswald uppercase">Warmup (s)</label>
                  <input type="number" min={0} max={300}
                    value={config.warmupTime}
                    onChange={(e) => { const val = Math.max(0, Math.min(300, parseInt(e.target.value) || 0)); updateConfig({ warmupTime: val }); }}
                    className="w-full px-3 py-2 bg-hclub-black border border-hclub-gray rounded-lg text-white text-center focus:outline-none focus:border-orange-400" />
                </div>
              </div>
            </div>

            {/* AMRAP exercises per group */}
            <div className={`grid gap-4 ${config.numGroups >= 2 ? 'md:grid-cols-2' : ''} ${config.numGroups >= 3 ? 'lg:grid-cols-3' : ''}`}>
              {Array.from({ length: config.numGroups }, (_, gIdx) => {
                const exercises = config.amrapExercises?.[gIdx] || [];
                return (
                  <div key={gIdx} className="bg-hclub-dark border border-hclub-gray rounded-xl p-4">
                    <h4 className="font-oswald text-sm uppercase tracking-wider text-gray-400 mb-3">
                      Gruppe {gIdx + 1}
                    </h4>
                    {exercises.map((ex, eIdx) => (
                      <div key={eIdx} className="flex gap-2 mb-2 items-center">
                        {renderExerciseSelect(ex.name, (v) => updateAmrapExercise(gIdx, eIdx, { name: v }))}
                        <input type="number" min={1} max={999} value={ex.reps || ''}
                          onChange={(e) => updateAmrapExercise(gIdx, eIdx, { reps: parseInt(e.target.value) || undefined })}
                          placeholder="Reps"
                          className="w-16 px-2 py-2 bg-hclub-black border border-hclub-gray rounded-lg text-white text-xs text-center focus:outline-none focus:border-orange-400" />
                        <span className="text-gray-500 text-xs">x</span>
                        <button onClick={() => removeAmrapExercise(gIdx, eIdx)}
                          className="text-red-400 hover:text-red-300 text-sm px-1">x</button>
                      </div>
                    ))}
                    <button onClick={() => addAmrapExercise(gIdx)}
                      className="text-xs text-orange-400 hover:text-white transition-colors font-oswald uppercase mt-2">+ Uebung</button>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ===================== FOR TIME MODE ===================== */}
        {workoutMode === 'fortime' && (
          <>
            <div className="bg-hclub-dark border border-hclub-gray rounded-xl p-5 mb-8">
              <h3 className="font-oswald text-lg uppercase tracking-wider mb-4 text-cyan-400">
                For Time Einstellungen
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1 font-oswald uppercase">Gruppen</label>
                  <input type="number" min={1} max={6}
                    value={config.numGroups}
                    onChange={(e) => { const val = Math.max(1, Math.min(6, parseInt(e.target.value) || 1)); updateConfig({ numGroups: val }); }}
                    className="w-full px-3 py-2 bg-hclub-black border border-hclub-gray rounded-lg text-white text-center focus:outline-none focus:border-cyan-400" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1 font-oswald uppercase">Warmup (s)</label>
                  <input type="number" min={0} max={300}
                    value={config.warmupTime}
                    onChange={(e) => { const val = Math.max(0, Math.min(300, parseInt(e.target.value) || 0)); updateConfig({ warmupTime: val }); }}
                    className="w-full px-3 py-2 bg-hclub-black border border-hclub-gray rounded-lg text-white text-center focus:outline-none focus:border-cyan-400" />
                </div>
              </div>
              <p className="text-gray-500 text-xs mt-3 font-oswald uppercase">
                Kein Timer - Gruppen werden manuell weitergeschaltet (Klick oder Taste 1-{config.numGroups})
              </p>
            </div>

            {/* ForTime exercises per group */}
            <div className={`grid gap-4 ${config.numGroups >= 2 ? 'md:grid-cols-2' : ''} ${config.numGroups >= 3 ? 'lg:grid-cols-3' : ''}`}>
              {Array.from({ length: config.numGroups }, (_, gIdx) => {
                const exercises = config.forTimeExercises?.[gIdx] || [];
                return (
                  <div key={gIdx} className="bg-hclub-dark border border-hclub-gray rounded-xl p-4">
                    <h4 className="font-oswald text-sm uppercase tracking-wider text-gray-400 mb-3">
                      Gruppe {gIdx + 1} <span className="text-cyan-400 text-xs">(Taste {gIdx + 1})</span>
                    </h4>
                    {exercises.map((ex, eIdx) => (
                      <div key={eIdx} className="flex gap-2 mb-2 items-center flex-wrap">
                        {renderExerciseSelect(ex.name, (v) => updateForTimeExercise(gIdx, eIdx, { name: v }))}
                        <input type="text" value={ex.distance || ''} placeholder="z.B. 500m"
                          onChange={(e) => updateForTimeExercise(gIdx, eIdx, { distance: e.target.value || undefined })}
                          className="w-20 px-2 py-2 bg-hclub-black border border-hclub-gray rounded-lg text-white text-xs text-center focus:outline-none focus:border-cyan-400" />
                        <input type="number" min={0} value={ex.reps || ''} placeholder="Reps"
                          onChange={(e) => updateForTimeExercise(gIdx, eIdx, { reps: parseInt(e.target.value) || undefined })}
                          className="w-16 px-2 py-2 bg-hclub-black border border-hclub-gray rounded-lg text-white text-xs text-center focus:outline-none focus:border-cyan-400" />
                        <input type="number" min={0} value={ex.duration || ''} placeholder="Sek"
                          onChange={(e) => updateForTimeExercise(gIdx, eIdx, { duration: parseInt(e.target.value) || undefined })}
                          className="w-16 px-2 py-2 bg-hclub-black border border-hclub-gray rounded-lg text-white text-xs text-center focus:outline-none focus:border-cyan-400" />
                        <button onClick={() => removeForTimeExercise(gIdx, eIdx)}
                          className="text-red-400 hover:text-red-300 text-sm px-1">x</button>
                      </div>
                    ))}
                    <button onClick={() => addForTimeExercise(gIdx)}
                      className="text-xs text-cyan-400 hover:text-white transition-colors font-oswald uppercase mt-2">+ Uebung</button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
