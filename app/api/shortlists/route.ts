import { requireRecruiter } from '@/lib/server/auth';
import { check, handle, readJson } from '@/lib/server/http';
import { ShortlistName } from '@/lib/server/shortlists';

type ListRow = { id: string; name: string; created_at: string; shortlist_people: { candidate_id: string }[] };

// GET /api/shortlists: the company's lists, newest first, with who is on each
// (ids are enough for the UI to mark a card as shortlisted).
export const GET = handle(async (req) => {
  const { supabase } = await requireRecruiter(req);
  const rows = check(
    await supabase
      .from('shortlists')
      .select('id, name, created_at, shortlist_people(candidate_id)')
      .order('created_at', { ascending: false }),
    'list shortlists',
  ) as ListRow[];
  return Response.json({
    shortlists: rows.map((r) => ({
      id: r.id,
      name: r.name,
      created_at: r.created_at,
      people_count: r.shortlist_people.length,
      person_ids: r.shortlist_people.map((p) => p.candidate_id),
    })),
  });
});

// POST /api/shortlists { name } -> 201 { id }
export const POST = handle(async (req) => {
  const { supabase, companyId } = await requireRecruiter(req);
  const { name } = await readJson(req, ShortlistName);
  // company_id comes from the verified token; RLS WITH CHECK rejects any other value.
  const row = check(
    await supabase.from('shortlists').insert({ name, company_id: companyId }).select('id').single(),
    'create shortlist',
  ) as { id: string };
  return Response.json({ id: row.id }, { status: 201 });
});
