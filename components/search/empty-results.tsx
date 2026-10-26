'use client';
// Zero results, with the most likely cause and a one-click way out.
// Three cases, in the order the API decides them (lib/search/schema.ts):
//   1. part of the brief can't be filtered on -> offer to search without it
//   2. nothing to filter on                    -> start again
//   3. no one matches every filter            -> remove the likely narrowest one
import Link from 'next/link';
import { StateMessage } from '@/components/search/states';
import { Button, buttonVariants } from '@/components/ui/button';
import { chipText, filtersToChips, likelyNarrowest, removeChip } from '@/lib/search/chips';
import type { Filters } from '@/lib/search/schema';

type Props = {
  filters: Filters;
  reason: string | null;
  busy: boolean;
  onApply: (filters: Filters) => void;
};

export function EmptyResults({ filters, reason, busy, onApply }: Props) {
  const newSearch = (
    <Link href="/" className={buttonVariants({ variant: 'outline' })}>
      Start a new search
    </Link>
  );

  if (filters.unsupported.length > 0) {
    const many = filters.unsupported.length > 1;
    return (
      <StateMessage
        art="empty"
        title="We can’t search by part of your brief"
        actions={
          <>
            <Button disabled={busy} onClick={() => onApply({ ...filters, unsupported: [] })}>
              Search without {many ? 'them' : `“${filters.unsupported[0].text}”`}
            </Button>
            {newSearch}
          </>
        }
      >
        <p>{reason}</p>
        <p className="mt-1">
          Every part of a brief must match, so we show no one rather than the wrong people. Searching without
          {many ? ' them' : ` “${filters.unsupported[0].text}”`} keeps your other filters and doesn’t use a search.
        </p>
      </StateMessage>
    );
  }

  const chips = filtersToChips(filters);
  const narrowest = likelyNarrowest(chips);
  if (!narrowest) {
    return (
      <StateMessage art="empty" title="Nothing to filter on" actions={newSearch}>
        {reason ?? 'Add a filter above, or start a new search with a role, city, skill, seniority or school.'}
      </StateMessage>
    );
  }

  const label = chipText(narrowest);
  return (
    <StateMessage
      art="empty"
      title="No one matches every filter"
      actions={
        <>
          <Button disabled={busy} onClick={() => onApply(removeChip(filters, narrowest))}>
            Remove “{label}”
          </Button>
          {newSearch}
        </>
      }
    >
      {chips.length > 1 ? (
        <><span className="font-medium text-foreground">{label}</span> is probably the narrowest. Remove it or edit a filter above. Editing filters doesn’t use a search.</>
      ) : (
        <>No candidate matches <span className="font-medium text-foreground">{label}</span>.</>
      )}
    </StateMessage>
  );
}
