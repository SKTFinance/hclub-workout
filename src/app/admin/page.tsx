'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

interface UserEntry {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
}

export default function AdminPage() {
  const [users, setUsers] = useState<UserEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);

  // Neuer User
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createSuccess, setCreateSuccess] = useState('');

  // Passwort ändern
  const [editUserId, setEditUserId] = useState<string | null>(null);
  const [editPassword, setEditPassword] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState('');
  const [editSuccess, setEditSuccess] = useState('');

  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    checkAdminAndLoad();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function checkAdminAndLoad() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/login');
      return;
    }

    // Admin-Check via API
    const res = await fetch('/api/admin/users');
    if (res.status === 403) {
      setError('Kein Zugriff — nur für Administratoren.');
      setLoading(false);
      return;
    }
    if (!res.ok) {
      setError('Fehler beim Laden der Benutzerliste.');
      setLoading(false);
      return;
    }

    const data = await res.json();
    setUsers(data.users || []);
    setIsAdmin(true);
    setLoading(false);
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setCreateError('');
    setCreateSuccess('');
    setCreateLoading(true);

    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: newEmail, password: newPassword }),
    });

    const data = await res.json();
    setCreateLoading(false);

    if (!res.ok) {
      setCreateError(data.error || 'Fehler beim Anlegen');
      return;
    }

    setCreateSuccess(`User ${newEmail} erfolgreich angelegt`);
    setNewEmail('');
    setNewPassword('');
    checkAdminAndLoad();
  }

  async function handleUpdatePassword(userId: string) {
    setEditError('');
    setEditSuccess('');
    setEditLoading(true);

    const res = await fetch(`/api/admin/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: editPassword }),
    });

    const data = await res.json();
    setEditLoading(false);

    if (!res.ok) {
      setEditError(data.error || 'Fehler beim Ändern');
      return;
    }

    setEditSuccess('Passwort erfolgreich geändert');
    setEditUserId(null);
    setEditPassword('');
  }

  async function handleDeleteUser(userId: string, email: string) {
    if (!confirm(`User "${email}" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`)) return;

    const res = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
    const data = await res.json();

    if (!res.ok) {
      alert(data.error || 'Fehler beim Löschen');
      return;
    }

    checkAdminAndLoad();
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-hclub-black flex items-center justify-center">
        <p className="text-gray-400 font-oswald uppercase tracking-wider">Laden...</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-hclub-black flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-red-400 font-oswald text-xl uppercase tracking-wider mb-4">{error}</p>
          <a href="/dashboard" className="text-hclub-magenta hover:underline font-oswald uppercase tracking-wider text-sm">
            Zurück zum Dashboard
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-hclub-black">
      {/* Header */}
      <header className="border-b border-hclub-gray">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <a href="/dashboard" className="font-oswald text-3xl font-bold tracking-wider">
              H-<span className="text-hclub-magenta">CLUB</span>
            </a>
            <span className="text-gray-500 font-oswald uppercase tracking-wider text-sm">/ Benutzerverwaltung</span>
          </div>
          <div className="flex items-center gap-4">
            <a href="/dashboard" className="text-gray-400 hover:text-hclub-magenta transition-colors text-sm font-oswald uppercase tracking-wider">
              Dashboard
            </a>
            <button
              onClick={handleLogout}
              className="text-gray-400 hover:text-red-400 transition-colors text-sm font-oswald uppercase tracking-wider"
            >
              Abmelden
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">

        {/* Neuen User anlegen */}
        <div className="bg-hclub-dark border border-hclub-gray rounded-xl p-6 fade-in-up" style={{ opacity: 0, animationDelay: '0s' }}>
          <h2 className="font-oswald text-xl uppercase tracking-wider mb-4 text-hclub-magenta">
            Neuen User anlegen
          </h2>
          <form onSubmit={handleCreateUser} className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs text-gray-400 mb-1 font-oswald uppercase tracking-wider">E-Mail</label>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                required
                placeholder="trainer@h-club.at"
                className="w-full px-3 py-2 bg-hclub-black border border-hclub-gray rounded-lg text-white text-sm
                           placeholder-gray-500 focus:outline-none focus:border-hclub-magenta transition-colors"
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs text-gray-400 mb-1 font-oswald uppercase tracking-wider">Passwort</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
                placeholder="••••••••"
                className="w-full px-3 py-2 bg-hclub-black border border-hclub-gray rounded-lg text-white text-sm
                           placeholder-gray-500 focus:outline-none focus:border-hclub-magenta transition-colors"
              />
            </div>
            <button
              type="submit"
              disabled={createLoading}
              className="px-5 py-2 bg-hclub-magenta hover:bg-hclub-magenta-dark text-white font-oswald uppercase
                         tracking-wider rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap text-sm"
            >
              {createLoading ? 'Anlegen...' : '+ User anlegen'}
            </button>
          </form>
          {createError && (
            <div className="mt-3 bg-red-900/30 border border-red-500/50 rounded-lg p-3 text-red-300 text-sm">{createError}</div>
          )}
          {createSuccess && (
            <div className="mt-3 bg-green-900/30 border border-green-500/50 rounded-lg p-3 text-green-300 text-sm">{createSuccess}</div>
          )}
        </div>

        {/* Passwort-Ändern Formular (wenn aktiv) */}
        {editUserId && (
          <div className="bg-hclub-dark border border-hclub-magenta/40 rounded-xl p-6 fade-in-up" style={{ opacity: 0 }}>
            <h2 className="font-oswald text-xl uppercase tracking-wider mb-4">
              Passwort ändern
            </h2>
            <p className="text-gray-400 text-sm mb-4">
              User: <span className="text-white">{users.find(u => u.id === editUserId)?.email}</span>
            </p>
            <div className="flex gap-3 items-end flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs text-gray-400 mb-1 font-oswald uppercase tracking-wider">Neues Passwort</label>
                <input
                  type="password"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  minLength={6}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 bg-hclub-black border border-hclub-gray rounded-lg text-white text-sm
                             placeholder-gray-500 focus:outline-none focus:border-hclub-magenta transition-colors"
                />
              </div>
              <button
                onClick={() => handleUpdatePassword(editUserId)}
                disabled={editLoading || editPassword.length < 6}
                className="px-5 py-2 bg-hclub-magenta hover:bg-hclub-magenta-dark text-white font-oswald uppercase
                           tracking-wider rounded-lg transition-colors disabled:opacity-50 text-sm"
              >
                {editLoading ? 'Speichern...' : 'Speichern'}
              </button>
              <button
                onClick={() => { setEditUserId(null); setEditPassword(''); setEditError(''); setEditSuccess(''); }}
                className="px-5 py-2 bg-hclub-gray hover:bg-hclub-dark text-gray-400 font-oswald uppercase
                           tracking-wider rounded-lg transition-colors text-sm"
              >
                Abbrechen
              </button>
            </div>
            {editError && (
              <div className="mt-3 bg-red-900/30 border border-red-500/50 rounded-lg p-3 text-red-300 text-sm">{editError}</div>
            )}
            {editSuccess && (
              <div className="mt-3 bg-green-900/30 border border-green-500/50 rounded-lg p-3 text-green-300 text-sm">{editSuccess}</div>
            )}
          </div>
        )}

        {/* Userliste */}
        <div className="fade-in-up" style={{ opacity: 0, animationDelay: '0.1s' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-oswald text-xl uppercase tracking-wider">
              Alle User
              <span className="ml-2 text-gray-500 text-base">({users.length})</span>
            </h2>
          </div>

          <div className="space-y-2">
            {users.map((user) => (
              <div
                key={user.id}
                className="bg-hclub-dark border border-hclub-gray rounded-lg px-4 py-3 flex items-center gap-4 hover:border-hclub-magenta/30 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-oswald text-white truncate">{user.email}</span>
                    {user.email === 'guido@h-club.at' && (
                      <span className="text-[10px] font-oswald uppercase px-1.5 py-0.5 rounded bg-hclub-magenta/20 text-hclub-magenta border border-hclub-magenta/30">
                        Admin
                      </span>
                    )}
                  </div>
                  <div className="text-gray-500 text-xs mt-0.5">
                    Erstellt: {new Date(user.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                    {user.last_sign_in_at && (
                      <> &bull; Letzter Login: {new Date(user.last_sign_in_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => {
                      setEditUserId(user.id);
                      setEditPassword('');
                      setEditError('');
                      setEditSuccess('');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="px-3 py-1.5 bg-hclub-gray hover:bg-hclub-magenta text-white text-xs font-oswald uppercase rounded-lg transition-colors"
                  >
                    Passwort
                  </button>
                  {user.email !== 'guido@h-club.at' && (
                    <button
                      onClick={() => handleDeleteUser(user.id, user.email)}
                      className="px-3 py-1.5 bg-red-900/30 hover:bg-red-900/60 text-red-400 text-xs font-oswald uppercase rounded-lg transition-colors"
                    >
                      Löschen
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
