// Screenshots for design review (npm run screenshots, after npm run build).
// Signs in through the real login form and saves PNGs of /login, / (search
// home), /shortlists and the upgrade dialog at 375px and 1280px wide into
// screenshots/ (gitignored). Needs Playwright's Chromium:
//   npx playwright install chromium
import { mkdirSync } from 'node:fs';
import { chromium, type Page } from 'playwright';
import { withServer } from './lib/server';

const OUT = 'screenshots';
const WIDTHS = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'desktop', width: 1280, height: 800 },
];
const ACCOUNT = 'recruiter@acme.test';

// Let enter animations (<= 250ms) finish before each shot.
const settle = (page: Page) => page.waitForTimeout(400);

async function main() {
  mkdirSync(OUT, { recursive: true });
  await withServer(async (base) => {
    const browser = await chromium.launch();
    try {
      for (const size of WIDTHS) {
        const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 2 });
        const page = await context.newPage();
        const shot = async (name: string) => {
          await settle(page);
          await page.screenshot({ path: `${OUT}/${name}-${size.name}.png` });
          console.log(`saved ${OUT}/${name}-${size.name}.png`);
        };

        await page.goto(`${base}/login`);
        await page.getByLabel('Email').waitFor();
        await shot('login');

        // Wrong password first, to capture the inline error state.
        await page.getByLabel('Email').fill(ACCOUNT);
        await page.getByLabel('Password').fill('wrong-password');
        await page.getByLabel('Password').press('Enter');
        // Not getByRole('alert'): Next.js always renders a hidden route announcer
        // with role="alert", which matched at once and screenshotted "Signing in…".
        // Wait for our own error, and for the form to be ready to submit again.
        await page.locator('#login-error').filter({ hasText: 'don’t match' }).waitFor();
        await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor();
        await shot('login-error');

        // Demo chip fills both fields; Enter submits.
        await page.getByRole('button', { name: ACCOUNT }).click();
        await page.getByLabel('Password').press('Enter');
        await page.waitForURL(`${base}/`);
        await page.getByRole('heading', { level: 1 }).waitFor();
        await page.locator('button[aria-haspopup="dialog"]').waitFor();
        await shot('home');

        await page.locator('button[aria-haspopup="dialog"]').click();
        await page.getByRole('dialog').waitFor();
        await shot('upgrade-dialog');
        await page.keyboard.press('Escape');
        await page.getByRole('dialog').waitFor({ state: 'detached' });

        await page.getByRole('link', { name: 'Shortlists' }).first().click();
        await page.waitForURL(`${base}/shortlists`);
        await shot('shortlists');

        await page.getByRole('button', { name: 'Account menu' }).click();
        await page.getByRole('menu').waitFor();
        await shot('user-menu');

        await context.close();
      }
    } finally {
      await browser.close();
    }
  });
}

main().catch((err) => {
  console.error(`screenshots failed: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
