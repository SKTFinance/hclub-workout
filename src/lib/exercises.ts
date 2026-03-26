export interface DefaultExercise {
  name: string;
  color: string;
  category: 'hyrox' | 'training' | 'custom';
}

export const HYROX_EXERCISES: DefaultExercise[] = [
  { name: 'SkiErg', color: '#00BFFF', category: 'hyrox' },
  { name: 'Sled Push', color: '#FF4444', category: 'hyrox' },
  { name: 'Sled Pull', color: '#FF6B00', category: 'hyrox' },
  { name: 'Burpee Broad Jump', color: '#FF00FF', category: 'hyrox' },
  { name: 'Rowing', color: '#00CED1', category: 'hyrox' },
  { name: "Farmer's Carry", color: '#8B4513', category: 'hyrox' },
  { name: 'Sandbag Lunges', color: '#DAA520', category: 'hyrox' },
  { name: 'Wall Balls', color: '#FFD700', category: 'hyrox' },
  { name: 'Run', color: '#32CD32', category: 'hyrox' },
];

export const TRAINING_EXERCISES: DefaultExercise[] = [
  { name: 'Back Squats', color: '#9370DB', category: 'training' },
  { name: 'Deadlifts', color: '#CD5C5C', category: 'training' },
  { name: 'Kettlebell Swings', color: '#FF8C00', category: 'training' },
  { name: 'Box Jumps', color: '#20B2AA', category: 'training' },
  { name: 'Battle Ropes', color: '#4169E1', category: 'training' },
  { name: 'Assault Bike', color: '#DC143C', category: 'training' },
  { name: 'Pull-ups', color: '#6A5ACD', category: 'training' },
  { name: 'Push-ups', color: '#3CB371', category: 'training' },
  { name: 'Planks', color: '#708090', category: 'training' },
  { name: 'Burpees', color: '#FF1493', category: 'training' },
  { name: 'Lunges', color: '#B8860B', category: 'training' },
  { name: 'Thrusters', color: '#FF6347', category: 'training' },
];

export const ALL_DEFAULT_EXERCISES = [...HYROX_EXERCISES, ...TRAINING_EXERCISES];

export function getDefaultColor(exerciseName: string): string {
  const exercise = ALL_DEFAULT_EXERCISES.find(
    (e) => e.name.toLowerCase() === exerciseName.toLowerCase()
  );
  return exercise?.color || '#FF00FF';
}
