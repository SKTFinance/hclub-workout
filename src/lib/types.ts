export interface Exercise {
  name: string;
  color: string;
}

export interface GroupRound {
  exercises: string[]; // exercise names for this group in this round
}

export interface WorkoutConfig {
  numGroups: number;
  numRounds: number;
  workTime: number; // seconds
  restTime: number; // seconds between exercises
  roundRestTime: number; // seconds between rounds
  warmupTime: number; // seconds
  rounds: {
    // rounds[roundIndex][groupIndex] = exercise names
    [roundIndex: number]: {
      [groupIndex: number]: string[];
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
