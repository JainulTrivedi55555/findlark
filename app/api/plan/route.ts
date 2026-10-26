import { requireRecruiter } from '@/lib/server/auth';
import { handle } from '@/lib/server/http';
import { getPlan } from '@/lib/server/searches';

// GET /api/plan: { plan, searches_remaining } (null when paid).
export const GET = handle(async (req) => {
  const { supabase, companyId } = await requireRecruiter(req);
  return Response.json(await getPlan(supabase, companyId));
});
