'use client';
// "21 people". The number is in the display face and counts up from 0 in 400 ms,
// but only on the first load of a results page (`firstLoad`); after Apply or
// paging it just shows the value. Under reduced motion it is always the value.
//
// The animated number is aria-hidden and written straight into the DOM (no
// re-render per frame). A visually hidden live region holds the real text, so
// screen readers hear "21 people" once, not every frame of the count.
import { useLayoutEffect, useRef } from 'react';
import { animate, useReducedMotion } from 'motion/react';
import { peopleCount } from '@/lib/format';
import { EASE_OUT } from '@/lib/motion';

type Props = {
  total: number;
  /** Shown instead of the number, e.g. "Updating results…". */
  busyText?: string | null;
  /** True only while the results page is revealing itself for the first time. */
  firstLoad: boolean;
  /** Seconds to wait before counting, so it follows the chips. */
  delay?: number;
};

export function ResultCount({ total, busyText, firstLoad, delay = 0 }: Props) {
  const reduce = useReducedMotion();
  const number = useRef<HTMLSpanElement>(null);
  const counted = useRef(false);

  useLayoutEffect(() => {
    const el = number.current;
    if (!el) return;
    const show = (n: number) => {
      el.textContent = n.toLocaleString('en-US');
    };
    if (firstLoad && !reduce && !counted.current && total > 0) {
      counted.current = true;
      show(0);
      const controls = animate(0, total, { duration: 0.4, delay, ease: EASE_OUT, onUpdate: (v) => show(Math.round(v)) });
      return () => controls.stop();
    }
    counted.current = true;
    show(total);
  }, [total, firstLoad, reduce, delay]);

  return (
    <>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {busyText ?? peopleCount(total)}
      </p>
      <p aria-hidden className="text-[15px]">
        {busyText ? (
          <span className="text-muted-foreground">{busyText}</span>
        ) : (
          <>
            <span ref={number} className="font-display text-[26px] leading-none font-semibold tabular-nums" />{' '}
            <span className="font-medium">{total === 1 ? 'person' : 'people'}</span>
          </>
        )}
      </p>
    </>
  );
}
