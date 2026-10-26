'use client';
// Designed empty, error and not-found states for the search screens.
import type { ReactNode } from 'react';
import Link from 'next/link';
import { ErrorCard } from '@/components/error-card';
import { Illustration, type ArtName } from '@/components/illustrations';
import { buttonVariants } from '@/components/ui/button';
import { useRichBackdrop } from '@/lib/backdrop-store';
import { describeError } from '@/lib/error-copy';
import { cn } from '@/lib/utils';

type Props = { art?: ArtName; title: string; children?: ReactNode; actions?: ReactNode; className?: string };

// Empty, error and not-found screens ask the backdrop for its full-strength light.
export function StateMessage({ art, title, children, actions, className }: Props) {
  useRichBackdrop();
  return (
    <div className={cn('flex flex-col items-center rounded-xl border bg-card px-6 py-10 text-center', className)}>
      {art && <Illustration name={art} className="mb-3" />}
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      {children && <div className="mt-1.5 max-w-md text-sm text-muted-foreground">{children}</div>}
      {actions && <div className="mt-5 flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  );
}

/** A page that failed to load: the shared error card, with Retry. */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  useRichBackdrop();
  return <ErrorCard copy={describeError(error)} onRetry={onRetry} className="mx-auto max-w-xl" />;
}

export function SearchNotFound() {
  return (
    <StateMessage
      art="empty"
      title="We can’t find that search"
      actions={
        <Link href="/" className={buttonVariants()}>
          Start a new search
        </Link>
      }
    >
      The link may be incomplete, or the search belongs to another company.
    </StateMessage>
  );
}
