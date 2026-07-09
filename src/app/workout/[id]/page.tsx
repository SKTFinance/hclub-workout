'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter, useParams } from 'next/navigation';
import type { Workout, WorkoutConfig, WorkoutMode, ExerciseEntry, LibraryExercise, ForTimeBlock } from '@/lib/types';
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
  const [isPublic, setIsPublic] = useState(true);
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
  const [customForTimeExercise, setCustomForTimeExercise] = useState<Record<string, string>>({});
  const [expandedRoundSettings, setExpandedRoundSettings] = useState<Record<number, boolean>>({});
  const [expandedGroupSettings, setExpandedGroupSettings] = useState<Record<string, boolean>>({});
  // Local string states for number inputs
  const [groupsInput, setGroupsInput] = useState(String(config.numGroups));
  const [roundsInput, setRoundsInput] = useState(String(config.numRounds));
  const [roundRestInput, setRoundRestInput] = useState(String(config.roundRestTime));
  const [warmupInput, setWarmupInput] = useState(String(config.warmupTime));
  const [iconPickerOpen, setIconPickerOpen] = useState<{ round: number; group: number; ex: number } | null>(null);
  // Drag-and-drop state for reordering exercises within a group
  const [dragExercise, setDragExercise] = useState<{ round: number; group: number; ex: number } | null>(null);
  const [dragOverExercise, setDragOverExercise] = useState<{ round: number; group: number; ex: number } | null>(null);
  // Exercise library
  const [libraryExercises, setLibraryExercises] = useState<LibraryExercise[]>([]);
  // Admin state
  const [isAdmin, setIsAdmin] = useState(false);

  // ForTime (= AMRAP im UI) round timer state
  const [forTimeRoundTimerEnabled, setForTimeRoundTimerEnabled] = useState(false);
  const [forTimeRoundTimerMinutes, setForTimeRoundTimerMinutes] = useState(12);

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
      setIsPublic(w.is_public || false);
      setWorkoutMode(w.workout_mode || 'timed');
      setConfig(w.config);
      setGroupsInput(String(w.config.numGroups));
      setRoundsInput(String(w.config.numRounds));
      setRoundRestInput(String(w.config.roundRestTime));
      setWarmupInput(String(w.config.warmupTime));
      // Load fortime round timer settings from config
      if (w.config.forTimeRoundTimerEnabled) {
        setForTimeRoundTimerEnabled(true);
        setForTimeRoundTimerMinutes(w.config.forTimeRoundTimerMinutes || 12);
      }
    }
  }, [supabase, id]);

  const loadLibrary = useCallback(async () => {
    const { data } = await supabase
      .from('exercise_library')
      .select('*')
      .order('name');
    if (data) setLibraryExercises(data as LibraryExercise[]);
  }, [supabase]);

  const checkAdmin = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('hclub_admins')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle();
    setIsAdmin(!!data);
  }, [supabase]);

  useEffect(() => {
    loadWorkout();
    loadLibrary();
    checkAdmin();
  }, [loadWorkout, loadLibrary, checkAdmin]);

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

  // Reorder exercises within a group (drag-and-drop). Moves the exercise at
  // `fromIndex` to `toIndex` and keeps the per-exercise iconOverrides in sync.
  function reorderExerciseInGroup(roundIndex: number, groupIndex: number, fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return;
    setConfig((prev) => {
      const rounds = JSON.parse(JSON.stringify(prev.rounds));
      const list: string[] = rounds[roundIndex]?.[groupIndex];
      if (!Array.isArray(list) || fromIndex < 0 || toIndex < 0 || fromIndex >= list.length || toIndex >= list.length) {
        return prev;
      }
      const [moved] = list.splice(fromIndex, 1);
      list.splice(toIndex, 0, moved);
      rounds[roundIndex][groupIndex] = list;

      // Keep iconOverrides aligned to the new exercise order
      const iconOverrides = JSON.parse(JSON.stringify(prev.iconOverrides || {}));
      const groupOverrides = iconOverrides[roundIndex]?.[groupIndex];
      if (groupOverrides && Object.keys(groupOverrides).length > 0) {
        const orderKeys = list.map((_, i) => i);
        // Build old-index order then apply same splice to derive mapping
        const idxOrder = orderKeys.map((_, i) => i);
        const [movedIdx] = idxOrder.splice(fromIndex, 1);
        idxOrder.splice(toIndex, 0, movedIdx);
        const remapped: Record<number, string> = {};
        idxOrder.forEach((oldIdx, newIdx) => {
          if (groupOverrides[oldIdx] !== undefined) remapped[newIdx] = groupOverrides[oldIdx];
        });
        if (!iconOverrides[roundIndex]) iconOverrides[roundIndex] = {};
        iconOverrides[roundIndex][groupIndex] = remapped;
      }

      return { ...prev, rounds, iconOverrides };
    });
  }

  // Duplicate a group across ALL rounds: inserts a copy right after `groupIndex`,
  // shifts subsequent groups (rounds/groupTimeSettings/iconOverrides) by one,
  // bumps numGroups. `rotateBy` cyclically rotates the exercise order of the NEW
  // group in every round (1st -> 2nd, ..., last -> 1st for rotateBy=1). 0 = exact copy.
  function duplicateGroup(roundIndex: number, groupIndex: number, rotateBy: number) {
    setConfig((prev) => {
      const newNumGroups = prev.numGroups + 1;
      const rounds = JSON.parse(JSON.stringify(prev.rounds));
      const groupTimeSettings = JSON.parse(JSON.stringify(prev.groupTimeSettings || {}));
      const iconOverrides = JSON.parse(JSON.stringify(prev.iconOverrides || {}));

      const rotate = <T,>(arr: T[], by: number): T[] => {
        const n = arr.length;
        if (n === 0) return arr;
        const k = ((by % n) + n) % n;
        if (k === 0) return arr.slice();
        // rotateBy=1 => 1. -> 2. means element moves DOWN by one position:
        // new[i] = old[(i - k + n) % n]
        return arr.map((_, i) => arr[(i - k + n) % n]);
      };

      const insertAt = groupIndex + 1;

      // For every round, shift group-indexed exercise arrays right, then insert copy
      for (let r = 0; r < prev.numRounds; r++) {
        if (!rounds[r]) rounds[r] = {};
        for (let g = newNumGroups - 1; g > insertAt; g--) {
          rounds[r][g] = rounds[r][g - 1];
        }
        const source = prev.rounds[r]?.[groupIndex] || ['Wall Balls'];
        rounds[r][insertAt] = rotate(JSON.parse(JSON.stringify(source)), rotateBy);

        // Shift group-indexed settings for this round
        if (groupTimeSettings[r]) {
          for (let g = newNumGroups - 1; g > insertAt; g--) {
            if (groupTimeSettings[r][g - 1] !== undefined) groupTimeSettings[r][g] = groupTimeSettings[r][g - 1];
            else delete groupTimeSettings[r][g];
          }
          if (groupTimeSettings[r][groupIndex] !== undefined) {
            groupTimeSettings[r][insertAt] = JSON.parse(JSON.stringify(groupTimeSettings[r][groupIndex]));
          } else {
            delete groupTimeSettings[r][insertAt];
          }
        }

        if (iconOverrides[r]) {
          for (let g = newNumGroups - 1; g > insertAt; g--) {
            if (iconOverrides[r][g - 1] !== undefined) iconOverrides[r][g] = iconOverrides[r][g - 1];
            else delete iconOverrides[r][g];
          }
          if (iconOverrides[r][groupIndex] !== undefined) {
            // Copy overrides and rotate their indices to match the rotated order
            const srcOv: Record<number, string> = iconOverrides[r][groupIndex];
            const srcLen = (prev.rounds[r]?.[groupIndex] || []).length;
            const rotated: Record<number, string> = {};
            if (srcLen > 0) {
              const k = ((rotateBy % srcLen) + srcLen) % srcLen;
              Object.entries(srcOv).forEach(([oldIdxStr, val]) => {
                const oldIdx = Number(oldIdxStr);
                const newIdx = (oldIdx + k) % srcLen;
                rotated[newIdx] = val as string;
              });
            }
            iconOverrides[r][insertAt] = rotated;
          } else {
            delete iconOverrides[r][insertAt];
          }
        }
      }

      return {
        ...prev,
        numGroups: newNumGroups,
        rounds,
        groupTimeSettings,
        iconOverrides,
      };
    });
    setGroupsInput(String(config.numGroups + 1));
  }

  // Asks how far to rotate the copied group's exercise order, then duplicates.
  function promptDuplicateGroup(roundIndex: number, groupIndex: number) {
    const exCount = (config.rounds[roundIndex]?.[groupIndex] || []).length;
    const answer = window.prompt(
      `Gruppe ${groupIndex + 1} duplizieren.\n\nWillst du die Anordnung um X verschieben?\n(1 = jede Übung rückt eine Position weiter, 2 = zwei, … · leer/0 = exakte Kopie)`,
      '0'
    );
    if (answer === null) return; // cancelled
    const raw = parseInt(answer.trim(), 10);
    const rotateBy = isNaN(raw) ? 0 : (exCount > 0 ? ((raw % exCount) + exCount) % exCount : 0);
    duplicateGroup(roundIndex, groupIndex, rotateBy);
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

  // ForTime Block helpers (= AMRAP-Modus im UI)
  function getForTimeBlocks(): ForTimeBlock[] {
    if (config.forTimeBlocks && config.forTimeBlocks.length > 0) return config.forTimeBlocks;
    // Legacy: convert single block to array
    return [{
      exercises: config.forTimeExercises || {},
    }];
  }

  function setForTimeBlocks(blocks: ForTimeBlock[]) {
    setConfig(prev => ({
      ...prev,
      forTimeBlocks: blocks,
      forTimeExercises: blocks[0]?.exercises || {},
    }));
  }

  function addForTimeBlock() {
    const blocks = getForTimeBlocks();
    const newBlock: ForTimeBlock = { exercises: {} };
    for (let g = 0; g < config.numGroups; g++) {
      newBlock.exercises[g] = [{ name: 'Wall Balls', reps: 10 }];
    }
    setForTimeBlocks([...blocks, newBlock]);
  }

  function removeForTimeBlock(blockIndex: number) {
    const blocks = getForTimeBlocks();
    if (blocks.length <= 1) return;
    const updated = blocks.filter((_, i) => i !== blockIndex);
    setForTimeBlocks(updated);
  }

  function updateForTimeBlockExercise(blockIndex: number, groupIndex: number, exIndex: number, updates: Partial<ExerciseEntry>) {
    const blocks = JSON.parse(JSON.stringify(getForTimeBlocks()));
    if (!blocks[blockIndex].exercises[groupIndex]) blocks[blockIndex].exercises[groupIndex] = [];
    blocks[blockIndex].exercises[groupIndex][exIndex] = { ...blocks[blockIndex].exercises[groupIndex][exIndex], ...updates };
    setForTimeBlocks(blocks);
  }

  function addForTimeBlockExercise(blockIndex: number, groupIndex: number) {
    const blocks = JSON.parse(JSON.stringify(getForTimeBlocks()));
    if (!blocks[blockIndex].exercises[groupIndex]) blocks[blockIndex].exercises[groupIndex] = [];
    blocks[blockIndex].exercises[groupIndex].push({ name: 'Wall Balls', reps: 10 });
    setForTimeBlocks(blocks);
  }

  function addCustomForTimeExercise(blockIndex: number, groupIndex: number) {
    const key = `${blockIndex}-${groupIndex}`;
    const name = (customForTimeExercise[key] || '').trim();
    if (!name) return;
    const blocks = JSON.parse(JSON.stringify(getForTimeBlocks()));
    if (!blocks[blockIndex].exercises[groupIndex]) blocks[blockIndex].exercises[groupIndex] = [];
    blocks[blockIndex].exercises[groupIndex].push({ name, reps: 10 });
    setForTimeBlocks(blocks);
    saveToLibrary(name);
    setCustomForTimeExercise(prev => ({ ...prev, [key]: '' }));
  }

  function removeForTimeBlockExercise(blockIndex: number, groupIndex: number, exIndex: number) {
    const blocks = JSON.parse(JSON.stringify(getForTimeBlocks()));
    if (blocks[blockIndex].exercises[groupIndex]?.length > 1) {
      blocks[blockIndex].exercises[groupIndex].splice(exIndex, 1);
    }
    setForTimeBlocks(blocks);
  }

  async function saveWorkout() {
    setSaving(true);
    // Persist fortime round timer settings into config
    const configToSave = {
      ...config,
      forTimeRoundTimerEnabled,
      forTimeRoundTimerMinutes,
    };
    await supabase
      .from('workouts')
      .update({
        name,
        trainer_name: localStorage.getItem('hclub_trainer_name') || '',
        config: configToSave,
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
        className="flex-1 min-w-0 px-3 py-2 bg-hclub-black border border-hclub-gray rounded-lg
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
    <div className="min-h-screen bg-hclub-black overflow-x-hidden">
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
              <option value="fortime">AMRAP</option>
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
                Öffentlich (andere Trainer sehen es)
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
                    onChange={(e) => { setGroupsInput(e.target.value); const val = parseInt(e.target.value); if (!isNaN(val) && val >= 1 && val <= 10) updateConfig({ numGroups: val }); }}
                    onBlur={() => { const val = parseInt(groupsInput); const c = isNaN(val) || val < 1 ? 1 : Math.min(10, val); setGroupsInput(String(c)); updateConfig({ numGroups: c }); }}
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
                        className="text-xs text-red-400 hover:text-red-300 font-oswald uppercase px-3 py-2">Zurücksetzen</button>
                    )}
                  </div>
                )}

                <div className="overflow-hidden pb-2">
                <div className={`grid gap-4 ${
                  config.numGroups === 1 ? 'grid-cols-1' :
                  config.numGroups === 2 ? 'grid-cols-1 sm:grid-cols-2' :
                  config.numGroups === 3 ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' :
                  config.numGroups === 4 ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4' :
                  config.numGroups <= 6 ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' :
                  'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
                }`}>
                  {Array.from({ length: config.numGroups }, (_, groupIndex) => {
                    const groupKey = `${roundIndex}-${groupIndex}`;
                    const groupHasCustomTime = config.groupTimeSettings?.[roundIndex]?.[groupIndex] &&
                      Object.keys(config.groupTimeSettings[roundIndex][groupIndex]).length > 0;
                    const isGroupExpanded = expandedGroupSettings[groupKey];
                    const groupWorkTime = config.groupTimeSettings?.[roundIndex]?.[groupIndex]?.workTime ?? effectiveWorkTime;
                    const groupRestTime = config.groupTimeSettings?.[roundIndex]?.[groupIndex]?.restTime ?? effectiveRestTime;

                    return (
                    <div key={groupIndex} className="bg-hclub-dark border border-hclub-gray rounded-xl p-4 min-w-0 overflow-hidden">
                      <div className="flex items-center justify-between mb-3 gap-2">
                        <h4 className="font-oswald text-sm uppercase tracking-wider text-gray-400">
                          Gruppe {groupIndex + 1}
                        </h4>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => promptDuplicateGroup(roundIndex, groupIndex)}
                            title="Gruppe duplizieren (mit optionaler Rotation)"
                            className="text-[10px] px-2 py-0.5 rounded font-oswald uppercase tracking-wider transition-colors border
                                       border-hclub-gray/50 text-gray-400 hover:text-purple-300 hover:border-purple-500 hover:bg-purple-900/20"
                          >
                            Duplizieren
                          </button>
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
                        const isDragging =
                          dragExercise?.round === roundIndex &&
                          dragExercise?.group === groupIndex &&
                          dragExercise?.ex === exIdx;
                        const isDragOver =
                          dragOverExercise?.round === roundIndex &&
                          dragOverExercise?.group === groupIndex &&
                          dragOverExercise?.ex === exIdx &&
                          !isDragging;
                        return (
                        <div key={exIdx}
                          className={`mb-2 rounded-lg transition-all ${isDragging ? 'opacity-40' : ''} ${isDragOver ? 'ring-2 ring-hclub-magenta ring-offset-2 ring-offset-hclub-dark' : ''}`}
                          onDragOver={(e) => {
                            if (!dragExercise || dragExercise.round !== roundIndex || dragExercise.group !== groupIndex) return;
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'move';
                            if (dragOverExercise?.ex !== exIdx || dragOverExercise?.group !== groupIndex || dragOverExercise?.round !== roundIndex) {
                              setDragOverExercise({ round: roundIndex, group: groupIndex, ex: exIdx });
                            }
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            if (dragExercise && dragExercise.round === roundIndex && dragExercise.group === groupIndex) {
                              reorderExerciseInGroup(roundIndex, groupIndex, dragExercise.ex, exIdx);
                            }
                            setDragExercise(null);
                            setDragOverExercise(null);
                          }}>
                          <div className="flex gap-2 min-w-0 items-center">
                            {/* Drag handle: Übung per Ziehen umsortieren */}
                            <div
                              draggable
                              onDragStart={(e) => {
                                e.dataTransfer.effectAllowed = 'move';
                                e.dataTransfer.setData('text/plain', String(exIdx));
                                setDragExercise({ round: roundIndex, group: groupIndex, ex: exIdx });
                              }}
                              onDragEnd={() => { setDragExercise(null); setDragOverExercise(null); }}
                              title="Ziehen zum Umsortieren"
                              className="flex-shrink-0 w-6 h-9 flex items-center justify-center cursor-grab active:cursor-grabbing text-gray-500 hover:text-hclub-magenta select-none"
                            >
                              <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                <circle cx="6" cy="4" r="1.6" /><circle cx="14" cy="4" r="1.6" />
                                <circle cx="6" cy="10" r="1.6" /><circle cx="14" cy="10" r="1.6" />
                                <circle cx="6" cy="16" r="1.6" /><circle cx="14" cy="16" r="1.6" />
                              </svg>
                            </div>
                            {/* Icon picker: nur für Admins */}
                            {isAdmin && (
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
                            )}
                            {!isAdmin && (
                              <div className="flex-shrink-0 w-9 h-9 flex items-center justify-center">
                                <IconComponent size={22} color="#9ca3af" />
                              </div>
                            )}
                            {renderExerciseSelect(exercise, (v) => setExercise(roundIndex, groupIndex, exIdx, v))}
                            <button onClick={() => removeExerciseFromGroup(roundIndex, groupIndex, exIdx)}
                              className="flex-shrink-0 px-2 text-red-400 hover:text-red-300 text-sm" title="Entfernen">x</button>
                          </div>
                          {isAdmin && isPickerOpen && (
                            <div className="mt-1 p-2 bg-hclub-black border border-hclub-magenta/40 rounded-lg overflow-hidden">
                              <div className="grid grid-cols-5 sm:grid-cols-6 gap-1">
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
                          className="text-xs text-hclub-magenta hover:text-white transition-colors font-oswald uppercase">+ Übung</button>
                      </div>
                      <div className="flex gap-2 mt-2 min-w-0">
                        <input type="text" value={customExercise}
                          onChange={(e) => setCustomExercise(e.target.value)}
                          placeholder="Eigene Übung..."
                          className="flex-1 min-w-0 px-2 py-1 bg-hclub-black border border-hclub-gray rounded text-white text-xs focus:outline-none focus:border-hclub-magenta"
                          onKeyDown={(e) => { if (e.key === 'Enter') addCustomExercise(roundIndex, groupIndex); }} />
                        <button onClick={() => addCustomExercise(roundIndex, groupIndex)}
                          className="text-xs text-hclub-magenta hover:text-white px-2">+</button>
                      </div>
                    </div>
                    );
                  })}
                </div>
                </div>
              </div>
              );
            })}
          </>
        )}

        {/* ===================== AMRAP MODE (fortime in DB) ===================== */}
        {workoutMode === 'fortime' && (
          <>
            <div className="bg-hclub-dark border border-hclub-gray rounded-xl p-5 mb-8">
              <h3 className="font-oswald text-lg uppercase tracking-wider mb-4 text-cyan-400">
                AMRAP Einstellungen
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1 font-oswald uppercase">Gruppen</label>
                  <input type="number" min={1} max={10}
                    value={config.numGroups}
                    onChange={(e) => { const val = Math.max(1, Math.min(10, parseInt(e.target.value) || 1)); updateConfig({ numGroups: val }); }}
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

              {/* Timer pro Runde Toggle */}
              <div className="border-t border-hclub-gray/40 pt-4 mt-2">
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <div
                      onClick={() => setForTimeRoundTimerEnabled(v => !v)}
                      className={`relative w-12 h-6 rounded-full transition-colors cursor-pointer ${forTimeRoundTimerEnabled ? 'bg-cyan-500' : 'bg-hclub-gray'}`}
                    >
                      <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${forTimeRoundTimerEnabled ? 'translate-x-7' : 'translate-x-1'}`} />
                    </div>
                    <span className="font-oswald uppercase tracking-wider text-sm text-gray-300">
                      Timer pro Runde
                    </span>
                  </label>
                  {forTimeRoundTimerEnabled && (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={120}
                        value={forTimeRoundTimerMinutes}
                        onChange={(e) => setForTimeRoundTimerMinutes(Math.max(1, Math.min(120, parseInt(e.target.value) || 12)))}
                        className="w-20 px-2 py-1 bg-hclub-black border border-cyan-500/60 rounded-lg text-white text-center text-sm focus:outline-none focus:border-cyan-400"
                      />
                      <span className="text-gray-400 text-sm font-oswald uppercase">Minuten</span>
                    </div>
                  )}
                </div>
                {forTimeRoundTimerEnabled && (
                  <p className="text-xs text-cyan-400/70 mt-2 font-oswald">
                    Countdown läuft während die Gruppen ihre Übungen absolvieren.
                  </p>
                )}
                {!forTimeRoundTimerEnabled && (
                  <p className="text-xs text-gray-500 mt-2 font-oswald">
                    Kein Timer — Gruppen klicken selbst weiter (Taste 1–{config.numGroups})
                  </p>
                )}
              </div>
            </div>

            {/* AMRAP Blocks (Runden) */}
            {getForTimeBlocks().map((block, bIdx) => (
              <div key={bIdx} className="mb-8">
                <div className="flex items-center gap-3 mb-4">
                  <h3 className="font-oswald text-xl uppercase tracking-wider text-cyan-400">
                    Runde {bIdx + 1}
                  </h3>
                  {getForTimeBlocks().length > 1 && (
                    <button onClick={() => removeForTimeBlock(bIdx)}
                      className="text-xs text-red-400 hover:text-red-300 font-oswald uppercase px-2 py-1 border border-red-400/30 rounded-lg">
                      Runde entfernen
                    </button>
                  )}
                </div>

                <div className="overflow-hidden pb-2">
                <div className={`grid gap-4 ${
                  config.numGroups === 1 ? 'grid-cols-1' :
                  config.numGroups === 2 ? 'grid-cols-1 sm:grid-cols-2' :
                  config.numGroups <= 4 ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4' :
                  'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
                }`}>
                  {Array.from({ length: config.numGroups }, (_, gIdx) => {
                    const exercises = block.exercises?.[gIdx] || [];
                    return (
                      <div key={gIdx} className="bg-hclub-dark border border-hclub-gray rounded-xl p-4 min-w-0 overflow-hidden">
                        <h4 className="font-oswald text-sm uppercase tracking-wider text-gray-400 mb-3">
                          Gruppe {gIdx + 1}
                        </h4>
                        {exercises.map((ex, eIdx) => {
                          const measureType = ex.distance ? 'distance' : ex.duration ? 'duration' : 'reps';
                          return (
                            <div key={eIdx} className="mb-3 p-2 bg-hclub-black/50 rounded-lg border border-hclub-gray/30">
                              <div className="flex gap-2 mb-2 items-center min-w-0">
                                {renderExerciseSelect(ex.name, (v) => updateForTimeBlockExercise(bIdx, gIdx, eIdx, { name: v }))}
                                <button onClick={() => removeForTimeBlockExercise(bIdx, gIdx, eIdx)}
                                  className="flex-shrink-0 text-red-400 hover:text-red-300 text-sm px-1">x</button>
                              </div>
                              <div className="flex gap-2 items-center">
                                <select value={measureType}
                                  onChange={(e) => {
                                    const t = e.target.value;
                                    if (t === 'distance') updateForTimeBlockExercise(bIdx, gIdx, eIdx, { distance: '500m', reps: undefined, duration: undefined });
                                    else if (t === 'reps') updateForTimeBlockExercise(bIdx, gIdx, eIdx, { reps: 10, distance: undefined, duration: undefined });
                                    else updateForTimeBlockExercise(bIdx, gIdx, eIdx, { duration: 30, distance: undefined, reps: undefined });
                                  }}
                                  className="px-2 py-1 bg-hclub-black border border-hclub-gray rounded text-white text-xs focus:outline-none focus:border-cyan-400">
                                  <option value="reps">Wiederholungen</option>
                                  <option value="distance">Meter</option>
                                  <option value="duration">Sekunden</option>
                                </select>
                                {measureType === 'distance' && (
                                  <input type="text" value={ex.distance || ''} placeholder="z.B. 500m"
                                    onChange={(e) => updateForTimeBlockExercise(bIdx, gIdx, eIdx, { distance: e.target.value || undefined })}
                                    className="w-24 px-2 py-1 bg-hclub-black border border-hclub-gray rounded text-white text-xs text-center focus:outline-none focus:border-cyan-400" />
                                )}
                                {measureType === 'reps' && (
                                  <input type="number" min={1} value={ex.reps || ''} placeholder="Reps"
                                    onChange={(e) => updateForTimeBlockExercise(bIdx, gIdx, eIdx, { reps: parseInt(e.target.value) || undefined })}
                                    className="w-20 px-2 py-1 bg-hclub-black border border-hclub-gray rounded text-white text-xs text-center focus:outline-none focus:border-cyan-400" />
                                )}
                                {measureType === 'duration' && (
                                  <input type="number" min={1} value={ex.duration || ''} placeholder="Sek"
                                    onChange={(e) => updateForTimeBlockExercise(bIdx, gIdx, eIdx, { duration: parseInt(e.target.value) || undefined })}
                                    className="w-20 px-2 py-1 bg-hclub-black border border-hclub-gray rounded text-white text-xs text-center focus:outline-none focus:border-cyan-400" />
                                )}
                              </div>
                            </div>
                          );
                        })}
                        <button onClick={() => addForTimeBlockExercise(bIdx, gIdx)}
                          className="text-xs text-cyan-400 hover:text-white transition-colors font-oswald uppercase mt-2">+ Übung</button>
                        <div className="flex gap-2 mt-2 min-w-0">
                          <input type="text" value={customForTimeExercise[`${bIdx}-${gIdx}`] || ''}
                            onChange={(e) => setCustomForTimeExercise(prev => ({ ...prev, [`${bIdx}-${gIdx}`]: e.target.value }))}
                            placeholder="Eigene Übung..."
                            className="flex-1 min-w-0 px-2 py-1 bg-hclub-black border border-hclub-gray rounded text-white text-xs focus:outline-none focus:border-cyan-400"
                            onKeyDown={(e) => { if (e.key === 'Enter') addCustomForTimeExercise(bIdx, gIdx); }} />
                          <button onClick={() => addCustomForTimeExercise(bIdx, gIdx)}
                            className="text-xs text-cyan-400 hover:text-white px-2">+</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                </div>
              </div>
            ))}

            <div className="flex justify-center mb-8">
              <button onClick={addForTimeBlock}
                className="px-8 py-3 bg-cyan-900/30 hover:bg-cyan-600 border border-cyan-500/50 hover:border-cyan-400
                           text-cyan-300 hover:text-white font-oswald text-lg uppercase tracking-wider rounded-xl transition-all duration-300">
                + Runde hinzufügen
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
