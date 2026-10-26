'use client';
// Primary navigation: Search and Shortlists.
// Desktop: links in the top bar, the active one in the accent colour with an
// underline that slides between links (motion layoutId).
// Phones (< 640px): a fixed bottom bar, 56px plus the safe area, 44px+ targets.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'motion/react';
import { ListChecks, Search } from 'lucide-react';
import { ShortlistCountAnnouncement, ShortlistCountBadge, useShortlistedCount } from '@/components/shortlist/shortlist-count';
import { transition } from '@/lib/motion';
import { cn } from '@/lib/utils';

const ITEMS = [
  { href: '/', label: 'Search', icon: Search, match: (p: string) => p === '/' || p.startsWith('/search') },
  { href: '/shortlists', label: 'Shortlists', icon: ListChecks, match: (p: string) => p.startsWith('/shortlists') },
] as const;

export function TopNav() {
  const pathname = usePathname();
  const shortlisted = useShortlistedCount();
  return (
    <nav aria-label="Main" className="hidden h-full items-stretch gap-1 sm:flex">
      {ITEMS.map((item) => {
        const active = item.match(pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'relative flex items-center px-3 text-sm font-medium transition-colors outline-none',
              'focus-visible:text-primary focus-visible:underline',
              active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {item.label}
            {item.href === '/shortlists' && <ShortlistCountBadge count={shortlisted} />}
            {active && (
              <motion.span
                layoutId="nav-underline"
                transition={transition}
                className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-primary"
              />
            )}
          </Link>
        );
      })}
      <ShortlistCountAnnouncement count={shortlisted} />
    </nav>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const shortlisted = useShortlistedCount();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] sm:hidden"
    >
      <ul className="grid h-14 grid-cols-2">
        {ITEMS.map((item) => {
          const active = item.match(pathname);
          const Icon = item.icon;
          return (
            <li key={item.href} className="flex">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium outline-none',
                  'focus-visible:bg-accent',
                  active ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                <Icon className="size-5" strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                <span className="inline-flex items-center">
                  {item.label}
                  {item.href === '/shortlists' && <ShortlistCountBadge count={shortlisted} />}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <ShortlistCountAnnouncement count={shortlisted} />
    </nav>
  );
}
