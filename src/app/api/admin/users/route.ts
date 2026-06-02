import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://hbprnkqadwdgyorqkyno.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhicHJua3FhZHdkZ3lvcnFreW5vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDU1MzY5MiwiZXhwIjoyMDkwMTI5NjkyfQ.iTONk7ZpdEShn9H1JXOe_dqRs_rwosxb0InU9xNjR30',
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export const dynamic = 'force-dynamic';

async function isAdmin(): Promise<boolean> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await getAdminClient()
    .from('hclub_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .single();

  return !!data;
}

// GET: Liste aller User
export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  }

  const { data: { users }, error } = await getAdminClient().auth.admin.listUsers();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const simplified = users
    .filter((u) => u.email?.includes('@h-club'))
    .map((u) => ({
      id: u.id,
      email: u.email,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at,
    }));

  return NextResponse.json({ users: simplified });
}

// POST: Neuen User anlegen
export async function POST(request: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  }

  const { email, password } = await request.json();

  if (!email || !password) {
    return NextResponse.json({ error: 'Email und Passwort erforderlich' }, { status: 400 });
  }

  const { data, error } = await getAdminClient().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ user: { id: data.user.id, email: data.user.email } }, { status: 201 });
}
