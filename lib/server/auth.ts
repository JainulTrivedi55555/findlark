import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from './errors';
import { createUserClient } from './supabase';

export type Recruiter = {
  /** Queries as this recruiter, so RLS limits it to their company's data. */
  supabase: SupabaseClient;
  userId: string;
  companyId: string;
};

const BEARER = /^Bearer\s+(\S+)$/i;

/**
 * Verifies `Authorization: Bearer <token>` and returns a user-scoped client.
 * Throws ApiError 401 for a missing or invalid token, and 403 for a valid user
 * who is not a recruiter (no row in recruiters).
 */
export async function requireRecruiter(req: Request): Promise<Recruiter> {
  const match = req.headers.get('authorization')?.match(BEARER);
  if (!match) {
    throw new ApiError(401, 'unauthorized', 'Missing Authorization: Bearer <token> header.');
  }
  const token = match[1];
  const supabase = createUserClient(token);

  // getClaims checks the JWT's signature (against the project's public key,
  // cached in-process) and its expiry locally: ~1 ms instead of ~100 ms for
  // getUser's round trip to the auth server. For symmetric (HS*) keys it falls
  // back to getUser by itself. Tradeoff: a token stays valid until it expires
  // (1 h) even after sign-out; RLS still checks the same signature on every query.
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
  const userId = claimsData?.claims.sub;
  if (claimsError || !userId || claimsData.claims.role !== 'authenticated') {
    throw new ApiError(401, 'unauthorized', 'Invalid or expired access token.');
  }

  // Read through RLS: a user can only see their own recruiters row.
  const { data: recruiter, error } = await supabase
    .from('recruiters')
    .select('company_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(`recruiter lookup failed: ${error.message}`);
  if (!recruiter) {
    throw new ApiError(403, 'forbidden', 'This account is not a recruiter.');
  }

  return { supabase, userId, companyId: recruiter.company_id };
}
