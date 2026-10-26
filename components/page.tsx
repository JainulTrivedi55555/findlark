// Page frame shared by the signed-in pages: one width, one rhythm.
// `wide` (max-w-5xl, the top bar's width) is for result lists; the default
// is a narrower reading width.
import { cn } from '@/lib/utils';

type Props = { children: React.ReactNode; className?: string; wide?: boolean };

export function Page({ children, className, wide = false }: Props) {
  return (
    <div className={cn('mx-auto w-full px-4 pt-6 pb-16 sm:px-6 sm:pt-10', wide ? 'max-w-5xl' : 'max-w-3xl', className)}>
      {children}
    </div>
  );
}

export function PageTitle({ children }: { children: React.ReactNode }) {
  return <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">{children}</h1>;
}

/** Placeholder line for screens that are built in the next chunk. */
export function ComingNext({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 text-muted-foreground">{children}</p>;
}
