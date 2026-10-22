import { DISCIPLINES, crossoverKind, type Discipline } from '@/lib/discipline';

// Schild für eine Übung der ANDEREN Art (z. B. Sled Push in einem CrossFit-Workout).
// Samuel: „im Zweifel auch mal eine Übung der anderen Art … anders dargestellt".
export default function CrossTag({ name, discipline, size = 'sm' }: { name: string; discipline?: Discipline; size?: 'sm' | 'lg' }) {
  const k = crossoverKind(name, discipline);
  if (!k) return null;
  return (
    <span className={size === 'lg' ? 'iv-cross' : 'v3-cross-mini'} style={{ ['--k' as string]: DISCIPLINES[k].accent }}>
      {k === 'hyrox' ? 'Hyrox station' : 'CrossFit move'}
    </span>
  );
}
