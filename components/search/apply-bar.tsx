'use client';
// Slides up when the staged filters differ from the applied ones.
// Apply re-runs the search in SQL only: no model call, no quota.
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { transition } from '@/lib/motion';

type Props = { visible: boolean; applying: boolean; onApply: () => void; onReset: () => void };

export function ApplyBar({ visible, applying, onApply, onReset }: Props) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: reduce ? 0 : 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: reduce ? 0 : 16 }}
          transition={transition}
          // Above the phone bottom nav (56px + safe area), centred on desktop.
          className="fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom)+12px)] z-30 px-4 sm:bottom-6"
        >
          <div
            role="region"
            aria-label="Unapplied filter changes"
            className="mx-auto flex max-w-xl items-center gap-3 rounded-xl border bg-popover p-2.5 pl-4 shadow-lg shadow-foreground/5"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Filters changed</p>
              <p className="text-[12px] leading-snug text-muted-foreground">Editing filters doesn’t use your search.</p>
            </div>
            <Button variant="ghost" onClick={onReset} disabled={applying}>
              Reset
            </Button>
            <Button onClick={onApply} disabled={applying}>
              {applying ? 'Applying…' : 'Apply'}
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
