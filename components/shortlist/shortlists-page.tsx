'use client';
// /shortlists: the company's lists, newest first. Create (inline form), rename
// (pencil), delete (in-place confirm that says how many people are on it).
import { useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Page, PageTitle } from '@/components/page';
import { EditableName } from '@/components/shortlist/editable-name';
import { ErrorState, StateMessage } from '@/components/search/states';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiClientError } from '@/lib/api-client';
import type { ShortlistSummary } from '@/lib/api-types';
import { peopleCount, relativeDate } from '@/lib/format';
import { fade, fastTransition } from '@/lib/motion';
import { validateName } from '@/lib/shortlists-logic';
import { createList, deleteList, loadShortlists, rename, useShortlists } from '@/lib/use-shortlists';

export function ShortlistsPage() {
  const store = useShortlists();
  const { status, lists, retry } = store;
  const [creating, setCreating] = useState(false);

  const showSkeleton = lists.length === 0 && (status === 'idle' || status === 'loading');
  const showError = status === 'error' && lists.length === 0;
  const empty = status === 'ready' && lists.length === 0 && !creating;

  return (
    <Page>
      <div className="flex items-center justify-between gap-3">
        <PageTitle>Shortlists</PageTitle>
        {!creating && lists.length > 0 && (
          <Button onClick={() => setCreating(true)}>
            <Plus data-icon="inline-start" aria-hidden />
            New list
          </Button>
        )}
      </div>

      {creating && <NewListForm onDone={() => setCreating(false)} />}

      <div className="mt-6" aria-busy={showSkeleton}>
        {showSkeleton ? (
          <div className="space-y-3" aria-label="Loading shortlists">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-xl border p-4">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="mt-2 h-3.5 w-36" />
              </div>
            ))}
          </div>
        ) : showError ? (
          <ErrorState error={store.status === 'error' ? store.error : null} onRetry={() => void retry()} />
        ) : empty ? (
          <StateMessage
            art="shortlist"
            title="No shortlists yet"
            actions={
              <>
                <Button onClick={() => setCreating(true)}>
                  <Plus data-icon="inline-start" aria-hidden />
                  New list
                </Button>
                <Link href="/" className={buttonVariants({ variant: 'outline' })}>
                  Go to Search
                </Link>
              </>
            }
          >
            Shortlist people from a search to keep them together.
          </StateMessage>
        ) : (
          <ul className="space-y-3">
            <AnimatePresence initial={false}>
              {lists.map((list) => (
                <ListRow key={list.id} list={list} />
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </Page>
  );
}

function NewListForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    const checked = validateName(name);
    if (!checked.ok) return setError(checked.message);
    setSaving(true);
    try {
      await createList(checked.name);
      onDone();
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 400) setError(err.message);
      else if (!(err instanceof ApiClientError && err.status === 401)) setError('Could not create the list. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <motion.form {...fade} onSubmit={submit} className="mt-5" aria-label="New list">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor="new-list-name" className="sr-only">
            New list name
          </label>
          <Input
            id="new-list-name"
            autoFocus
            value={name}
            disabled={saving}
            placeholder="List name, e.g. Hiring Q4"
            autoComplete="off"
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => e.key === 'Escape' && onDone()}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'new-list-name-error' : undefined}
          />
          {error && (
            <p id="new-list-name-error" role="alert" className="mt-1.5 text-[13px] text-destructive">
              {error}
            </p>
          )}
        </div>
        <Button type="submit" disabled={saving}>
          {saving ? 'Creating…' : 'Create'}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </motion.form>
  );
}

function ListRow({ list }: { list: ShortlistSummary }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function remove() {
    setDeleting(true);
    try {
      await deleteList(list.id);
    } catch (err) {
      setDeleting(false);
      setConfirming(false);
      if (!(err instanceof ApiClientError && err.status === 401)) toast.error('Could not delete the list. Try again.');
      // The list may already be gone (deleted in another tab): sync with the server.
      void loadShortlists();
    }
  }

  return (
    <motion.li layout exit={{ opacity: 0 }} transition={fastTransition} className="rounded-xl border bg-card">
      <div className="flex items-center gap-1 p-3 pl-4 sm:pl-5">
        <EditableName name={list.name} onSave={(name) => rename(list.id, name)}>
          <Link
            href={`/shortlists/${list.id}`}
            className="block rounded-md py-1 outline-none focus-visible:ring-3 focus-visible:ring-ring/25"
          >
            <span className="block truncate text-[15px] font-medium hover:text-primary">{list.name}</span>
            <span className="mt-0.5 block text-[13px] text-muted-foreground">
              {peopleCount(list.people_count)} · created {relativeDate(list.created_at)}
            </span>
          </Link>
        </EditableName>
        {!confirming && (
          <Button variant="ghost" size="icon" aria-label={`Delete ${list.name}`} onClick={() => setConfirming(true)} className="text-muted-foreground">
            <Trash2 aria-hidden />
          </Button>
        )}
      </div>

      {confirming && (
        <div role="alertdialog" aria-label={`Delete ${list.name}?`} className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 sm:px-5">
          <p className="text-sm">
            {list.people_count === 0
              ? 'Delete this list? No one is on it.'
              : `Delete this list? ${peopleCount(list.people_count)} ${list.people_count === 1 ? 'is' : 'are'} on it. They stay in search.`}
          </p>
          <div className="flex gap-2">
            <Button variant="destructive" disabled={deleting} autoFocus onClick={() => void remove()}>
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
            <Button variant="ghost" disabled={deleting} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </motion.li>
  );
}
