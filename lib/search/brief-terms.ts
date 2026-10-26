// Which words of the brief produced a chip. Pure, no I/O.
//
// Best effort and exact only: for each chip we look for its vocabulary value
// and the synonyms that map to it (lib/search/synonyms.ts) as whole words in
// the brief, case-insensitive. Chips with no wording to point at (years,
// switches) simply have no highlight.
import { SYNONYMS } from './synonyms';
import type { Chip } from './chips';
import { KINDS } from './chips';
import type { ListField } from './schema';

export type BriefPart = { text: string; chipIds: string[] };

/** Words that could have produced this chip, longest first. */
function termsFor(chip: Chip): string[] {
  const field = KINDS[chip.kind].field as ListField | undefined;
  if (!field) return [];
  const values = chip.kind === 'skills_any' ? [] : chip.raw ? [chip.raw] : [];
  const terms = new Set<string>();
  for (const value of values) {
    terms.add(value.toLowerCase());
    for (const [word, targets] of Object.entries(SYNONYMS[field])) {
      if (targets.includes(value)) terms.add(word.toLowerCase());
    }
  }
  return [...terms].sort((a, b) => b.length - a.length);
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Splits the brief into plain and highlighted parts. Parts joined equal the brief. */
export function briefParts(brief: string, chips: Chip[]): BriefPart[] {
  const spans: { start: number; end: number; chipId: string }[] = [];
  for (const chip of chips) {
    for (const term of termsFor(chip)) {
      // Whole words only: "go" must not light up inside "good" or "Django".
      const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(term)}(?![\\p{L}\\p{N}])`, 'giu');
      for (const m of brief.matchAll(re)) spans.push({ start: m.index, end: m.index + m[0].length, chipId: chip.id });
    }
  }
  // Earliest first, longer first; a span overlapping one already taken is dropped
  // unless it is exactly the same words (two chips can share a word).
  spans.sort((a, b) => a.start - b.start || b.end - a.end);
  const taken: { start: number; end: number; chipIds: string[] }[] = [];
  for (const s of spans) {
    const last = taken[taken.length - 1];
    if (last && last.start === s.start && last.end === s.end) {
      if (!last.chipIds.includes(s.chipId)) last.chipIds.push(s.chipId);
    } else if (!last || s.start >= last.end) {
      taken.push({ start: s.start, end: s.end, chipIds: [s.chipId] });
    }
  }
  const parts: BriefPart[] = [];
  let at = 0;
  for (const t of taken) {
    if (t.start > at) parts.push({ text: brief.slice(at, t.start), chipIds: [] });
    parts.push({ text: brief.slice(t.start, t.end), chipIds: t.chipIds });
    at = t.end;
  }
  if (at < brief.length) parts.push({ text: brief.slice(at), chipIds: [] });
  return parts;
}
