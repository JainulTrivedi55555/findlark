'use client';
// Candidate portraits and company logos. Both are local SVGs, so no image host
// is needed: portraits are inline data URIs stored with each candidate, logos are
// files in public/logos (both written by scripts/generate-seed.ts).
// next/image with `unoptimized`: the optimizer does not process SVGs and there is
// nothing to resize. If an image fails, a neutral initials tile shows.
import Image from 'next/image';
import { useState } from 'react';
import { cn } from '@/lib/utils';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? '?').slice(0, 2);
  return letters.toUpperCase();
}

type Props = { src: string | null | undefined; name: string; size?: number; className?: string };

function Fallback({ name, size, className, rounded }: Omit<Props, 'src'> & { size: number; rounded: string }) {
  return (
    <span
      role="img"
      aria-label={name}
      className={cn(
        'inline-flex shrink-0 items-center justify-center bg-muted font-medium text-muted-foreground select-none',
        rounded,
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.36)) }}
    >
      {initials(name)}
    </span>
  );
}

/** Round candidate portrait. */
export function Avatar({ src, name, size = 40, className }: Props) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <Fallback name={name} size={size} className={className} rounded="rounded-full" />;
  return (
    <Image
      src={src}
      alt={name}
      width={size}
      height={size}
      style={{ width: size, height: size }}
      loading="lazy"
      unoptimized
      onError={() => setFailed(true)}
      className={cn('shrink-0 rounded-full bg-muted object-cover', className)}
    />
  );
}

/** Square company logo with a hairline border. */
export function CompanyLogo({ src, name, size = 24, className }: Props) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <Fallback name={name} size={size} className={className} rounded="rounded-md" />;
  return (
    <Image
      src={src}
      alt={`${name} logo`}
      width={size}
      height={size}
      style={{ width: size, height: size }}
      loading="lazy"
      unoptimized
      onError={() => setFailed(true)}
      className={cn('shrink-0 rounded-md bg-card object-contain ring-1 ring-border', className)}
    />
  );
}
