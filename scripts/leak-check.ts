// Scans everything the browser can receive from a production build for secrets
// (npm run leak-check, after npm run build).
//
// Scanned: .next/static (all client JS/CSS) and the prerendered pages and RSC
// payloads in .next/server/app (HTML sent to the browser). Server-only chunks
// are not sent to the browser and are not scanned.
//
// Looks for the actual secret key and model key values (read from .env.local /
// the environment, never printed) and for tell-tale markers. Exits 1 on any hit.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import './lib/env';

const CLIENT_DIRS = ['.next/static'];
const PRERENDERED_DIR = '.next/server/app';
const PRERENDERED_EXT = /\.(html|rsc|body|meta|json)$/;

// Markers match key-shaped strings (prefix + key body), not the bare prefix:
// supabase-js itself ships `key.startsWith("sb_secret_")` to tell key formats
// apart, which is code, not a key. Any real key of these kinds still matches.
const markers: { name: string; pattern: RegExp }[] = [
  { name: 'marker "sb_secret_…"', pattern: /sb_secret_[A-Za-z0-9_-]{16,}/ },
  { name: 'marker "sk-ant-…"', pattern: /sk-ant-[A-Za-z0-9_-]{16,}/ },
  { name: 'marker "service_role"', pattern: /service_role/ },
  { name: 'marker "whsec_…"', pattern: /whsec_[A-Za-z0-9+/=_-]{8,}/ },
];
const needles: { name: string; value: string }[] = [];
for (const name of ['SUPABASE_SECRET_KEY', 'ANTHROPIC_API_KEY', 'STRIPE_WEBHOOK_SECRET']) {
  const value = process.env[name];
  // Only meaningful values; a very short value would match by accident.
  if (value && value.length >= 12) needles.push({ name: `value of ${name}`, value });
}

function walk(dir: string, filter: (path: string) => boolean, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, filter, out);
    else if (filter(path)) out.push(path);
  }
  return out;
}

function main() {
  if (!existsSync('.next/BUILD_ID')) {
    console.error('leak-check: no production build. Run `npm run build` first.');
    process.exit(1);
  }
  const files = [
    ...CLIENT_DIRS.flatMap((d) => walk(d, () => true)),
    ...walk(PRERENDERED_DIR, (p) => PRERENDERED_EXT.test(p)),
  ];

  const hits: string[] = [];
  for (const file of files) {
    const text = readFileSync(file, 'latin1'); // byte-safe for any file type
    for (const n of needles) if (text.includes(n.value)) hits.push(`${file}: ${n.name}`);
    for (const m of markers) if (m.pattern.test(text)) hits.push(`${file}: ${m.name}`);
  }

  console.log(`leak-check: scanned ${files.length} files for ${needles.length + markers.length} patterns ` +
    `(${needles.filter((n) => n.name.startsWith('value')).map((n) => n.name.replace('value of ', '')).join(', ') || 'no key values found to check'}).`);
  if (hits.length) {
    console.error(`leak-check: FOUND ${hits.length} hit(s) (values not shown):\n  ${hits.join('\n  ')}`);
    process.exit(1);
  }
  console.log('leak-check: clean.');
}

main();
