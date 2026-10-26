import { requireRecruiter } from '@/lib/server/auth';
import { check, handle, notFound, uuidParam } from '@/lib/server/http';

// DELETE /api/saved-briefs/{id}
export const DELETE = handle<{ id: string }>(async (req, { params }) => {
  const { supabase } = await requireRecruiter(req);
  const id = uuidParam((await params).id, 'Saved search');
  // RLS: another company's row matches nothing -> 404.
  const rows = check(await supabase.from('saved_briefs').delete().eq('id', id).select('id'), 'delete saved brief') as {
    id: string;
  }[];
  if (rows.length === 0) throw notFound('Saved search');
  return Response.json({ id, deleted: true });
});
