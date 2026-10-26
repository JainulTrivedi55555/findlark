'use client';
// A thin line with a sweep (transform only) that says "working". The same line
// sits under the brief box while a search runs and at the top of the results
// skeleton, so the hand-off between the two screens looks like one continuous wait.
import { motion, useReducedMotion } from 'motion/react';

export function ProgressLine() {
  const reduce = useReducedMotion();
  return (
    <div className="relative h-0.5 w-full overflow-hidden rounded-full bg-foreground/10" aria-hidden>
      {reduce ? (
        <div className="h-full w-full animate-pulse bg-primary/40" />
      ) : (
        <motion.div
          className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-primary/70"
          initial={{ x: '-100%' }}
          animate={{ x: '300%' }}
          transition={{ duration: 1.2, ease: 'easeInOut', repeat: Infinity }}
        />
      )}
    </div>
  );
}
