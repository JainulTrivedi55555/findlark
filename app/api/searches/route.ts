import { requireRecruiter } from '@/lib/server/auth';
import { check, handle } from '@/lib/server/http';

const LIMIT = 10;

// GET /api/searches: the company's last 10 searches, newest first, so a recruiter
// can reopen one without running (and paying for) a new search.
// Read with the user-scoped client: RLS limits it to the caller's company.
// total is null while a search is still running; those are left out.
export const GET = handle(async (req) => {
  const { supabase } = await requireRecruiter(req);
  const rows = check(
    await supabase
      .from('searches')
      .select('id, brief, total, created_at')
      .not('total', 'is', null)
      .order('created_at', { ascending: false })
      .limit(LIMIT),
    'list searches',
  ) as { id: string; brief: string; total: number; created_at: string }[];
  return Response.json({ searches: rows });
});
