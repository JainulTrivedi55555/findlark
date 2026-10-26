// Runs search_candidates for already-validated filters and returns every match,
// best first. Takes the Supabase client as a parameter so it works from plain
// scripts (eval, tests) as well as from route handlers.
import type { SupabaseClient } from '@supabase/supabase-js';
import { Filters, zeroResultReason } from './schema';

// PostgREST returns at most 1,000 rows per request (supabase/config.toml
// max_rows), so read the ordered result in pages. The order is deterministic
// (years_experience desc, id), so pages never overlap or skip.
const PAGE = 1000;

export type FindResult = { ids: string[]; reason: string | null };

export async function findCandidates(admin: SupabaseClient, input: Filters): Promise<FindResult> {
  const filters = Filters.parse(input); // never send an unvalidated value to SQL
  const reason = zeroResultReason(filters);
  if (reason) return { ids: [], reason };

  const ids: string[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .rpc('search_candidates', { filters })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`search_candidates failed: ${error.message}`);
    const rows = (data ?? []) as { candidate_id: string }[];
    for (const r of rows) ids.push(r.candidate_id);
    if (rows.length < PAGE) break;
  }
  return { ids, reason: null };
}
