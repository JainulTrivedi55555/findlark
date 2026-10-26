'use client';
// Saves the brief with the filters as currently APPLIED (not unapplied edits),
// so re-running a saved search gives the results the recruiter saw.
// Turns into "Saved" until the applied filters change again.
import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Bookmark, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { api, ApiClientError } from '@/lib/api-client';
import { fastTransition } from '@/lib/motion';
import type { Filters } from '@/lib/search/schema';

type Props = { brief: string; filters: Filters };

export function SaveSearchButton({ brief, filters }: Props) {
  const key = JSON.stringify(filters);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const saved = savedKey === key;

  async function save() {
    if (saved || saving) return;
    setSaving(true);
    try {
      await api.saveBrief(brief, filters);
      setSavedKey(key);
      toast.success('Search saved', { description: 'Find it under Saved searches on the Search page.' });
    } catch (err) {
      if (!(err instanceof ApiClientError && err.status === 401)) toast.error('Could not save this search. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Button variant="outline" onClick={save} disabled={saving} aria-live="polite" className={saved ? 'text-primary' : undefined}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={saved ? 'saved' : 'save'}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.6 }}
          transition={fastTransition}
          className="inline-flex"
        >
          {saved ? <Check aria-hidden /> : <Bookmark aria-hidden />}
        </motion.span>
      </AnimatePresence>
      {saved ? 'Saved' : saving ? 'Saving…' : 'Save search'}
    </Button>
  );
}
