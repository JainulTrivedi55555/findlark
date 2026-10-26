'use client';
// The brief box on the home page. Enter searches, Shift+Enter adds a line.
// Grows up to 3 lines, max 500 characters (the API's limit).
//
// Free plan: with the search unused, a muted line says this will use it; once
// used, the button becomes "Upgrade to search again" and opens the upgrade
// dialog. The box stays usable (the text is kept for after upgrading).
import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import { ErrorCard } from '@/components/error-card';
import { ProgressLine } from '@/components/search/progress-line';
import { Button } from '@/components/ui/button';
import type { RunState } from '@/components/search/use-run-search';
import { openUpgrade } from '@/lib/app-store';
import { fade } from '@/lib/motion';
import { usePlan } from '@/lib/use-plan';
import { cn } from '@/lib/utils';

export const MAX_BRIEF = 500;
const COUNTER_FROM = 400;
const MAX_LINES = 3;

// Example briefs shown as the placeholder, one every 4 s. Each returns people
// on the demo data with the filters it should map to. Snowflake is only held by
// Data Engineers, hence "data engineers" in the first one.
const PLACEHOLDERS = [
  'sr data engineers in Boston who know Snowflake',
  'junior frontend, Seattle, open to work',
  'account execs in Atlanta who know Salesforce',
  'mobile engineers who know Swift or Kotlin',
  'staff engineers who’ve worked at a startup',
];
const ROTATE_MS = 4000;

export type BriefFormHandle = { focus: () => void };

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (brief: string) => void;
  run: RunState;
};

export const BriefForm = forwardRef<BriefFormHandle, Props>(function BriefForm({ value, onChange, onSubmit, run }, ref) {
  const plan = usePlan();
  const textarea = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => ({ focus: () => textarea.current?.focus() }));

  const running = run.status === 'running';
  const free = plan.status === 'ready' && plan.plan.plan === 'free';
  const remaining = plan.status === 'ready' ? plan.plan.searches_remaining : null;
  const outOfSearches = free && (remaining ?? 0) <= 0;
  const brief = value.trim();

  // Rotating placeholder, whenever the box is empty (focused or not). Stops when
  // it has text or is disabled, and is off under reduced motion (the first example stays).
  const reduce = useReducedMotion();
  const [hint, setHint] = useState(0);
  const rotating = !reduce && !running && value.length === 0;
  useEffect(() => {
    if (!rotating) return;
    const id = setInterval(() => setHint((i) => (i + 1) % PLACEHOLDERS.length), ROTATE_MS);
    return () => clearInterval(id);
  }, [rotating]);
  const placeholder = PLACEHOLDERS[reduce ? 0 : hint];

  // Auto-grow: reset, then fit the content, capped at MAX_LINES.
  useLayoutEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = 'auto';
    const style = getComputedStyle(el);
    const line = parseFloat(style.lineHeight);
    const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    el.style.height = `${Math.min(el.scrollHeight, line * MAX_LINES + padding)}px`;
  }, [value]);

  function submit() {
    if (running) return;
    if (outOfSearches) return openUpgrade();
    if (brief) onSubmit(brief);
    else textarea.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // isComposing: Enter that confirms an IME composition must not submit.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div
        className={cn(
          'rounded-xl border bg-card p-2 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/15',
          running && 'bg-subtle',
        )}
      >
        <label htmlFor="brief" className="sr-only">
          Describe who you are looking for
        </label>
        <div className="relative">
          <textarea
            id="brief"
            ref={textarea}
            autoFocus
            rows={1}
            maxLength={MAX_BRIEF}
            value={value}
            disabled={running}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            // The native placeholder is kept for screen readers and layout but drawn
            // transparent: the visible copy below fades between examples.
            placeholder={placeholder}
            aria-describedby="brief-note"
            className="block min-h-14 w-full resize-none bg-transparent px-3 py-3 text-[17px] leading-7 outline-none placeholder:text-transparent disabled:text-muted-foreground"
          />
          {value.length === 0 && (
            <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden px-3 py-3 text-[17px] leading-7 text-muted-foreground">
              <AnimatePresence mode="wait" initial={false}>
                <motion.span key={placeholder} {...fade} className="block">
                  {placeholder}
                </motion.span>
              </AnimatePresence>
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 px-1 pb-0.5">
          {value.length >= COUNTER_FROM && (
            <span className={cn('text-[12px] tabular-nums', value.length >= MAX_BRIEF ? 'text-destructive' : 'text-muted-foreground')}>
              {value.length} / {MAX_BRIEF}
            </span>
          )}
          {outOfSearches ? (
            <Button type="submit" variant="outline">
              Upgrade to search again
            </Button>
          ) : (
            <Button type="submit" disabled={running} className="min-w-24">
              {running ? 'Searching…' : 'Search'}
              {!running && <ArrowRight data-icon="inline-end" aria-hidden />}
            </Button>
          )}
        </div>
      </div>

      <div id="brief-note" className="mt-3 min-h-6 text-[13px]" aria-live="polite">
        <AnimatePresence mode="wait" initial={false}>
          {running ? (
            <SearchProgress key="progress" phase={run.phase} />
          ) : run.status === 'error' ? (
            <motion.div key="error" {...fade}>
              <ErrorCard copy={run.copy} onRetry={run.retry} />
            </motion.div>
          ) : outOfSearches ? (
            <motion.p key="out" {...fade} className="text-muted-foreground">
              You’ve used your company’s free search. Open a past search below, or edit its filters for free.
            </motion.p>
          ) : free && remaining === 1 ? (
            <motion.p key="one" {...fade} className="text-muted-foreground">
              This will use your free search.
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>
    </form>
  );
});

/** "Reading your brief…" then "Finding people…", over a thin moving line. */
function SearchProgress({ phase }: { phase: 'reading' | 'finding' }) {
  return (
    <motion.div {...fade} className="space-y-2">
      <AnimatePresence mode="wait" initial={false}>
        <motion.p key={phase} {...fade} className="text-muted-foreground">
          {phase === 'reading' ? 'Reading your brief…' : 'Finding people…'}
        </motion.p>
      </AnimatePresence>
      <ProgressLine />
    </motion.div>
  );
}
