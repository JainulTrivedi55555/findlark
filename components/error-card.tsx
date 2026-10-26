'use client';
// The one error component: an icon, a plain-language title and message, and a
// visible main button (Retry, or Sign in again when retrying cannot help).
// The copy comes from lib/error-copy.ts, so no status code or raw response
// body ever reaches the screen.
import { Clock, LogIn, RotateCw, ServerCrash, TriangleAlert, WifiOff, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { signOutAndRedirect } from '@/lib/api-client';
import type { ErrorCopy, ErrorKind } from '@/lib/error-copy';
import { cn } from '@/lib/utils';

const ICONS: Record<ErrorKind, LucideIcon> = {
  offline: WifiOff,
  network: WifiOff,
  timeout: Clock,
  session: LogIn,
  forbidden: LogIn,
  rate_limit: Clock,
  server: ServerCrash,
  bad_request: TriangleAlert,
  unknown: TriangleAlert,
};

type Props = {
  copy: ErrorCopy;
  onRetry?: () => void;
  /** Smaller padding, for a section inside a page (e.g. Recent searches). */
  compact?: boolean;
  className?: string;
};

export function ErrorCard({ copy, onRetry, compact = false, className }: Props) {
  const Icon = ICONS[copy.kind];
  return (
    <div
      role="alert"
      data-error-kind={copy.kind}
      className={cn(
        'flex gap-3 rounded-xl border border-destructive/30 bg-surface text-left',
        compact ? 'p-3.5' : 'p-4 sm:gap-4 sm:p-5',
        className,
      )}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <Icon className="size-4.5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold text-foreground">{copy.title}</p>
        <p className="mt-0.5 text-sm text-foreground/80">{copy.message}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {copy.action === 'sign_in' ? (
            <Button onClick={() => void signOutAndRedirect()}>
              <LogIn data-icon="inline-start" aria-hidden />
              Sign in again
            </Button>
          ) : (
            onRetry && (
              <Button onClick={onRetry}>
                <RotateCw data-icon="inline-start" aria-hidden />
                Retry
              </Button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
