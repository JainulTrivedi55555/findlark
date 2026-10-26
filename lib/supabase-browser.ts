'use client';
// The only Supabase client in the browser. Used for auth only: sign in, read
// the session, listen for changes, sign out. All app data goes through our
// /api routes (lib/api-client.ts), never straight to Supabase tables.
//
// It uses only the two values that are safe in the browser: the project URL
// and the publishable (anon) key. Next.js inlines NEXT_PUBLIC_* at build time.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

export function supabaseBrowser(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error('Supabase URL or publishable key is missing. Run `make setup` (it writes .env.local).');
  }
  client = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return client;
}
