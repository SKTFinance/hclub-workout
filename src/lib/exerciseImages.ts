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
  'dumbell shoulder press': 'shoulder-press',
  'dumbbell shoulder press': 'shoulder-press',
  'db shoulder press': 'shoulder-press',
  'strict press': 'shoulder-press',
  // Kniebeugen mit Kettlebell, Sit-ups
  'goblet squat': 'goblet-squat',
  'goblet squats': 'goblet-squat',
  'goblet squats (kb)': 'goblet-squat',
  'sit-ups': 'sit-ups',
  'sit ups': 'sit-ups',
  'situps': 'sit-ups',
};

// Trainer schreiben oft frei: „400m row", „20 WB --> 200m Ski", „1L Sled pull".
// Ohne exakten Treffer suchen wir Stichworte; bei mehreren gewinnt das früheste
// im Namen (bei gleicher Stelle das längere), also die zuerst genannte Übung.
const KEYWORDS: [RegExp, string][] = [
  [/sled\s*push|schlitten/, 'sled-push'],
  [/sled\s*pull/, 'sled-pull'],
  [/push[\s-]*ups?\b|liegestütz/, 'push-ups'],
  [/\bpush\b/, 'sled-push'],
  [/pull[\s-]*ups?\b|klimmz/, 'pull-ups'],
  [/\bwb\b|wall\s*balls?/, 'wall-balls'],
  [/\bbbj\b|broad\s*jump/, 'burpee-broad-jump'],
  [/burpee/, 'burpees'],
  [/\bski/, 'skierg'],
  [/\brow(ing)?\b|rudern/, 'rowing'],
  [/carry|farmer/, 'farmers-carry'],
  [/(sand)?bag\s*lunge/, 'sandbag-lunges'],
  [/lunge|ausfallschritt/, 'lunges'],
  [/\brun\b|running|sprint|lauf/, 'run'],
  [/thruster|squat[\w\s-]*press/, 'thrusters'],
  [/back\s*squat/, 'back-squats'],
  [/squat|kniebeug/, 'goblet-squat'],
  [/shoulder\s*press|overhead\s*press|\bpress\b/, 'shoulder-press'],
  [/sit[\s-]*ups?|crunch/, 'sit-ups'],
  [/plank/, 'planks'],
  [/box\s*jump/, 'box-jumps'],
  [/swing/, 'kettlebell-swings'],
  [/deadlift|kreuzheben/, 'deadlifts'],
  [/battle\s*rope/, 'battle-ropes'],
  [/bike/, 'assault-bike'],
];

function matchKeyword(key: string): string | null {
  let best: { slug: string; pos: number; len: number } | null = null;
  for (const [re, slug] of KEYWORDS) {
    const m = re.exec(key);
    if (!m) continue;
    if (!best || m.index < best.pos || (m.index === best.pos && m[0].length > best.len)) {
      best = { slug, pos: m.index, len: m[0].length };
    }
  }
  return best ? best.slug : null;
}

function resolveSlug(exerciseName: string): string | null {
  const key = exerciseName.trim().toLowerCase();
  return NAME_TO_SLUG[key] || matchKeyword(key);
}

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
// Priority: user override (localStorage) > NAME_TO_SLUG mapping > Stichwort > generic.
export function getExerciseImage(exerciseName: string | undefined | null): string {
  if (!exerciseName) return GENERIC;
  const key = exerciseName.trim().toLowerCase();

  const overrides = loadImageOverrides();
  const override = overrides[key] ?? overrides[exerciseName.trim()];
  if (override) return slugToImageUrl(override);

  const slug = resolveSlug(exerciseName);
  return slug ? `/exercises/${slug}.jpg` : GENERIC;
}

// Resolves the default (non-override) slug for an exercise, or '__generic__'.
export function getDefaultImageSlug(exerciseName: string | undefined | null): string {
  if (!exerciseName) return '__generic__';
  return resolveSlug(exerciseName) || '__generic__';
}
