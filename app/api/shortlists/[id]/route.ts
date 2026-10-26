import { requireRecruiter } from '@/lib/server/auth';
import { CARD_COLUMNS, toCard, type CandidateRow } from '@/lib/server/candidates';
import { check, handle, notFound, readJson, uuidParam } from '@/lib/server/http';
import { ShortlistName } from '@/lib/server/shortlists';

type ShortlistRow = {
  id: string;
  name: string;
  created_at: string;
  shortlist_people: { added_at: string; candidates: CandidateRow }[];
};

// GET /api/shortlists/{id}: the list and the people on it, most recently added first.
export const GET = handle<{ id: string }>(async (req, { params }) => {
  const { supabase } = await requireRecruiter(req);
  const id = uuidParam((await params).id, 'Shortlist');
  const row = check(
    await supabase
      .from('shortlists')
      .select(`id, name, created_at, shortlist_people(added_at, candidates(${CARD_COLUMNS}))`)
      .eq('id', id)
      .order('added_at', { referencedTable: 'shortlist_people', ascending: false })
      .maybeSingle(),
    'read shortlist',
  ) as unknown as ShortlistRow | null;
  if (!row) throw notFound('Shortlist');
  return Response.json({
    id: row.id,
    name: row.name,
    created_at: row.created_at,
    people: row.shortlist_people.map((p) => ({ ...toCard(p.candidates), added_at: p.added_at })),
  });
});

// PATCH /api/shortlists/{id} { name }: rename.
export const PATCH = handle<{ id: string }>(async (req, { params }) => {
  const { supabase } = await requireRecruiter(req);
  const id = uuidParam((await params).id, 'Shortlist');
  const { name } = await readJson(req, ShortlistName);
  // RLS: another company's list matches no row, so nothing is updated -> 404.
  const rows = check(await supabase.from('shortlists').update({ name }).eq('id', id).select('id, name'), 'rename shortlist') as {
    id: string; name: string;
  }[];
  if (rows.length === 0) throw notFound('Shortlist');
  return Response.json(rows[0]);
});

// DELETE /api/shortlists/{id}: removes the list and its entries (cascade).
export const DELETE = handle<{ id: string }>(async (req, { params }) => {
  const { supabase } = await requireRecruiter(req);
  const id = uuidParam((await params).id, 'Shortlist');
  const rows = check(await supabase.from('shortlists').delete().eq('id', id).select('id'), 'delete shortlist') as {
    id: string;
  }[];
  if (rows.length === 0) throw notFound('Shortlist');
  return Response.json({ id, deleted: true });
});
