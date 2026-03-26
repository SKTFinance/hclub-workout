'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useParams } from 'next/navigation';
import type { Workout, WorkoutConfig, ExerciseSetting } from '@/lib/types';
import { getDefaultColor } from '@/lib/exercises';
import {
  playCountdownBeep,
  playPowerTimerBeep,
  playGoSound,
  playPhaseEndSound,
  playRoundEndSound,
} from '@/lib/sounds';

type Phase = 'idle' | 'warmup' | 'work' | 'rest' | 'roundRest' | 'finished';

const GROUP_BG_SHADES = ['#1a1a1a', '#222222', '#2a2a2a', '#1e1e1e', '#252525', '#202020'];

export default function LiveWorkoutPage() {
  const params = useParams();
  const id = params.id as string;
  const supabase = createClient();

  const [workout, setWorkout] = useState<Workout | null>(null);
  const [exerciseColors, setExerciseColors] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<Phase>('idle');
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [currentRound, setCurrentRound] = useState(0);
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTickRef = useRef<number>(0);
  const prevTimeRef = useRef<number>(0);

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

  function getMaxExercisesInRound(config: WorkoutConfig, roundIndex: number): number {
    let max = 0;
    for (let g = 0; g < config.numGroups; g++) {
      const exercises = config.rounds[roundIndex]?.[g] || [];
      if (exercises.length > max) max = exercises.length;
    }
    return Math.max(max, 1);
  }

  // Timer tick
  useEffect(() => {
    if (phase === 'idle' || phase === 'finished' || isPaused) {
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

      setTimeRemaining((prev) => {
        const next = prev - elapsed;
        if (next <= 0) return 0;
        return next;
      });
    }, 100);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [phase, isPaused]);

  // Sound effects based on time
  useEffect(() => {
    if (isPaused || phase === 'idle' || phase === 'finished') return;

    if (timeRemaining <= 10 && timeRemaining > 0 && timeRemaining !== prevTimeRef.current) {
      if (phase === 'work') {
        playPowerTimerBeep();
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
  }, [timeRemaining, phase, isPaused]);

  // Phase transitions
  useEffect(() => {
    if (timeRemaining > 0 || phase === 'idle' || phase === 'finished' || isPaused) return;
    if (!workout) return;

    const config = workout.config;

    if (phase === 'warmup') {
      setPhase('work');
      setTimeRemaining(config.workTime);
      setCurrentRound(0);
      setCurrentExerciseIndex(0);
      return;
    }

    if (phase === 'work') {
      const maxExercises = getMaxExercisesInRound(config, currentRound);
      const nextExIndex = currentExerciseIndex + 1;

      if (nextExIndex < maxExercises) {
        // More exercises in this round
        if (config.restTime > 0) {
          setPhase('rest');
          setTimeRemaining(config.restTime);
          setCurrentExerciseIndex(nextExIndex);
        } else {
          setCurrentExerciseIndex(nextExIndex);
          setTimeRemaining(config.workTime);
        }
      } else {
        // Round complete
        const nextRound = currentRound + 1;
        if (nextRound < config.numRounds) {
          if (config.roundRestTime > 0) {
            setPhase('roundRest');
            setTimeRemaining(config.roundRestTime);
            setCurrentRound(nextRound);
            setCurrentExerciseIndex(0);
          } else {
            setCurrentRound(nextRound);
            setCurrentExerciseIndex(0);
            setTimeRemaining(config.workTime);
          }
        } else {
          setPhase('finished');
        }
      }
      return;
    }

    if (phase === 'rest') {
      setPhase('work');
      setTimeRemaining(config.workTime);
      return;
    }

    if (phase === 'roundRest') {
      setPhase('work');
      setTimeRemaining(config.workTime);
      return;
    }
  }, [timeRemaining, phase, isPaused, workout, currentRound, currentExerciseIndex]);

  // Keyboard controls
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.code === 'Space') {
        e.preventDefault();
        if (phase === 'idle') {
          startWorkout();
        } else if (phase !== 'finished') {
          setIsPaused((p) => !p);
        }
      }
      if (e.code === 'Escape') {
        if (phase !== 'idle') {
          setPhase('idle');
          setIsPaused(false);
        }
      }
      if (e.code === 'KeyF') {
        toggleFullscreen();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  });

  function startWorkout() {
    if (!workout) return;
    // Init audio context on user gesture
    playCountdownBeep();
    const config = workout.config;
    setCurrentRound(0);
    setCurrentExerciseIndex(0);

    if (config.warmupTime > 0) {
      setPhase('warmup');
      setTimeRemaining(config.warmupTime);
    } else {
      setPhase('work');
      setTimeRemaining(config.workTime);
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

  if (!workout) {
    return (
      <div className="workout-fullscreen flex items-center justify-center">
        <div className="text-gray-400 font-oswald text-2xl uppercase">Laden...</div>
      </div>
    );
  }

  const config = workout.config;

  // IDLE state
  if (phase === 'idle') {
    return (
      <div className="workout-fullscreen flex flex-col items-center justify-center">
        <h1 className="font-oswald text-6xl md:text-8xl font-bold tracking-wider mb-4">
          H-<span className="text-hclub-magenta">CLUB</span>
        </h1>
        <h2 className="font-oswald text-3xl md:text-4xl uppercase tracking-wider text-gray-300 mb-2">
          {workout.name}
        </h2>
        <p className="text-gray-400 text-lg mb-12">{workout.trainer_name}</p>

        <div className="grid grid-cols-3 gap-8 mb-12 text-center">
          <div>
            <div className="font-oswald text-4xl text-hclub-magenta">{config.numGroups}</div>
            <div className="text-gray-400 text-sm font-oswald uppercase">Gruppen</div>
          </div>
          <div>
            <div className="font-oswald text-4xl text-hclub-magenta">{config.numRounds}</div>
            <div className="text-gray-400 text-sm font-oswald uppercase">Runden</div>
          </div>
          <div>
            <div className="font-oswald text-4xl text-hclub-magenta">{config.workTime}s</div>
            <div className="text-gray-400 text-sm font-oswald uppercase">Arbeit</div>
          </div>
        </div>

        <button
          onClick={startWorkout}
          className="px-12 py-4 bg-hclub-magenta hover:bg-hclub-magenta-dark text-white font-oswald
                     text-2xl uppercase tracking-widest rounded-xl transition-colors"
        >
          Workout Starten
        </button>

        <div className="absolute bottom-6 flex gap-8 text-gray-500 text-sm">
          <span>LEERTASTE = Start/Pause</span>
          <span>F = Vollbild</span>
          <span>ESC = Beenden</span>
        </div>
      </div>
    );
  }

  // FINISHED state
  if (phase === 'finished') {
    return (
      <div className="workout-fullscreen flex flex-col items-center justify-center">
        <h1 className="font-oswald text-7xl md:text-9xl font-bold text-hclub-magenta uppercase tracking-wider mb-8 power-pulse">
          Fertig!
        </h1>
        <h2 className="font-oswald text-3xl uppercase tracking-wider text-gray-300 mb-4">
          {workout.name}
        </h2>
        <p className="text-gray-400 text-lg mb-12">Gut gemacht!</p>
        <button
          onClick={() => setPhase('idle')}
          className="px-8 py-3 bg-hclub-gray hover:bg-hclub-magenta text-white font-oswald
                     text-xl uppercase tracking-wider rounded-xl transition-colors"
        >
          Zurück
        </button>
        {/* Bottom branding */}
        <div className="absolute bottom-6 right-6">
          <span className="font-oswald text-xl tracking-wider text-gray-500">
            H-<span className="text-hclub-magenta">CLUB</span>
          </span>
        </div>
      </div>
    );
  }

  // WARMUP state
  if (phase === 'warmup') {
    return (
      <div className="workout-fullscreen flex flex-col items-center justify-center">
        {isPaused && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-50">
            <span className="font-oswald text-6xl uppercase tracking-wider text-yellow-400">
              Pausiert
            </span>
          </div>
        )}
        <div className="breathe">
          <h1 className="font-oswald text-5xl md:text-7xl uppercase tracking-widest text-hclub-magenta mb-8">
            Warmup
          </h1>
          <div className="font-oswald text-[10rem] md:text-[14rem] leading-none text-white text-center">
            {formatTime(timeRemaining)}
          </div>
        </div>
        <p className="text-gray-400 text-xl mt-8 font-oswald uppercase tracking-wider">
          Mach dich bereit!
        </p>
        {/* Bottom branding */}
        <div className="absolute bottom-6 right-6">
          <span className="font-oswald text-xl tracking-wider text-gray-500">
            H-<span className="text-hclub-magenta">CLUB</span>
          </span>
        </div>
        <div className="absolute bottom-6 left-6 text-gray-500">
          {workout.trainer_name}
        </div>
      </div>
    );
  }

  // WORK / REST / ROUND REST - Main display with groups
  const showPowerTimer = phase === 'work' && timeRemaining <= 10 && timeRemaining > 0;

  return (
    <div className="workout-fullscreen flex flex-col">
      {/* Pause overlay */}
      {isPaused && (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-50">
          <span className="font-oswald text-6xl uppercase tracking-wider text-yellow-400">
            Pausiert
          </span>
        </div>
      )}

      {/* Power timer overlay */}
      {showPowerTimer && (
        <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none">
          <div className="flash-overlay absolute inset-0 bg-hclub-magenta" />
          <div className="power-pulse font-oswald text-[16rem] md:text-[22rem] leading-none text-hclub-magenta font-bold"
               style={{ textShadow: '0 0 60px #FF00FF, 0 0 120px #FF00FF' }}>
            {timeRemaining}
          </div>
        </div>
      )}

      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-hclub-dark/80 border-b border-hclub-gray/50 shrink-0">
        <div className="font-oswald text-lg uppercase tracking-wider">
          {phase === 'rest' && (
            <span className="text-yellow-400">Pause</span>
          )}
          {phase === 'roundRest' && (
            <span className="text-orange-400">Rundenpause</span>
          )}
          {phase === 'work' && (
            <span className="text-green-400">Arbeit</span>
          )}
        </div>
        <div className="font-oswald text-2xl tracking-wider">
          Runde {currentRound + 1}/{config.numRounds}
        </div>
        <div className="font-oswald text-4xl md:text-5xl tracking-wider text-white" style={phase === 'work' && timeRemaining <= 10 ? { color: '#FF00FF' } : {}}>
          {formatTime(timeRemaining)}
        </div>
      </div>

      {/* Round rest display */}
      {phase === 'roundRest' && (
        <div className="flex-1 flex flex-col items-center justify-center">
          <h2 className="font-oswald text-4xl md:text-6xl uppercase tracking-widest text-orange-400 mb-4">
            Rundenpause
          </h2>
          <div className="font-oswald text-[8rem] md:text-[12rem] leading-none text-white">
            {formatTime(timeRemaining)}
          </div>
          <p className="font-oswald text-2xl md:text-3xl uppercase tracking-wider text-gray-400 mt-4">
            Nächste: Runde {currentRound + 1}
          </p>
        </div>
      )}

      {/* Rest between exercises display */}
      {phase === 'rest' && (
        <div className="flex-1 flex flex-col items-center justify-center">
          <h2 className="font-oswald text-4xl md:text-6xl uppercase tracking-widest text-yellow-400 mb-4">
            Pause
          </h2>
          <div className="font-oswald text-[8rem] md:text-[12rem] leading-none text-white">
            {formatTime(timeRemaining)}
          </div>
        </div>
      )}

      {/* Work phase - group columns */}
      {phase === 'work' && (
        <div className="flex-1 flex">
          {Array.from({ length: config.numGroups }, (_, groupIndex) => {
            const exercises = config.rounds[currentRound]?.[groupIndex] || [];
            const currentExercise = exercises[currentExerciseIndex] || exercises[exercises.length - 1] || 'Übung';
            const exerciseColor = getExerciseColor(currentExercise);

            return (
              <div
                key={groupIndex}
                className="flex-1 flex flex-col items-center justify-center relative"
                style={{
                  backgroundColor: GROUP_BG_SHADES[groupIndex % GROUP_BG_SHADES.length],
                  borderRight: groupIndex < config.numGroups - 1 ? '1px solid #333' : 'none',
                }}
              >
                {/* Group label */}
                <div className="absolute top-3 font-oswald text-sm md:text-base uppercase tracking-widest text-gray-500">
                  Gruppe {groupIndex + 1}
                </div>

                {/* Exercise name */}
                <div
                  className="font-oswald text-3xl md:text-5xl lg:text-6xl uppercase tracking-wider text-center px-4 mb-6"
                  style={{ color: exerciseColor }}
                >
                  {currentExercise}
                </div>

                {/* Exercise progress dots */}
                <div className="flex gap-2 mb-4">
                  {exercises.map((_, idx) => (
                    <div
                      key={idx}
                      className="w-3 h-3 rounded-full"
                      style={{
                        backgroundColor:
                          idx === currentExerciseIndex
                            ? exerciseColor
                            : idx < currentExerciseIndex
                            ? '#555'
                            : '#333',
                      }}
                    />
                  ))}
                </div>

                {/* Accent bar at bottom */}
                <div
                  className="absolute bottom-0 left-0 right-0 h-1"
                  style={{ backgroundColor: exerciseColor }}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Bottom bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-hclub-dark/80 border-t border-hclub-gray/50 shrink-0">
        <div className="text-gray-400 text-sm">
          {workout.trainer_name}
        </div>
        {phase === 'work' && (
          <div className="text-gray-500 text-sm font-oswald uppercase">
            Übung {currentExerciseIndex + 1}/{getMaxExercisesInRound(config, currentRound)}
          </div>
        )}
        <div className="font-oswald text-lg tracking-wider text-gray-500">
          H-<span className="text-hclub-magenta">CLUB</span>
        </div>
      </div>
    </div>
  );
}
