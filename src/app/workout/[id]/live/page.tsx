'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useParams } from 'next/navigation';
import type { Workout, WorkoutConfig, ExerciseSetting, WorkoutMode, ExerciseEntry, ForTimeBlock } from '@/lib/types';
import { getDefaultColor } from '@/lib/exercises';
import {
  playCountdownBeep,
  playPowerTimerBeep,
  playGoSound,
  playPhaseEndSound,
  playRoundEndSound,
} from '@/lib/sounds';
import { getExerciseImage } from '@/lib/exerciseImages';

type Phase = 'idle' | 'summary' | 'warmup' | 'countdown' | 'work' | 'rest' | 'roundRest' | 'finished';

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

  // ForTime (= AMRAP im UI) state
  const [forTimeCurrentExIndex, setForTimeCurrentExIndex] = useState<Record<number, number>>({});
  const [forTimeGroupFinished, setForTimeGroupFinished] = useState<Record<number, boolean>>({});
  // Absolvierte Durchgänge pro Gruppe (AMRAP-Loop): schnelle Gruppen fangen wieder vorne an
  const [forTimeGroupRounds, setForTimeGroupRounds] = useState<Record<number, number>>({});
  const [forTimeElapsed, setForTimeElapsed] = useState(0);
  const [forTimeCurrentBlock, setForTimeCurrentBlock] = useState(0);
  // Round timer for fortime mode
  const [forTimeRoundTimeRemaining, setForTimeRoundTimeRemaining] = useState(0);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTickRef = useRef<number>(0);
  const prevTimeRef = useRef<number>(0);
  const prevExerciseRef = useRef<number>(-1);
  const prevRoundRef = useRef<number>(-1);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const workoutMode: WorkoutMode = workout?.workout_mode || 'timed';

  // ForTime round timer settings
  const forTimeRoundTimerEnabled = workout?.config?.forTimeRoundTimerEnabled || false;
  const forTimeRoundTimerSeconds = (workout?.config?.forTimeRoundTimerMinutes || 12) * 60;

  // Block helpers
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
        // Also count down round timer if enabled
        if (forTimeRoundTimerEnabled) {
          setForTimeRoundTimeRemaining((prev) => {
            const next = prev - elapsed;
            return next <= 0 ? 0 : next;
          });
        }
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
  }, [phase, isPaused, workoutMode, forTimeRoundTimerEnabled]);

  // Sound effects based on time (timed mode only)
  useEffect(() => {
    if (isPaused || phase === 'idle' || phase === 'summary' || phase === 'finished' || phase === 'countdown') return;
    if (workoutMode === 'fortime') return;

    if (timeRemaining <= 5 && timeRemaining > 0 && timeRemaining !== prevTimeRef.current) {
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

  // Round timer sound + auto-advance for fortime mode
  useEffect(() => {
    if (workoutMode !== 'fortime' || !forTimeRoundTimerEnabled || phase !== 'work') return;
    if (forTimeRoundTimeRemaining <= 5 && forTimeRoundTimeRemaining > 0) {
      playCountdownBeep();
    }
    if (forTimeRoundTimeRemaining === 0 && forTimeElapsed > 0 && workout) {
      playRoundEndSound();
      // Auto-advance to next block when round timer expires
      const blocks = getForTimeBlocks(workout.config);
      const nextBlock = forTimeCurrentBlock + 1;
      if (nextBlock < blocks.length) {
        setPhase('roundRest');
        setTimeRemaining(workout.config.roundRestTime || 60);
        setForTimeCurrentBlock(nextBlock);
      } else {
        setPhase('finished');
      }
    }
  }, [forTimeRoundTimeRemaining, workoutMode, forTimeRoundTimerEnabled, phase, forTimeElapsed, workout, forTimeCurrentBlock]);

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

  // Skip current station/exercise (timed mode only)
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

  // ForTime warmup transition and block transitions
  useEffect(() => {
    if (workoutMode !== 'fortime') return;

    if (phase === 'warmup' && timeRemaining <= 3 && !isPaused && workout) {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      startCountdown(() => {
        setPhase('work');
        setForTimeElapsed(0);
        setForTimeCurrentBlock(0);
        // Initialize round timer
        if (workout.config.forTimeRoundTimerEnabled) {
          setForTimeRoundTimeRemaining((workout.config.forTimeRoundTimerMinutes || 12) * 60);
        }
        const initIdx: Record<number, number> = {};
        const initFinished: Record<number, boolean> = {};
        for (let g = 0; g < workout.config.numGroups; g++) {
          initIdx[g] = 0;
          initFinished[g] = false;
        }
        setForTimeCurrentExIndex(initIdx);
        setForTimeGroupFinished(initFinished);
        setForTimeGroupRounds({});
      });
      return;
    }

    // After roundRest in ForTime, start next block
    // Note: use timeRemaining === 0 without prevTimeRef check (which isn't updated in fortime mode)
    if (phase === 'roundRest' && timeRemaining === 0 && !isPaused && workout) {
      startCountdown(() => {
        setPhase('work');
        // Reset round timer for new block
        if (workout.config.forTimeRoundTimerEnabled) {
          setForTimeRoundTimeRemaining((workout.config.forTimeRoundTimerMinutes || 12) * 60);
        }
        setForTimeElapsed(0);
        const initIdx: Record<number, number> = {};
        const initFinished: Record<number, boolean> = {};
        for (let g = 0; g < workout.config.numGroups; g++) {
          initIdx[g] = 0;
          initFinished[g] = false;
        }
        setForTimeCurrentExIndex(initIdx);
        setForTimeGroupFinished(initFinished);
        setForTimeGroupRounds({});
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeRemaining, phase, isPaused, workout, workoutMode]);

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
        // AMRAP mit Rundentimer: Gruppe ist durch → Durchgang zählen und wieder vorne anfangen,
        // bis der Rundentimer abläuft (echtes AMRAP). Ohne Timer: Gruppe gilt als fertig.
        if (forTimeRoundTimerEnabled) {
          setForTimeGroupRounds(pr => ({ ...pr, [groupIndex]: (pr[groupIndex] || 0) + 1 }));
          playRoundEndSound();
          return { ...prev, [groupIndex]: 0 };
        }
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
          setIsPaused((p) => !p);
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
      } else {
        // fortime mode
        startCountdown(() => {
          setPhase('work');
          setForTimeElapsed(0);
          setForTimeCurrentBlock(0);
          if (config.forTimeRoundTimerEnabled) {
            setForTimeRoundTimeRemaining((config.forTimeRoundTimerMinutes || 12) * 60);
          }
          const initIdx: Record<number, number> = {};
          const initFinished: Record<number, boolean> = {};
          for (let g = 0; g < config.numGroups; g++) {
            initIdx[g] = 0;
            initFinished[g] = false;
          }
          setForTimeCurrentExIndex(initIdx);
          setForTimeGroupFinished(initFinished);
          setForTimeGroupRounds({});
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
          workoutMode === 'fortime' ? 'text-cyan-400 bg-cyan-400/10' :
          'text-green-400 bg-green-400/10'
        }`}>
          {workoutMode === 'fortime' ? 'AMRAP' : 'Zeitbasiert'}
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
          {workoutMode === 'fortime' && (
            <>
              <div className="fade-in-up" style={{ animationDelay: '0.3s' }}>
                <div className="font-oswald text-4xl text-hclub-magenta">
                  {getForTimeBlocks(config).length}
                </div>
                <div className="text-gray-400 text-sm font-oswald uppercase">Runden</div>
              </div>
              <div className="fade-in-up" style={{ animationDelay: '0.4s' }}>
                {config.forTimeRoundTimerEnabled ? (
                  <>
                    <div className="font-oswald text-4xl text-cyan-400">{config.forTimeRoundTimerMinutes || 12}</div>
                    <div className="text-gray-400 text-sm font-oswald uppercase">Min/Runde</div>
                  </>
                ) : (
                  <>
                    <div className="font-oswald text-4xl text-cyan-400">AMRAP</div>
                    <div className="text-gray-400 text-sm font-oswald uppercase">Modus</div>
                  </>
                )}
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
      <div className="workout-fullscreen flex flex-col overflow-hidden">
        {/* Fixierter Kopf — immer sichtbar */}
        <div className="shrink-0 flex flex-col items-center px-4 pt-4 pb-2">
          <h1 className="font-oswald font-bold tracking-wider fade-in-up text-center leading-none"
              style={{ fontSize: 'clamp(20px, 4.5vh, 44px)' }}>
            {workout.name}
          </h1>
          <p className="text-gray-400 fade-in-up" style={{ animationDelay: '0.1s', fontSize: 'clamp(12px, 2vh, 18px)' }}>
            {workout.trainer_name}
          </p>
          {totalTimeEstimate > 0 && (
            <div className="font-oswald text-hclub-magenta fade-in-up" style={{ animationDelay: '0.15s', fontSize: 'clamp(12px, 2vh, 18px)' }}>
              Geschaetzte Dauer: {formatTimeMinutes(totalTimeEstimate)}
            </div>
          )}
        </div>

        {/* Scrollbarer Mittelbereich — nimmt den Rest, Buttons bleiben sichtbar */}
        <div className="flex-1 min-h-0 overflow-y-auto w-full flex flex-col items-center px-4 py-2">

        {workoutMode === 'timed' && (
          <div className={`w-full mb-2 grid gap-4 ${
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
                        <div className={`text-gray-500 font-oswald uppercase tracking-wider mb-1.5 ${config.numRounds === 1 ? 'text-sm' : 'text-xs'}`}>G{gIdx + 1}</div>
                        {exercises.map((ex, eIdx) => (
                          <div key={eIdx} className={`rd-ex-row ${config.numRounds === 1 ? 'text-sm' : 'text-xs'}`} style={{ color: getExerciseColor(ex) }}>
                            <span className="rd-ex-dot" />
                            <span>{ex}</span>
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
          <div className="w-full max-w-5xl mb-2 space-y-4">
            {config.forTimeRoundTimerEnabled && (
              <div className="text-center text-cyan-400 font-oswald uppercase tracking-wider mb-2">
                Timer pro Runde: {config.forTimeRoundTimerMinutes || 12} Minuten
              </div>
            )}
            {getForTimeBlocks(config).map((block, bIdx) => (
              <div key={bIdx} className="bg-hclub-dark border border-cyan-500/30 rounded-xl p-5 fade-in-up" style={{ animationDelay: `${0.2 + bIdx * 0.1}s`, opacity: 0 }}>
                <h3 className="font-oswald text-lg uppercase tracking-wider text-cyan-400 mb-3">
                  {getForTimeBlocks(config).length > 1 ? `Runde ${bIdx + 1}` : 'AMRAP'}
                </h3>
                <div className="overflow-x-auto">
                <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${config.numGroups}, minmax(90px, 1fr))`, minWidth: config.numGroups > 4 ? `${config.numGroups * 110}px` : undefined }}>
                  {Array.from({ length: config.numGroups }, (_, gIdx) => {
                    const exercises = block.exercises?.[gIdx] || [];
                    return (
                      <div key={gIdx}>
                        <div className="text-gray-500 text-xs font-oswald uppercase mb-2">G{gIdx + 1} ({gIdx + 1})</div>
                        {exercises.map((ex, eIdx) => (
                          <div key={eIdx} className="rd-ex-row text-xs" style={{ color: getExerciseColor(ex.name) }}>
                            <span className="rd-ex-dot" />
                            <span>{formatExerciseLabel(ex)}</span>
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

        </div>
        {/* Fixierter Fuß — Start-/Zurück-Buttons IMMER sichtbar & klickbar */}
        <div className="shrink-0 flex gap-4 justify-center items-center px-4 py-3 border-t border-hclub-gray/40 bg-black/40">
          <button onClick={() => setPhase('idle')}
            className="px-8 py-3 bg-hclub-gray hover:bg-hclub-magenta/30 text-white font-oswald text-lg md:text-xl uppercase tracking-wider rounded-xl transition-colors">
            Zurück
          </button>
          <button onClick={startWorkout}
            className="px-12 py-3 bg-hclub-magenta hover:bg-hclub-magenta-dark text-white font-oswald text-lg md:text-xl uppercase tracking-widest rounded-xl transition-colors glow-pulse">
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

  // =================== FORTIME / AMRAP WORK PHASE ===================
  // Alle Übungen aller Gruppen gleichzeitig sichtbar, keine Slideshow
  if (workoutMode === 'fortime' && phase === 'work') {
    const currentBlockData = getForTimeBlocks(config)[forTimeCurrentBlock];
    const totalBlocks = getForTimeBlocks(config).length;
    const roundTimerActive = forTimeRoundTimerEnabled;
    const roundTimerExpired = roundTimerActive && forTimeRoundTimeRemaining === 0;

    return (
      <div className="workout-fullscreen rd-live-bg flex flex-col">
        {isPaused && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-50 cursor-pointer" onClick={() => setIsPaused(false)}>
            <span className="font-oswald text-6xl uppercase tracking-wider text-yellow-400">Pausiert</span>
          </div>
        )}

        {/* Top bar: Elapsed / Round Timer */}
        <div className="rd-topbar flex items-center justify-between px-4 py-2 md:py-3 shrink-0 relative z-10">
          <div className="flex flex-col">
            <div className="rd-timer-label font-oswald text-[10px] uppercase">
              AMRAP{totalBlocks > 1 ? ` — Runde ${forTimeCurrentBlock + 1}/${totalBlocks}` : ''}
            </div>
            <div className="rd-timer font-oswald font-bold" style={{ fontSize: 'min(8vw, 2.75rem)' }}>
              {formatTime(forTimeElapsed)}
            </div>
          </div>

          {/* Round countdown timer */}
          {roundTimerActive && (
            <div className={`flex flex-col items-center ${roundTimerExpired ? 'text-red-400' : forTimeRoundTimeRemaining <= 30 ? 'text-yellow-400' : 'text-hclub-magenta'}`}>
              <div className="rd-timer-label text-[10px] font-oswald uppercase">
                Rundenzeit
              </div>
              <div className={`font-oswald font-bold ${roundTimerExpired ? 'heartbeat' : 'rd-timer-accent'}`}
                style={{ fontSize: 'min(10vw, 3.25rem)', textShadow: roundTimerExpired ? '0 0 30px #f87171' : forTimeRoundTimeRemaining <= 30 ? '0 0 20px #facc15' : undefined }}>
                {formatTime(forTimeRoundTimeRemaining)}
              </div>
            </div>
          )}

          <div className="font-oswald text-lg tracking-wider text-gray-400">
            H-<span className="text-hclub-magenta rd-timer-accent">CLUB</span>
          </div>
        </div>

        {/* Group columns — alle Übungen gleichzeitig sichtbar */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden">
          <div className="flex h-full" style={{ minWidth: config.numGroups > 4 ? `${config.numGroups * 160}px` : '100%' }}>
            {Array.from({ length: config.numGroups }, (_, gIdx) => {
              const exercises = currentBlockData?.exercises?.[gIdx] || [];
              const currentIdx = forTimeCurrentExIndex[gIdx] || 0;
              const isFinished = forTimeGroupFinished[gIdx];
              const groupRounds = forTimeGroupRounds[gIdx] || 0;

              const currentExName = exercises[currentIdx]?.name || '';

              return (
                <div key={gIdx}
                  className={`rd-col ${isFinished ? '' : 'rd-col-active cursor-pointer'} flex-1 flex flex-col relative`}
                  style={{
                    backgroundColor: isFinished ? '#07160a' : undefined,
                    borderRight: gIdx < config.numGroups - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                    minWidth: config.numGroups > 4 ? '160px' : undefined,
                  }}
                  onClick={() => !isFinished && forTimeAdvanceGroup(gIdx)}
                >
                  {/* Current exercise image — Schein in der Übungsfarbe */}
                  {!isFinished && (
                    <div className="px-3 pt-2 shrink-0 flex justify-center">
                      <div className="rd-img-frame rd-img-color" style={{ width: '100%', maxWidth: config.numGroups > 4 ? 130 : 180, aspectRatio: '4 / 3', ['--ex-color' as string]: getExerciseColor(currentExName) }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={getExerciseImage(currentExName)} alt={currentExName}
                          onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/exercises/generic.jpg'; }} />
                      </div>
                    </div>
                  )}

                  {/* Group header */}
                  <div className="px-3 pt-2 pb-1 border-b border-white/5 shrink-0">
                    <div className="font-oswald text-xs uppercase tracking-widest text-gray-500 flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        Gruppe {gIdx + 1}
                        {roundTimerActive && groupRounds > 0 && (
                          <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 text-[10px] font-bold tracking-normal">
                            {groupRounds} {groupRounds === 1 ? 'Durchgang' : 'Durchgänge'}
                          </span>
                        )}
                      </span>
                      <span className="text-cyan-500 text-[10px]">({gIdx + 1})</span>
                    </div>
                    {!isFinished && (
                      <div className="mt-1 flex gap-1">
                        {exercises.map((_, idx) => (
                          <div key={idx} className="h-1 rounded-full flex-1 transition-all"
                            style={{
                              backgroundColor: idx < currentIdx ? '#22c55e' : idx === currentIdx ? getExerciseColor(exercises[idx]?.name || '') : '#333',
                              opacity: idx === currentIdx ? 1 : 0.6,
                            }} />
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Exercise list — alle gleichzeitig sichtbar */}
                  <div className="flex-1 overflow-y-auto py-2">
                    {isFinished ? (
                      <div className="flex items-center justify-center h-full">
                        <div className={`font-oswald ${config.numGroups > 5 ? 'text-2xl' : 'text-4xl md:text-5xl'} uppercase tracking-wider text-green-400`}>
                          Fertig!
                        </div>
                      </div>
                    ) : (
                      exercises.map((ex, eIdx) => {
                        const isDone = eIdx < currentIdx;
                        const isCurrent = eIdx === currentIdx;
                        const exerciseColor = getExerciseColor(ex.name);

                        return (
                          <div key={eIdx}
                            className={`mx-2 mb-2 rounded-lg px-3 py-2 transition-all ${
                              isDone
                                ? 'opacity-30 line-through'
                                : isCurrent
                                ? 'ring-1 ring-white/20'
                                : 'opacity-60'
                            }`}
                            style={{
                              backgroundColor: isCurrent
                                ? `${exerciseColor}18`
                                : isDone ? 'transparent' : 'rgba(255,255,255,0.03)',
                              borderLeft: isCurrent ? `3px solid ${exerciseColor}` : '3px solid transparent',
                            }}
                          >
                            <div
                              className={`font-oswald uppercase tracking-wide ${
                                isCurrent
                                  ? config.numGroups > 5 ? 'text-base md:text-lg' : 'text-lg md:text-2xl'
                                  : config.numGroups > 5 ? 'text-sm md:text-base' : 'text-base md:text-lg'
                              }`}
                              style={{ color: isCurrent ? exerciseColor : isDone ? '#555' : exerciseColor }}
                            >
                              {formatExerciseLabel(ex)}
                            </div>
                            {isCurrent && (
                              <div className="text-gray-500 text-[10px] font-oswald uppercase mt-0.5">
                                Aktuell
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Click hint */}
                  {!isFinished && (
                    <div className="px-3 pb-2 shrink-0">
                      <div className="text-center text-gray-600 text-xs font-oswald uppercase border border-white/5 rounded py-1">
                        Klick / Taste {gIdx + 1}
                      </div>
                    </div>
                  )}

                </div>
              );
            })}
          </div>
        </div>

        {/* Bottom controls */}
        <div className="rd-bottombar flex items-center justify-between px-4 py-2 shrink-0">
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
          <span className="text-gray-500 text-xs">Taste 1-{config.numGroups} = Übung abhaken</span>
        </div>
      </div>
    );
  }

  // =================== TIMED MODE: WORK / REST / ROUND REST ===================
  const workTimeTotal = getWorkTimeForRound(config, currentRound);

  return (
    <div className="workout-fullscreen rd-live-bg flex flex-col">
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
               style={{ fontSize: 'min(30vw, 25vh)', textShadow: '0 0 40px rgba(255,0,255,0.5)', lineHeight: 1 }}>
            Runde {announceRound}
          </div>
        </div>
      )}

      {/* Top bar */}
      <div className="rd-topbar grid grid-cols-3 items-center px-4 py-2 md:py-3 shrink-0 relative z-10">
        <div className="flex items-center gap-3">
          <div className="font-oswald text-sm uppercase tracking-wider">
            {phase === 'rest' && <span className="text-yellow-400">Pause</span>}
            {phase === 'roundRest' && <span className="text-orange-400">Rundenpause</span>}
            {phase === 'work' && <span className="text-hclub-magenta rd-timer-accent">Arbeit</span>}
          </div>
          <div className="rd-chip font-oswald text-sm md:text-base tracking-wider text-gray-200 px-2.5 py-0.5 rounded-full">
            Runde {currentRound + 1}/{config.numRounds}
          </div>
        </div>

        {/* GIANT TIMER - centered */}
        <div className="flex flex-col items-center justify-center">
          <div className="rd-timer-label font-oswald text-[9px] md:text-[11px] uppercase mb-0.5">Timer</div>
          <div className={`rd-timer font-oswald font-bold tracking-wider ${phase === 'work' && timeRemaining <= 5 ? 'rd-timer-accent' : ''}`}
               style={{ fontSize: 'min(9vw, 4.5rem)', lineHeight: 1 }}>
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

      {/* Single, prominent full-width progress bar (one Timer for all groups) */}
      {(() => {
        const phaseTotal =
          phase === 'work' ? workTimeTotal :
          phase === 'rest' ? getRestTimeForRound(config, currentRound) :
          phase === 'roundRest' ? config.roundRestTime : 0;
        const fillPct = phaseTotal > 0 ? Math.max(0, Math.min(100, (timeRemaining / phaseTotal) * 100)) : 0;
        const barColor =
          phase === 'work' ? '#FF00FF' :
          phase === 'rest' ? '#FACC15' :
          phase === 'roundRest' ? '#FB923C' : '#FF00FF';
        return (
          <div className="rd-progress-track">
            <div className="rd-progress-fill" style={{
              width: `${fillPct}%`,
              backgroundColor: barColor,
              boxShadow: `0 0 12px ${barColor}, 0 0 24px ${barColor}80`,
            }} />
          </div>
        );
      })()}

      {/* Shared fit-to-viewport styles for the REST / ROUNDREST card grids */}
      {(phase === 'rest' || phase === 'roundRest') && (
        <style>{`
          .rest-wrap {
            flex: 1 1 0%;
            min-height: 0;
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: clamp(6px, 1.5vmin, 20px) clamp(8px, 2vmin, 24px);
            gap: clamp(4px, 1.2vmin, 14px);
          }
          .rest-head {
            flex: 0 0 auto;
            font-size: clamp(16px, 4vh, 40px);
            line-height: 1;
          }
          .rest-sub {
            flex: 0 0 auto;
            font-size: clamp(12px, 2.4vh, 22px);
            line-height: 1;
          }
          .rest-grid-wrap {
            flex: 1 1 0%;
            min-height: 0;
            width: 100%;
            max-width: 1400px;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .rest-grid {
            display: grid;
            width: 100%;
            height: 100%;
            min-height: 0;
            gap: clamp(4px, 1.2vmin, 14px);
            grid-template-columns: repeat(${config.numGroups > 4 ? Math.ceil(config.numGroups / 2) : config.numGroups}, minmax(0, 1fr));
            grid-template-rows: ${config.numGroups > 4 ? 'minmax(0,1fr) minmax(0,1fr)' : 'minmax(0,1fr)'};
          }
          .rest-card {
            container-type: size;
            min-height: 0;
            min-width: 0;
            display: grid;
            grid-template-rows: auto 1fr auto;
            justify-items: center;
            align-items: center;
            gap: 1.5cqmin;
            padding: 2.5cqmin;
            border-radius: 10px;
            box-sizing: border-box;
          }
          .rest-card-label { font-size: clamp(8px, 5cqmin, 18px); line-height: 1; }
          .rest-card-img {
            height: 100%;
            max-height: 62cqmin;
            aspect-ratio: 4 / 3;
            max-width: 94%;
          }
          .rest-card-img img { width: 100%; height: 100%; object-fit: cover; }
          .rest-card-name {
            font-size: clamp(10px, 8cqmin, 26px);
            line-height: 1.02;
            text-align: center;
            display: -webkit-box;
            -webkit-box-orient: vertical;
            -webkit-line-clamp: 2;
            line-clamp: 2;
            overflow: hidden;
          }
        `}</style>
      )}

      {/* Round rest display — kein doppelter Timer (oben bleibt Referenz), fit-to-viewport */}
      {phase === 'roundRest' && (
        <div className="rest-wrap">
          <h2 className="rest-head font-oswald uppercase tracking-widest text-orange-400">Rundenpause</h2>
          <p className="rest-sub font-oswald uppercase tracking-wider text-gray-400">Nächste: Runde {currentRound + 1}</p>
          <div className="rest-grid-wrap">
            <div className="rest-grid">
              {Array.from({ length: config.numGroups }, (_, gIdx) => {
                const nextExercises = config.rounds[currentRound]?.[gIdx] || [];
                const nextEx = nextExercises[0] || 'Übung';
                return (
                  <div key={gIdx} className="rest-card rd-col rd-col-active">
                    <div className="rest-card-label text-gray-400 font-oswald uppercase tracking-wider">G{String.fromCharCode(65 + gIdx)}</div>
                    <div className="rest-card-img rd-img-frame rd-img-color" style={{ ['--ex-color' as string]: getExerciseColor(nextEx) }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={getExerciseImage(nextEx)} alt={nextEx} onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/exercises/generic.jpg'; }} />
                    </div>
                    <div className="rest-card-name font-oswald uppercase tracking-wider" style={{ color: getExerciseColor(nextEx) }}>{nextEx}</div>
                  </div>
                );
              })}
            </div>
          </div>
          <button onClick={() => setTimeRemaining(0)}
            className="shrink-0 px-8 py-2.5 bg-green-600 hover:bg-green-500 text-white font-oswald text-lg uppercase tracking-wider rounded-xl transition-colors">
            Weiter &rarr;
          </button>
        </div>
      )}

      {/* Rest between exercises — kein doppelter Timer, fit-to-viewport */}
      {phase === 'rest' && (
        <div className="rest-wrap">
          <h2 className="rest-head font-oswald uppercase tracking-widest text-yellow-400">Pause</h2>
          <div className="rest-grid-wrap">
            <div className="rest-grid">
              {Array.from({ length: config.numGroups }, (_, gIdx) => {
                const exercises = config.rounds[currentRound]?.[gIdx] || [];
                const nextEx = exercises[currentExerciseIndex] || exercises[exercises.length - 1] || 'Übung';
                return (
                  <div key={gIdx} className="rest-card rd-col rd-col-active">
                    <div className="rest-card-label text-gray-400 font-oswald uppercase tracking-wider">G{String.fromCharCode(65 + gIdx)}</div>
                    <div className="rest-card-img rd-img-frame rd-img-color" style={{ ['--ex-color' as string]: getExerciseColor(nextEx) }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={getExerciseImage(nextEx)} alt={nextEx} onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/exercises/generic.jpg'; }} />
                    </div>
                    <div className="rest-card-name font-oswald uppercase tracking-wider" style={{ color: getExerciseColor(nextEx) }}>{nextEx}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* WORK phase */}
      {phase === 'work' && (
        <>
          <style>{`
            /* Fit-to-viewport: der Grid-Bereich nimmt den Rest der Höhe (flex:1),
               kein Scroll. Spalten/Reihen adaptiv nach Gruppenzahl. */
            .work-groups-scroll {
              flex: 1 1 0%;
              min-height: 0;
              overflow: hidden;
            }
            .work-groups-grid {
              display: grid;
              height: 100%;
              width: 100%;
              min-height: 0;
              gap: clamp(2px, 0.5vmin, 8px);
              padding: clamp(2px, 0.6vmin, 10px);
              grid-template-columns: repeat(${config.numGroups > 4 ? Math.ceil(config.numGroups / 2) : config.numGroups}, minmax(0, 1fr));
              grid-template-rows: ${config.numGroups > 4 ? 'minmax(0,1fr) minmax(0,1fr)' : 'minmax(0,1fr)'};
            }
            /* Jede Karte ist ein Container-Query-Kontext -> Inhalt skaliert
               relativ zur KARTENGRÖSSE (cqmin), nicht zur Viewport-Breite.
               Dadurch bei 3 Gruppen groß, bei 8 kompakt, immer ausgewogen. */
            .work-col {
              container-type: size;
              min-height: 0;
              min-width: 0;
              height: 100%;
              align-self: stretch;
              border-radius: 10px;
            }
            /* Spalten-Inhalt: feste Slot-Reihenfolge, vertikal ausgewogen zentriert.
               1fr oben+unten drückt Bild/Name/Dots mittig -> kein Loch. */
            /* Inhalt vertikal zentriert (align-content:center) mit auto-Bändern.
               Da ALLE Karten gleiche Zellgröße + gleiche Bandstruktur haben,
               liegen Label/Bild/Name/Dots/Nächste in jeder Spalte auf gleicher
               Höhe. Bild ist durch cqh UND cqw begrenzt -> nie zu groß. */
            .work-col-inner {
              display: grid;
              grid-template-rows: auto auto auto auto auto;
              grid-auto-rows: 0;
              justify-items: center;
              align-content: center;
              justify-content: center;
              height: 100%;
              width: 100%;
              padding: 3cqmin 3cqmin;
              gap: 2cqmin;
              box-sizing: border-box;
              overflow: hidden;
            }
            .work-col-label {
              font-size: clamp(8px, 4.2cqmin, 20px);
              line-height: 1;
            }
            /* Bild: Höhe an Kartenhöhe gekoppelt (cqh), Breite folgt via
               aspect-ratio, aber durch max-width (cqw) gedeckelt -> nie zu breit. */
            .work-col-img {
              height: 46cqh;
              width: auto;
              max-width: 90cqw;
              aspect-ratio: 4 / 3;
              flex-shrink: 0;
            }
            .work-col-img img { width: 100%; height: 100%; object-fit: cover; }
            /* Übungsname skaliert mit der Karte, max. 2 Zeilen */
            .work-col-name {
              display: -webkit-box;
              -webkit-box-orient: vertical;
              -webkit-line-clamp: 2;
              line-clamp: 2;
              overflow: hidden;
              width: 100%;
              text-align: center;
              font-size: clamp(13px, 7cqmin, 40px);
              line-height: 1.02;
            }
            .work-col-dots { display: flex; }
            .work-col-dot {
              width: clamp(5px, 2.2cqmin, 12px);
              height: clamp(5px, 2.2cqmin, 12px);
              border-radius: 9999px;
            }
            /* "NÄCHSTE"-Box: skaliert mit, max. 2 Zeilen */
            .work-col-next {
              display: flex;
              align-items: center;
              justify-content: center;
              text-align: center;
              max-width: 100%;
              font-size: clamp(11px, 4.5cqmin, 26px);
              line-height: 1.1;
              padding: 0.4em 0.7em;
              border-radius: 8px;
              background: rgba(255,255,255,0.04);
              border: 1px solid rgba(255,255,255,0.08);
            }
            .work-col-next > span {
              display: -webkit-box;
              -webkit-box-orient: vertical;
              -webkit-line-clamp: 2;
              line-clamp: 2;
              overflow: hidden;
            }
          `}</style>
          <div className="work-groups-scroll">
          <div className="work-groups-grid">
          {Array.from({ length: config.numGroups }, (_, groupIndex) => {
            const exercises = config.rounds[currentRound]?.[groupIndex] || [];
            const currentExercise = exercises[currentExerciseIndex] || exercises[exercises.length - 1] || 'Übung';
            const exerciseColor = getExerciseColor(currentExercise);
            const nextExercise = getNextExercise(config, groupIndex);
            const exerciseImage = getExerciseImage(currentExercise);

            const groupWorkTime = getWorkTimeForGroup(config, currentRound, groupIndex);
            const hasGroupCustomTime = groupWorkTime !== workTimeTotal;

            return (
              <div key={groupIndex}
                className="work-col rd-col rd-col-active relative slide-up"
                style={{
                  borderRight: groupIndex < config.numGroups - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                  animationDelay: `${groupIndex * 0.1}s`,
                }}>
                <div className="work-col-inner">
                  {/* Group label */}
                  <div className="work-col-label font-oswald uppercase tracking-widest text-gray-400">
                    Gruppe {groupIndex + 1}
                    {hasGroupCustomTime && <span className="text-hclub-magenta ml-2">({groupWorkTime}s)</span>}
                  </div>

                  {/* Exercise image — skaliert mit der Karte */}
                  <div key={`img-${exerciseAnimKey}`}
                    className="work-col-img rd-img-frame rd-img-color exercise-enter"
                    style={{ ['--ex-color' as string]: exerciseColor }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={exerciseImage} alt={currentExercise}
                      onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/exercises/generic.jpg'; }} />
                  </div>

                  {/* Current exercise name */}
                  <div key={exerciseAnimKey}
                    className="work-col-name font-oswald uppercase tracking-wider exercise-enter px-1"
                    style={{ color: exerciseColor, textShadow: `0 0 14px ${exerciseColor}40` }}>
                    {currentExercise}
                  </div>

                  {/* Exercise progress dots */}
                  <div className="work-col-dots flex gap-1 md:gap-2">
                    {exercises.map((_, idx) => (
                      <div key={idx} className={`work-col-dot transition-all duration-300 ${idx === currentExerciseIndex ? 'rd-dot-active' : ''}`}
                        style={{
                          color: exerciseColor,
                          backgroundColor: idx === currentExerciseIndex ? exerciseColor : idx < currentExerciseIndex ? '#666' : '#333',
                          transform: idx === currentExerciseIndex ? 'scale(1.3)' : 'scale(1)',
                        }} />
                    ))}
                  </div>

                  {/* Next exercise preview */}
                  {nextExercise ? (
                    <div className="work-col-next font-oswald uppercase tracking-wider">
                      <span><span className="text-gray-400">Nächste: </span>
                      <span style={{ color: getExerciseColor(nextExercise) }}>{nextExercise}</span></span>
                    </div>
                  ) : <div />}
                </div>
              </div>
            );
          })}
          </div>
          </div>
        </>
      )}

      {/* Bottom controls */}
      <div className="rd-bottombar flex items-center justify-between px-4 py-2 shrink-0">
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
