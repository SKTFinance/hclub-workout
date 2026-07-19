import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://hbprnkqadwdgyorqkyno.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhicHJua3FhZHdkZ3lvcnFreW5vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NTM2OTIsImV4cCI6MjA5MDEyOTY5Mn0.mG1q1cYfhsrG1vVxijjELtj-6mFvJrAZvTu5Wj0fB3c',
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Robust: ein Fehler beim Auth-Check (z. B. Supabase-Hänger) darf NIEMALS
  // die ganze App mit MIDDLEWARE_INVOCATION_FAILED (500) lahmlegen. Im
  // Fehlerfall Request einfach durchlassen statt zu werfen.
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Protected routes
    const isProtected =
      request.nextUrl.pathname.startsWith('/dashboard') ||
      request.nextUrl.pathname.startsWith('/workout') ||
      request.nextUrl.pathname.startsWith('/settings') ||
      request.nextUrl.pathname.startsWith('/admin');

    if (!user && isProtected) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }

    if (user && request.nextUrl.pathname === '/login') {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard';
      return NextResponse.redirect(url);
    }
  } catch (err) {
    console.error('[middleware] Auth-Check fehlgeschlagen, Request wird durchgelassen:', err);
    return supabaseResponse;
  }

  return supabaseResponse;
}
