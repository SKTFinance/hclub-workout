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
import AmrapStage from '@/components/AmrapStage';
import IntervalStage from '@/components/IntervalStage';
import RemoteBadge from '@/components/RemoteBadge';
import { newCode, validCode, useRemoteHost, type RemoteCmd, type RemoteStatus } from '@/lib/remote';

type Phase = 'idle' | 'summary' | 'warmup' | 'countdown' | 'work' | 'rest' | 'roundRest' | 'finished';

const PARTICLE_COLORS = ['#199DA9', '#22BFCC', '#0E6F78', '#5FD3DD', '#FFD700', '#00BFFF', '#FF4444', '#32CD32'];

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

  // ---- Fernbedienung (Handy) und Einbettung (Freies Training, Splitscreen) ----
  const [rcCode, setRcCode] = useState<string | null>(null);
  const [embedSlot, setEmbedSlot] = useState<number | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const slot = q.get('embed');
    if (slot !== null) { setEmbedSlot(Number(slot) || 0); return; }
    const c = (q.get('rc') || '').toUpperCase();
    setRcCode(validCode(c) ? c : newCode());
  }, []);
  const runCmd = useCallback((c: RemoteCmd) => {
    const key = (code: string, key?: string) => window.dispatchEvent(new KeyboardEvent('keydown', { code, key: key ?? code }));
    if (c.t === 'toggle') key('Space', ' ');
    else if (c.t === 'skip') key('KeyN', 'n');
    else if (c.t === 'done') key(`Digit${c.g + 1}`, String(c.g + 1));
    else if (c.t === 'stop') key('Escape', 'Escape');
    else if (c.t === 'adjust') setTimeRemaining((t) => Math.max(0, t + c.s));
  }, []);
  useEffect(() => {
    if (embedSlot === null) return;
    const on = (e: MessageEvent) => { if (e.origin === window.location.origin && e.data?.hy === 'cmd') runCmd(e.data.cmd as RemoteCmd); };
    window.addEventListener('message', on);
    return () => window.removeEventListener('message', on);
  }, [embedSlot, runCmd]);
  const remoteTime = phase === 'work' && workoutMode === 'fortime'
    ? (forTimeRoundTimerEnabled ? forTimeRoundTimeRemaining : forTimeElapsed)
    : timeRemaining;
  const remoteStatus: RemoteStatus | null = workout ? {
    name: workout.name, mode: workoutMode, phase, time: remoteTime, round: currentRound + 1,
    rounds: workout.config.numRounds, groups: workout.config.numGroups, paused: isPaused, label: workout.trainer_name,
  } : null;
  useRemoteHost(embedSlot === null ? rcCode : null, remoteStatus, runCmd);
  useEffect(() => {
    if (embedSlot === null || !remoteStatus) return;
    window.parent?.postMessage({ hy: 'status', slot: embedSlot, status: remoteStatus }, window.location.origin);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embedSlot, phase, remoteTime, isPaused]);
  const autoStarted = useRef(false);
  useEffect(() => {
    if (embedSlot !== null && workout && phase === 'idle' && !autoStarted.current) { autoStarted.current = true; startWorkout(); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embedSlot, workout, phase]);

  // Block helpers
  function getForTimeBlocks(c: WorkoutConfig): ForTimeBlock[] {
    if (c.forTimeBlocks && c.forTimeBlocks.length > 0) return c.forTimeBlocks;
    return [{ exercises: c.forTimeExercises || {} }];
  }

  // Load workout and exercise colors
  const loadData = useCallback(async () => {
    // Vorschau aus dem KI-Baukasten: Workout liegt nur im Browser (localStorage),
    // nichts wird gespeichert oder aus der Datenbank gelesen.
    if (id === 'preview' || id.startsWith('free-')) {
      try {
        const raw = id === 'preview' ? localStorage.getItem('hybryd_preview_workout') : sessionStorage.getItem(`hybryd_${id}`);
        if (raw) setWorkout(JSON.parse(raw) as Workout);
      } catch { /* leer lassen → „Loading" */ }
      return;
    }
    const { data: workoutData } = await supabase
      .from('hybryd_workouts')
      .select('*')
      .eq('id', id)
      .single();

    if (workoutData) {
      setWorkout(workoutData as Workout);
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: settings } = await supabase
        .from('hybryd_exercise_settings')
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
      // ⛔ NOTIZEN UEBERSPRINGEN. Eine Notiz ist kein Schritt, den man abhakt —
      // sie stuende sonst als „aktuelle Uebung" da und muesste weggetippt
      // werden, obwohl gar nichts zu tun ist. Die Schleife laeuft weiter, bis
      // eine echte Uebung kommt oder die Liste zu Ende ist.
      let nextIdx = (prev[groupIndex] || 0) + 1;
      while (nextIdx < exercises.length && exercises[nextIdx]?.isNote) {
        nextIdx += 1;
      }
      if (nextIdx >= exercises.length) {
        // For Time mit Rundenzahl („3 RFT"): bis zur Zielrunde wieder vorn beginnen,
        // danach ist die Gruppe fertig — auch wenn ein Time-Cap läuft.
        const target = workout.config.forTimeTargetRounds || 0;
        if (target > 0) {
          const done = (forTimeGroupRounds[groupIndex] || 0) + 1;
          setForTimeGroupRounds(pr => ({ ...pr, [groupIndex]: done }));
          playRoundEndSound();
          if (done < target) return { ...prev, [groupIndex]: 0 };
          setForTimeGroupFinished(pf => ({ ...pf, [groupIndex]: true }));
          return prev;
        }
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
    if (ex.weight) parts.push(`· ${ex.weight}`);
    return parts.join(' ');
  }

  if (!workout) {
    return (
      <div className="workout-fullscreen flex items-center justify-center">
        <div className="text-gray-400 font-oswald text-2xl uppercase">Loading...</div>
      </div>
    );
  }

  const config = workout.config;

  // =================== IDLE STATE ===================
  if (phase === 'idle') {
    return (
      <div className="workout-fullscreen flex flex-col items-center justify-center overflow-y-auto px-4 pb-[15vh] [@media(max-height:500px)]:justify-start [@media(max-height:500px)]:pt-4 [@media(max-height:500px)]:pb-4">
        {embedSlot === null && <RemoteBadge code={rcCode} />}
        <h1 className="font-oswald text-6xl md:text-8xl font-bold tracking-wider mb-4 logo-glow [@media(max-height:500px)]:text-4xl [@media(max-height:500px)]:mb-1">
          HYB<span className="text-hclub-magenta">RYD</span>
        </h1>
        <h2 className="font-oswald text-3xl md:text-4xl uppercase tracking-wider text-gray-300 mb-2 text-center fade-in-up [@media(max-height:500px)]:text-2xl [@media(max-height:500px)]:mb-0">
          {workout.name}
        </h2>
        <p className="text-gray-400 text-lg mb-4 fade-in-up [@media(max-height:500px)]:mb-1 [@media(max-height:500px)]:text-base" style={{ animationDelay: '0.1s' }}>{workout.trainer_name}</p>
        <div className={`font-oswald text-sm uppercase tracking-wider mb-8 [@media(max-height:500px)]:mb-3 px-3 py-1 rounded ${
          workoutMode === 'fortime' ? 'text-cyan-400 bg-cyan-400/10' :
          'text-green-400 bg-green-400/10'
        }`}>
          {workoutMode === 'fortime' ? 'AMRAP' : 'Timed'}
        </div>

        <div className="grid grid-cols-3 gap-8 mb-12 text-center [@media(max-height:500px)]:mb-4">
          <div className="fade-in-up" style={{ animationDelay: '0.2s' }}>
            <div className="font-oswald text-4xl text-hclub-magenta">{config.numGroups}</div>
            <div className="text-gray-400 text-sm font-oswald uppercase">Groups</div>
          </div>
          {workoutMode === 'timed' && (
            <>
              <div className="fade-in-up" style={{ animationDelay: '0.3s' }}>
                <div className="font-oswald text-4xl text-hclub-magenta">{config.numRounds}</div>
                <div className="text-gray-400 text-sm font-oswald uppercase">Rounds</div>
              </div>
              <div className="fade-in-up" style={{ animationDelay: '0.4s' }}>
                <div className="font-oswald text-4xl text-hclub-magenta">{config.workTime}s</div>
                <div className="text-gray-400 text-sm font-oswald uppercase">Work</div>
              </div>
            </>
          )}
          {workoutMode === 'fortime' && (
            <>
              <div className="fade-in-up" style={{ animationDelay: '0.3s' }}>
                <div className="font-oswald text-4xl text-hclub-magenta">
                  {getForTimeBlocks(config).length}
                </div>
                <div className="text-gray-400 text-sm font-oswald uppercase">Rounds</div>
              </div>
              <div className="fade-in-up" style={{ animationDelay: '0.4s' }}>
                {config.forTimeRoundTimerEnabled ? (
                  <>
                    <div className="font-oswald text-4xl text-cyan-400">{config.forTimeRoundTimerMinutes || 12}</div>
                    <div className="text-gray-400 text-sm font-oswald uppercase">Min/Round</div>
                  </>
                ) : (
                  <>
                    <div className="font-oswald text-4xl text-cyan-400">AMRAP</div>
                    <div className="text-gray-400 text-sm font-oswald uppercase">Mode</div>
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
          Start Workout
        </button>

        <div className="absolute bottom-6 hidden md:flex gap-8 text-gray-500 text-sm pointer-events-none [@media(max-height:500px)]:hidden">
          <span>SPACE = Start/Pause</span>
          <span>F = Fullscreen</span>
          <span>ESC = Exit</span>
          {workoutMode === 'timed' && <span>N = Skip</span>}
          {workoutMode === 'fortime' && <span>1-{config.numGroups} = Next in group</span>}
        </div>
      </div>
    );
  }

  // =================== SUMMARY STATE ===================
  if (phase === 'summary') {
    return (
      <div className="workout-fullscreen flex flex-col overflow-hidden">
        {embedSlot === null && <RemoteBadge code={rcCode} />}
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
              Estimated duration: {formatTimeMinutes(totalTimeEstimate)}
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
                  <h3 className={`font-oswald uppercase tracking-wider text-hclub-magenta ${config.numRounds === 1 ? 'text-xl' : 'text-lg'}`}>Round {roundIdx + 1}</h3>
                  <div className="flex gap-3 text-xs font-oswald uppercase">
                    <span className="text-green-400">{getWorkTimeForRound(config, roundIdx)}s Work</span>
                    <span className="text-blue-400">{getRestTimeForRound(config, roundIdx)}s Rest</span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${config.numGroups}, minmax(80px, 1fr))`, minWidth: config.numGroups > 4 ? `${config.numGroups * 100}px` : undefined }}>
                  {Array.from({ length: config.numGroups }, (_, gIdx) => {
                    const exercises = config.rounds[roundIdx]?.[gIdx] || [];
                    return (
                      <div key={gIdx}>
                        <div className={`text-gray-500 font-oswald uppercase tracking-wider mb-1.5 ${config.numRounds === 1 ? 'text-base md:text-lg' : 'text-sm md:text-base'}`}>G{gIdx + 1}</div>
                        {exercises.map((ex, eIdx) => (
                          <div key={eIdx} className={`rd-ex-row ${config.numRounds === 1 ? 'text-base md:text-lg' : 'text-sm md:text-base'}`} style={{ color: getExerciseColor(ex) }}>
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
                Timer per round: {config.forTimeRoundTimerMinutes || 12} Minutes
              </div>
            )}
            {getForTimeBlocks(config).map((block, bIdx) => (
              <div key={bIdx} className="bg-hclub-dark border border-cyan-500/30 rounded-xl p-5 fade-in-up" style={{ animationDelay: `${0.2 + bIdx * 0.1}s`, opacity: 0 }}>
                <h3 className="font-oswald text-lg uppercase tracking-wider text-cyan-400 mb-3">
                  {getForTimeBlocks(config).length > 1 ? `Round ${bIdx + 1}` : 'AMRAP'}
                </h3>
                <div className="overflow-x-auto">
                <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${config.numGroups}, minmax(90px, 1fr))`, minWidth: config.numGroups > 4 ? `${config.numGroups * 110}px` : undefined }}>
                  {Array.from({ length: config.numGroups }, (_, gIdx) => {
                    const exercises = block.exercises?.[gIdx] || [];
                    return (
                      <div key={gIdx}>
                        <div className="text-gray-500 text-sm md:text-base font-oswald uppercase mb-2">G{gIdx + 1}</div>
                        {exercises.map((ex, eIdx) => (
                          <div key={eIdx} className="rd-ex-row text-base md:text-xl" style={{ color: getExerciseColor(ex.name) }}>
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
            Back
          </button>
          <button onClick={startWorkout}
            className="px-12 py-3 bg-hclub-magenta hover:bg-hclub-magenta-dark text-white font-oswald text-lg md:text-xl uppercase tracking-widest rounded-xl transition-colors glow-pulse">
            Let&apos;s go!
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
          textShadow: '0 0 60px #199DA9, 0 0 120px rgba(25,157,169,0.5)',
          lineHeight: 1,
        }}>
          {countdownValue > 0 ? countdownValue : 'GO!'}
        </div>
        <div className="absolute bottom-6 right-6">
          <span className="font-oswald text-xl tracking-wider text-gray-500">HYB<span className="text-hclub-magenta">RYD</span></span>
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
          <div className="burst rounded-full border border-cyan-500" style={{ width: 80, height: 80, animationDelay: '0.3s', position: 'absolute' }} />
        </div>
        <h1 className="font-oswald text-7xl md:text-9xl font-bold text-white uppercase tracking-wider mb-8 power-pulse relative z-10">Done!</h1>
        <h2 className="font-oswald text-3xl uppercase tracking-wider text-gray-300 mb-4 relative z-10">{workout.name}</h2>
        {workoutMode === 'fortime' && (
          <p className="font-oswald text-2xl text-cyan-400 mb-4 relative z-10">Time: {formatTime(forTimeElapsed)}</p>
        )}
        <p className="text-gray-400 text-lg mb-12 relative z-10">Great work!</p>
        <button onClick={() => setPhase('idle')}
          className="px-8 py-3 bg-hclub-gray hover:bg-hclub-magenta text-white font-oswald text-xl uppercase tracking-wider rounded-xl transition-colors relative z-10">
          Back
        </button>
        <div className="absolute bottom-6 right-6">
          <span className="font-oswald text-xl tracking-wider text-gray-500">HYB<span className="text-hclub-magenta">RYD</span></span>
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
            <span className="font-oswald text-6xl uppercase tracking-wider text-yellow-400">Paused</span>
            <span className="absolute bottom-24 text-gray-400 font-oswald text-lg uppercase tracking-wider">Tap to resume</span>
          </div>
        )}
        <div className="breathe text-center">
          <h1 className="font-oswald text-5xl md:text-7xl uppercase tracking-widest text-hclub-magenta mb-8 text-center">Warmup</h1>
          <div className="font-oswald text-[10rem] md:text-[14rem] leading-none text-white text-center">{formatTime(timeRemaining)}</div>
        </div>
        <p className="text-gray-400 text-xl mt-8 font-oswald uppercase tracking-wider text-center">Get ready!</p>
        <button onClick={() => setIsPaused(p => !p)}
          className="absolute bottom-16 left-4 z-50 w-14 h-14 rounded-full flex items-center justify-center transition-all active:scale-90"
          style={{ backgroundColor: isPaused ? '#FFD700' : 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)', border: isPaused ? '2px solid #FFD700' : '2px solid rgba(255,255,255,0.2)' }}
          title={isPaused ? 'Resume' : 'Pause'}>
          {isPaused ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="black"><polygon points="6,4 20,12 6,20" /></svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="white"><rect x="5" y="4" width="5" height="16" rx="1" /><rect x="14" y="4" width="5" height="16" rx="1" /></svg>
          )}
        </button>
        <div className="absolute bottom-6 right-6"><span className="font-oswald text-xl tracking-wider text-gray-500">HYB<span className="text-hclub-magenta">RYD</span></span></div>
        <div className="absolute bottom-6 left-6 text-gray-500">{workout.trainer_name}</div>
      </div>
    );
  }

  // =================== FORTIME / AMRAP WORK PHASE ===================
  // Alle Übungen aller Gruppen gleichzeitig sichtbar, keine Slideshow
  if (workoutMode === 'fortime' && phase === 'work') {
    const blocks = getForTimeBlocks(config);
    const currentBlockData = blocks[forTimeCurrentBlock];
    return (
      <AmrapStage
        title={workout.name}
        formatLabel={config.formatLabel || (forTimeRoundTimerEnabled ? `AMRAP ${config.forTimeRoundTimerMinutes || 12}` : 'For Time')}
        blockIndex={forTimeCurrentBlock}
        totalBlocks={blocks.length}
        numGroups={config.numGroups}
        exercisesByGroup={currentBlockData?.exercises || {}}
        currentIndex={forTimeCurrentExIndex}
        groupRounds={forTimeGroupRounds}
        groupFinished={forTimeGroupFinished}
        targetRounds={config.forTimeTargetRounds}
        roundTimer={{ enabled: forTimeRoundTimerEnabled, remaining: forTimeRoundTimeRemaining, total: forTimeRoundTimerSeconds }}
        elapsed={forTimeElapsed}
        isPaused={isPaused}
        trainerName={workout.trainer_name}
        onAdvance={forTimeAdvanceGroup}
        onTogglePause={() => setIsPaused(p => !p)}
      />
    );
  }

  // =================== TIMED MODE: WORK / REST / ROUND REST ===================
  const ivPhase = (phase === 'rest' || phase === 'roundRest') ? phase : 'work';
  const ivTotal =
    ivPhase === 'work' ? getWorkTimeForRound(config, currentRound) :
    ivPhase === 'rest' ? getRestTimeForRound(config, currentRound) :
    (config.roundRestTime || 60);
  const ivKind: 'emom' | 'intervals' =
    /^emom/i.test(config.formatLabel || '') || (config.numRounds === 1 && config.workTime === 60 && config.restTime === 0) ? 'emom' : 'intervals';

  return (
    <IntervalStage
      title={workout.name}
      formatLabel={config.formatLabel || (ivKind === 'emom' ? 'EMOM' : 'Intervals')}
      phase={ivPhase}
      kind={ivKind}
      timeRemaining={timeRemaining}
      phaseTotal={ivTotal}
      round={currentRound}
      totalRounds={config.numRounds}
      groups={Array.from({ length: config.numGroups }, (_, g) => ({
        items: config.rounds[currentRound]?.[g] || [],
        idx: currentExerciseIndex,
      }))}
      isPaused={isPaused}
      trainerName={workout.trainer_name}
      onSkip={() => (phase === 'work' ? skipToNext() : setTimeRemaining(0))}
      onAdjust={(d) => setTimeRemaining((t) => Math.max(0, t + d))}
      onTogglePause={() => setIsPaused((x) => !x)}
    />
  );
}
