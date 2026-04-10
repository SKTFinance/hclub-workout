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
  iconOverrides?: {
    // iconOverrides[roundIndex][groupIndex][exerciseIndex] = icon key from exerciseIconMap
    [roundIndex: number]: {
      [groupIndex: number]: {
        [exerciseIndex: number]: string;
      };
    };
  };
}

export interface Workout {
  id: string;
  user_id: string;
  name: string;
  trainer_name: string;
  config: WorkoutConfig;
  created_at: string;
  updated_at: string;
}

export interface ExerciseSetting {
  id: string;
  user_id: string;
  exercise_name: string;
  color: string;
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
