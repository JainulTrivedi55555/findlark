import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Filters, zeroResultReason } from '@/lib/search/schema';
import { CARD_COLUMNS, toCard, type CandidateRow } from './candidates';
import { ApiError } from './errors';
import { check, notFound } from './http';
import { createAdminClient } from './supabase';

export const PAGE_SIZE = 20;

// --- Writes: the three SQL functions, called with the secret key ------------
// They are security definer and executable by service_role only. Company and
// recruiter ids always come from requireRecruiter, never from the request.

/** Uses one search from the quota, or throws 402. Never calls the model. */
export async function reserveSearch(companyId: string, recruiterId: string, brief: string): Promise<string> {
  const { data, error } = await createAdminClient().rpc('reserve_search', {
    p_company: companyId,
    p_recruiter: recruiterId,
    p_brief: brief,
  });
  if (error?.message === 'quota_exceeded') {
    throw new ApiError(402, 'free_limit_reached', 'Your free search has been used. Upgrade to keep searching.', {
      searches_remaining: 0,
    });
  }
  if (error) throw new Error(`reserve_search: ${error.message}`);
  return data as string;
}

/** Runs the filters in SQL and stores the ranked results. Returns the total. */
export async function finishSearch(searchId: string, filters: Filters): Promise<number> {
  const { data, error } = await createAdminClient().rpc('finish_search', {
    p_search: searchId,
    p_filters: filters,
  });
  if (error) throw new Error(`finish_search: ${error.message}`);
  return data as number;
}

/** Gives the reservation back. Logs instead of throwing: it runs inside error handling. */
export async function refundSearch(searchId: string): Promise<void> {
  const { error } = await createAdminClient().rpc('refund_search', { p_search: searchId });
  if (error) console.error(`refund_search failed for a search: ${error.message}`);
}

// --- Reads: always with the recruiter's own client, so RLS applies ----------

export async function getPlan(supabase: SupabaseClient, companyId: string) {
  const company = check(
    await supabase.from('companies').select('plan, searches_used').eq('id', companyId).single(),
    'read plan',
  ) as { plan: 'free' | 'paid'; searches_used: number };
  return {
    plan: company.plan,
    // null = unlimited (paid). Free plan: 1 search in total.
    searches_remaining: company.plan === 'paid' ? null : Math.max(0, 1 - company.searches_used),
  };
}

/** Throws 404 unless the search exists and belongs to the caller's company (RLS). */
export async function assertOwnSearch(supabase: SupabaseClient, searchId: string): Promise<void> {
  const row = check(await supabase.from('searches').select('id').eq('id', searchId).maybeSingle(), 'read search');
  if (!row) throw notFound('Search');
}

function reasonFor(filters: Filters, total: number): string | null {
  const reason = zeroResultReason(filters);
  if (reason) return reason;
  return total === 0 ? 'No one matches all of these filters. Try removing one.' : null;
}

/**
 * One page of a stored search: { search_id, brief, filters, unsupported, reason, page,
 * page_size, total, total_pages, results }. Never touches the quota.
 */
export async function readSearchPage(supabase: SupabaseClient, searchId: string, page: number) {
  const from = (page - 1) * PAGE_SIZE + 1;
  const to = page * PAGE_SIZE;

  // Two independent reads in parallel; both go through RLS. The results read is
  // a range on the (search_id, rank) primary key.
  const [searchRes, rowsRes] = await Promise.all([
    supabase.from('searches').select('id, brief, filters, total').eq('id', searchId).maybeSingle(),
    supabase
      .from('search_results')
      .select(`rank, candidates(${CARD_COLUMNS})`)
      .eq('search_id', searchId)
      .gte('rank', from)
      .lte('rank', to)
      .order('rank'),
  ]);
  const search = check(searchRes, 'read search') as {
    id: string;
    brief: string;
    filters: unknown;
    total: number | null;
  } | null;
  if (!search) throw notFound('Search');
  if (search.total === null) {
    throw new ApiError(409, 'search_pending', 'This search is still running. Try again in a moment.');
  }
  const rows = check(rowsRes, 'read results') as unknown as { rank: number; candidates: CandidateRow }[];

  const filters = Filters.parse(search.filters);
  return {
    search_id: search.id,
    brief: search.brief,
    filters,
    unsupported: filters.unsupported,
    reason: reasonFor(filters, search.total),
    page,
    page_size: PAGE_SIZE,
    total: search.total,
    total_pages: Math.ceil(search.total / PAGE_SIZE),
    results: rows.map((r) => toCard(r.candidates)),
  };
}
