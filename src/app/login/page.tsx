'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

// Demo für David (16.10.2026, Samuel TG 18016): Zugang nur mit dem Passwort „HYBRYD“, ohne Mailadresse.
// Das Wort öffnet das gemeinsame Demo-Konto; es ist ohnehin öffentlich weitergegeben.
const DEMO_WORT = 'HYBRYD';
const DEMO_EMAIL = 'demo.hybryd@sktopenclaw.com';
const DEMO_KONTO_PASSWORT = 'Hybryd-Demo-c0edd2';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (password.trim().toUpperCase() !== DEMO_WORT) throw new Error('Wrong password');
      const { error } = await supabase.auth.signInWithPassword({
        email: DEMO_EMAIL,
        password: DEMO_KONTO_PASSWORT,
      });
      if (error) throw error;
      router.push('/dashboard');
      router.refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center login-bg px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-10">
          <h1 className="font-oswald text-6xl font-bold tracking-wider logo-glow">
            HYB<span className="text-hclub-magenta">RYD</span>
          </h1>
          <p className="text-gray-400 mt-2 text-sm uppercase tracking-[0.3em] font-oswald fade-in-up"
             style={{ opacity: 0, animationDelay: '0.5s' }}>
            Workout Timer
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-5 fade-in-up" style={{ opacity: 0, animationDelay: '0.7s' }}>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1 uppercase tracking-wider font-oswald">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoFocus
              autoCapitalize="characters"
              autoComplete="off"
              className="w-full px-4 py-3 bg-hclub-dark border border-hclub-gray rounded-lg
                         text-white placeholder-gray-500 focus:outline-none focus:border-hclub-magenta
                         transition-colors"
              placeholder="HYBRYD"
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
            {loading ? 'Loading...' : 'Sign in'}
          </button>
        </form>

      </div>
    </div>
  );
}
