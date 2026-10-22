'use client';

// Workout-Übersicht (V3, 22.10.2026). Samuel: „Die große Übersicht draußen müssen wir
// überholen, dass die Workouts übersichtlicher zu finden sind."
//
// - Getrennt nach Art: Hyrox und CrossFit als eigene Abschnitte, Umschalter mit Anzahl.
// - Suche über Name, Coach UND Übungen („sled" findet alle Workouts mit Schlitten).
// - Karten zeigen Art, Format, Dauer, Gruppen und die ersten Übungsbilder.
// - Auf der Vorschau: Live-Workouts werden nur GELESEN. Gespeichert, kopiert, favorisiert
//   und gelöscht wird nur im Browser (lib/localWorkouts). In Produktion wie bisher.

export const dynamic = 'force-dynamic';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Workout, WorkoutConfig } from '@/lib/types';
import { DISCIPLINES, workoutDiscipline, type Discipline } from '@/lib/discipline';
import { getExerciseImage } from '@/lib/exerciseImages';
import { USE_LOCAL_STORE, deleteLocalWorkout, isLocalId, listLocalWorkouts, saveLocalWorkout } from '@/lib/localWorkouts';

type Scope = 'mine' | 'all' | 'favorites';
type Kind = 'all' | Discipline;
type Sort = 'date' | 'name';

const FAV_KEY = 'hybryd_local_favs_v1';

function exerciseNames(c: WorkoutConfig, mode?: string): string[] {
  const out: string[] = [];
  if (mode === 'fortime' && c.forTimeBlocks?.length) {
    c.forTimeBlocks.forEach((b) => Object.values(b.exercises || {}).forEach((g) => (g || []).forEach((e) => { if (!e.isNote && e.name) out.push(e.name); })));
  } else {
    Object.values(c.rounds || {}).forEach((r) => Object.values(r || {}).forEach((g) => (g || []).forEach((n) => out.push(n))));
  }
  return out;
}

function cleanName(n: string): string {
  return n.split(' @ ')[0].replace(/^\s*\d+(?:[.,]\d+)?\s*(km|kcal|cal|m|x)?\s+/i, '').trim();
}

function durationMin(w: Workout): number | null {
  const c = w.config;
  if (w.workout_mode === 'fortime') {
    if (!c.forTimeRoundTimerEnabled) return null;
    return (c.forTimeBlocks?.length || 1) * (c.forTimeRoundTimerMinutes || 12);
  }
  let s = 0;
  for (let r = 0; r < (c.numRounds || 1); r++) {
    const n = c.rounds?.[r]?.[0]?.length || 0;
    s += n * (c.workTime || 0) + Math.max(0, n - 1) * (c.restTime || 0);
  }
  s += Math.max(0, (c.numRounds || 1) - 1) * (c.roundRestTime || 0);
  return s ? Math.max(1, Math.round(s / 60)) : null;
}

function formatOf(w: Workout): string {
  const c = w.config;
  if (c.formatLabel) return c.formatLabel;
  if (w.workout_mode === 'fortime') return c.forTimeRoundTimerEnabled ? `AMRAP ${c.forTimeRoundTimerMinutes || 12}` : 'For Time';
  return `${c.workTime}/${c.restTime} × ${c.numRounds}`;
}

function Dashboard() {
  const router = useRouter();
  const params = useSearchParams();
  const savedId = params.get('saved');
  const supabase = useMemo(() => createClient(), []);
  const [remote, setRemote] = useState<Workout[]>([]);
  const [local, setLocal] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [scope, setScope] = useState<Scope>('all');
  const [kind, setKind] = useState<Kind>('all');
  const [sort, setSort] = useState<Sort>('date');
  const [q, setQ] = useState('');
  const [favs, setFavs] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setUserId(user.id);
      fetch('/api/admin/users').then((r) => { if (r.ok) setIsAdmin(true); }).catch(() => {});
    }
    const { data } = await supabase.from('hybryd_workouts').select('*').order('updated_at', { ascending: false });
    if (data) setRemote(data as Workout[]);
    setLocal(USE_LOCAL_STORE ? listLocalWorkouts() : []);
    if (USE_LOCAL_STORE) {
      try { setFavs(new Set(JSON.parse(localStorage.getItem(FAV_KEY) || '[]'))); } catch { /* egal */ }
    } else {
      const { data: f } = await supabase.from('hybryd_workout_favorites').select('workout_id');
      if (f) setFavs(new Set(f.map((x: { workout_id: string }) => x.workout_id)));
    }
    setLoading(false);
  }, [supabase]);
  useEffect(() => { load(); }, [load]);

  const all = useMemo(() => [...local, ...remote], [local, remote]);
  const isMine = useCallback((w: Workout) => isLocalId(w.id) || w.user_id === userId, [userId]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = all.filter((w) => scope === 'all' || (scope === 'mine' ? isMine(w) : favs.has(w.id)));
    if (needle) {
      list = list.filter((w) =>
        w.name.toLowerCase().includes(needle) ||
        (w.trainer_name || '').toLowerCase().includes(needle) ||
        formatOf(w).toLowerCase().includes(needle) ||
        exerciseNames(w.config, w.workout_mode).some((n) => n.toLowerCase().includes(needle)));
    }
    list = [...list].sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : (b.updated_at || '').localeCompare(a.updated_at || '')));
    return list;
  }, [all, scope, favs, q, sort, isMine]);

  const byKind = useMemo(() => {
    const m: Record<Discipline, Workout[]> = { hyrox: [], crossfit: [] };
    filtered.forEach((w) => m[workoutDiscipline(w.config)].push(w));
    return m;
  }, [filtered]);

  function toggleFav(id: string) {
    const next = new Set(favs);
    const on = !next.has(id);
    if (on) next.add(id); else next.delete(id);
    setFavs(next);
    if (USE_LOCAL_STORE) {
      try { localStorage.setItem(FAV_KEY, JSON.stringify([...next])); } catch { /* egal */ }
      return;
    }
    if (on) supabase.auth.getUser().then(({ data: { user } }) => user && supabase.from('hybryd_workout_favorites').insert({ user_id: user.id, workout_id: id }));
    else supabase.from('hybryd_workout_favorites').delete().eq('workout_id', id);
  }

  async function copy(w: Workout) {
    if (USE_LOCAL_STORE) {
      saveLocalWorkout({ user_id: 'local', name: `${w.name} (copy)`, trainer_name: w.trainer_name, config: w.config, workout_mode: w.workout_mode, is_public: false });
      setLocal(listLocalWorkouts());
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('hybryd_workouts').insert({ user_id: user.id, user_email: user.email, name: `${w.name} (copy)`, trainer_name: w.trainer_name, config: w.config, is_public: true, workout_mode: w.workout_mode || 'timed' });
    load();
  }

  async function remove(w: Workout) {
    if (!confirm(`Delete “${w.name}”?`)) return;
    if (isLocalId(w.id)) { deleteLocalWorkout(w.id); setLocal(listLocalWorkouts()); return; }
    if (USE_LOCAL_STORE) return; // Vorschau löscht keine Live-Workouts
    await supabase.from('hybryd_workouts').delete().eq('id', w.id);
    load();
  }

  function edit(w: Workout) {
    // Vorschau: alles im neuen Editor (Live-Workouts als Kopie). Produktion: eigene
    // Live-Workouts weiter im bisherigen Editor.
    if (isLocalId(w.id) || USE_LOCAL_STORE) router.push(`/workout/ai?edit=${w.id}`);
    else router.push(`/workout/${w.id}`);
  }

  async function logout() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  function Card({ w }: { w: Workout }) {
    const d = workoutDiscipline(w.config);
    const names = Array.from(new Set(exerciseNames(w.config, w.workout_mode).map(cleanName))).filter(Boolean);
    const mins = durationMin(w);
    const own = isMine(w);
    return (
      <article className={`ov-card ${w.id === savedId ? 'is-new' : ''}`} style={{ ['--k' as string]: DISCIPLINES[d].accent }}>
        <div className="ov-card-top">
          <span className="ov-tag">{DISCIPLINES[d].label}</span>
          <span className="ov-format">{formatOf(w)}</span>
          <button type="button" className={`ov-fav ${favs.has(w.id) ? 'is-on' : ''}`} onClick={() => toggleFav(w.id)} aria-label={favs.has(w.id) ? 'Remove favourite' : 'Add favourite'} aria-pressed={favs.has(w.id)}>
            {favs.has(w.id) ? '★' : '☆'}
          </button>
        </div>
        <h3 className="ov-card-name">{w.name}</h3>
        <div className="ov-thumbs" aria-hidden="true">
          {names.slice(0, 4).map((n) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={n} src={getExerciseImage(n)} alt="" loading="lazy" />
          ))}
          {names.length > 4 && <span>+{names.length - 4}</span>}
        </div>
        <div className="ov-meta">
          <span><b>{mins ? `${mins} min` : 'Open'}</b></span>
          <span><b>{w.config.numGroups || 1}</b> {(w.config.numGroups || 1) === 1 ? 'group' : 'groups'}</span>
          <span>{w.trainer_name}</span>
          {isLocalId(w.id) && <span className="ov-local">In this browser</span>}
        </div>
        <div className="ov-actions">
          <button type="button" className="ov-start" onClick={() => window.open(`/workout/${w.id}/live`, '_blank')}>Start</button>
          {(own || USE_LOCAL_STORE) && <button type="button" className="ov-btn" onClick={() => edit(w)}>Edit</button>}
          <button type="button" className="ov-btn" onClick={() => copy(w)}>Copy</button>
          {(isLocalId(w.id) || (own && !USE_LOCAL_STORE)) && (
            <button type="button" className="ov-btn is-danger" onClick={() => remove(w)} aria-label={`Delete ${w.name}`}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          )}
        </div>
      </article>
    );
  }

  function Section({ k, list }: { k: Discipline; list: Workout[] }) {
    const n = limit[k] || (kind === 'all' ? 6 : 24);
    return (
      <section className="ov-section" aria-label={DISCIPLINES[k].label}>
        <h2 className="ov-section-h" style={{ ['--k' as string]: DISCIPLINES[k].accent }}>
          <span className="ov-dot" aria-hidden="true" />{DISCIPLINES[k].label}<span>{list.length}</span>
        </h2>
        {list.length === 0 ? (
          <div className="ov-empty" style={{ marginTop: 0 }}>
            <b>No {DISCIPLINES[k].label} workouts{q ? ` for “${q}”` : ''}</b>
            <button type="button" className="ov-more" onClick={() => router.push(`/workout/ai?d=${k}`)}>+ New {DISCIPLINES[k].label} workout</button>
          </div>
        ) : (
          <>
            <div className="ov-grid">{list.slice(0, n).map((w) => <Card key={w.id} w={w} />)}</div>
            {list.length > n && (
              <button type="button" className="ov-more" onClick={() => setLimit({ ...limit, [k]: n + 24 })}>Show {Math.min(24, list.length - n)} more</button>
            )}
          </>
        )}
      </section>
    );
  }

  const kinds: Discipline[] = kind === 'all' ? ['hyrox', 'crossfit'] : [kind];

  return (
    <div className="ov-root">
      <header className="ov-top">
        <div className="ov-top-in">
          <div className="ov-logo">HYB<span>RYD</span></div>
          <nav className="ov-nav">
            {isAdmin && <a href="/admin">Users</a>}
            <a href="/tv">TV mode</a>
            <a href="/settings">Settings</a>
            <button type="button" onClick={logout}>Sign out</button>
          </nav>
        </div>
      </header>

      <main className="ov-main">
        <div className="ov-hero">
          <div>
            <h1 className="ov-h1">Workouts</h1>
            <p className="ov-sub">{loading ? 'Loading…' : `${filtered.length} ${filtered.length === 1 ? 'workout' : 'workouts'}`}</p>
          </div>
          <div className="ov-new">
            {(['hyrox', 'crossfit'] as Discipline[]).map((k) => (
              <button key={k} type="button" className="ov-new-btn" style={{ ['--k' as string]: DISCIPLINES[k].accent }} onClick={() => router.push(`/workout/ai?d=${k}`)}>
                <i aria-hidden="true">+</i>{DISCIPLINES[k].label}
              </button>
            ))}
          </div>
        </div>

        <div className="ov-bar">
          <label className="ov-search">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="2" /><path d="M16 16l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, coach or movement" aria-label="Search workouts" />
          </label>
          <div className="ov-tabs" role="tablist" aria-label="Type">
            <button type="button" role="tab" aria-selected={kind === 'all'} className={kind === 'all' ? 'is-on' : ''} onClick={() => setKind('all')}>All <b>{filtered.length}</b></button>
            {(['hyrox', 'crossfit'] as Discipline[]).map((k) => (
              <button key={k} type="button" role="tab" aria-selected={kind === k} className={kind === k ? 'is-on' : ''} style={{ ['--k' as string]: DISCIPLINES[k].accent }} onClick={() => setKind(k)}>
                <span className="ov-dot" aria-hidden="true" />{DISCIPLINES[k].label} <b>{byKind[k].length}</b>
              </button>
            ))}
          </div>
          <div className="ov-tabs" role="tablist" aria-label="Show">
            {(['all', 'mine', 'favorites'] as Scope[]).map((s) => (
              <button key={s} type="button" role="tab" aria-selected={scope === s} className={scope === s ? 'is-on' : ''} onClick={() => setScope(s)}>
                {s === 'all' ? 'Everyone' : s === 'mine' ? 'Mine' : '★ Favourites'}
              </button>
            ))}
          </div>
          <select className="ov-select" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
            <option value="date">Newest first</option>
            <option value="name">Name A–Z</option>
          </select>
        </div>

        {!loading && kinds.map((k) => <Section key={k} k={k} list={byKind[k]} />)}
      </main>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <Dashboard />
    </Suspense>
  );
}
