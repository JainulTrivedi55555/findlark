// brief -> filters -> candidate ids. The whole search pipeline without HTTP,
// so scripts (eval) and route handlers share one code path.
//
// The Supabase client is a parameter: the caller decides which one (the secret
// key client, needed for search_candidates, which only service_role may run).
import type { SupabaseClient } from '@supabase/supabase-js';
import { extractFilters, MAX_BRIEF_LENGTH, MODEL, type LlmUsage } from '@/lib/server/llm';
import { findCandidates } from './find';
import { normalizeFilters } from './normalize';
import { Filters, zeroResultReason } from './schema';

export type SearchRun = {
  filters: Filters;
  ids: string[];
  /** Why there are zero results on purpose (unsupported or no filters), else null. */
  reason: string | null;
  llm: { model: string; latencyMs: number; usage: LlmUsage };
};

const EMPTY_FILTERS = Filters.parse({});

export type Interpretation = { filters: Filters; llm: SearchRun['llm'] };

/** brief -> validated filters (one model call). Used by POST /api/search and runSearch. */
export async function interpretBrief(brief: string, model: string = MODEL): Promise<Interpretation> {
  const text = brief.trim();
  if (text.length === 0 || text.length > MAX_BRIEF_LENGTH) {
    throw new Error(`brief must be 1 to ${MAX_BRIEF_LENGTH} characters`);
  }

  const result = await extractFilters(text, model);
  const llm = { model: result.model, latencyMs: result.latencyMs, usage: result.usage };

  if (result.refused || !result.raw) {
    // A declined brief searches nothing: zero results with a reason.
    return { filters: { ...EMPTY_FILTERS, unsupported: [{ text: 'brief declined by the model' }] }, llm };
  }
  return { filters: normalizeFilters(result.raw), llm };
}

/** brief -> filters -> every matching id, without storing anything (eval, scripts). */
export async function runSearch(
  admin: SupabaseClient,
  brief: string,
  options: { model?: string } = {},
): Promise<SearchRun> {
  const { filters, llm } = await interpretBrief(brief, options.model);
  const { ids, reason } = await findCandidates(admin, filters);
  return { filters, ids, reason: reason ?? zeroResultReason(filters), llm };
}
