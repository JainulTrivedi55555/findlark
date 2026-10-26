'use client';
// The signed-in frame: top bar (product name, nav, plan pill, account menu),
// the page, the phone bottom nav and the upgrade dialog.
import Link from 'next/link';
import { BottomNav, TopNav } from '@/components/app-nav';
import { RequireAuth } from '@/components/auth-guard';
import { Logo } from '@/components/logo';
import { PlanPill } from '@/components/plan-pill';
import { UpgradeDialog } from '@/components/upgrade-dialog';
import { UserMenu } from '@/components/user-menu';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      {/* Fixed and sticky bars are fully opaque (no alpha, no blur), so scrolled
          content never shows through them on a phone; the hairline border keeps
          them distinct. Safe-area padding clears the iPhone notch and home bar. */}
      <header className="sticky top-0 z-40 border-b bg-background pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-4 sm:px-6">
          <Link
            href="/"
            aria-label="Findlark, home"
            className="-mx-1 rounded-md px-1 outline-none focus-visible:ring-3 focus-visible:ring-ring/25"
          >
            <Logo size={24} />
          </Link>
          <TopNav />
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <PlanPill />
            <UserMenu />
          </div>
        </div>
      </header>
      {/* Bottom padding keeps content clear of the fixed phone nav. */}
      <main className="flex flex-1 flex-col pr-[env(safe-area-inset-right)] pb-[calc(56px+env(safe-area-inset-bottom))] pl-[env(safe-area-inset-left)] sm:pb-0">{children}</main>
      <BottomNav />
      <UpgradeDialog />
    </RequireAuth>
  );
}
