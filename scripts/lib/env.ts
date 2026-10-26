// Loads .env.local for scripts run with tsx (Next.js loads it for the app itself).
import { existsSync } from 'node:fs';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}. Run \`npm run write-env\` (or \`make setup\`) first.`);
    process.exit(1);
  }
  return value;
}
