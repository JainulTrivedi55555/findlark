'use client';
// Explains the plans and how upgrading works. There is no checkout in this
// demo: a Stripe subscription event for the company flips it to Pro (see
// POST /api/billing/events). Opens from the plan pill and, automatically, when
// the API answers 402 free_limit_reached (lib/api-client.ts).
// Base UI's dialog gives the focus trap, Esc to close and the aria wiring.
import { closeUpgrade, useAppStore } from '@/lib/app-store';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const FREE = ['1 search per company', 'Paging and filter edits are free', 'Shortlists and saved searches'];
const PRO = ['Unlimited searches', 'Everything in Free'];

function PlanColumn({ name, items, current }: { name: string; items: string[]; current: boolean }) {
  return (
    <section aria-label={`${name} plan`} className="rounded-xl border p-4">
      <h3 className="flex items-center justify-between text-sm font-semibold">
        {name}
        {current && <span className="text-xs font-normal text-muted-foreground">Current plan</span>}
      </h3>
      <ul className="mt-2.5 space-y-1.5 text-[13px] text-muted-foreground">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

export function UpgradeDialog() {
  const open = useAppStore((s) => s.upgradeOpen);
  const plan = useAppStore((s) => s.plan);
  const isPro = plan.status === 'ready' && plan.plan.plan === 'paid';
  const outOfSearches = plan.status === 'ready' && !isPro && (plan.plan.searches_remaining ?? 0) <= 0;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && closeUpgrade()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isPro ? 'You’re on Pro' : 'Upgrade to Pro'}</DialogTitle>
          <DialogDescription>
            {isPro
              ? 'Your company has unlimited searches while its Stripe subscription is active.'
              : outOfSearches
                ? 'Your company has used its one free search. Pro has no limit.'
                : 'The free plan includes one search per company. Pro has no limit.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <PlanColumn name="Free" items={FREE} current={!isPro} />
          <PlanColumn name="Pro" items={PRO} current={isPro} />
        </div>

        <section aria-labelledby="how-to-upgrade" className="rounded-xl bg-muted p-4">
          <h3 id="how-to-upgrade" className="text-sm font-semibold">
            How to upgrade
          </h3>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
            There is no checkout in this demo. Your company moves to Pro when Stripe sends an active subscription
            event with <code className="font-mono text-[12px] text-foreground">metadata.company</code> set to your
            company. It returns to Free when the subscription ends.
          </p>
        </section>

        <DialogFooter>
          <DialogClose render={<Button className="w-full sm:w-auto" />}>Close</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
