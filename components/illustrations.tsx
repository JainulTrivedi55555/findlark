// Three tiny original illustrations for the empty, nothing-shortlisted and error
// states. Inline SVG in the palette (ink lines, sand and rose fills), under
// 120px, decorative (aria-hidden).
import { cn } from '@/lib/utils';

const line = 'fill-none stroke-foreground/70';

/** A blank profile sheet with a lens: no one matched. */
function EmptyArt() {
  return (
    <>
      <rect x="22" y="10" width="62" height="76" rx="10" className="fill-card stroke-foreground/30" strokeWidth="1.5" />
      <circle cx="53" cy="32" r="9" className="fill-none stroke-foreground/30" strokeWidth="1.5" strokeDasharray="3 3" />
      <rect x="36" y="49" width="34" height="4" rx="2" className="fill-foreground/15" />
      <rect x="40" y="58" width="26" height="4" rx="2" className="fill-foreground/10" />
      <circle cx="78" cy="70" r="15" className="fill-highlight/70" />
      <circle cx="78" cy="70" r="15" className={line} strokeWidth="2.2" />
      <path d="M89 81l10 10" className={line} strokeWidth="3" strokeLinecap="round" />
    </>
  );
}

/** A bookmark waiting for someone. */
function ShortlistArt() {
  return (
    <>
      <circle cx="60" cy="48" r="34" className="fill-highlight/60" />
      <path d="M44 22h32a4 4 0 0 1 4 4v50l-20-13-20 13V26a4 4 0 0 1 4-4z" className="fill-card stroke-foreground/70" strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M60 36v16M52 44h16" className={line} strokeWidth="2.2" strokeLinecap="round" />
    </>
  );
}

/** A sheet with a snapped line: something went wrong. */
function ErrorArt() {
  return (
    <>
      <circle cx="60" cy="50" r="34" className="fill-[var(--pool-rose)]/45" />
      <rect x="30" y="20" width="60" height="62" rx="10" className="fill-card stroke-foreground/30" strokeWidth="1.5" />
      <path d="M40 38h16l5 8 6-14 5 6h8" className={line} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="40" y="58" width="40" height="4" rx="2" className="fill-foreground/15" />
      <rect x="40" y="67" width="26" height="4" rx="2" className="fill-foreground/10" />
    </>
  );
}

const ART = { empty: EmptyArt, shortlist: ShortlistArt, error: ErrorArt } as const;
export type ArtName = keyof typeof ART;

export function Illustration({ name, className }: { name: ArtName; className?: string }) {
  const Art = ART[name];
  return (
    <svg viewBox="0 0 120 96" width="112" height="90" aria-hidden className={cn('shrink-0', className)}>
      <Art />
    </svg>
  );
}
