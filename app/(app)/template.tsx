'use client';
// A template re-mounts on every navigation, so each page fades in
// (opacity + 8px rise, 200ms ease-out). No movement under reduced motion.
import { motion, useReducedMotion } from 'motion/react';
import { pageEnter } from '@/lib/motion';

export default function AppTemplate({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div {...pageEnter(reduce)} className="flex flex-1 flex-col">
      {children}
    </motion.div>
  );
}
