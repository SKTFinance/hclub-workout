export interface Exercise {
  name: string;
  color: string;
}

export interface GroupRound {
  exercises: string[]; // exercise names for this group in this round
}

export interface RoundSettings {
  workTime?: number; // override per round
  restTime?: number; // override per round
}

// Per-group time overrides within a round
export interface GroupTimeSettings {
  workTime?: number;
  restTime?: number;
}

export type WorkoutMode = 'timed' | 'amrap' | 'fortime';

// Exercise entry for AMRAP and ForTime modes
export interface ExerciseEntry {
  name: string;
  reps?: number;       // number of repetitions
  distance?: string;   // e.g. "500m", "50m"
  duration?: number;   // seconds (for timed holds like planks in fortime mode)
}

export interface WorkoutConfig {
  numGroups: number;
  numRounds: number;
  workTime: number; // seconds (default for all rounds)
  restTime: number; // seconds between exercises (default)
  roundRestTime: number; // seconds between rounds
  warmupTime: number; // seconds
  rounds: {
    // rounds[roundIndex][groupIndex] = exercise names
    [roundIndex: number]: {
      [groupIndex: number]: string[];
    };
  };
  roundSettings?: {
    [roundIndex: number]: RoundSettings;
  };
  // Per-group time overrides within each round
  groupTimeSettings?: {
    [roundIndex: number]: {
      [groupIndex: number]: GroupTimeSettings;
    };
  };
  iconOverrides?: {
    // iconOverrides[roundIndex][groupIndex][exerciseIndex] = icon key from exerciseIconMap
    [roundIndex: number]: {
      [groupIndex: number]: {
        [exerciseIndex: number]: string;
      };
    };
  };
  // AMRAP mode settings
  amrapTotalTime?: number; // total time in seconds for AMRAP
  amrapExercises?: {
    // amrapExercises[groupIndex] = list of exercises with reps
    [groupIndex: number]: ExerciseEntry[];
  };
  // ForTime mode settings
  forTimeExercises?: {
    // forTimeExercises[groupIndex] = list of exercises with distance/reps
    [groupIndex: number]: ExerciseEntry[];
  };
}

export interface Workout {
  id: string;
  user_id: string;
  user_email?: string;
  name: string;
  trainer_name: string;
  config: WorkoutConfig;
  is_public?: boolean;
  workout_mode?: WorkoutMode;
  created_at: string;
  updated_at: string;
}

export interface ExerciseSetting {
  id: string;
  user_id: string;
  exercise_name: string;
  color: string;
}

export interface LibraryExercise {
  id: string;
  user_id: string;
  name: string;
  color: string;
  icon_key?: string;
  category: string;
  created_at: string;
}

export type TimerPhase =
  | 'warmup'
  | 'work'
  | 'rest'
  | 'roundRest'
  | 'finished';

export interface TimerState {
  phase: TimerPhase;
  timeRemaining: number;
  currentRound: number;
  currentExerciseIndex: number;
  isPaused: boolean;
  isRunning: boolean;
}
