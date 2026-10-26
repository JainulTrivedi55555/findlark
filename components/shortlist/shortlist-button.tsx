'use client';
// The bookmark button: on every result card (icon only) and on the candidate
// page (with the label "Shortlist"). Filled when the person is on at least one
// list. Opens a popover (a bottom sheet on phones) with the company's lists:
// tap a row to add or remove the person, or type a name to make a new list and
// add them to it. State comes from the shared cache (lib/shortlists-store.ts),
// so every button for the same person agrees at once.
import { useEffect, useRef, useState } from 'react';
import { useAnimate, useReducedMotion } from 'motion/react';
import { Bookmark, Check } from 'lucide-react';
import { toast } from 'sonner';
import { ResponsivePopover } from '@/components/search/responsive-popover';
import { buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiClientError } from '@/lib/api-client';
import type { ShortlistSummary } from '@/lib/api-types';
import { EASE_OUT } from '@/lib/motion';
import { listsForPerson, validateName } from '@/lib/shortlists-logic';
import { createList, setOnList, useShortlists } from '@/lib/use-shortlists';
import { cn } from '@/lib/utils';

type Props = {
  personId: string;
  personName: string;
  /** 'icon' on cards, 'labelled' on the candidate page. */
  variant?: 'icon' | 'labelled';
  className?: string;
};

// A 401 already sent the recruiter to /login; no toast on top of that.
const isSignedOut = (err: unknown) => err instanceof ApiClientError && err.status === 401;

export function ShortlistButton({ personId, personName, variant = 'icon', className }: Props) {
  const [open, setOpen] = useState(false);
  const { lists } = useShortlists();
  const on = listsForPerson(lists, personId);
  const filled = on.length > 0;

  // Pop when the icon becomes filled (not on first render).
  const reduce = useReducedMotion();
  const [scope, animate] = useAnimate<HTMLSpanElement>();
  const wasFilled = useRef(filled);
  useEffect(() => {
    if (filled && !wasFilled.current && !reduce && scope.current) {
      void animate(scope.current, { scale: [1, 1.15, 1] }, { duration: 0.2, ease: EASE_OUT });
    }
    wasFilled.current = filled;
  }, [filled, reduce, animate, scope]);

  const status = filled ? `on ${on.length} ${on.length === 1 ? 'list' : 'lists'}` : 'not on a list';
  const trigger = (
    <button
      type="button"
      aria-pressed={filled}
      aria-label={`Shortlist ${personName}, ${status}`}
      title={filled ? `Shortlisted on ${on.length} ${on.length === 1 ? 'list' : 'lists'}` : 'Shortlist'}
      className={cn(
        variant === 'icon'
          ? buttonVariants({ variant: 'ghost', size: 'icon' })
          : buttonVariants({ variant: 'outline' }),
        filled && 'text-primary',
        className,
      )}
    >
      <span ref={scope} className="inline-flex">
        <Bookmark className={cn(filled && 'fill-current')} aria-hidden />
      </span>
      {variant === 'labelled' && 'Shortlist'}
    </button>
  );

  return (
    <ResponsivePopover open={open} onOpenChange={setOpen} trigger={trigger} title={`Shortlist ${personName}`} align="end">
      <ShortlistPanel personId={personId} />
    </ResponsivePopover>
  );
}

function ShortlistPanel({ personId }: { personId: string }) {
  const { status, lists, retry } = useShortlists();
  // Rows with a request in flight are disabled, so quick taps cannot send an add and a remove out of order.
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const markPending = (id: string, value: boolean) =>
    setPending((p) => {
      const next = new Set(p);
      if (value) next.add(id);
      else next.delete(id);
      return next;
    });

  /** Adds or removes, with a toast naming the list and an Undo. */
  async function toggle(list: ShortlistSummary, add: boolean) {
    markPending(list.id, true);
    try {
      await setOnList(list.id, personId, add);
      toast.success(add ? `Added to ${list.name}` : `Removed from ${list.name}`, {
        action: {
          label: 'Undo',
          onClick: () =>
            void setOnList(list.id, personId, !add).catch((err) => {
              if (!isSignedOut(err)) toast.error('Could not undo. Try again.');
            }),
        },
      });
    } catch (err) {
      // setOnList already put the row back as it was.
      if (!isSignedOut(err)) toast.error(add ? `Could not add to ${list.name}` : `Could not remove from ${list.name}`);
    } finally {
      markPending(list.id, false);
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (creating) return;
    const checked = validateName(name);
    if (!checked.ok) return setNameError(checked.message);
    setCreating(true);
    setNameError(null);
    try {
      const list = await createList(checked.name);
      setName('');
      await toggle(list, true);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 400) setNameError(err.message);
      else if (!isSignedOut(err)) toast.error('Could not create the list. Try again.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col">
      {status === 'error' && lists.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted-foreground" role="alert">
          Couldn’t load your lists.{' '}
          <button type="button" onClick={() => void retry()} className="font-medium text-foreground underline underline-offset-4 hover:text-primary max-sm:py-2.5">
            Retry
          </button>
        </p>
      ) : status !== 'ready' && lists.length === 0 ? (
        <div className="space-y-2 p-3" aria-busy="true" aria-label="Loading your lists">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : lists.length === 0 ? (
        <p className="px-4 pt-3 pb-1 text-sm text-muted-foreground">Create your first list to start shortlisting.</p>
      ) : (
        <ul aria-label="Your shortlists" className="max-h-64 overflow-y-auto p-1.5">
          {lists.map((list) => {
            const checked = list.person_ids.includes(personId);
            return (
              <li key={list.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  disabled={pending.has(list.id)}
                  onClick={() => void toggle(list, !checked)}
                  className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2.5 text-left text-sm outline-none hover:bg-accent focus-visible:bg-accent focus-visible:ring-3 focus-visible:ring-ring/25 disabled:opacity-60 sm:min-h-9"
                >
                  <span
                    className={cn(
                      'flex size-5 shrink-0 items-center justify-center rounded-md border',
                      checked ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-card',
                    )}
                    aria-hidden
                  >
                    {checked && <Check className="size-3.5" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{list.name}</span>
                  <span className="text-[12px] text-muted-foreground tabular-nums">{list.people_count}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <form onSubmit={create} className={cn('p-2.5', lists.length > 0 && 'border-t')}>
        <label htmlFor={`new-list-${personId}`} className="sr-only">
          New list name
        </label>
        <Input
          id={`new-list-${personId}`}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setNameError(null);
          }}
          disabled={creating}
          placeholder="New list"
          autoComplete="off"
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? `new-list-error-${personId}` : undefined}
        />
        {nameError ? (
          <p id={`new-list-error-${personId}`} role="alert" className="mt-1.5 px-1 text-[13px] text-destructive">
            {nameError}
          </p>
        ) : (
          name.trim() && <p className="mt-1.5 px-1 text-[12px] text-muted-foreground">Press Enter to create and add.</p>
        )}
      </form>
    </div>
  );
}
