import { requireRecruiter } from '@/lib/server/auth';
import { check, handle, notFound, personParam, uuidParam } from '@/lib/server/http';
import { assertOwnShortlist } from '@/lib/server/shortlists';

type Params = { id: string; personId: string };

// POST /api/shortlists/{id}/people/{personId}: add. Adding twice changes nothing (200 both times).
export const POST = handle<Params>(async (req, { params }) => {
  const { supabase } = await requireRecruiter(req);
  const p = await params;
  const shortlistId = uuidParam(p.id, 'Shortlist');
  const personId = personParam(p.personId);

  const [, person] = await Promise.all([
    assertOwnShortlist(supabase, shortlistId),
    supabase.from('candidates').select('id').eq('id', personId).maybeSingle(),
  ]);
  if (!check(person, 'read person')) throw notFound('Person');

  // INSERT ... ON CONFLICT DO NOTHING: idempotent, and RLS WITH CHECK still applies.
  check(
    await supabase
      .from('shortlist_people')
      .upsert({ shortlist_id: shortlistId, candidate_id: personId }, {
        onConflict: 'shortlist_id,candidate_id',
        ignoreDuplicates: true,
      }),
    'add to shortlist',
  );
  return Response.json({ shortlist_id: shortlistId, person_id: personId, on_list: true });
});

// DELETE /api/shortlists/{id}/people/{personId}: remove. Removing someone not on the list is fine (200).
export const DELETE = handle<Params>(async (req, { params }) => {
  const { supabase } = await requireRecruiter(req);
  const p = await params;
  const shortlistId = uuidParam(p.id, 'Shortlist');
  const personId = personParam(p.personId);

  await assertOwnShortlist(supabase, shortlistId);
  check(
    await supabase.from('shortlist_people').delete().eq('shortlist_id', shortlistId).eq('candidate_id', personId),
    'remove from shortlist',
  );
  return Response.json({ shortlist_id: shortlistId, person_id: personId, on_list: false });
});
