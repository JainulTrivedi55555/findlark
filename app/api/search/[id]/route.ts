import { requireRecruiter } from '@/lib/server/auth';
import { handle, pageParam, uuidParam } from '@/lib/server/http';
import { readSearchPage } from '@/lib/server/searches';

// GET /api/search/{id}?page=N: one page of 20 from the stored results.
// A cheap indexed read through RLS. Never calls the model, never touches the quota.
// A page past the end returns an empty results array.
export const GET = handle<{ id: string }>(async (req, { params }) => {
  const { supabase } = await requireRecruiter(req);
  const searchId = uuidParam((await params).id, 'Search');
  const page = pageParam(req);
  return Response.json(await readSearchPage(supabase, searchId, page));
});
