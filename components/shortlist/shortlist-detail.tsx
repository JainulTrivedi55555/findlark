'use client';
// /shortlists/{id}: one list, its people as the same cards as the search
// results, each with a Remove action. Removing animates the card out.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, X } from 'lucide-react';
import { toast } from 'sonner';
import { Page } from '@/components/page';
import { ResultCard } from '@/components/search/result-card';
import { ErrorState, StateMessage } from '@/components/search/states';
import { EditableName } from '@/components/shortlist/editable-name';
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ResultCardSkeleton } from '@/components/search/result-card';
import { api, ApiClientError } from '@/lib/api-client';
import type { ShortlistDetail } from '@/lib/api-types';
import { peopleCount } from '@/lib/format';
import { fastTransition } from '@/lib/motion';
import { rename, setOnList } from '@/lib/use-shortlists';

type State =
  | { status: 'loading' }
  | { status: 'ready'; list: ShortlistDetail }
  | { status: 'notfound' }
  | { status: 'error'; error: unknown };

const NO_SKILLS = new Set<string>();

const backLink = (
  <Link
    href="/shortlists"
    className="-ml-1 inline-flex h-11 items-center gap-1.5 rounded-md px-1 text-[13px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/25 sm:h-8"
  >
    <ArrowLeft className="size-3.5" aria-hidden />
    Shortlists
  </Link>
);

export function ShortlistDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<State>({ status: 'loading' });
  // Bumped by Retry to load again.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true; // false once the id changed or the page closed: ignore a late answer
    api
      .shortlist(id)
      .then((list) => active && setState({ status: 'ready', list }))
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof ApiClientError && err.status === 404) setState({ status: 'notfound' });
        else setState({ status: 'error', error: err });
      });
    return () => {
      active = false;
    };
  }, [id, attempt]);

  const retry = () => {
    setState({ status: 'loading' });
    setAttempt((n) => n + 1);
  };

  if (state.status === 'loading') {
    return (
      <Page wide>
        {backLink}
        <div aria-busy="true" aria-label="Loading shortlist">
          <Skeleton className="mt-2 h-8 w-64" />
          <Skeleton className="mt-3 h-4 w-24" />
          <div className="mt-8 space-y-3">
            {[0, 1, 2].map((i) => (
              <ResultCardSkeleton key={i} />
            ))}
          </div>
        </div>
      </Page>
    );
  }
  if (state.status === 'notfound') {
    return (
      <Page wide>
        {backLink}
        <StateMessage
          className="mt-4"
          art="empty"
          title="We can’t find that list"
          actions={<Link href="/shortlists" className={buttonVariants()}>Back to shortlists</Link>}
        >
          It may have been deleted, or the link is incomplete.
        </StateMessage>
      </Page>
    );
  }
  if (state.status === 'error') {
    return (
      <Page wide>
        {backLink}
        <div className="mt-4"><ErrorState error={state.error} onRetry={retry} /></div>
      </Page>
    );
  }

  // Functional update, so a rollback never overwrites other changes made meanwhile.
  const update = (fn: (list: ShortlistDetail) => ShortlistDetail) =>
    setState((s) => (s.status === 'ready' ? { status: 'ready', list: fn(s.list) } : s));
  return <Detail list={state.list} update={update} />;
}

function Detail({ list, update }: { list: ShortlistDetail; update: (fn: (list: ShortlistDetail) => ShortlistDetail) => void }) {
  async function remove(index: number) {
    const person = list.people[index];
    // Optimistic: the card leaves now; put it back where it was if the API says no.
    update((l) => ({ ...l, people: l.people.filter((p) => p.id !== person.id) }));
    try {
      await setOnList(list.id, person.id, false);
    } catch (err) {
      update((l) => {
        const people = [...l.people];
        people.splice(Math.min(index, people.length), 0, person);
        return { ...l, people };
      });
      if (!(err instanceof ApiClientError && err.status === 401)) toast.error(`Could not remove ${person.name}. Try again.`);
    }
  }

  return (
    <Page wide>
      {backLink}
      <div className="mt-1 flex items-center gap-1">
        <EditableName
          name={list.name}
          onSave={async (name) => {
            await rename(list.id, name);
            update((l) => ({ ...l, name }));
          }}
        >
          <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">{list.name}</h1>
        </EditableName>
      </div>
      <p className="mt-1 text-[15px] text-muted-foreground" aria-live="polite" aria-atomic="true">
        {peopleCount(list.people.length)}
      </p>

      <div className="mt-8">
        {list.people.length === 0 ? (
          <StateMessage
            art="shortlist"
            title="No one here yet"
            actions={<Link href="/" className={buttonVariants()}>Go to Search</Link>}
          >
            Shortlist people from a search.
          </StateMessage>
        ) : (
          <ul className="space-y-3" aria-label="People on this list">
            <AnimatePresence initial={false}>
              {list.people.map((person, i) => (
                <motion.li key={person.id} layout exit={{ opacity: 0 }} transition={fastTransition}>
                  <ResultCard
                    person={person}
                    matchSkills={NO_SKILLS}
                    actions={
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${person.name} from ${list.name}`}
                        title="Remove from list"
                        onClick={() => void remove(i)}
                        className="text-muted-foreground"
                      >
                        <X aria-hidden />
                      </Button>
                    }
                  />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </Page>
  );
}
