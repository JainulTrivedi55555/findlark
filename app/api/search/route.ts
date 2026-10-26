import { z } from 'zod';
import { requireRecruiter } from '@/lib/server/auth';
import { ApiError } from '@/lib/server/errors';
import { handle, readJson, safeText } from '@/lib/server/http';
import { Timing } from '@/lib/server/timing';
import { MAX_BRIEF_LENGTH, llmErrorDetails } from '@/lib/server/llm';
import { finishSearch, getPlan, readSearchPage, refundSearch, reserveSearch } from '@/lib/server/searches';
import { interpretBrief } from '@/lib/search/run';
import type { Filters } from '@/lib/search/schema';

const Body = z.object({ brief: safeText(MAX_BRIEF_LENGTH) }).strict();

// POST /api/search { brief }
// The only route that calls the model, and the only one that uses the free search.
export const POST = handle(async (req) => {
  const timing = new Timing();
  const { supabase, userId, companyId } = await requireRecruiter(req);
  const { brief } = await readJson(req, Body);
  timing.mark('auth');

  // 1. Reserve first: an out-of-quota company gets 402 here and never costs a model call.
  const searchId = await reserveSearch(companyId, userId, brief);
  timing.mark('reserve');

  // 2. Brief -> validated filters (model). Any failure here, including a timeout,
  //    a missing key or unusable output, gives the search back and returns 502.
  let filters: Filters;
  const modelStarted = performance.now();
  try {
    ({ filters } = await interpretBrief(brief));
  } catch (err) {
    // Elapsed covers every SDK attempt (timeout x attempts for a double timeout).
    const ms = Math.round(performance.now() - modelStarted);
    await refundSearch(searchId);
    const { name, status, requestId } = llmErrorDetails(err);
    console.error(`model step failed: class=${name} status=${status} request_id=${requestId} ms=${ms}`);
    throw new ApiError(502, 'search_unavailable', 'The search service did not respond. Try again; your search was not used.');
  }
  timing.mark('model');

  // 3. Filters -> stored ranked results (SQL). On failure: refund, then a generic 500.
  try {
    await finishSearch(searchId, filters);
  } catch (err) {
    await refundSearch(searchId);
    throw err;
  }
  timing.mark('finish');

  const [page, plan] = await Promise.all([readSearchPage(supabase, searchId, 1), getPlan(supabase, companyId)]);
  timing.mark('read');
  return Response.json(
    { ...page, searches_remaining: plan.searches_remaining },
    { headers: { 'Server-Timing': timing.header() } },
  );
});
