'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        // Auto-login after signup
        const { error: loginError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (loginError) throw loginError;
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      }
      router.push('/dashboard');
      router.refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Ein Fehler ist aufgetreten';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-hclub-black px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-10">
          <h1 className="font-oswald text-6xl font-bold tracking-wider">
            H-<span className="text-hclub-magenta">CLUB</span>
          </h1>
          <p className="text-gray-400 mt-2 text-sm uppercase tracking-[0.3em] font-oswald">
            Workout Timer
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1 uppercase tracking-wider font-oswald">
              E-Mail
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 bg-hclub-dark border border-hclub-gray rounded-lg
                         text-white placeholder-gray-500 focus:outline-none focus:border-hclub-magenta
                         transition-colors"
              placeholder="trainer@h-club.at"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1 uppercase tracking-wider font-oswald">
              Passwort
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-4 py-3 bg-hclub-dark border border-hclub-gray rounded-lg
                         text-white placeholder-gray-500 focus:outline-none focus:border-hclub-magenta
                         transition-colors"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-3 text-red-300 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-hclub-magenta hover:bg-hclub-magenta-dark text-white font-oswald
                       text-lg uppercase tracking-wider rounded-lg transition-colors disabled:opacity-50
                       disabled:cursor-not-allowed"
          >
            {loading ? 'Laden...' : isSignUp ? 'Registrieren' : 'Anmelden'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError('');
            }}
            className="text-gray-400 hover:text-hclub-magenta text-sm transition-colors"
          >
            {isSignUp
              ? 'Bereits registriert? Jetzt anmelden'
              : 'Noch kein Konto? Jetzt registrieren'}
          </button>
        </div>
      </div>
    </div>
  );
}
