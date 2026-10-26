'use client';
// Previous / next and page numbers, driven by ?page=N links (refresh, back and
// share all work). Phones get a compact "Page 2 of 170" bar instead of numbers.
// Paging only reads stored results: it never re-runs the search or uses quota.
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { pageItems } from '@/lib/search/chips';
import { cn } from '@/lib/utils';

type Props = { searchId: string; page: number; totalPages: number; className?: string };

const box =
  'inline-flex h-11 min-w-11 items-center justify-center gap-1 rounded-lg px-3 text-sm font-medium outline-none ' +
  'focus-visible:ring-3 focus-visible:ring-ring/25 sm:h-9 sm:min-w-9 sm:px-2.5';

export function Pagination({ searchId, page, totalPages, className }: Props) {
  if (totalPages <= 1) return null;
  const href = (p: number) => `/search/${searchId}?page=${p}`;
  const prev = page > 1 ? page - 1 : null;
  const next = page < totalPages ? page + 1 : null;

  const step = (to: number | null, label: string, children: React.ReactNode) =>
    to ? (
      // scroll={false}: the results page scrolls to the top itself, instantly.
      <Link href={href(to)} scroll={false} aria-label={label} className={cn(box, 'border bg-card hover:bg-accent')}>
        {children}
      </Link>
    ) : (
      <span aria-disabled="true" className={cn(box, 'border text-muted-foreground/50')}>
        {children}
      </span>
    );

  return (
    <nav aria-label="Pagination" className={cn('flex items-center justify-between gap-2', className)}>
      {step(prev, 'Previous page', <><ChevronLeft className="size-4" aria-hidden /><span className="max-sm:sr-only">Previous</span></>)}

      <p className="text-sm text-muted-foreground sm:hidden">
        Page <span className="font-medium text-foreground">{page}</span> of {totalPages.toLocaleString('en-US')}
      </p>
      <ol className="hidden items-center gap-1 sm:flex">
        {pageItems(page, totalPages).map((item, i) =>
          item === 'gap' ? (
            <li key={`gap-${i}`} className="px-1 text-muted-foreground" aria-hidden>
              …
            </li>
          ) : (
            <li key={item}>
              <Link
                href={href(item)}
                scroll={false}
                aria-current={item === page ? 'page' : undefined}
                aria-label={`Page ${item}`}
                className={cn(box, item === page ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-accent')}
              >
                {item}
              </Link>
            </li>
          ),
        )}
      </ol>

      {step(next, 'Next page', <><span className="max-sm:sr-only">Next</span><ChevronRight className="size-4" aria-hidden /></>)}
    </nav>
  );
}
