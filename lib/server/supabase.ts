import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Server code never keeps a session: every request carries its own token.
const NO_SESSION = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. Run \`make setup\` or \`npm run write-env\`.`);
  return value;
}

/**
 * A client that queries as the recruiter who owns `accessToken`.
 * It uses the publishable key plus the user's JWT, so Postgres sees role
 * "authenticated" with auth.uid() = that user, and RLS applies to every query.
 */
export function createUserClient(accessToken: string): SupabaseClient {
  return createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'), {
    auth: NO_SESSION,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

/**
 * A client with the secret key. It bypasses RLS, so use it ONLY for the
 * billing webhook and for security-definer SQL functions the server must call.
 * Never use it to read or write a recruiter's shortlists or saved briefs.
 */
export function createAdminClient(): SupabaseClient {
  return createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SECRET_KEY'), { auth: NO_SESSION });
}
