'use client';
// Always-visible plan status in the top bar. Click opens the upgrade dialog.
// Reads GET /api/plan through usePlan(); call refreshPlan() (lib/use-plan.ts)
// after anything that changes it, such as running a search.
import { openUpgrade } from '@/lib/app-store';
import type { Plan } from '@/lib/api-types';
import { refreshPlan, usePlan } from '@/lib/use-plan';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

export function planLabel(plan: Plan): string {
  if (plan.plan === 'paid') return 'Pro';
  const left = plan.searches_remaining ?? 0;
  if (left <= 0) return 'No free searches left';
  return left === 1 ? '1 free search left' : `${left} free searches left`;
}

const pill =
  'inline-flex h-8 items-center rounded-full border px-3 text-[13px] font-medium whitespace-nowrap transition-colors ' +
  'outline-none focus-visible:ring-3 focus-visible:ring-ring/25 focus-visible:border-ring ' +
  // A 44px tap area on touch screens without making the pill itself taller.
  'relative after:absolute after:-inset-y-1.5 after:inset-x-0 after:content-[""]';

export function PlanPill({ className }: { className?: string }) {
  const state = usePlan();

  if (state.status === 'loading') {
    return <Skeleton className={cn('h-8 w-32 rounded-full', className)} aria-label="Loading plan" />;
  }

  if (state.status === 'error') {
    return (
      <button type="button" onClick={() => void refreshPlan()} className={cn(pill, 'text-muted-foreground hover:bg-accent', className)}>
        Plan unavailable · Retry
      </button>
    );
  }

  const { plan } = state;
  const isPro = plan.plan === 'paid';
  const out = !isPro && (plan.searches_remaining ?? 0) <= 0;
  return (
    <button
      type="button"
      onClick={openUpgrade}
      aria-label={`${planLabel(plan)}. ${isPro ? 'View plan details' : 'How to upgrade'}`}
      aria-haspopup="dialog"
      className={cn(
        pill,
        isPro
          ? 'border-primary/25 bg-primary/5 text-primary hover:bg-primary/10'
          : out
            ? 'border-border bg-muted text-foreground hover:bg-accent'
            : 'border-border bg-card text-foreground hover:bg-accent',
        className,
      )}
    >
      {planLabel(plan)}
    </button>
  );
}
