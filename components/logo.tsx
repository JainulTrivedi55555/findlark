// The Findlark mark: a search lens with a person in it (a dot), on a pine tile.
// Original, inline SVG, painted with the theme colours so it never needs a file.
import { cn } from '@/lib/utils';

export function LogoMark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className={cn('shrink-0', className)}>
      <rect width="32" height="32" rx="9" className="fill-primary" />
      <circle cx="14.5" cy="14.5" r="6" fill="none" strokeWidth="2.4" className="stroke-primary-foreground" />
      <circle cx="14.5" cy="14.5" r="1.9" className="fill-primary-foreground" />
      <path d="M19 19l5 5" strokeWidth="2.6" strokeLinecap="round" className="stroke-primary-foreground" />
    </svg>
  );
}

/** Mark plus the "Findlark" wordmark in the display face. */
export function Logo({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark size={size} />
      <span className="font-display text-[19px] leading-none font-semibold tracking-tight">Findlark</span>
    </span>
  );
}
