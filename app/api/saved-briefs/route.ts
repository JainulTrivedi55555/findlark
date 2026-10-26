import { z } from 'zod';
import { requireRecruiter } from '@/lib/server/auth';
import { check, handle, readJson, safeText } from '@/lib/server/http';
import { MAX_BRIEF_LENGTH } from '@/lib/server/llm';
import { Filters } from '@/lib/search/schema';

const Body = z
  .object({ brief: safeText(MAX_BRIEF_LENGTH), filters: Filters })
  .strict();

// GET /api/saved-briefs: the company's saved searches, newest first.
export const GET = handle(async (req) => {
  const { supabase } = await requireRecruiter(req);
  const rows = check(
    await supabase.from('saved_briefs').select('id, brief, filters, created_at').order('created_at', { ascending: false }),
    'list saved briefs',
  );
  return Response.json({ saved_briefs: rows });
});

// POST /api/saved-briefs { brief, filters } -> 201 { id }. Filters must use vocabulary values.
export const POST = handle(async (req) => {
  const { supabase, companyId } = await requireRecruiter(req);
  const { brief, filters } = await readJson(req, Body);
  const row = check(
    await supabase.from('saved_briefs').insert({ brief, filters, company_id: companyId }).select('id').single(),
    'save brief',
  ) as { id: string };
  return Response.json({ id: row.id }, { status: 201 });
});
