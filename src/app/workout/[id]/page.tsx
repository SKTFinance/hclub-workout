'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter, useParams } from 'next/navigation';
import type { Workout, WorkoutConfig } from '@/lib/types';
import { HYROX_EXERCISES, TRAINING_EXERCISES } from '@/lib/exercises';

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
      setConfig(w.config);
    }
  }, [supabase, id]);

  useEffect(() => {
    loadWorkout();
  }, [loadWorkout]);

  function updateConfig(partial: Partial<WorkoutConfig>) {
    setConfig((prev) => {
      const next = { ...prev, ...partial };

      // If numRounds or numGroups changed, ensure rounds structure exists
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
    setConfig((prev) => {
      const rounds = JSON.parse(JSON.stringify(prev.rounds));
      if (!rounds[roundIndex]) rounds[roundIndex] = {};
      if (!rounds[roundIndex][groupIndex]) rounds[roundIndex][groupIndex] = [];
      rounds[roundIndex][groupIndex].push(customExercise.trim());
      return { ...prev, rounds };
    });
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

  function toggleRoundSettings(roundIndex: number) {
    setExpandedRoundSettings((prev) => ({ ...prev, [roundIndex]: !prev[roundIndex] }));
  }

  function randomFill() {
    setConfig((prev) => {
      const rounds = JSON.parse(JSON.stringify(prev.rounds));
      const exercisePool = ALL_EXERCISES.map((e) => e.name);

      for (let r = 0; r < prev.numRounds; r++) {
        if (!rounds[r]) rounds[r] = {};

        // Collect previous round's exercises per group to avoid same-in-a-row
        const prevRoundExercises: Record<number, string> = {};
        if (r > 0 && rounds[r - 1]) {
          for (let g = 0; g < prev.numGroups; g++) {
            const prevEx = rounds[r - 1]?.[g];
            if (prevEx && prevEx.length > 0) {
              prevRoundExercises[g] = prevEx[prevEx.length - 1];
            }
          }
        }

        // For each exercise slot in the round, assign unique exercises per group
        const maxExercisesInRound = Math.max(
          ...Array.from({ length: prev.numGroups }, (_, g) =>
            (rounds[r]?.[g]?.length || 1)
          )
        );

        for (let exIdx = 0; exIdx < maxExercisesInRound; exIdx++) {
          // Shuffle available exercises
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

            // Find an exercise not used in this slot and not same as previous for this group
            let chosen = available.find(
              (ex) => !usedInSlot.has(ex) && ex !== prevExForGroup
            );
            if (!chosen) {
              // Fallback: just avoid same-in-a-row
              chosen = available.find((ex) => ex !== prevExForGroup);
            }
            if (!chosen) {
              chosen = available[0] || 'Wall Balls';
            }

            rounds[r][g][exIdx] = chosen;
            usedInSlot.add(chosen);
          }
        }
      }

      return { ...prev, rounds };
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
              &larr; Zurück
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
        <div className="grid md:grid-cols-2 gap-4 mb-8">
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

        {/* Timing settings */}
        <div className="bg-hclub-dark border border-hclub-gray rounded-xl p-5 mb-8">
          <h3 className="font-oswald text-lg uppercase tracking-wider mb-4">
            Zeiteinstellungen
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1 font-oswald uppercase">
                Gruppen
              </label>
              <input
                type="number"
                min={1}
                max={6}
                value={config.numGroups}
                onChange={(e) => updateConfig({ numGroups: Math.max(1, Math.min(6, parseInt(e.target.value) || 1)) })}
                className="w-full px-3 py-2 bg-hclub-black border border-hclub-gray rounded-lg text-white
                           text-center focus:outline-none focus:border-hclub-magenta"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1 font-oswald uppercase">
                Runden
              </label>
              <input
                type="number"
                min={1}
                max={20}
                value={config.numRounds}
                onChange={(e) => updateConfig({ numRounds: Math.max(1, Math.min(20, parseInt(e.target.value) || 1)) })}
                className="w-full px-3 py-2 bg-hclub-black border border-hclub-gray rounded-lg text-white
                           text-center focus:outline-none focus:border-hclub-magenta"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1 font-oswald uppercase">
                Arbeitszeit (s)
              </label>
              <input
                type="number"
                min={5}
                max={600}
                step={5}
                value={config.workTime}
                onChange={(e) => updateConfig({ workTime: parseInt(e.target.value) || 60 })}
                className="w-full px-3 py-2 bg-hclub-black border border-hclub-gray rounded-lg text-white
                           text-center focus:outline-none focus:border-hclub-magenta"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1 font-oswald uppercase">
                Pause (s)
              </label>
              <input
                type="number"
                min={0}
                max={300}
                step={5}
                value={config.restTime}
                onChange={(e) => updateConfig({ restTime: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 bg-hclub-black border border-hclub-gray rounded-lg text-white
                           text-center focus:outline-none focus:border-hclub-magenta"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1 font-oswald uppercase">
                Rundenpause (s)
              </label>
              <input
                type="number"
                min={0}
                max={600}
                step={5}
                value={config.roundRestTime}
                onChange={(e) => updateConfig({ roundRestTime: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 bg-hclub-black border border-hclub-gray rounded-lg text-white
                           text-center focus:outline-none focus:border-hclub-magenta"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1 font-oswald uppercase">
                Warmup (s)
              </label>
              <input
                type="number"
                min={0}
                max={300}
                step={5}
                value={config.warmupTime}
                onChange={(e) => updateConfig({ warmupTime: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 bg-hclub-black border border-hclub-gray rounded-lg text-white
                           text-center focus:outline-none focus:border-hclub-magenta"
              />
            </div>
          </div>
        </div>

        {/* Random fill button */}
        <div className="flex justify-center mb-8">
          <button
            onClick={randomFill}
            className="px-8 py-3 bg-purple-900/40 hover:bg-hclub-magenta border border-purple-500/50 hover:border-hclub-magenta
                       text-purple-300 hover:text-white font-oswald text-lg uppercase tracking-wider rounded-xl
                       transition-all duration-300"
          >
            Zufällig befüllen
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
                {isExpanded ? 'Zeiten ▲' : 'Zeiten ▼'}
                {roundHasCustomSettings && ' ✦'}
              </button>
              {roundHasCustomSettings && !isExpanded && (
                <span className="text-xs text-gray-500 font-oswald">
                  {effectiveWorkTime}s / {effectiveRestTime}s
                </span>
              )}
            </div>

            {isExpanded && (
              <div className="bg-hclub-dark/50 border border-hclub-gray/50 rounded-lg p-4 mb-4 flex flex-wrap gap-4 items-end">
                <div>
                  <label className="block text-xs text-gray-400 mb-1 font-oswald uppercase">
                    Arbeitszeit (s)
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={600}
                    step={5}
                    value={effectiveWorkTime}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || config.workTime;
                      updateRoundSetting(roundIndex, 'workTime', val === config.workTime ? undefined : val);
                    }}
                    className="w-24 px-3 py-2 bg-hclub-black border border-hclub-gray rounded-lg text-white
                               text-center text-sm focus:outline-none focus:border-hclub-magenta"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1 font-oswald uppercase">
                    Pause (s)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={300}
                    step={5}
                    value={effectiveRestTime}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 0;
                      updateRoundSetting(roundIndex, 'restTime', val === config.restTime ? undefined : val);
                    }}
                    className="w-24 px-3 py-2 bg-hclub-black border border-hclub-gray rounded-lg text-white
                               text-center text-sm focus:outline-none focus:border-hclub-magenta"
                  />
                </div>
                {roundHasCustomSettings && (
                  <button
                    onClick={() => {
                      setConfig((prev) => {
                        const roundSettings = { ...(prev.roundSettings || {}) };
                        delete roundSettings[roundIndex];
                        return { ...prev, roundSettings };
                      });
                    }}
                    className="text-xs text-red-400 hover:text-red-300 font-oswald uppercase px-3 py-2"
                  >
                    Zurücksetzen
                  </button>
                )}
              </div>
            )}

            <div className={`grid gap-4 grid-cols-1 ${config.numGroups >= 2 ? 'sm:grid-cols-2' : ''} ${config.numGroups >= 3 ? 'lg:grid-cols-3' : ''} ${config.numGroups >= 4 ? 'xl:grid-cols-4' : ''}`}>
              {Array.from({ length: config.numGroups }, (_, groupIndex) => (
                <div
                  key={groupIndex}
                  className="bg-hclub-dark border border-hclub-gray rounded-xl p-4"
                >
                  <h4 className="font-oswald text-sm uppercase tracking-wider text-gray-400 mb-3">
                    Gruppe {groupIndex + 1}
                  </h4>
                  {(config.rounds[roundIndex]?.[groupIndex] || []).map((exercise, exIdx) => (
                    <div key={exIdx} className="flex gap-2 mb-2">
                      <select
                        value={exercise}
                        onChange={(e) => setExercise(roundIndex, groupIndex, exIdx, e.target.value)}
                        className="flex-1 px-3 py-2 bg-hclub-black border border-hclub-gray rounded-lg
                                   text-white text-sm focus:outline-none focus:border-hclub-magenta"
                      >
                        <optgroup label="HYROX">
                          {HYROX_EXERCISES.map((ex) => (
                            <option key={ex.name} value={ex.name}>
                              {ex.name}
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label="Training">
                          {TRAINING_EXERCISES.map((ex) => (
                            <option key={ex.name} value={ex.name}>
                              {ex.name}
                            </option>
                          ))}
                        </optgroup>
                        {/* If current value is custom, show it */}
                        {!ALL_EXERCISES.find((e) => e.name === exercise) && (
                          <option value={exercise}>{exercise}</option>
                        )}
                      </select>
                      <button
                        onClick={() => removeExerciseFromGroup(roundIndex, groupIndex, exIdx)}
                        className="px-2 text-red-400 hover:text-red-300 text-sm"
                        title="Entfernen"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => addExerciseToGroup(roundIndex, groupIndex)}
                      className="text-xs text-hclub-magenta hover:text-white transition-colors font-oswald uppercase"
                    >
                      + Übung
                    </button>
                  </div>
                  <div className="flex gap-2 mt-2">
                    <input
                      type="text"
                      value={customExercise}
                      onChange={(e) => setCustomExercise(e.target.value)}
                      placeholder="Eigene Übung..."
                      className="flex-1 px-2 py-1 bg-hclub-black border border-hclub-gray rounded text-white
                                 text-xs focus:outline-none focus:border-hclub-magenta"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') addCustomExercise(roundIndex, groupIndex);
                      }}
                    />
                    <button
                      onClick={() => addCustomExercise(roundIndex, groupIndex)}
                      className="text-xs text-hclub-magenta hover:text-white px-2"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          );
        })}
      </main>
    </div>
  );
}
