// Maps exercise names to generated image assets under /public/exercises.
// Falls back to a generic image when no specific one is hinterlegt.
// A per-exercise override (localStorage `hclub_exercise_images` / exercise_settings.image_key)
// wird bevorzugt gelesen: Override > NAME_TO_SLUG > generic.

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
  // Shoulder Press (+ Varianten)
  'shoulder press': 'shoulder-press',
  'shoulder-press': 'shoulder-press',
  'shoulderpress': 'shoulder-press',
  'overhead press': 'shoulder-press',
  'military press': 'shoulder-press',
  'barbell shoulder press': 'shoulder-press',
  'dumbbell shoulder press': 'shoulder-press',
  'db shoulder press': 'shoulder-press',
  'strict press': 'shoulder-press',
};

const GENERIC = '/exercises/generic.jpg';

// All slugs available as pickable images in the settings image picker.
// Derived from the mapping values (unique) so the picker stays in sync.
export const AVAILABLE_IMAGE_SLUGS: string[] = Array.from(
  new Set(Object.values(NAME_TO_SLUG))
).sort();

const IMAGES_STORAGE_KEY = 'hclub_exercise_images';

// Reads the per-exercise image override map from localStorage (client only).
function loadImageOverrides(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(IMAGES_STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

// Returns the URL for a given slug (e.g. 'run' -> '/exercises/run.jpg').
export function slugToImageUrl(slug: string): string {
  if (!slug || slug === '__generic__') return GENERIC;
  return `/exercises/${slug}.jpg`;
}

// Returns the image URL for an exercise.
// Priority: user override (localStorage) > NAME_TO_SLUG mapping > generic.
export function getExerciseImage(exerciseName: string | undefined | null): string {
  if (!exerciseName) return GENERIC;
  const key = exerciseName.trim().toLowerCase();

  const overrides = loadImageOverrides();
  const override = overrides[key] ?? overrides[exerciseName.trim()];
  if (override) return slugToImageUrl(override);

  const slug = NAME_TO_SLUG[key];
  return slug ? `/exercises/${slug}.jpg` : GENERIC;
}

// Resolves the default (non-override) slug for an exercise, or '__generic__'.
export function getDefaultImageSlug(exerciseName: string | undefined | null): string {
  if (!exerciseName) return '__generic__';
  return NAME_TO_SLUG[exerciseName.trim().toLowerCase()] || '__generic__';
}
