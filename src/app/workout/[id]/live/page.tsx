'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
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

type Phase = 'idle' | 'summary' | 'warmup' | 'countdown' | 'work' | 'rest' | 'roundRest' | 'finished';

const GROUP_BG_SHADES = ['#1a1a1a', '#222222', '#2a2a2a', '#1e1e1e', '#252525', '#202020'];

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

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTickRef = useRef<number>(0);
  const prevTimeRef = useRef<number>(0);
  const prevExerciseRef = useRef<number>(-1);
  const prevRoundRef = useRef<number>(-1);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  // Compute total workout time estimate
  const totalTimeEstimate = useMemo(() => {
    if (!workout) return 0;
    const c = workout.config;
    let total = c.warmupTime;
    // Each round: all groups rotate through all stations,
    // so total exercises = sum of all exercises across all groups (not max)
    for (let r = 0; r < c.numRounds; r++) {
      let totalExInRound = 0;
      for (let g = 0; g < c.numGroups; g++) {
        const exercises = c.rounds[r]?.[g] || [];
        totalExInRound += exercises.length;
      }
      totalExInRound = Math.max(totalExInRound, 1);
      total += totalExInRound * c.workTime;
      total += (totalExInRound - 1) * c.restTime;
      if (r < c.numRounds - 1) total += c.roundRestTime;
    }
    // Add countdown time (3s per work/round start)
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
    if (isPaused || phase === 'idle' || phase === 'summary' || phase === 'finished' || phase === 'countdown') return;

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
  }, [timeRemaining, phase, isPaused]);

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
        setCountdownValue(0); // "GO!"
        playGoSound();
      } else {
        if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
        onComplete();
      }
    }, 1000);
  }

  // Phase transitions
  useEffect(() => {
    if (timeRemaining > 0 || phase === 'idle' || phase === 'summary' || phase === 'finished' || phase === 'countdown' || isPaused) return;
    if (!workout) return;

    const config = workout.config;

    if (phase === 'warmup') {
      startCountdown(() => {
        setPhase('work');
        setTimeRemaining(config.workTime);
        setCurrentRound(0);
        setCurrentExerciseIndex(0);
      });
      return;
    }

    if (phase === 'work') {
      const maxExercises = getMaxExercisesInRound(config, currentRound);
      const nextExIndex = currentExerciseIndex + 1;

      if (nextExIndex < maxExercises) {
        if (config.restTime > 0) {
          setPhase('rest');
          setTimeRemaining(config.restTime);
          setCurrentExerciseIndex(nextExIndex);
        } else {
          setCurrentExerciseIndex(nextExIndex);
          setTimeRemaining(config.workTime);
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
              setTimeRemaining(config.workTime);
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
      setTimeRemaining(config.workTime);
      return;
    }

    if (phase === 'roundRest') {
      startCountdown(() => {
        setPhase('work');
        setTimeRemaining(config.workTime);
      });
      return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeRemaining, phase, isPaused, workout, currentRound, currentExerciseIndex]);

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
      startCountdown(() => {
        setPhase('work');
        setTimeRemaining(config.workTime);
      });
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

  // Get next exercise name for current group
  function getNextExercise(config: WorkoutConfig, groupIndex: number): string | null {
    const exercises = config.rounds[currentRound]?.[groupIndex] || [];
    const nextIdx = currentExerciseIndex + 1;
    if (nextIdx < exercises.length) {
      return exercises[nextIdx];
    }
    // Check next round
    const nextRound = currentRound + 1;
    if (nextRound < config.numRounds) {
      const nextRoundExercises = config.rounds[nextRound]?.[groupIndex] || [];
      return nextRoundExercises[0] || null;
    }
    return null;
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
        <h1 className="font-oswald text-6xl md:text-8xl font-bold tracking-wider mb-4 logo-glow">
          H-<span className="text-hclub-magenta">CLUB</span>
        </h1>
        <h2 className="font-oswald text-3xl md:text-4xl uppercase tracking-wider text-gray-300 mb-2 fade-in-up">
          {workout.name}
        </h2>
        <p className="text-gray-400 text-lg mb-12 fade-in-up" style={{ animationDelay: '0.1s' }}>{workout.trainer_name}</p>

        <div className="grid grid-cols-3 gap-8 mb-12 text-center">
          <div className="fade-in-up" style={{ animationDelay: '0.2s' }}>
            <div className="font-oswald text-4xl text-hclub-magenta">{config.numGroups}</div>
            <div className="text-gray-400 text-sm font-oswald uppercase">Gruppen</div>
          </div>
          <div className="fade-in-up" style={{ animationDelay: '0.3s' }}>
            <div className="font-oswald text-4xl text-hclub-magenta">{config.numRounds}</div>
            <div className="text-gray-400 text-sm font-oswald uppercase">Runden</div>
          </div>
          <div className="fade-in-up" style={{ animationDelay: '0.4s' }}>
            <div className="font-oswald text-4xl text-hclub-magenta">{config.workTime}s</div>
            <div className="text-gray-400 text-sm font-oswald uppercase">Arbeit</div>
          </div>
        </div>

        <button
          onClick={goToSummary}
          className="px-12 py-4 bg-hclub-magenta hover:bg-hclub-magenta-dark text-white font-oswald
                     text-2xl uppercase tracking-widest rounded-xl transition-colors fade-in-up glow-pulse"
          style={{ animationDelay: '0.5s' }}
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

  // SUMMARY state - Workout overview before starting
  if (phase === 'summary') {
    return (
      <div className="workout-fullscreen flex flex-col items-center overflow-y-auto py-8 px-4">
        <h1 className="font-oswald text-4xl md:text-5xl font-bold tracking-wider mb-2 fade-in-up">
          {workout.name}
        </h1>
        <p className="text-gray-400 text-lg mb-2 fade-in-up" style={{ animationDelay: '0.1s' }}>
          {workout.trainer_name}
        </p>
        <div className="font-oswald text-xl text-hclub-magenta mb-8 fade-in-up" style={{ animationDelay: '0.15s' }}>
          Geschätzte Dauer: {formatTimeMinutes(totalTimeEstimate)}
        </div>

        <div className="w-full max-w-5xl grid gap-6 md:grid-cols-2 mb-8">
          {Array.from({ length: config.numRounds }, (_, roundIdx) => (
            <div
              key={roundIdx}
              className="bg-hclub-dark border border-hclub-gray rounded-xl p-5 fade-in-up"
              style={{ animationDelay: `${0.2 + roundIdx * 0.1}s`, opacity: 0 }}
            >
              <h3 className="font-oswald text-lg uppercase tracking-wider text-hclub-magenta mb-3">
                Runde {roundIdx + 1}
              </h3>
              <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${config.numGroups}, 1fr)` }}>
                {Array.from({ length: config.numGroups }, (_, gIdx) => {
                  const exercises = config.rounds[roundIdx]?.[gIdx] || [];
                  return (
                    <div key={gIdx}>
                      <div className="text-gray-500 text-xs font-oswald uppercase tracking-wider mb-1">
                        Gruppe {gIdx + 1}
                      </div>
                      {exercises.map((ex, eIdx) => (
                        <div
                          key={eIdx}
                          className="text-sm mb-1"
                          style={{ color: getExerciseColor(ex) }}
                        >
                          {ex}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-4 fade-in-up" style={{ animationDelay: '0.6s', opacity: 0 }}>
          <button
            onClick={() => setPhase('idle')}
            className="px-8 py-3 bg-hclub-gray hover:bg-hclub-magenta/30 text-white font-oswald
                       text-xl uppercase tracking-wider rounded-xl transition-colors"
          >
            Zurück
          </button>
          <button
            onClick={startWorkout}
            className="px-12 py-3 bg-hclub-magenta hover:bg-hclub-magenta-dark text-white font-oswald
                       text-xl uppercase tracking-widest rounded-xl transition-colors glow-pulse"
          >
            Los geht&apos;s!
          </button>
        </div>
      </div>
    );
  }

  // COUNTDOWN state (3-2-1-GO!)
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
        {/* Bottom branding */}
        <div className="absolute bottom-6 right-6">
          <span className="font-oswald text-xl tracking-wider text-gray-500">
            H-<span className="text-hclub-magenta">CLUB</span>
          </span>
        </div>
      </div>
    );
  }

  // FINISHED state
  if (phase === 'finished') {
    const particles = Array.from({ length: 30 }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      bottom: `${Math.random() * 20}%`,
      color: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
      delay: `${Math.random() * 2}s`,
      size: 4 + Math.random() * 12,
      duration: `${2 + Math.random() * 3}s`,
    }));

    return (
      <div className="workout-fullscreen flex flex-col items-center justify-center overflow-hidden">
        {/* Particle effects */}
        {particles.map((p) => (
          <div
            key={p.id}
            className="particle"
            style={{
              left: p.left,
              bottom: p.bottom,
              backgroundColor: p.color,
              width: p.size,
              height: p.size,
              animationDelay: p.delay,
              animationDuration: p.duration,
            }}
          />
        ))}

        {/* Burst circles */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="burst rounded-full border-2 border-hclub-magenta" style={{ width: 100, height: 100, animationDelay: '0s' }} />
          <div className="burst rounded-full border border-purple-500" style={{ width: 80, height: 80, animationDelay: '0.3s', position: 'absolute' }} />
          <div className="burst rounded-full border border-pink-400" style={{ width: 60, height: 60, animationDelay: '0.6s', position: 'absolute' }} />
        </div>

        <h1 className="font-oswald text-7xl md:text-9xl font-bold text-hclub-magenta uppercase tracking-wider mb-8 power-pulse relative z-10">
          Fertig!
        </h1>
        <h2 className="font-oswald text-3xl uppercase tracking-wider text-gray-300 mb-4 relative z-10">
          {workout.name}
        </h2>
        <p className="text-gray-400 text-lg mb-12 relative z-10">Gut gemacht!</p>
        <button
          onClick={() => setPhase('idle')}
          className="px-8 py-3 bg-hclub-gray hover:bg-hclub-magenta text-white font-oswald
                     text-xl uppercase tracking-wider rounded-xl transition-colors relative z-10"
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
  const showShake = phase === 'work' && timeRemaining <= 3 && timeRemaining > 0;
  const workTimeTotal = config.workTime;
  const progressPercent = phase === 'work' ? (timeRemaining / workTimeTotal) * 100 : 100;

  return (
    <div className={`workout-fullscreen flex flex-col ${showPowerTimer ? 'bg-pulse-dark' : ''} ${showShake ? 'shake' : ''}`}>
      {/* Pause overlay */}
      {isPaused && (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-50">
          <span className="font-oswald text-6xl uppercase tracking-wider text-yellow-400">
            Pausiert
          </span>
        </div>
      )}

      {/* Round announcement overlay */}
      {showRoundAnnounce && (
        <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="round-announce font-oswald font-bold text-hclub-magenta uppercase"
               style={{
                 fontSize: 'min(30vw, 25vh)',
                 textShadow: '0 0 60px #FF00FF, 0 0 100px rgba(255,0,255,0.4)',
                 lineHeight: 1,
               }}>
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
        <div className={`font-oswald text-4xl md:text-5xl tracking-wider text-white ${phase === 'work' && timeRemaining <= 10 ? 'heartbeat' : ''}`}
             style={phase === 'work' && timeRemaining <= 10 ? { color: '#FF00FF' } : {}}>
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

      {/* Work phase - group columns (grid on mobile, flex on desktop) */}
      {phase === 'work' && (
        <>
          <style>{`
            .work-groups-grid {
              display: grid;
              grid-template-columns: ${config.numGroups <= 2 ? '1fr' : 'repeat(2, 1fr)'};
              flex: 1;
            }
            @media (min-width: 768px) {
              .work-groups-grid {
                display: flex;
              }
              .work-groups-grid > div {
                flex: 1;
              }
            }
          `}</style>
          <div className="work-groups-grid">
          {Array.from({ length: config.numGroups }, (_, groupIndex) => {
            const exercises = config.rounds[currentRound]?.[groupIndex] || [];
            const currentExercise = exercises[currentExerciseIndex] || exercises[exercises.length - 1] || 'Übung';
            const exerciseColor = getExerciseColor(currentExercise);
            const nextExercise = getNextExercise(config, groupIndex);

            return (
              <div
                key={groupIndex}
                className="flex flex-col items-center justify-center relative slide-up min-h-[120px] md:min-h-0"
                style={{
                  backgroundColor: GROUP_BG_SHADES[groupIndex % GROUP_BG_SHADES.length],
                  borderRight: groupIndex < config.numGroups - 1 ? '1px solid #333' : 'none',
                  borderBottom: '1px solid #333',
                  animationDelay: `${groupIndex * 0.1}s`,
                }}
              >
                {/* Time progress bar */}
                <div
                  className="time-progress-bar"
                  style={{
                    width: `${progressPercent}%`,
                    backgroundColor: exerciseColor,
                    opacity: 0.6,
                  }}
                />

                {/* Group label */}
                <div className="font-oswald text-xs md:text-base uppercase tracking-widest text-gray-500 mt-1 md:absolute md:top-3">
                  Gruppe {groupIndex + 1}
                </div>

                {/* Exercise name */}
                <div
                  key={exerciseAnimKey}
                  className="font-oswald text-xl sm:text-2xl md:text-5xl lg:text-6xl uppercase tracking-wider text-center px-2 md:px-4 mb-2 md:mb-6 exercise-enter"
                  style={{ color: exerciseColor }}
                >
                  {currentExercise}
                </div>

                {/* Exercise progress dots */}
                <div className="flex gap-1 md:gap-2 mb-1 md:mb-4">
                  {exercises.map((_, idx) => (
                    <div
                      key={idx}
                      className="w-2 h-2 md:w-3 md:h-3 rounded-full transition-all duration-300"
                      style={{
                        backgroundColor:
                          idx === currentExerciseIndex
                            ? exerciseColor
                            : idx < currentExerciseIndex
                            ? '#555'
                            : '#333',
                        transform: idx === currentExerciseIndex ? 'scale(1.3)' : 'scale(1)',
                      }}
                    />
                  ))}
                </div>

                {/* Next exercise preview */}
                {nextExercise && (
                  <div className="text-gray-500 text-xs md:text-sm font-oswald uppercase tracking-wider mb-1">
                    Nächste: <span style={{ color: getExerciseColor(nextExercise), opacity: 0.7 }}>{nextExercise}</span>
                  </div>
                )}

                {/* Accent bar at bottom */}
                <div
                  className="absolute bottom-0 left-0 right-0 h-1"
                  style={{ backgroundColor: exerciseColor }}
                />
              </div>
            );
          })}
          </div>
        </>
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
