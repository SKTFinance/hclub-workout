'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useParams } from 'next/navigation';
import type { Workout, WorkoutConfig, ExerciseSetting, WorkoutMode, ExerciseEntry, AmrapBlock, ForTimeBlock } from '@/lib/types';
import { getDefaultColor } from '@/lib/exercises';
import {
  playCountdownBeep,
  playPowerTimerBeep,
  playGoSound,
  playPhaseEndSound,
  playRoundEndSound,
} from '@/lib/sounds';
import { getExerciseIcon, exerciseIconMap } from '@/lib/exerciseIcons';

type Phase = 'idle' | 'summary' | 'warmup' | 'countdown' | 'work' | 'rest' | 'roundRest' | 'finished';

const GROUP_BG_SHADES = ['#1a1a1a', '#222222', '#2a2a2a', '#1e1e1e', '#252525', '#202020'];

function getIconForExercise(
  config: WorkoutConfig,
  roundIndex: number,
  groupIndex: number,
  exerciseIndex: number,
  exerciseName: string
) {
  const overrideKey = config.iconOverrides?.[roundIndex]?.[groupIndex]?.[exerciseIndex];
  if (overrideKey && exerciseIconMap[overrideKey]) {
    return exerciseIconMap[overrideKey];
  }
  return getExerciseIcon(exerciseName);
}

const PARTICLE_COLORS = ['#FF00FF', '#CC00CC', '#9900FF', '#FF66FF', '#FFD700', '#00BFFF', '#FF4444', '#32CD32'];

export default function LiveWorkoutPage() {
  const params = useParams();
  const id = params.id as string;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const supabase = useMemo(() => createClient(), []);

  const [workout, setWorkout] = useState<Workout | null>(null);
  const [exerciseColors, setExerciseColors] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<Phase>('idle');
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [currentRound, setCurrentRound] = useState(0);
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [exerciseAnimKey, setExerciseAnimKey] = useState(0);
  const [showRoundAnnounce, setShowRoundAnnounce] = useState(false);
  const [announceRound, setAnnounceRound] = useState(0);
  const [countdownValue, setCountdownValue] = useState(3);
  const [numberPopKey, setNumberPopKey] = useState(0);

  // AMRAP state
  const [amrapRoundsCompleted, setAmrapRoundsCompleted] = useState<Record<number, number>>({});
  const [amrapCurrentExIndex, setAmrapCurrentExIndex] = useState<Record<number, number>>({});
  const [amrapCurrentBlock, setAmrapCurrentBlock] = useState(0);

  // ForTime state
  const [forTimeCurrentExIndex, setForTimeCurrentExIndex] = useState<Record<number, number>>({});
  const [forTimeGroupFinished, setForTimeGroupFinished] = useState<Record<number, boolean>>({});
  const [forTimeElapsed, setForTimeElapsed] = useState(0);
  const [forTimeCurrentBlock, setForTimeCurrentBlock] = useState(0);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTickRef = useRef<number>(0);
  const prevTimeRef = useRef<number>(0);
  const prevExerciseRef = useRef<number>(-1);
  const prevRoundRef = useRef<number>(-1);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const workoutMode: WorkoutMode = workout?.workout_mode || 'timed';

  // Block helpers
  function getAmrapBlocks(c: WorkoutConfig): AmrapBlock[] {
    if (c.amrapBlocks && c.amrapBlocks.length > 0) return c.amrapBlocks;
    return [{ totalTime: c.amrapTotalTime || 1200, exercises: c.amrapExercises || {} }];
  }

  function getForTimeBlocks(c: WorkoutConfig): ForTimeBlock[] {
    if (c.forTimeBlocks && c.forTimeBlocks.length > 0) return c.forTimeBlocks;
    return [{ exercises: c.forTimeExercises || {} }];
  }

  // Load workout and exercise colors
  const loadData = useCallback(async () => {
    const { data: workoutData } = await supabase
      .from('workouts')
      .select('*')
      .eq('id', id)
      .single();

    if (workoutData) {
      setWorkout(workoutData as Workout);
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: settings } = await supabase
        .from('exercise_settings')
        .select('*')
        .eq('user_id', user.id);

      if (settings) {
        const colors: Record<string, string> = {};
        (settings as ExerciseSetting[]).forEach((s) => {
          colors[s.exercise_name] = s.color;
        });
        setExerciseColors(colors);
      }
    }
  }, [supabase, id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function getExerciseColor(name: string): string {
    return exerciseColors[name] || getDefaultColor(name);
  }

  function getWorkTimeForRound(config: WorkoutConfig, roundIndex: number): number {
    return config.roundSettings?.[roundIndex]?.workTime ?? config.workTime;
  }

  function getWorkTimeForGroup(config: WorkoutConfig, roundIndex: number, groupIndex: number): number {
    return config.groupTimeSettings?.[roundIndex]?.[groupIndex]?.workTime
      ?? config.roundSettings?.[roundIndex]?.workTime
      ?? config.workTime;
  }

  function getRestTimeForRound(config: WorkoutConfig, roundIndex: number): number {
    return config.roundSettings?.[roundIndex]?.restTime ?? config.restTime;
  }

  function getMaxExercisesInRound(config: WorkoutConfig, roundIndex: number): number {
    let max = 0;
    for (let g = 0; g < config.numGroups; g++) {
      const exercises = config.rounds[roundIndex]?.[g] || [];
      if (exercises.length > max) max = exercises.length;
    }
    return Math.max(max, 1);
  }

  // Compute total workout time estimate
  const totalTimeEstimate = useMemo(() => {
    if (!workout) return 0;
    const c = workout.config;
    if (workoutMode === 'amrap') return (c.amrapTotalTime || 1200) + c.warmupTime;
    if (workoutMode === 'fortime') return 0; // unknown
    let total = c.warmupTime;
    for (let r = 0; r < c.numRounds; r++) {
      let totalExInRound = 0;
      for (let g = 0; g < c.numGroups; g++) {
        const exercises = c.rounds[r]?.[g] || [];
        totalExInRound += exercises.length;
      }
      totalExInRound = Math.max(totalExInRound, 1);
      const rWorkTime = c.roundSettings?.[r]?.workTime ?? c.workTime;
      const rRestTime = c.roundSettings?.[r]?.restTime ?? c.restTime;
      total += totalExInRound * rWorkTime;
      total += (totalExInRound - 1) * rRestTime;
      if (r < c.numRounds - 1) total += c.roundRestTime;
    }
    total += 3 * c.numRounds;
    return total;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workout]);

  // Timer tick
  useEffect(() => {
    if (phase === 'idle' || phase === 'summary' || phase === 'finished' || phase === 'countdown' || isPaused) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    lastTickRef.current = Date.now();

    intervalRef.current = setInterval(() => {
      const now = Date.now();
      const elapsed = Math.floor((now - lastTickRef.current) / 1000);
      if (elapsed < 1) return;
      lastTickRef.current = now;

      if (workoutMode === 'fortime' && phase === 'work') {
        setForTimeElapsed((prev) => prev + elapsed);
      } else {
        setTimeRemaining((prev) => {
          const next = prev - elapsed;
          if (next <= 0) return 0;
          return next;
        });
      }
    }, 100);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [phase, isPaused, workoutMode]);

  // Sound effects based on time
  useEffect(() => {
    if (isPaused || phase === 'idle' || phase === 'summary' || phase === 'finished' || phase === 'countdown') return;
    if (workoutMode === 'fortime') return; // no countdown sounds in fortime

    if (timeRemaining <= 10 && timeRemaining > 0 && timeRemaining !== prevTimeRef.current) {
      if (phase === 'work') {
        playPowerTimerBeep();
        setNumberPopKey((k) => k + 1);
      } else {
        playCountdownBeep();
      }
    }

    if (timeRemaining === 0 && prevTimeRef.current !== 0) {
      if (phase === 'work') {
        playPhaseEndSound();
      } else if (phase === 'roundRest') {
        playRoundEndSound();
      } else {
        playGoSound();
      }
    }

    prevTimeRef.current = timeRemaining;
  }, [timeRemaining, phase, isPaused, workoutMode]);

  // Exercise change animation trigger
  useEffect(() => {
    if (currentExerciseIndex !== prevExerciseRef.current && phase === 'work') {
      setExerciseAnimKey((k) => k + 1);
    }
    prevExerciseRef.current = currentExerciseIndex;
  }, [currentExerciseIndex, phase]);

  // Round announcement trigger
  useEffect(() => {
    if (currentRound !== prevRoundRef.current && phase === 'work') {
      setAnnounceRound(currentRound + 1);
      setShowRoundAnnounce(true);
      const timer = setTimeout(() => setShowRoundAnnounce(false), 2000);
      return () => clearTimeout(timer);
    }
    prevRoundRef.current = currentRound;
  }, [currentRound, phase]);

  // Countdown logic
  function startCountdown(onComplete: () => void) {
    setPhase('countdown');
    setCountdownValue(3);
    let count = 3;
    playCountdownBeep();

    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);

    countdownIntervalRef.current = setInterval(() => {
      count -= 1;
      if (count > 0) {
        setCountdownValue(count);
        playCountdownBeep();
      } else if (count === 0) {
        setCountdownValue(0);
        playGoSound();
      } else {
        if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
        onComplete();
      }
    }, 1000);
  }

  // Skip current station/exercise
  function skipToNext() {
    if (!workout || phase !== 'work') return;
    if (workoutMode !== 'timed') return;

    const config = workout.config;
    const maxExercises = getMaxExercisesInRound(config, currentRound);
    const nextExIndex = currentExerciseIndex + 1;

    if (nextExIndex < maxExercises) {
      const roundRestTime = getRestTimeForRound(config, currentRound);
      if (roundRestTime > 0) {
        setPhase('rest');
        setTimeRemaining(roundRestTime);
        setCurrentExerciseIndex(nextExIndex);
      } else {
        setCurrentExerciseIndex(nextExIndex);
        setTimeRemaining(getWorkTimeForRound(config, currentRound));
      }
    } else {
      const nextRound = currentRound + 1;
      if (nextRound < config.numRounds) {
        if (config.roundRestTime > 0) {
          setPhase('roundRest');
          setTimeRemaining(config.roundRestTime);
          setCurrentRound(nextRound);
          setCurrentExerciseIndex(0);
        } else {
          startCountdown(() => {
            setCurrentRound(nextRound);
            setCurrentExerciseIndex(0);
            setPhase('work');
            setTimeRemaining(getWorkTimeForRound(config, nextRound));
          });
        }
      } else {
        setPhase('finished');
      }
    }
  }

  // Phase transitions for timed mode
  useEffect(() => {
    if (workoutMode !== 'timed') return;

    if (phase === 'warmup' && timeRemaining <= 3 && !isPaused && workout) {
      const cfg = workout.config;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      startCountdown(() => {
        setPhase('work');
        setTimeRemaining(getWorkTimeForRound(cfg, 0));
        setCurrentRound(0);
        setCurrentExerciseIndex(0);
      });
      return;
    }

    if (timeRemaining > 0 || phase === 'idle' || phase === 'summary' || phase === 'finished' || phase === 'countdown' || isPaused) return;
    if (!workout) return;

    const config = workout.config;

    if (phase === 'work') {
      const maxExercises = getMaxExercisesInRound(config, currentRound);
      const nextExIndex = currentExerciseIndex + 1;
      const roundRestTime = getRestTimeForRound(config, currentRound);

      if (nextExIndex < maxExercises) {
        if (roundRestTime > 0) {
          setPhase('rest');
          setTimeRemaining(roundRestTime);
          setCurrentExerciseIndex(nextExIndex);
        } else {
          setCurrentExerciseIndex(nextExIndex);
          setTimeRemaining(getWorkTimeForRound(config, currentRound));
        }
      } else {
        const nextRound = currentRound + 1;
        if (nextRound < config.numRounds) {
          if (config.roundRestTime > 0) {
            setPhase('roundRest');
            setTimeRemaining(config.roundRestTime);
            setCurrentRound(nextRound);
            setCurrentExerciseIndex(0);
          } else {
            startCountdown(() => {
              setCurrentRound(nextRound);
              setCurrentExerciseIndex(0);
              setPhase('work');
              setTimeRemaining(getWorkTimeForRound(config, nextRound));
            });
          }
        } else {
          setPhase('finished');
        }
      }
      return;
    }

    if (phase === 'rest') {
      setPhase('work');
      setTimeRemaining(getWorkTimeForRound(config, currentRound));
      return;
    }

    if (phase === 'roundRest') {
      startCountdown(() => {
        setPhase('work');
        setTimeRemaining(getWorkTimeForRound(config, currentRound));
      });
      return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeRemaining, phase, isPaused, workout, currentRound, currentExerciseIndex, workoutMode]);

  // AMRAP phase transitions
  useEffect(() => {
    if (workoutMode !== 'amrap') return;

    if (phase === 'warmup' && timeRemaining <= 3 && !isPaused && workout) {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      const blocks = getAmrapBlocks(workout.config);
      const firstBlock = blocks[0];
      startCountdown(() => {
        setPhase('work');
        setAmrapCurrentBlock(0);
        setTimeRemaining(firstBlock.totalTime);
        const initIdx: Record<number, number> = {};
        const initRounds: Record<number, number> = {};
        for (let g = 0; g < workout.config.numGroups; g++) { initIdx[g] = 0; initRounds[g] = 0; }
        setAmrapCurrentExIndex(initIdx);
        setAmrapRoundsCompleted(initRounds);
      });
      return;
    }

    if (phase === 'work' && timeRemaining === 0 && prevTimeRef.current !== 0 && workout) {
      const blocks = getAmrapBlocks(workout.config);
      const nextBlock = amrapCurrentBlock + 1;
      if (nextBlock < blocks.length) {
        // Transition to next AMRAP block with a rest/countdown
        playRoundEndSound();
        setPhase('roundRest');
        setTimeRemaining(workout.config.roundRestTime || 60);
        setAmrapCurrentBlock(nextBlock);
      } else {
        setPhase('finished');
      }
    }

    // After roundRest in AMRAP, start next block
    if (phase === 'roundRest' && timeRemaining === 0 && prevTimeRef.current !== 0 && workout) {
      const blocks = getAmrapBlocks(workout.config);
      const block = blocks[amrapCurrentBlock];
      if (block) {
        startCountdown(() => {
          setPhase('work');
          setTimeRemaining(block.totalTime);
          const initIdx: Record<number, number> = {};
          const initRounds: Record<number, number> = {};
          for (let g = 0; g < workout.config.numGroups; g++) { initIdx[g] = 0; initRounds[g] = 0; }
          setAmrapCurrentExIndex(initIdx);
          setAmrapRoundsCompleted(initRounds);
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeRemaining, phase, isPaused, workout, workoutMode]);

  // ForTime warmup transition and block transitions
  useEffect(() => {
    if (workoutMode !== 'fortime') return;

    if (phase === 'warmup' && timeRemaining <= 3 && !isPaused && workout) {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      startCountdown(() => {
        setPhase('work');
        setForTimeElapsed(0);
        setForTimeCurrentBlock(0);
        const initIdx: Record<number, number> = {};
        const initFinished: Record<number, boolean> = {};
        for (let g = 0; g < workout.config.numGroups; g++) {
          initIdx[g] = 0;
          initFinished[g] = false;
        }
        setForTimeCurrentExIndex(initIdx);
        setForTimeGroupFinished(initFinished);
      });
      return;
    }

    // After roundRest in ForTime, start next block
    if (phase === 'roundRest' && timeRemaining === 0 && prevTimeRef.current !== 0 && workout) {
      startCountdown(() => {
        setPhase('work');
        const initIdx: Record<number, number> = {};
        const initFinished: Record<number, boolean> = {};
        for (let g = 0; g < workout.config.numGroups; g++) {
          initIdx[g] = 0;
          initFinished[g] = false;
        }
        setForTimeCurrentExIndex(initIdx);
        setForTimeGroupFinished(initFinished);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeRemaining, phase, isPaused, workout, workoutMode]);

  // AMRAP next exercise for a group
  function amrapNextExercise(groupIndex?: number) {
    if (!workout) return;
    const blocks = getAmrapBlocks(workout.config);
    const currentBlock = blocks[amrapCurrentBlock];
    if (!currentBlock) return;
    const exercises = currentBlock.exercises;
    if (!exercises) return;

    // If no group specified, advance all groups
    const groups = groupIndex !== undefined ? [groupIndex] : Array.from({ length: workout.config.numGroups }, (_, i) => i);

    setAmrapCurrentExIndex(prev => {
      const next = { ...prev };
      const groupsWrapped: number[] = [];
      for (const g of groups) {
        const exList = exercises[g] || [];
        const nextIdx = (next[g] || 0) + 1;
        if (nextIdx >= exList.length) {
          next[g] = 0;
          groupsWrapped.push(g);
        } else {
          next[g] = nextIdx;
        }
      }
      // Increment round counter for each group that completed a full cycle
      if (groupsWrapped.length > 0) {
        setAmrapRoundsCompleted(prev => {
          const updated = { ...prev };
          for (const g of groupsWrapped) {
            updated[g] = (updated[g] || 0) + 1;
          }
          return updated;
        });
      }
      return next;
    });
    playGoSound();
  }

  // ForTime advance group
  function forTimeAdvanceGroup(groupIndex: number) {
    if (!workout) return;
    const blocks = getForTimeBlocks(workout.config);
    const currentBlock = blocks[forTimeCurrentBlock];
    if (!currentBlock) return;
    const exercises = currentBlock.exercises?.[groupIndex] || [];

    setForTimeCurrentExIndex(prev => {
      const nextIdx = (prev[groupIndex] || 0) + 1;
      if (nextIdx >= exercises.length) {
        setForTimeGroupFinished(pf => ({ ...pf, [groupIndex]: true }));
        playRoundEndSound();
        return prev;
      }
      playGoSound();
      return { ...prev, [groupIndex]: nextIdx };
    });
  }

  // Check if all ForTime groups are finished
  useEffect(() => {
    if (workoutMode !== 'fortime' || phase !== 'work' || !workout) return;
    const allDone = Array.from({ length: workout.config.numGroups }, (_, g) => forTimeGroupFinished[g]).every(Boolean);
    if (allDone) {
      const blocks = getForTimeBlocks(workout.config);
      const nextBlock = forTimeCurrentBlock + 1;
      if (nextBlock < blocks.length) {
        // Move to next ForTime block with a rest period
        playRoundEndSound();
        setPhase('roundRest');
        setTimeRemaining(workout.config.roundRestTime || 60);
        setForTimeCurrentBlock(nextBlock);
      } else {
        setPhase('finished');
      }
    }
  }, [forTimeGroupFinished, phase, workout, workoutMode, forTimeCurrentBlock]);

  // Keyboard controls
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.code === 'Space') {
        e.preventDefault();
        if (phase === 'idle') {
          goToSummary();
        } else if (phase === 'summary') {
          startWorkout();
        } else if (phase !== 'finished' && phase !== 'countdown') {
          if (workoutMode === 'amrap' && phase === 'work') {
            amrapNextExercise();
          } else {
            setIsPaused((p) => !p);
          }
        }
      }
      if (e.code === 'Escape') {
        if (phase !== 'idle') {
          setPhase('idle');
          setIsPaused(false);
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
          }
        }
      }
      if (e.code === 'KeyF') {
        toggleFullscreen();
      }
      if (e.code === 'KeyN' && phase === 'work' && workoutMode === 'timed') {
        skipToNext();
      }
      // ForTime: number keys advance groups
      if (workoutMode === 'fortime' && phase === 'work') {
        const digit = parseInt(e.key);
        if (digit >= 1 && digit <= (workout?.config.numGroups || 0)) {
          forTimeAdvanceGroup(digit - 1);
        }
      }
      // AMRAP: number keys advance specific groups
      if (workoutMode === 'amrap' && phase === 'work') {
        const digit = parseInt(e.key);
        if (digit >= 1 && digit <= (workout?.config.numGroups || 0)) {
          amrapNextExercise(digit - 1);
        }
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  });

  function goToSummary() {
    if (!workout) return;
    setPhase('summary');
  }

  function startWorkout() {
    if (!workout) return;
    playCountdownBeep();
    const config = workout.config;
    setCurrentRound(0);
    setCurrentExerciseIndex(0);

    if (config.warmupTime > 0) {
      setPhase('warmup');
      setTimeRemaining(config.warmupTime);
    } else {
      if (workoutMode === 'timed') {
        startCountdown(() => {
          setPhase('work');
          setTimeRemaining(getWorkTimeForRound(config, 0));
        });
      } else if (workoutMode === 'amrap') {
        const blocks = getAmrapBlocks(config);
        startCountdown(() => {
          setPhase('work');
          setAmrapCurrentBlock(0);
          setTimeRemaining(blocks[0].totalTime);
          const initIdx: Record<number, number> = {};
          const initRounds: Record<number, number> = {};
          for (let g = 0; g < config.numGroups; g++) { initIdx[g] = 0; initRounds[g] = 0; }
          setAmrapCurrentExIndex(initIdx);
          setAmrapRoundsCompleted(initRounds);
        });
      } else {
        startCountdown(() => {
          setPhase('work');
          setForTimeElapsed(0);
          setForTimeCurrentBlock(0);
          const initIdx: Record<number, number> = {};
          const initFinished: Record<number, boolean> = {};
          for (let g = 0; g < config.numGroups; g++) {
            initIdx[g] = 0;
            initFinished[g] = false;
          }
          setForTimeCurrentExIndex(initIdx);
          setForTimeGroupFinished(initFinished);
        });
      }
    }
    setIsPaused(false);
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true));
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false));
    }
  }

  function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function formatTimeMinutes(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m === 0) return `${s}s`;
    return s > 0 ? `${m}min ${s}s` : `${m}min`;
  }

  function getNextExercise(config: WorkoutConfig, groupIndex: number): string | null {
    const exercises = config.rounds[currentRound]?.[groupIndex] || [];
    const nextIdx = currentExerciseIndex + 1;
    if (nextIdx < exercises.length) return exercises[nextIdx];
    const nextRound = currentRound + 1;
    if (nextRound < config.numRounds) {
      const nextRoundExercises = config.rounds[nextRound]?.[groupIndex] || [];
      return nextRoundExercises[0] || null;
    }
    return null;
  }

  function formatExerciseLabel(ex: ExerciseEntry): string {
    const parts: string[] = [];
    if (ex.distance) parts.push(ex.distance);
    if (ex.reps) parts.push(`${ex.reps}x`);
    if (ex.duration) parts.push(`${ex.duration}s`);
    parts.push(ex.name);
    return parts.join(' ');
  }

  if (!workout) {
    return (
      <div className="workout-fullscreen flex items-center justify-center">
        <div className="text-gray-400 font-oswald text-2xl uppercase">Laden...</div>
      </div>
    );
  }

  const config = workout.config;

  // =================== IDLE STATE ===================
  if (phase === 'idle') {
    return (
      <div className="workout-fullscreen flex flex-col items-center justify-center" style={{ paddingBottom: "15vh" }}>
        <h1 className="font-oswald text-6xl md:text-8xl font-bold tracking-wider mb-4 logo-glow">
          H-<span className="text-hclub-magenta">CLUB</span>
        </h1>
        <h2 className="font-oswald text-3xl md:text-4xl uppercase tracking-wider text-gray-300 mb-2 fade-in-up">
          {workout.name}
        </h2>
        <p className="text-gray-400 text-lg mb-4 fade-in-up" style={{ animationDelay: '0.1s' }}>{workout.trainer_name}</p>
        <div className={`font-oswald text-sm uppercase tracking-wider mb-8 px-3 py-1 rounded ${
          workoutMode === 'amrap' ? 'text-orange-400 bg-orange-400/10' :
          workoutMode === 'fortime' ? 'text-cyan-400 bg-cyan-400/10' :
          'text-green-400 bg-green-400/10'
        }`}>
          {workoutMode === 'amrap' ? 'AMRAP' : workoutMode === 'fortime' ? 'For Time' : 'Zeitbasiert'}
        </div>

        <div className="grid grid-cols-3 gap-8 mb-12 text-center">
          <div className="fade-in-up" style={{ animationDelay: '0.2s' }}>
            <div className="font-oswald text-4xl text-hclub-magenta">{config.numGroups}</div>
            <div className="text-gray-400 text-sm font-oswald uppercase">Gruppen</div>
          </div>
          {workoutMode === 'timed' && (
            <>
              <div className="fade-in-up" style={{ animationDelay: '0.3s' }}>
                <div className="font-oswald text-4xl text-hclub-magenta">{config.numRounds}</div>
                <div className="text-gray-400 text-sm font-oswald uppercase">Runden</div>
              </div>
              <div className="fade-in-up" style={{ animationDelay: '0.4s' }}>
                <div className="font-oswald text-4xl text-hclub-magenta">{config.workTime}s</div>
                <div className="text-gray-400 text-sm font-oswald uppercase">Arbeit</div>
              </div>
            </>
          )}
          {workoutMode === 'amrap' && (
            <>
              <div className="fade-in-up" style={{ animationDelay: '0.3s' }}>
                <div className="font-oswald text-4xl text-hclub-magenta">{Math.floor((config.amrapTotalTime || 1200) / 60)}</div>
                <div className="text-gray-400 text-sm font-oswald uppercase">Minuten</div>
              </div>
              <div className="fade-in-up" style={{ animationDelay: '0.4s' }}>
                <div className="font-oswald text-4xl text-hclub-magenta">AMRAP</div>
                <div className="text-gray-400 text-sm font-oswald uppercase">Modus</div>
              </div>
            </>
          )}
          {workoutMode === 'fortime' && (
            <>
              <div className="fade-in-up" style={{ animationDelay: '0.3s' }}>
                <div className="font-oswald text-4xl text-hclub-magenta">
                  {Object.values(config.forTimeExercises || {}).reduce((sum, exs) => sum + (exs?.length || 0), 0)}
                </div>
                <div className="text-gray-400 text-sm font-oswald uppercase">Übungen</div>
              </div>
              <div className="fade-in-up" style={{ animationDelay: '0.4s' }}>
                <div className="font-oswald text-4xl text-cyan-400">FT</div>
                <div className="text-gray-400 text-sm font-oswald uppercase">Modus</div>
              </div>
            </>
          )}
        </div>

        <button onClick={goToSummary}
          className="px-12 py-4 bg-hclub-magenta hover:bg-hclub-magenta-dark text-white font-oswald
                     text-2xl uppercase tracking-widest rounded-xl transition-colors fade-in-up glow-pulse"
          style={{ animationDelay: '0.5s' }}>
          Workout Starten
        </button>

        <div className="absolute bottom-6 flex gap-8 text-gray-500 text-sm">
          <span>LEERTASTE = Start/Pause</span>
          <span>F = Vollbild</span>
          <span>ESC = Beenden</span>
          {workoutMode === 'timed' && <span>N = Überspringen</span>}
          {workoutMode === 'fortime' && <span>1-{config.numGroups} = Gruppe weiter</span>}
        </div>
      </div>
    );
  }

  // =================== SUMMARY STATE ===================
  if (phase === 'summary') {
    return (
      <div className="workout-fullscreen flex flex-col items-center overflow-y-auto py-8 px-4">
        <h1 className="font-oswald text-4xl md:text-5xl font-bold tracking-wider mb-2 fade-in-up">
          {workout.name}
        </h1>
        <p className="text-gray-400 text-lg mb-2 fade-in-up" style={{ animationDelay: '0.1s' }}>
          {workout.trainer_name}
        </p>
        {totalTimeEstimate > 0 && (
          <div className="font-oswald text-xl text-hclub-magenta mb-8 fade-in-up" style={{ animationDelay: '0.15s' }}>
            Geschaetzte Dauer: {formatTimeMinutes(totalTimeEstimate)}
          </div>
        )}

        {workoutMode === 'timed' && (
          <div className={`w-full mb-8 grid gap-6 ${
            config.numRounds === 1 ? 'max-w-5xl grid-cols-1' : 'max-w-5xl md:grid-cols-2'
          }`}>
            {Array.from({ length: config.numRounds }, (_, roundIdx) => (
              <div key={roundIdx} className="bg-hclub-dark border border-hclub-gray rounded-xl p-5 fade-in-up"
                style={{ animationDelay: `${0.2 + roundIdx * 0.1}s`, opacity: 0 }}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className={`font-oswald uppercase tracking-wider text-hclub-magenta ${config.numRounds === 1 ? 'text-xl' : 'text-lg'}`}>Runde {roundIdx + 1}</h3>
                  <div className="flex gap-3 text-xs font-oswald uppercase">
                    <span className="text-green-400">{getWorkTimeForRound(config, roundIdx)}s Arbeit</span>
                    <span className="text-blue-400">{getRestTimeForRound(config, roundIdx)}s Pause</span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${config.numGroups}, minmax(80px, 1fr))`, minWidth: config.numGroups > 4 ? `${config.numGroups * 100}px` : undefined }}>
                  {Array.from({ length: config.numGroups }, (_, gIdx) => {
                    const exercises = config.rounds[roundIdx]?.[gIdx] || [];
                    return (
                      <div key={gIdx}>
                        <div className={`text-gray-500 font-oswald uppercase tracking-wider mb-1 ${config.numRounds === 1 ? 'text-sm' : 'text-xs'}`}>G{gIdx + 1}</div>
                        {exercises.map((ex, eIdx) => (
                          <div key={eIdx} className={`mb-1 ${config.numRounds === 1 ? 'text-sm' : 'text-xs'}`} style={{ color: getExerciseColor(ex) }}>{ex}</div>
                        ))}
                      </div>
                    );
                  })}
                </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {workoutMode === 'amrap' && (
          <div className="w-full max-w-3xl mb-8 space-y-4">
            {getAmrapBlocks(config).map((block, bIdx) => (
              <div key={bIdx} className="bg-hclub-dark border border-orange-500/30 rounded-xl p-5 fade-in-up" style={{ animationDelay: `${0.2 + bIdx * 0.1}s`, opacity: 0 }}>
                <h3 className="font-oswald text-lg uppercase tracking-wider text-orange-400 mb-3">
                  {getAmrapBlocks(config).length > 1 ? `Block ${bIdx + 1}: ` : ''}{Math.floor(block.totalTime / 60)} Min AMRAP
                </h3>
                <div className="overflow-x-auto">
                <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${config.numGroups}, minmax(90px, 1fr))`, minWidth: config.numGroups > 4 ? `${config.numGroups * 110}px` : undefined }}>
                  {Array.from({ length: config.numGroups }, (_, gIdx) => {
                    const exercises = block.exercises?.[gIdx] || [];
                    return (
                      <div key={gIdx}>
                        <div className="text-gray-500 text-xs font-oswald uppercase mb-2">G{gIdx + 1}</div>
                        {exercises.map((ex, eIdx) => (
                          <div key={eIdx} className="text-xs mb-1" style={{ color: getExerciseColor(ex.name) }}>
                            {ex.reps}x {ex.name}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {workoutMode === 'fortime' && (
          <div className="w-full max-w-3xl mb-8 space-y-4">
            {getForTimeBlocks(config).map((block, bIdx) => (
              <div key={bIdx} className="bg-hclub-dark border border-cyan-500/30 rounded-xl p-5 fade-in-up" style={{ animationDelay: `${0.2 + bIdx * 0.1}s`, opacity: 0 }}>
                <h3 className="font-oswald text-lg uppercase tracking-wider text-cyan-400 mb-3">
                  {getForTimeBlocks(config).length > 1 ? `Runde ${bIdx + 1}` : 'For Time'}
                </h3>
                <div className="overflow-x-auto">
                <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${config.numGroups}, minmax(90px, 1fr))`, minWidth: config.numGroups > 4 ? `${config.numGroups * 110}px` : undefined }}>
                  {Array.from({ length: config.numGroups }, (_, gIdx) => {
                    const exercises = block.exercises?.[gIdx] || [];
                    return (
                      <div key={gIdx}>
                        <div className="text-gray-500 text-xs font-oswald uppercase mb-2">G{gIdx + 1} ({gIdx + 1})</div>
                        {exercises.map((ex, eIdx) => (
                          <div key={eIdx} className="text-xs mb-1" style={{ color: getExerciseColor(ex.name) }}>
                            {formatExerciseLabel(ex)}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-4 fade-in-up" style={{ animationDelay: '0.6s', opacity: 0 }}>
          <button onClick={() => setPhase('idle')}
            className="px-8 py-3 bg-hclub-gray hover:bg-hclub-magenta/30 text-white font-oswald text-xl uppercase tracking-wider rounded-xl transition-colors">
            Zurück
          </button>
          <button onClick={startWorkout}
            className="px-12 py-3 bg-hclub-magenta hover:bg-hclub-magenta-dark text-white font-oswald text-xl uppercase tracking-widest rounded-xl transition-colors glow-pulse">
            Los geht&apos;s!
          </button>
        </div>
      </div>
    );
  }

  // =================== COUNTDOWN ===================
  if (phase === 'countdown') {
    return (
      <div className="workout-fullscreen flex flex-col items-center justify-center bg-pulse-dark">
        <div key={countdownValue} className="countdown-pop font-oswald font-bold text-hclub-magenta" style={{
          fontSize: 'min(50vw, 40vh)',
          textShadow: '0 0 60px #FF00FF, 0 0 120px rgba(255,0,255,0.5)',
          lineHeight: 1,
        }}>
          {countdownValue > 0 ? countdownValue : 'GO!'}
        </div>
        <div className="absolute bottom-6 right-6">
          <span className="font-oswald text-xl tracking-wider text-gray-500">H-<span className="text-hclub-magenta">CLUB</span></span>
        </div>
      </div>
    );
  }

  // =================== FINISHED ===================
  if (phase === 'finished') {
    const particles = Array.from({ length: 30 }, (_, i) => ({
      id: i, left: `${Math.random() * 100}%`, bottom: `${Math.random() * 20}%`,
      color: PARTICLE_COLORS[i % PARTICLE_COLORS.length], delay: `${Math.random() * 2}s`,
      size: 4 + Math.random() * 12, duration: `${2 + Math.random() * 3}s`,
    }));

    return (
      <div className="workout-fullscreen flex flex-col items-center justify-center overflow-hidden">
        {particles.map((p) => (
          <div key={p.id} className="particle" style={{ left: p.left, bottom: p.bottom, backgroundColor: p.color, width: p.size, height: p.size, animationDelay: p.delay, animationDuration: p.duration }} />
        ))}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="burst rounded-full border-2 border-hclub-magenta" style={{ width: 100, height: 100, animationDelay: '0s' }} />
          <div className="burst rounded-full border border-purple-500" style={{ width: 80, height: 80, animationDelay: '0.3s', position: 'absolute' }} />
        </div>
        <h1 className="font-oswald text-7xl md:text-9xl font-bold text-hclub-magenta uppercase tracking-wider mb-8 power-pulse relative z-10">Fertig!</h1>
        <h2 className="font-oswald text-3xl uppercase tracking-wider text-gray-300 mb-4 relative z-10">{workout.name}</h2>
        {workoutMode === 'amrap' && (
          <div className="flex gap-6 mb-4 relative z-10">
            {Array.from({ length: config.numGroups }, (_, g) => (
              <p key={g} className="font-oswald text-2xl text-orange-400">
                Gruppe {g + 1}: {amrapRoundsCompleted[g] || 0} Runden
              </p>
            ))}
          </div>
        )}
        {workoutMode === 'fortime' && (
          <p className="font-oswald text-2xl text-cyan-400 mb-4 relative z-10">Zeit: {formatTime(forTimeElapsed)}</p>
        )}
        <p className="text-gray-400 text-lg mb-12 relative z-10">Gut gemacht!</p>
        <button onClick={() => setPhase('idle')}
          className="px-8 py-3 bg-hclub-gray hover:bg-hclub-magenta text-white font-oswald text-xl uppercase tracking-wider rounded-xl transition-colors relative z-10">
          Zurück
        </button>
        <div className="absolute bottom-6 right-6">
          <span className="font-oswald text-xl tracking-wider text-gray-500">H-<span className="text-hclub-magenta">CLUB</span></span>
        </div>
      </div>
    );
  }

  // =================== WARMUP ===================
  if (phase === 'warmup') {
    return (
      <div className="workout-fullscreen flex flex-col items-center justify-center" style={{ paddingBottom: "15vh" }}>
        {isPaused && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-50 cursor-pointer" onClick={() => setIsPaused(false)}>
            <span className="font-oswald text-6xl uppercase tracking-wider text-yellow-400">Pausiert</span>
            <span className="absolute bottom-24 text-gray-400 font-oswald text-lg uppercase tracking-wider">Tippe zum Fortsetzen</span>
          </div>
        )}
        <div className="breathe text-center">
          <h1 className="font-oswald text-5xl md:text-7xl uppercase tracking-widest text-hclub-magenta mb-8 text-center">Warmup</h1>
          <div className="font-oswald text-[10rem] md:text-[14rem] leading-none text-white text-center">{formatTime(timeRemaining)}</div>
        </div>
        <p className="text-gray-400 text-xl mt-8 font-oswald uppercase tracking-wider text-center">Mach dich bereit!</p>
        <button onClick={() => setIsPaused(p => !p)}
          className="absolute bottom-16 left-4 z-50 w-14 h-14 rounded-full flex items-center justify-center transition-all active:scale-90"
          style={{ backgroundColor: isPaused ? '#FFD700' : 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)', border: isPaused ? '2px solid #FFD700' : '2px solid rgba(255,255,255,0.2)' }}
          title={isPaused ? 'Fortsetzen' : 'Pausieren'}>
          {isPaused ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="black"><polygon points="6,4 20,12 6,20" /></svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="white"><rect x="5" y="4" width="5" height="16" rx="1" /><rect x="14" y="4" width="5" height="16" rx="1" /></svg>
          )}
        </button>
        <div className="absolute bottom-6 right-6"><span className="font-oswald text-xl tracking-wider text-gray-500">H-<span className="text-hclub-magenta">CLUB</span></span></div>
        <div className="absolute bottom-6 left-6 text-gray-500">{workout.trainer_name}</div>
      </div>
    );
  }

  // =================== AMRAP WORK PHASE ===================
  if (workoutMode === 'amrap' && phase === 'work') {
    return (
      <div className="workout-fullscreen flex flex-col">
        {isPaused && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-50 cursor-pointer" onClick={() => setIsPaused(false)}>
            <span className="font-oswald text-6xl uppercase tracking-wider text-yellow-400">Pausiert</span>
          </div>
        )}

        {/* Big timer at top */}
        <div className="flex flex-col items-center justify-center py-4 md:py-8 shrink-0 bg-gradient-to-b from-black/80 to-transparent relative z-10">
          <div className="text-gray-500 text-sm font-oswald uppercase tracking-wider mb-1">
            AMRAP{getAmrapBlocks(config).length > 1 ? ` Block ${amrapCurrentBlock + 1}/${getAmrapBlocks(config).length}` : ''}
          </div>
          <div className={`font-oswald leading-none text-white ${timeRemaining <= 10 ? 'text-hclub-magenta heartbeat' : ''}`}
            style={{ fontSize: 'min(30vw, 20vh)', textShadow: timeRemaining <= 10 ? '0 0 60px #FF00FF' : 'none' }}>
            {formatTime(timeRemaining)}
          </div>
          <div className="flex gap-4 mt-2">
            {Array.from({ length: config.numGroups }, (_, g) => (
              <div key={g} className="text-orange-400 font-oswald text-xl">
                G{g + 1}: {amrapRoundsCompleted[g] || 0} Runden
              </div>
            ))}
          </div>
        </div>

        {/* Group columns */}
        <div className="flex-1 overflow-x-auto">
        <div className="flex h-full" style={{ minWidth: config.numGroups > 4 ? `${config.numGroups * 130}px` : '100%' }}>
          {Array.from({ length: config.numGroups }, (_, gIdx) => {
            const currentBlockData = getAmrapBlocks(config)[amrapCurrentBlock];
            const exercises = currentBlockData?.exercises?.[gIdx] || [];
            const currentIdx = amrapCurrentExIndex[gIdx] || 0;
            const currentEx = exercises[currentIdx];
            const nextEx = exercises[(currentIdx + 1) % exercises.length];
            if (!currentEx) return null;

            return (
              <div key={gIdx} className="flex-1 flex flex-col items-center justify-center relative cursor-pointer"
                style={{ backgroundColor: GROUP_BG_SHADES[gIdx % GROUP_BG_SHADES.length], borderRight: gIdx < config.numGroups - 1 ? '1px solid #333' : 'none', minWidth: config.numGroups > 4 ? '130px' : undefined }}
                onClick={() => amrapNextExercise(gIdx)}>
                <div className="font-oswald text-xs uppercase tracking-widest text-gray-500 absolute top-3 text-center px-1">
                  G{gIdx + 1} <span className="text-orange-400">{amrapRoundsCompleted[gIdx] || 0}R</span>
                </div>
                <div className="text-gray-500 text-sm font-oswald mb-1">{currentEx.reps}x</div>
                <div className={`font-oswald ${config.numGroups > 5 ? 'text-lg md:text-2xl' : 'text-2xl md:text-5xl'} uppercase tracking-wider text-center px-2 mb-2`}
                  style={{ color: getExerciseColor(currentEx.name) }}>
                  {currentEx.name}
                </div>
                {nextEx && (
                  <div className={`text-gray-400 ${config.numGroups > 5 ? 'text-sm md:text-base' : 'text-2xl md:text-3xl'} font-oswald uppercase tracking-wider text-center px-1`}>
                    <span className="text-gray-500">→ </span><span style={{ color: getExerciseColor(nextEx.name), opacity: 0.8 }}>{nextEx.reps}x {nextEx.name}</span>
                  </div>
                )}
                <div className="absolute bottom-4 text-gray-600 text-xs font-oswald uppercase">Klick</div>
                <div className="absolute bottom-0 left-0 right-0 h-1" style={{ backgroundColor: getExerciseColor(currentEx.name) }} />
              </div>
            );
          })}
        </div>
        </div>

        {/* Bottom controls */}
        <div className="flex items-center justify-between px-4 py-2 bg-hclub-dark/80 border-t border-hclub-gray/50 shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => setIsPaused(p => !p)}
              className="w-10 h-10 rounded-full flex items-center justify-center transition-all"
              style={{ backgroundColor: isPaused ? '#FFD700' : 'rgba(255,255,255,0.15)', border: isPaused ? '2px solid #FFD700' : '2px solid rgba(255,255,255,0.2)' }}>
              {isPaused ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="black"><polygon points="6,4 20,12 6,20" /></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><rect x="5" y="4" width="5" height="16" rx="1" /><rect x="14" y="4" width="5" height="16" rx="1" /></svg>
              )}
            </button>
            <span className="text-gray-400 text-sm">{workout.trainer_name}</span>
          </div>
          <span className="text-gray-500 text-xs">LEERTASTE = Alle weiter | Mit Tasten 1-{config.numGroups} die jeweilige Gruppe weiter</span>
          <span className="font-oswald text-lg tracking-wider text-gray-500">H-<span className="text-hclub-magenta">CLUB</span></span>
        </div>
      </div>
    );
  }

  // =================== FORTIME WORK PHASE ===================
  if (workoutMode === 'fortime' && phase === 'work') {
    return (
      <div className="workout-fullscreen flex flex-col">
        {isPaused && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-50 cursor-pointer" onClick={() => setIsPaused(false)}>
            <span className="font-oswald text-6xl uppercase tracking-wider text-yellow-400">Pausiert</span>
          </div>
        )}

        {/* Elapsed timer */}
        <div className="flex flex-col items-center justify-center py-3 shrink-0 bg-gradient-to-b from-black/80 to-transparent relative z-10">
          <div className="text-gray-500 text-sm font-oswald uppercase tracking-wider mb-1">
            For Time{getForTimeBlocks(config).length > 1 ? ` Runde ${forTimeCurrentBlock + 1}/${getForTimeBlocks(config).length}` : ''}
          </div>
          <div className="font-oswald leading-none text-white" style={{ fontSize: 'min(20vw, 12vh)' }}>
            {formatTime(forTimeElapsed)}
          </div>
        </div>

        {/* Group columns */}
        <div className="flex-1 overflow-x-auto">
        <div className="flex h-full" style={{ minWidth: config.numGroups > 4 ? `${config.numGroups * 130}px` : '100%' }}>
          {Array.from({ length: config.numGroups }, (_, gIdx) => {
            const currentBlockData = getForTimeBlocks(config)[forTimeCurrentBlock];
            const exercises = currentBlockData?.exercises?.[gIdx] || [];
            const currentIdx = forTimeCurrentExIndex[gIdx] || 0;
            const isFinished = forTimeGroupFinished[gIdx];
            const currentEx = exercises[currentIdx];
            const nextEx = currentIdx + 1 < exercises.length ? exercises[currentIdx + 1] : null;

            return (
              <div key={gIdx} className={`flex-1 flex flex-col items-center justify-center relative ${isFinished ? '' : 'cursor-pointer'}`}
                style={{ backgroundColor: isFinished ? '#0a1a0a' : GROUP_BG_SHADES[gIdx % GROUP_BG_SHADES.length], borderRight: gIdx < config.numGroups - 1 ? '1px solid #333' : 'none', minWidth: config.numGroups > 4 ? '130px' : undefined }}
                onClick={() => !isFinished && forTimeAdvanceGroup(gIdx)}>
                <div className="font-oswald text-xs uppercase tracking-widest text-gray-500 absolute top-3 text-center px-1">
                  G{gIdx + 1} <span className="text-cyan-400">({gIdx + 1})</span>
                </div>

                {isFinished ? (
                  <div className={`font-oswald ${config.numGroups > 5 ? 'text-2xl md:text-4xl' : 'text-4xl md:text-6xl'} uppercase tracking-wider text-green-400`}>Fertig!</div>
                ) : currentEx ? (
                  <>
                    {/* Exercise progress */}
                    <div className="flex gap-1 mb-2">
                      {exercises.map((_, idx) => (
                        <div key={idx} className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: idx === currentIdx ? getExerciseColor(currentEx.name) : idx < currentIdx ? '#555' : '#333',
                            transform: idx === currentIdx ? 'scale(1.3)' : 'scale(1)' }} />
                      ))}
                    </div>

                    <div className={`font-oswald ${config.numGroups > 5 ? 'text-lg md:text-2xl' : 'text-3xl md:text-6xl'} uppercase tracking-wider text-center px-2 mb-2`}
                      style={{ color: getExerciseColor(currentEx.name) }}>
                      {formatExerciseLabel(currentEx)}
                    </div>

                    {nextEx && (
                      <div className={`text-gray-400 ${config.numGroups > 5 ? 'text-xs md:text-sm' : 'text-2xl md:text-3xl'} font-oswald uppercase tracking-wider mt-2 text-center px-1`}>
                        <span className="text-gray-500">→ </span><span style={{ color: getExerciseColor(nextEx.name), opacity: 0.8 }}>{formatExerciseLabel(nextEx)}</span>
                      </div>
                    )}
                    <div className="absolute bottom-4 text-gray-600 text-xs font-oswald uppercase">Taste {gIdx + 1}</div>
                  </>
                ) : null}

                <div className="absolute bottom-0 left-0 right-0 h-1" style={{ backgroundColor: isFinished ? '#32CD32' : (currentEx ? getExerciseColor(currentEx.name) : '#333') }} />
              </div>
            );
          })}
        </div>
        </div>

        {/* Bottom */}
        <div className="flex items-center justify-between px-4 py-2 bg-hclub-dark/80 border-t border-hclub-gray/50 shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => setIsPaused(p => !p)}
              className="w-10 h-10 rounded-full flex items-center justify-center transition-all"
              style={{ backgroundColor: isPaused ? '#FFD700' : 'rgba(255,255,255,0.15)', border: isPaused ? '2px solid #FFD700' : '2px solid rgba(255,255,255,0.2)' }}>
              {isPaused ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="black"><polygon points="6,4 20,12 6,20" /></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><rect x="5" y="4" width="5" height="16" rx="1" /><rect x="14" y="4" width="5" height="16" rx="1" /></svg>
              )}
            </button>
            <span className="text-gray-400 text-sm">{workout.trainer_name}</span>
          </div>
          <span className="text-gray-500 text-xs">Taste 1-{config.numGroups} = Gruppe weiter</span>
          <span className="font-oswald text-lg tracking-wider text-gray-500">H-<span className="text-hclub-magenta">CLUB</span></span>
        </div>
      </div>
    );
  }

  // =================== TIMED MODE: WORK / REST / ROUND REST ===================
  const showPowerTimer = phase === 'work' && timeRemaining <= 10 && timeRemaining > 0;
  const showShake = phase === 'work' && timeRemaining <= 3 && timeRemaining > 0;
  const workTimeTotal = getWorkTimeForRound(config, currentRound);
  const progressPercent = phase === 'work' ? (timeRemaining / workTimeTotal) * 100 : 100;

  return (
    <div className={`workout-fullscreen flex flex-col ${showPowerTimer ? 'bg-pulse-dark' : ''} ${showShake ? 'shake' : ''}`}>
      {/* Pause overlay */}
      {isPaused && (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-50">
          <span className="font-oswald text-6xl uppercase tracking-wider text-yellow-400">Pausiert</span>
        </div>
      )}

      {/* Round announcement overlay */}
      {showRoundAnnounce && (
        <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="round-announce font-oswald font-bold text-hclub-magenta uppercase"
               style={{ fontSize: 'min(30vw, 25vh)', textShadow: '0 0 60px #FF00FF, 0 0 100px rgba(255,0,255,0.4)', lineHeight: 1 }}>
            Runde {announceRound}
          </div>
        </div>
      )}

      {/* Power timer edge glow */}
      {showPowerTimer && (
        <>
          <div className="edge-glow-top" />
          <div className="edge-glow-bottom" />
          <div className="edge-glow-left" />
          <div className="edge-glow-right" />
        </>
      )}

      {/* Power timer overlay */}
      {showPowerTimer && (
        <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none">
          <div className="flash-overlay absolute inset-0 bg-hclub-magenta" />
          <div key={numberPopKey} className="number-pop font-oswald text-[16rem] md:text-[22rem] leading-none text-hclub-magenta font-bold"
               style={{ textShadow: '0 0 60px #FF00FF, 0 0 120px #FF00FF' }}>
            {timeRemaining}
          </div>
        </div>
      )}

      {/* Redesigned top bar: Timer prominent, phase + round info smaller */}
      <div className="grid grid-cols-3 items-center px-4 py-2 bg-hclub-dark/80 border-b border-hclub-gray/50 shrink-0">
        <div className="flex items-center gap-3">
          <div className="font-oswald text-sm uppercase tracking-wider">
            {phase === 'rest' && <span className="text-yellow-400">Pause</span>}
            {phase === 'roundRest' && <span className="text-orange-400">Rundenpause</span>}
            {phase === 'work' && <span className="text-green-400">Arbeit</span>}
          </div>
          <div className="font-oswald text-lg tracking-wider text-gray-400">
            Runde {currentRound + 1}/{config.numRounds}
          </div>
        </div>

        {/* GIANT TIMER - centered */}
        <div className="flex justify-center">
          <div className={`font-oswald tracking-wider text-white ${phase === 'work' && timeRemaining <= 10 ? 'heartbeat text-hclub-magenta' : ''}`}
               style={{ fontSize: 'min(8vw, 4rem)', lineHeight: 1 }}>
            {formatTime(timeRemaining)}
          </div>
        </div>

        <div className="flex items-center gap-2 justify-end">
          {phase === 'work' && (
            <button onClick={skipToNext}
              className="px-3 py-1 bg-hclub-gray hover:bg-orange-900/60 text-gray-300 hover:text-orange-300 text-xs
                         font-oswald uppercase rounded-lg transition-colors border border-hclub-gray hover:border-orange-500/50"
              title="Überspringen (N)">
              Weiter &rarr;
            </button>
          )}
        </div>
      </div>

      {/* Round rest display */}
      {phase === 'roundRest' && (
        <div className="flex-1 flex flex-col items-center justify-center px-4">
          <h2 className="font-oswald text-3xl md:text-5xl uppercase tracking-widest text-orange-400 mb-4">Rundenpause</h2>
          <div className="font-oswald leading-none text-white mb-6" style={{ fontSize: 'min(40vw, 25vh)' }}>
            {formatTime(timeRemaining)}
          </div>
          <p className="font-oswald text-xl md:text-2xl uppercase tracking-wider text-gray-400 mb-6">Nächste: Runde {currentRound + 1}</p>
          <div className="w-full max-w-5xl mb-6">
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(config.numGroups > 4 ? Math.ceil(config.numGroups / 2) : config.numGroups, 4)}, 1fr)` }}>
            {Array.from({ length: config.numGroups }, (_, gIdx) => {
              const nextExercises = config.rounds[currentRound]?.[gIdx] || [];
              const nextEx = nextExercises[0] || 'Übung';
              const ExIcon = getIconForExercise(config, currentRound, gIdx, 0, nextEx);
              return (
                <div key={gIdx} className="bg-hclub-dark/60 border border-hclub-gray/40 rounded-xl p-3 text-center">
                  <div className="text-gray-500 text-xs font-oswald uppercase tracking-wider mb-1">G{String.fromCharCode(65 + gIdx)}</div>
                  <div className="flex justify-center mb-1 opacity-70"><ExIcon size={config.numGroups > 5 ? 32 : 40} color={getExerciseColor(nextEx)} /></div>
                  <div className="font-oswald text-sm md:text-lg uppercase tracking-wider" style={{ color: getExerciseColor(nextEx) }}>{nextEx}</div>
                </div>
              );
            })}
          </div>
          </div>
          <button onClick={() => setTimeRemaining(0)}
            className="px-8 py-3 bg-green-600 hover:bg-green-500 text-white font-oswald text-xl uppercase tracking-wider rounded-xl transition-colors">
            Weiter &rarr;
          </button>
        </div>
      )}

      {/* Rest between exercises */}
      {phase === 'rest' && (
        <div className="flex-1 flex flex-col items-center justify-center px-4">
          <h2 className="font-oswald text-3xl md:text-5xl uppercase tracking-widest text-yellow-400 mb-4">Pause</h2>
          <div className="font-oswald leading-none text-white mb-6" style={{ fontSize: 'min(40vw, 25vh)' }}>
            {formatTime(timeRemaining)}
          </div>
          <div className="w-full max-w-5xl">
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(config.numGroups > 4 ? Math.ceil(config.numGroups / 2) : config.numGroups, 4)}, 1fr)` }}>
            {Array.from({ length: config.numGroups }, (_, gIdx) => {
              const exercises = config.rounds[currentRound]?.[gIdx] || [];
              const nextEx = exercises[currentExerciseIndex] || exercises[exercises.length - 1] || 'Übung';
              const ExIcon = getIconForExercise(config, currentRound, gIdx, currentExerciseIndex, nextEx);
              return (
                <div key={gIdx} className="bg-hclub-dark/60 border border-hclub-gray/40 rounded-xl p-3 text-center">
                  <div className="text-gray-500 text-xs font-oswald uppercase tracking-wider mb-1">G{String.fromCharCode(65 + gIdx)}</div>
                  <div className="flex justify-center mb-1 opacity-70"><ExIcon size={config.numGroups > 5 ? 32 : 40} color={getExerciseColor(nextEx)} /></div>
                  <div className="font-oswald text-sm md:text-lg uppercase tracking-wider" style={{ color: getExerciseColor(nextEx) }}>{nextEx}</div>
                </div>
              );
            })}
          </div>
          </div>
        </div>
      )}

      {/* WORK phase - redesigned: exercise name smaller, next preview bigger */}
      {phase === 'work' && (
        <>
          <style>{`
            .work-groups-scroll {
              flex: 1;
              overflow-x: auto;
              overflow-y: hidden;
            }
            .work-groups-grid {
              display: grid;
              height: 100%;
              min-height: 0;
              grid-template-columns: repeat(${config.numGroups > 4 ? Math.ceil(config.numGroups / 2) : config.numGroups}, 1fr);
              grid-template-rows: ${config.numGroups > 4 ? '1fr 1fr' : '1fr'};
            }
          `}</style>
          <div className="work-groups-scroll">
          <div className="work-groups-grid">
          {Array.from({ length: config.numGroups }, (_, groupIndex) => {
            const exercises = config.rounds[currentRound]?.[groupIndex] || [];
            const currentExercise = exercises[currentExerciseIndex] || exercises[exercises.length - 1] || 'Übung';
            const exerciseColor = getExerciseColor(currentExercise);
            const nextExercise = getNextExercise(config, groupIndex);
            const ExerciseIcon = getIconForExercise(config, currentRound, groupIndex, currentExerciseIndex, currentExercise);

            // Get group-specific time if any
            const groupWorkTime = getWorkTimeForGroup(config, currentRound, groupIndex);
            const hasGroupCustomTime = groupWorkTime !== workTimeTotal;

            return (
              <div key={groupIndex}
                className="flex flex-col items-center justify-center relative slide-up min-h-[120px] md:min-h-0"
                style={{
                  backgroundColor: GROUP_BG_SHADES[groupIndex % GROUP_BG_SHADES.length],
                  borderRight: groupIndex < config.numGroups - 1 ? '1px solid #333' : 'none',
                  borderBottom: '1px solid #333',
                  animationDelay: `${groupIndex * 0.1}s`,
                }}>
                {/* Time progress bar */}
                <div className="time-progress-bar" style={{ width: `${progressPercent}%`, backgroundColor: exerciseColor, opacity: 0.6 }} />

                {/* Group label */}
                <div className="font-oswald text-xs md:text-sm uppercase tracking-widest text-gray-500 mt-1 md:absolute md:top-3">
                  Gruppe {groupIndex + 1}
                  {hasGroupCustomTime && <span className="text-cyan-400 ml-2">({groupWorkTime}s)</span>}
                </div>

                {/* Exercise icon - smaller */}
                <div key={`icon-${exerciseAnimKey}`} className="exercise-enter mb-1 md:mb-2 opacity-80">
                  <ExerciseIcon size={config.numGroups <= 2 ? 56 : 40} color={exerciseColor} />
                </div>

                {/* Current exercise name - smaller */}
                <div key={exerciseAnimKey}
                  className="font-oswald text-lg sm:text-xl md:text-3xl lg:text-4xl uppercase tracking-wider text-center px-2 md:px-4 mb-1 md:mb-3 exercise-enter"
                  style={{ color: exerciseColor }}>
                  {currentExercise}
                </div>

                {/* Exercise progress dots */}
                <div className="flex gap-1 md:gap-2 mb-1 md:mb-2">
                  {exercises.map((_, idx) => (
                    <div key={idx} className="w-2 h-2 md:w-3 md:h-3 rounded-full transition-all duration-300"
                      style={{
                        backgroundColor: idx === currentExerciseIndex ? exerciseColor : idx < currentExerciseIndex ? '#555' : '#333',
                        transform: idx === currentExerciseIndex ? 'scale(1.3)' : 'scale(1)',
                      }} />
                  ))}
                </div>

                {/* Next exercise preview - BIGGER */}
                {nextExercise && (
                  <div className="font-oswald text-xl md:text-3xl uppercase tracking-wider mt-1 md:mt-2 px-3 py-1 rounded-lg text-center"
                    style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
                    <span className="text-gray-400">Nächste: </span>
                    <span style={{ color: getExerciseColor(nextExercise) }}>{nextExercise}</span>
                  </div>
                )}

                <div className="absolute bottom-0 left-0 right-0 h-1" style={{ backgroundColor: exerciseColor }} />
              </div>
            );
          })}
          </div>
          </div>
        </>
      )}

      {/* Bottom controls */}
      <div className="flex items-center justify-between px-4 py-2 bg-hclub-dark/80 border-t border-hclub-gray/50 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => setIsPaused(p => !p)}
            className="w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-90"
            style={{ backgroundColor: isPaused ? '#FFD700' : 'rgba(255,255,255,0.15)', border: isPaused ? '2px solid #FFD700' : '2px solid rgba(255,255,255,0.2)' }}>
            {isPaused ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="black"><polygon points="6,4 20,12 6,20" /></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><rect x="5" y="4" width="5" height="16" rx="1" /><rect x="14" y="4" width="5" height="16" rx="1" /></svg>
            )}
          </button>
          <span className="text-gray-400 text-sm">{workout.trainer_name}</span>
        </div>
        {phase === 'work' && (
          <div className="text-gray-500 text-sm font-oswald uppercase">
            Übung {currentExerciseIndex + 1}/{getMaxExercisesInRound(config, currentRound)}
          </div>
        )}
        <span className="font-oswald text-lg tracking-wider text-gray-500">H-<span className="text-hclub-magenta">CLUB</span></span>
      </div>
    </div>
  );
}
