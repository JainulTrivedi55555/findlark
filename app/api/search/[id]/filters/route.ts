import { z } from 'zod';
import { requireRecruiter } from '@/lib/server/auth';
import { handle, readJson, uuidParam } from '@/lib/server/http';
import { assertOwnSearch, finishSearch, getPlan, readSearchPage } from '@/lib/server/searches';
import { Filters } from '@/lib/search/schema';

// The Filters schema only accepts vocabulary values, so nothing unknown reaches SQL.
const Body = z.object({ filters: Filters }).strict();

// POST /api/search/{id}/filters { filters }
// Re-runs an existing search with edited filters. SQL only: no model call and,
// by design, no quota use (only a brief the model interprets uses a search).
export const POST = handle<{ id: string }>(async (req, { params }) => {
  const { supabase, companyId } = await requireRecruiter(req);
  const searchId = uuidParam((await params).id, 'Search');
  const { filters } = await readJson(req, Body);

  await assertOwnSearch(supabase, searchId); // 404 for another company's search
  await finishSearch(searchId, filters);

  const [page, plan] = await Promise.all([readSearchPage(supabase, searchId, 1), getPlan(supabase, companyId)]);
  return Response.json({ ...page, searches_remaining: plan.searches_remaining });
});
