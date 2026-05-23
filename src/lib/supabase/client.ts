'use client';

import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://hbprnkqadwdgyorqkyno.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhicHJua3FhZHdkZ3lvcnFreW5vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NTM2OTIsImV4cCI6MjA5MDEyOTY5Mn0.mG1q1cYfhsrG1vVxijjELtj-6mFvJrAZvTu5Wj0fB3c'
  );
}
