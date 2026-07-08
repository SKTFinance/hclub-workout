// Maps exercise names to generated image assets under /public/exercises.
// Falls back to a generic image when no specific one is hinterlegt.
// Later a per-exercise override (e.g. DB image_url) kann hier ergänzt werden.

const NAME_TO_SLUG: Record<string, string> = {
  // HYROX
  'skierg': 'skierg',
  'sled push': 'sled-push',
  'sled pull': 'sled-pull',
  'burpee broad jump': 'burpee-broad-jump',
  'rowing': 'rowing',
  "farmer's carry": 'farmers-carry',
  'farmers carry': 'farmers-carry',
  'sandbag lunges': 'sandbag-lunges',
  'wall balls': 'wall-balls',
  'run': 'run',
  // Training
  'back squats': 'back-squats',
  'squats': 'back-squats',
  'deadlifts': 'deadlifts',
  'kettlebell swings': 'kettlebell-swings',
  'box jumps': 'box-jumps',
  'battle ropes': 'battle-ropes',
  'assault bike': 'assault-bike',
  'pull-ups': 'pull-ups',
  'pullups': 'pull-ups',
  'pull ups': 'pull-ups',
  'push-ups': 'push-ups',
  'pushups': 'push-ups',
  'push ups': 'push-ups',
  'planks': 'planks',
  'plank': 'planks',
  'burpees': 'burpees',
  'lunges': 'lunges',
  'thrusters': 'thrusters',
};

const GENERIC = '/exercises/generic.jpg';

// Returns the image URL for an exercise, with fallback to a generic image.
export function getExerciseImage(exerciseName: string | undefined | null): string {
  if (!exerciseName) return GENERIC;
  const slug = NAME_TO_SLUG[exerciseName.trim().toLowerCase()];
  return slug ? `/exercises/${slug}.jpg` : GENERIC;
}
