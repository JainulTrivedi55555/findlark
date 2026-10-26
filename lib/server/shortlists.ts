import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { check, notFound, safeText } from './http';

export const ShortlistName = z.object({ name: safeText(80) }).strict();

/** Throws 404 unless the shortlist is visible to the caller (their company, via RLS). */
export async function assertOwnShortlist(supabase: SupabaseClient, shortlistId: string): Promise<void> {
  const row = check(
    await supabase.from('shortlists').select('id').eq('id', shortlistId).maybeSingle(),
    'read shortlist',
  );
  if (!row) throw notFound('Shortlist');
}
