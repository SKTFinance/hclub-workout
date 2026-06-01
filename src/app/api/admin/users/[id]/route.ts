import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
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

// PATCH: Passwort ändern
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  }

  const { id } = await params;
  const { password } = await request.json();

  if (!password || password.length < 6) {
    return NextResponse.json({ error: 'Passwort muss mindestens 6 Zeichen haben' }, { status: 400 });
  }

  const { error } = await getAdminClient().auth.admin.updateUserById(id, { password });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

// DELETE: User löschen
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  }

  const { id } = await params;

  // Eigenen Account kann man nicht löschen
  const supabase = await createServerClient();
  const { data: { user: currentUser } } = await supabase.auth.getUser();
  if (currentUser?.id === id) {
    return NextResponse.json({ error: 'Du kannst deinen eigenen Account nicht löschen' }, { status: 400 });
  }

  const { error } = await getAdminClient().auth.admin.deleteUser(id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
