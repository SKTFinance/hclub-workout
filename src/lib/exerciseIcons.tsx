import React from 'react';

interface IconProps {
  size?: number;
  color?: string;
}

const defaultSize = 120;

function SvgWrap({ children, size = defaultSize, color = 'currentColor', viewBox = '0 0 100 100' }: IconProps & { children: React.ReactNode; viewBox?: string }) {
  return (
    <svg width={size} height={size} viewBox={viewBox} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

const Squats = ({ size, color }: IconProps) => (
  <SvgWrap size={size} color={color}>
    <circle cx="50" cy="15" r="7" />
    <line x1="50" y1="22" x2="50" y2="50" />
    <line x1="50" y1="32" x2="30" y2="42" />
    <line x1="50" y1="32" x2="70" y2="42" />
    <line x1="50" y1="50" x2="35" y2="75" />
    <line x1="35" y1="75" x2="30" y2="90" />
    <line x1="50" y1="50" x2="65" y2="75" />
    <line x1="65" y1="75" x2="70" y2="90" />
    <line x1="20" y1="42" x2="80" y2="42" strokeWidth="4" />
  </SvgWrap>
);

const Pushups = ({ size, color }: IconProps) => (
  <SvgWrap size={size} color={color}>
    <circle cx="22" cy="40" r="7" />
    <line x1="29" y1="42" x2="55" y2="50" />
    <line x1="55" y1="50" x2="85" y2="50" />
    <line x1="29" y1="45" x2="22" y2="65" />
    <line x1="22" y1="65" x2="20" y2="80" />
    <line x1="85" y1="50" x2="88" y2="80" />
  </SvgWrap>
);

const Burpees = ({ size, color }: IconProps) => (
  <SvgWrap size={size} color={color}>
    <circle cx="50" cy="12" r="7" />
    <line x1="50" y1="19" x2="50" y2="42" />
    <line x1="50" y1="28" x2="35" y2="20" />
    <line x1="50" y1="28" x2="65" y2="20" />
    <line x1="50" y1="42" x2="38" y2="65" />
    <line x1="38" y1="65" x2="35" y2="85" />
    <line x1="50" y1="42" x2="62" y2="65" />
    <line x1="62" y1="65" x2="65" y2="85" />
    <path d="M 45 5 L 50 -2 L 55 5" strokeWidth="2" />
  </SvgWrap>
);

const Lunges = ({ size, color }: IconProps) => (
  <SvgWrap size={size} color={color}>
    <circle cx="50" cy="15" r="7" />
    <line x1="50" y1="22" x2="50" y2="50" />
    <line x1="50" y1="32" x2="35" y2="25" />
    <line x1="50" y1="32" x2="65" y2="25" />
    <line x1="50" y1="50" x2="30" y2="70" />
    <line x1="30" y1="70" x2="25" y2="90" />
    <line x1="50" y1="50" x2="70" y2="75" />
    <line x1="70" y1="75" x2="80" y2="90" />
  </SvgWrap>
);

const Plank = ({ size, color }: IconProps) => (
  <SvgWrap size={size} color={color}>
    <circle cx="20" cy="42" r="7" />
    <line x1="27" y1="44" x2="65" y2="50" />
    <line x1="65" y1="50" x2="85" y2="50" />
    <line x1="25" y1="48" x2="18" y2="70" />
    <line x1="85" y1="50" x2="88" y2="70" />
  </SvgWrap>
);

const MountainClimbers = ({ size, color }: IconProps) => (
  <SvgWrap size={size} color={color}>
    <circle cx="25" cy="30" r="7" />
    <line x1="30" y1="34" x2="55" y2="45" />
    <line x1="55" y1="45" x2="85" y2="50" />
    <line x1="55" y1="45" x2="40" y2="65" />
    <line x1="40" y1="65" x2="30" y2="80" />
    <line x1="85" y1="50" x2="90" y2="75" />
    <line x1="30" y1="37" x2="20" y2="55" />
  </SvgWrap>
);

const JumpingJacks = ({ size, color }: IconProps) => (
  <SvgWrap size={size} color={color}>
    <circle cx="50" cy="15" r="7" />
    <line x1="50" y1="22" x2="50" y2="52" />
    <line x1="50" y1="30" x2="25" y2="18" />
    <line x1="50" y1="30" x2="75" y2="18" />
    <line x1="50" y1="52" x2="30" y2="85" />
    <line x1="50" y1="52" x2="70" y2="85" />
  </SvgWrap>
);

const Situps = ({ size, color }: IconProps) => (
  <SvgWrap size={size} color={color}>
    <circle cx="35" cy="35" r="7" />
    <line x1="38" y1="41" x2="55" y2="58" />
    <line x1="55" y1="58" x2="80" y2="65" />
    <line x1="80" y1="65" x2="85" y2="80" />
    <line x1="80" y1="65" x2="90" y2="60" />
    <line x1="38" y1="38" x2="28" y2="28" />
    <line x1="38" y1="38" x2="48" y2="28" />
  </SvgWrap>
);

const Rowing = ({ size, color }: IconProps) => (
  <SvgWrap size={size} color={color}>
    <circle cx="40" cy="30" r="7" />
    <line x1="40" y1="37" x2="45" y2="60" />
    <line x1="45" y1="60" x2="70" y2="75" />
    <line x1="70" y1="75" x2="75" y2="85" />
    <line x1="40" y1="42" x2="60" y2="35" />
    <line x1="40" y1="42" x2="55" y2="40" />
    <rect x="10" y="80" width="80" height="4" rx="2" />
  </SvgWrap>
);

const SkiErg = ({ size, color }: IconProps) => (
  <SvgWrap size={size} color={color}>
    <circle cx="50" cy="20" r="7" />
    <line x1="50" y1="27" x2="50" y2="55" />
    <line x1="50" y1="35" x2="35" y2="50" />
    <line x1="50" y1="35" x2="65" y2="50" />
    <line x1="50" y1="55" x2="42" y2="80" />
    <line x1="50" y1="55" x2="58" y2="80" />
    <line x1="35" y1="50" x2="30" y2="65" />
    <line x1="65" y1="50" x2="70" y2="65" />
  </SvgWrap>
);

const SledPush = ({ size, color }: IconProps) => (
  <SvgWrap size={size} color={color}>
    <circle cx="30" cy="30" r="7" />
    <line x1="35" y1="35" x2="50" y2="55" />
    <line x1="50" y1="55" x2="42" y2="80" />
    <line x1="50" y1="55" x2="58" y2="80" />
    <line x1="35" y1="38" x2="55" y2="38" />
    <line x1="35" y1="38" x2="55" y2="42" />
    <rect x="55" y="30" width="25" height="35" rx="3" strokeWidth="3" />
    <line x1="55" y1="65" x2="80" y2="65" />
  </SvgWrap>
);

const SledPull = ({ size, color }: IconProps) => (
  <SvgWrap size={size} color={color}>
    <circle cx="30" cy="30" r="7" />
    <line x1="30" y1="37" x2="35" y2="55" />
    <line x1="35" y1="55" x2="28" y2="80" />
    <line x1="35" y1="55" x2="42" y2="80" />
    <line x1="30" y1="42" x2="15" y2="45" />
    <line x1="30" y1="42" x2="20" y2="50" />
    <line x1="35" y1="55" x2="65" y2="55" strokeDasharray="4 3" />
    <rect x="65" y="42" width="20" height="25" rx="3" />
  </SvgWrap>
);

const WallBalls = ({ size, color }: IconProps) => (
  <SvgWrap size={size} color={color}>
    <circle cx="50" cy="20" r="7" />
    <line x1="50" y1="27" x2="50" y2="52" />
    <line x1="50" y1="35" x2="35" y2="22" />
    <line x1="50" y1="35" x2="65" y2="22" />
    <line x1="50" y1="52" x2="38" y2="75" />
    <line x1="38" y1="75" x2="35" y2="88" />
    <line x1="50" y1="52" x2="62" y2="75" />
    <line x1="62" y1="75" x2="65" y2="88" />
    <circle cx="50" cy="10" r="5" strokeWidth="2" />
  </SvgWrap>
);

const FarmersCarry = ({ size, color }: IconProps) => (
  <SvgWrap size={size} color={color}>
    <circle cx="50" cy="15" r="7" />
    <line x1="50" y1="22" x2="50" y2="52" />
    <line x1="50" y1="32" x2="30" y2="52" />
    <line x1="50" y1="32" x2="70" y2="52" />
    <line x1="50" y1="52" x2="42" y2="80" />
    <line x1="50" y1="52" x2="58" y2="80" />
    <rect x="25" y="50" width="8" height="16" rx="2" />
    <rect x="67" y="50" width="8" height="16" rx="2" />
  </SvgWrap>
);

const BurpeeBroadJump = ({ size, color }: IconProps) => (
  <SvgWrap size={size} color={color}>
    <circle cx="45" cy="12" r="7" />
    <line x1="45" y1="19" x2="48" y2="42" />
    <line x1="45" y1="28" x2="30" y2="22" />
    <line x1="45" y1="28" x2="60" y2="18" />
    <line x1="48" y1="42" x2="35" y2="68" />
    <line x1="35" y1="68" x2="30" y2="85" />
    <line x1="48" y1="42" x2="60" y2="68" />
    <line x1="60" y1="68" x2="65" y2="85" />
    <path d="M 70 75 Q 78 60 85 75" strokeWidth="2" />
    <path d="M 75 80 Q 82 65 90 80" strokeWidth="2" />
  </SvgWrap>
);

const Deadlifts = ({ size, color }: IconProps) => (
  <SvgWrap size={size} color={color}>
    <circle cx="50" cy="25" r="7" />
    <line x1="50" y1="32" x2="50" y2="55" />
    <line x1="50" y1="40" x2="30" y2="55" />
    <line x1="50" y1="40" x2="70" y2="55" />
    <line x1="50" y1="55" x2="42" y2="78" />
    <line x1="42" y1="78" x2="40" y2="90" />
    <line x1="50" y1="55" x2="58" y2="78" />
    <line x1="58" y1="78" x2="60" y2="90" />
    <line x1="20" y1="55" x2="80" y2="55" strokeWidth="4" />
    <circle cx="15" cy="55" r="6" strokeWidth="2" />
    <circle cx="85" cy="55" r="6" strokeWidth="2" />
  </SvgWrap>
);

const KettlebellSwings = ({ size, color }: IconProps) => (
  <SvgWrap size={size} color={color}>
    <circle cx="50" cy="18" r="7" />
    <line x1="50" y1="25" x2="50" y2="52" />
    <line x1="50" y1="33" x2="35" y2="18" />
    <line x1="50" y1="33" x2="65" y2="18" />
    <line x1="50" y1="52" x2="40" y2="78" />
    <line x1="50" y1="52" x2="60" y2="78" />
    <circle cx="50" cy="8" r="4" strokeWidth="2" />
    <path d="M 47 5 Q 50 0 53 5" strokeWidth="2" />
  </SvgWrap>
);

const BoxJumps = ({ size, color }: IconProps) => (
  <SvgWrap size={size} color={color}>
    <circle cx="40" cy="15" r="7" />
    <line x1="40" y1="22" x2="42" y2="42" />
    <line x1="40" y1="30" x2="28" y2="22" />
    <line x1="40" y1="30" x2="55" y2="22" />
    <line x1="42" y1="42" x2="35" y2="58" />
    <line x1="42" y1="42" x2="52" y2="58" />
    <rect x="55" y="58" width="30" height="25" rx="2" />
    <path d="M 30 85 Q 45 50 60 58" strokeWidth="2" strokeDasharray="3 3" />
  </SvgWrap>
);

const BattleRopes = ({ size, color }: IconProps) => (
  <SvgWrap size={size} color={color}>
    <circle cx="50" cy="20" r="7" />
    <line x1="50" y1="27" x2="50" y2="50" />
    <line x1="50" y1="50" x2="42" y2="78" />
    <line x1="50" y1="50" x2="58" y2="78" />
    <path d="M 50 35 Q 35 35 30 45 Q 25 55 20 55 Q 15 55 12 65 Q 10 75 10 85" strokeWidth="2.5" />
    <path d="M 50 35 Q 65 35 70 45 Q 75 55 80 55 Q 85 55 88 65 Q 90 75 90 85" strokeWidth="2.5" />
  </SvgWrap>
);

const AssaultBike = ({ size, color }: IconProps) => (
  <SvgWrap size={size} color={color}>
    <circle cx="50" cy="18" r="7" />
    <line x1="50" y1="25" x2="50" y2="45" />
    <line x1="50" y1="32" x2="38" y2="25" />
    <line x1="50" y1="32" x2="62" y2="25" />
    <line x1="50" y1="45" x2="40" y2="62" />
    <line x1="50" y1="45" x2="60" y2="62" />
    <circle cx="35" cy="72" r="14" strokeWidth="2" />
    <circle cx="65" cy="72" r="14" strokeWidth="2" />
    <line x1="40" y1="62" x2="35" y2="72" />
    <line x1="60" y1="62" x2="65" y2="72" />
  </SvgWrap>
);

const Pullups = ({ size, color }: IconProps) => (
  <SvgWrap size={size} color={color}>
    <line x1="20" y1="15" x2="80" y2="15" strokeWidth="4" />
    <circle cx="50" cy="30" r="7" />
    <line x1="50" y1="37" x2="50" y2="60" />
    <line x1="50" y1="22" x2="40" y2="15" />
    <line x1="50" y1="22" x2="60" y2="15" />
    <line x1="50" y1="60" x2="42" y2="82" />
    <line x1="50" y1="60" x2="58" y2="82" />
  </SvgWrap>
);

const Thrusters = ({ size, color }: IconProps) => (
  <SvgWrap size={size} color={color}>
    <circle cx="50" cy="15" r="7" />
    <line x1="50" y1="22" x2="50" y2="50" />
    <line x1="50" y1="30" x2="30" y2="18" />
    <line x1="50" y1="30" x2="70" y2="18" />
    <line x1="50" y1="50" x2="38" y2="72" />
    <line x1="38" y1="72" x2="35" y2="88" />
    <line x1="50" y1="50" x2="62" y2="72" />
    <line x1="62" y1="72" x2="65" y2="88" />
    <line x1="22" y1="18" x2="78" y2="18" strokeWidth="3" />
  </SvgWrap>
);

const Run = ({ size, color }: IconProps) => (
  <SvgWrap size={size} color={color}>
    <circle cx="48" cy="12" r="7" />
    <line x1="48" y1="19" x2="50" y2="48" />
    <line x1="48" y1="28" x2="32" y2="22" />
    <line x1="48" y1="28" x2="65" y2="35" />
    <line x1="50" y1="48" x2="30" y2="78" />
    <line x1="30" y1="78" x2="25" y2="90" />
    <line x1="50" y1="48" x2="68" y2="70" />
    <line x1="68" y1="70" x2="75" y2="90" />
  </SvgWrap>
);

const SandbagLunges = ({ size, color }: IconProps) => (
  <SvgWrap size={size} color={color}>
    <circle cx="50" cy="12" r="7" />
    <line x1="50" y1="19" x2="50" y2="50" />
    <line x1="50" y1="28" x2="38" y2="22" />
    <line x1="50" y1="28" x2="62" y2="22" />
    <line x1="50" y1="50" x2="32" y2="72" />
    <line x1="32" y1="72" x2="28" y2="90" />
    <line x1="50" y1="50" x2="68" y2="75" />
    <line x1="68" y1="75" x2="78" y2="90" />
    <ellipse cx="50" cy="22" rx="12" ry="5" strokeWidth="2.5" />
  </SvgWrap>
);

const GenericExercise = ({ size, color }: IconProps) => (
  <SvgWrap size={size} color={color}>
    <circle cx="50" cy="18" r="7" />
    <line x1="50" y1="25" x2="50" y2="55" />
    <line x1="50" y1="35" x2="30" y2="45" />
    <line x1="50" y1="35" x2="70" y2="45" />
    <line x1="50" y1="55" x2="35" y2="85" />
    <line x1="50" y1="55" x2="65" y2="85" />
  </SvgWrap>
);

export const exerciseIconMap: Record<string, React.FC<IconProps>> = {
  // HYROX
  'skierg': SkiErg,
  'sled push': SledPush,
  'sled pull': SledPull,
  'burpee broad jump': BurpeeBroadJump,
  'rowing': Rowing,
  "farmer's carry": FarmersCarry,
  'sandbag lunges': SandbagLunges,
  'wall balls': WallBalls,
  'run': Run,
  // Training
  'back squats': Squats,
  'deadlifts': Deadlifts,
  'kettlebell swings': KettlebellSwings,
  'box jumps': BoxJumps,
  'battle ropes': BattleRopes,
  'assault bike': AssaultBike,
  'pull-ups': Pullups,
  'push-ups': Pushups,
  'planks': Plank,
  'burpees': Burpees,
  'lunges': Lunges,
  'thrusters': Thrusters,
  // Common aliases
  'squats': Squats,
  'pushups': Pushups,
  'push ups': Pushups,
  'pullups': Pullups,
  'pull ups': Pullups,
  'plank': Plank,
  'mountain climbers': MountainClimbers,
  'jumping jacks': JumpingJacks,
  'sit-ups': Situps,
  'situps': Situps,
  'sit ups': Situps,
};

export function getExerciseIcon(exerciseName: string): React.FC<IconProps> {
  return exerciseIconMap[exerciseName.toLowerCase()] || GenericExercise;
}

// Deduplicated list of icons for the picker (one entry per unique component)
const _seen = new Set<React.FC<IconProps>>();
export const ICON_PICKER_OPTIONS: { key: string; label: string; Component: React.FC<IconProps> }[] = [];
for (const [key, Component] of Object.entries(exerciseIconMap)) {
  if (!_seen.has(Component)) {
    _seen.add(Component);
    ICON_PICKER_OPTIONS.push({ key, label: key.replace(/\b\w/g, (c) => c.toUpperCase()), Component });
  }
}
// Also include GenericExercise as fallback option
ICON_PICKER_OPTIONS.push({ key: '__generic__', label: 'Generic', Component: GenericExercise });
