// End-to-end UI test in a real browser (npm run test:e2e, after npm run build).
//
// Puts acme on the paid plan (admin client) so it can run several searches,
// then at 1280px: searches a brief, checks the chips, removes a chip and
// applies, edits a chip value, pages to 2 and back, saves the search and finds
// it on home, hits empty results (unsupported part of the brief, then no
// filters at all), the error and not-found states, and finally the 402 on the
// free plan, which must open the upgrade dialog.
// Then at 375px it revisits the same screens for screenshots and checks there
// is no horizontal scroll.
//
// Then shortlists (button on a card, popover, candidate page, lists pages, rename,
// remove, delete, another company's list = 404, empty states) and, with a FREE
// company, the zero-result search that must stay reachable from Recent searches
// and can be re-run without the unsupported part for free.
//
// Then a failed new search (HTML 500, JSON 500, dropped connection, 401) must
// show the friendly error card with Retry at 1280px and 390px, and on phones
// (360, 390, 430px) every fixed or sticky bar must be opaque and leave the
// page's content clear (screenshots/e2e-bars-*.png).
//
// The main flow calls the model 4 times (about $0.04); `--only errors,bars`
// makes no model call. Portraits and logos are local, so nothing leaves the
// machine except the model calls. Saves PNGs to
// screenshots/e2e-*.png. Always puts acme back on free with 0 searches used and
// deletes the saved searches, shortlists and searches it created.
import { mkdirSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { chromium, type Browser, type Locator, type Page } from 'playwright';
import { Filters } from '../lib/search/schema';
import { adminClient, Report, signIn as apiSignIn, withServer } from './lib/server';

const OUT = 'screenshots';
const ACCOUNT = 'recruiter@acme.test';
const BRIEF = 'senior TypeScript engineers in New York who have worked at a startup';
const UNSUPPORTED_BRIEF = 'senior TypeScript engineers in New York who speak Portuguese';
const MISSING_SEARCH = '00000000-0000-4000-8000-000000000000';

// `npm run test:e2e -- --only errors,bars` runs just those parts (main, errors,
// bars). errors and bars make no model calls.
const onlyArg = process.argv.indexOf('--only');
const ONLY = onlyArg >= 0 ? new Set(process.argv[onlyArg + 1]?.split(',')) : null;

const admin = adminClient();
const report = new Report();
const startedAt = new Date().toISOString();

async function setPlan(plan: 'free' | 'paid', searchesUsed: number) {
  const { error } = await admin.from('companies').update({ plan, searches_used: searchesUsed }).eq('id', 'acme');
  if (error) throw new Error(`set plan: ${error.message}`);
}

async function cleanUp() {
  await setPlan('free', 0);
  await admin.from('saved_briefs').delete().eq('company_id', 'acme').gte('created_at', startedAt);
  // Cascades to the lists' people and to a search's stored results.
  await admin.from('shortlists').delete().eq('company_id', 'acme').gte('created_at', startedAt);
  await admin.from('searches').delete().eq('company_id', 'acme').gte('created_at', startedAt);
}

async function newContext(browser: Browser, size: 'desktop' | 'mobile', mobileWidth = 375) {
  const context = await browser.newContext(
    size === 'desktop'
      ? { viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2 }
      : { viewport: { width: mobileWidth, height: 812 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
  );
  // tsx compiles named functions inside page.evaluate() with a __name() helper
  // that only exists in Node; give the page a no-op one.
  await context.addInitScript('window.__name = (fn) => fn;');
  return context;
}

const settle = (page: Page) => page.waitForTimeout(400);

/** axe-core scan of what is on screen; serious and critical violations fail the test. */
async function axeCheck(page: Page, name: string, size: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const bad = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const detail = bad.map((v) => `${v.id} (${v.nodes.length}): ${v.nodes[0]?.target.join(' ')}`).join(' | ');
  report.add(`axe: ${name} ${size}`, bad.length === 0, detail);
}

async function shot(page: Page, name: string, size: string) {
  await settle(page);
  await page.screenshot({ path: `${OUT}/e2e-${name}-${size}.png`, fullPage: false });
  await axeCheck(page, name, size);
}

async function noHorizontalScroll(page: Page, where: string) {
  const { scroll, client } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  report.add(`no horizontal scroll: ${where}`, scroll <= client, `${scroll} <= ${client}`);
}

const loginScanned = new Set<number>();

async function signIn(page: Page, base: string, account = ACCOUNT) {
  await page.goto(`${base}/login`);
  const width = page.viewportSize()?.width ?? 0;
  if (!loginScanned.has(width)) {
    loginScanned.add(width);
    await page.getByRole('button', { name: account }).waitFor();
    await axeCheck(page, 'login', `${width}px`);
  }
  await page.getByRole('button', { name: account }).click();
  await page.getByLabel('Password').press('Enter');
  await page.waitForURL(`${base}/`);
  await page.getByRole('heading', { name: 'Who are you looking for?' }).waitFor();
}

const countText = (page: Page) => page.locator('p[aria-live="polite"][aria-atomic="true"]');
async function total(page: Page): Promise<number> {
  await countText(page).filter({ hasText: /people|person/ }).waitFor();
  const text = (await countText(page).textContent()) ?? '';
  return Number(text.replace(/[^\d]/g, ''));
}
const chipTriggers = (page: Page) => page.locator('[data-chip-trigger]:not([data-chip-trigger="__add"])');

async function apply(page: Page) {
  await page.getByRole('region', { name: 'Unapplied filter changes' }).waitFor();
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await page.getByRole('region', { name: 'Unapplied filter changes' }).waitFor({ state: 'detached' });
}

async function runSearch(page: Page, base: string, brief: string): Promise<string> {
  await page.getByLabel('Describe who you are looking for').fill(brief);
  await page.getByLabel('Describe who you are looking for').press('Enter');
  await page.waitForURL(/\/search\/[0-9a-f-]{36}$/, { timeout: 20_000 });
  await page.locator('[aria-label="Filters"]').waitFor();
  return page.url().replace(base, '');
}

async function desktopFlow(browser: Browser, base: string) {
  const size = 'desktop';
  const context = await newContext(browser, 'desktop');
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await signIn(page, base);
  await page.getByRole('heading', { name: 'Saved searches' }).waitFor();
  await page.locator('[aria-label="Loading saved searches"]').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: /View plan details|How to upgrade/ }).waitFor();
  await shot(page, 'home', size);

  // 1. Search a brief; the status line shows while it runs.
  await page.getByLabel('Describe who you are looking for').fill(BRIEF);
  await page.getByLabel('Describe who you are looking for').press('Enter');
  await page.getByText('Reading your brief…').waitFor({ timeout: 3000 });
  report.add('status line while searching', true, 'Reading your brief…');
  await page.waitForURL(/\/search\/[0-9a-f-]{36}$/, { timeout: 20_000 });
  const resultsPath = page.url().replace(base, '');

  // 2. Chips show how the brief was understood.
  await page.locator('[aria-label="Filters"]').waitFor();
  const chips = await chipTriggers(page).evaluateAll((els) => els.map((e) => e.getAttribute('data-chip-trigger')));
  report.add('chips for the brief', chips.includes('skills:TypeScript') && chips.includes('cities:New York'), chips.join(', '));
  report.add('brief shown on results', await page.getByRole('heading', { level: 1, name: BRIEF }).isVisible());
  const first = await total(page);
  report.add('results and count', first > 0 && (await page.locator('ol[aria-label="Results"] > li').count()) > 0, `${first} people`);
  await shot(page, 'results', size);

  // 3. Remove a chip and apply: more (or as many) people.
  const removable = chips.includes('company_types:startup') ? 'Worked at: a startup' : 'Seniority: Senior';
  await page.getByRole('button', { name: `Remove ${removable}` }).click();
  await apply(page);
  const afterRemove = await total(page);
  report.add('remove chip + apply', afterRemove >= first && !(await chipTriggers(page).allTextContents()).join().includes(removable.split(': ')[1]), `${removable}: ${first} -> ${afterRemove}`);

  // 4. Page 2 and back. URL-driven; the count must not change.
  const before = await total(page);
  if (before > 20) {
    const firstOnPage1 = await page.locator('ol[aria-label="Results"] > li h3 a').first().textContent();
    await page.getByRole('link', { name: 'Next page' }).click();
    await page.waitForURL(/\?page=2$/);
    await page.getByText(/^Showing 21 to/).waitFor();
    const firstOnPage2 = await page.locator('ol[aria-label="Results"] > li h3 a').first().textContent();
    report.add('page 2', firstOnPage1 !== firstOnPage2 && (await total(page)) === before, `${firstOnPage1} -> ${firstOnPage2}`);
    await page.goBack();
    await page.getByText(/^Showing 1 to/).waitFor();
    const back = await page.locator('ol[aria-label="Results"] > li h3 a').first().textContent();
    report.add('back to page 1', back === firstOnPage1, String(back));
  } else {
    report.add('page 2', false, `only ${before} results, cannot page`);
  }

  // 5. Edit a chip value: New York -> Boston, keyboard only.
  await page.locator('[data-chip-trigger="cities:New York"]').click();
  await page.getByRole('combobox').waitFor();
  await page.getByRole('combobox').fill('bos');
  await shot(page, 'popover', size);
  await page.getByRole('combobox').press('Enter');
  await page.locator('[data-chip-trigger="cities:Boston"]').waitFor();
  await settle(page);
  const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-chip-trigger'));
  report.add('focus returns to the edited chip', focused === 'cities:Boston', String(focused));
  await apply(page);
  await total(page);
  const firstCardPlace = await page.locator('ol[aria-label="Results"] > li').first().textContent();
  report.add('edit chip value + apply', Boolean(firstCardPlace?.includes('Boston')), 'first card is in Boston');

  // 6. Save the search and find it on home.
  await page.getByRole('button', { name: 'Save search' }).click();
  await page.getByRole('button', { name: 'Saved' }).waitFor();
  await page.getByRole('link', { name: 'New search' }).click();
  await page.waitForURL(`${base}/`);
  const saved = page.getByRole('heading', { name: 'Saved searches' }).locator('..').getByText(BRIEF);
  await saved.first().waitFor();
  report.add('saved search on home', true, 'Boston, without the removed chip');

  // 7. Empty results: an unsupported part of the brief.
  const unsupportedPath = await runSearch(page, base, UNSUPPORTED_BRIEF);
  const zero = await total(page);
  const hasUnsupported = await page.getByText('Can’t filter by:').isVisible();
  report.add('unsupported brief -> zero + chip', zero === 0 && hasUnsupported, `${zero} people`);
  await page.getByText('We can’t search by part of your brief').waitFor();
  await shot(page, 'empty', size);
  await mobileShot(browser, base, unsupportedPath, 'empty');

  // 8. Dismiss the unsupported chip and apply: results again.
  await page.getByRole('button', { name: /^Dismiss/ }).first().click();
  await apply(page);
  const afterDismiss = await total(page);
  report.add('dismiss unsupported + apply', afterDismiss > 0, `${afterDismiss} people`);

  // 9. Remove every chip and apply: zero, never everyone.
  while ((await chipTriggers(page).count()) > 0) {
    const label = await page.locator('button[aria-label^="Remove "]').first().getAttribute('aria-label');
    await page.locator('button[aria-label^="Remove "]').first().click();
    await page.locator(`button[aria-label="${label}"]`).waitFor({ state: 'detached' });
  }
  await apply(page);
  const none = await total(page).catch(() => -1);
  report.add('no filters -> zero, not everyone', none === 0 && (await page.getByText('Nothing to filter on').isVisible()), `${none} people`);

  // 10. Error state with Retry (results request fails once).
  let fail = true;
  await page.route(
    (url) => /^\/api\/search\/[^/]+$/.test(url.pathname),
    (route) =>
      fail && route.request().method() === 'GET'
        ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'internal', message: 'Something went wrong on our side. Try again.' }) })
        : route.continue(),
  );
  await page.goto(`${base}${resultsPath}`);
  await page.getByRole('button', { name: 'Retry' }).waitFor();
  await shot(page, 'error', size);
  fail = false;
  await page.getByRole('button', { name: 'Retry' }).click();
  report.add('error state + Retry', (await total(page)) > 0);
  await page.unroute((url) => /^\/api\/search\/[^/]+$/.test(url.pathname));

  // 11. Another company's (or a missing) search.
  await page.goto(`${base}/search/${MISSING_SEARCH}`);
  await page.getByText('We can’t find that search').waitFor();
  report.add('404 state', true);

  // 12. Free plan with the search used: the API answers 402, the dialog opens,
  //     the brief stays in the box. (The page still thinks it is Pro.)
  await page.goto(`${base}/`);
  await page.getByRole('button', { name: 'Pro. View plan details' }).waitFor();
  await setPlan('free', 1);
  await page.getByLabel('Describe who you are looking for').fill('data scientists in Seattle');
  await page.getByLabel('Describe who you are looking for').press('Enter');
  await page.getByRole('dialog').getByText('Upgrade to Pro').waitFor();
  const kept = await page.getByLabel('Describe who you are looking for').inputValue();
  report.add('402 opens upgrade dialog', kept === 'data scientists in Seattle', 'brief kept');
  await shot(page, 'dialog', size);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Upgrade to search again' }).waitFor();
  report.add('out of searches: upgrade button + note', await page.getByText('You’ve used your company’s free search').isVisible());
  await shot(page, 'home-out', size);

  report.add('no page errors (desktop)', errors.length === 0, errors.join(' | ').slice(0, 200));
  await context.close();
  return { resultsPath, unsupportedPath };
}

/** One 375px screenshot of a path, taken before the desktop flow changes it. */
async function mobileShot(browser: Browser, base: string, path: string, name: string) {
  const context = await newContext(browser, 'mobile');
  const page = await context.newPage();
  await signIn(page, base);
  await page.goto(`${base}${path}`);
  await page.locator('[aria-label="Filters"]').waitFor();
  await total(page);
  await shot(page, name, 'mobile');
  await noHorizontalScroll(page, `${name} 375`);
  await context.close();
}

async function mobileShots(browser: Browser, base: string, paths: { resultsPath: string; unsupportedPath: string }) {
  const size = 'mobile';
  const context = await newContext(browser, 'mobile');
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // acme is free with its search used (from the desktop flow).
  await signIn(page, base);
  await page.getByRole('heading', { name: 'Saved searches' }).waitFor();
  await page.getByText(BRIEF).first().waitFor();
  await shot(page, 'home', size);
  await noHorizontalScroll(page, 'home 375');

  await page.goto(`${base}${paths.resultsPath}`);
  await total(page);
  await shot(page, 'results', size);
  await noHorizontalScroll(page, 'results 375');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await shot(page, 'results-bottom', size);

  // Chip editor is a bottom sheet on phones.
  await chipTriggers(page).first().click();
  await page.getByRole('combobox').waitFor();
  await shot(page, 'popover', size);
  await page.keyboard.press('Escape');

  // Staged edit: Apply bar above the bottom nav.
  await page.locator('button[aria-label^="Remove "]').first().click();
  await page.getByRole('region', { name: 'Unapplied filter changes' }).waitFor();
  await shot(page, 'apply-bar', size);
  await page.getByRole('button', { name: 'Reset' }).click();

  await page.route(
    (url) => /^\/api\/search\/[^/]+$/.test(url.pathname),
    (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'internal', message: 'Something went wrong on our side. Try again.' }) }),
  );
  await page.goto(`${base}${paths.resultsPath}`);
  await page.getByRole('button', { name: 'Retry' }).waitFor();
  await shot(page, 'error', size);
  await page.unroute((url) => /^\/api\/search\/[^/]+$/.test(url.pathname));

  await page.goto(`${base}/`);
  await page.getByRole('button', { name: 'Upgrade to search again' }).click();
  await page.getByRole('dialog').waitFor();
  await shot(page, 'dialog', size);

  report.add('no page errors (mobile)', errors.length === 0, errors.join(' | ').slice(0, 200));
  await context.close();
}

// ---------------------------------------------------------------------------
// Shortlists
// ---------------------------------------------------------------------------

const firstCard = (page: Page) => page.locator('ol[aria-label="Results"] > li').first();
const panel = (page: Page) => page.getByRole('dialog');
const listLink = (page: Page, name: string) => page.getByRole('link', { name: new RegExp(`^${name}`) });

/** The shortlist trigger button on a card or the candidate page. */
const trigger = (scope: Page | Locator) => scope.getByRole('button', { name: /^Shortlist .*, (not on a list|on \d+ lists?)$/ });

async function tapTargetOk(locator: Locator): Promise<string> {
  const box = await locator.boundingBox();
  return box ? `${Math.round(box.width)}x${Math.round(box.height)}` : 'not visible';
}

async function shortlistDesktop(browser: Browser, base: string, resultsPath: string) {
  const size = 'desktop';
  const context = await newContext(browser, size);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await signIn(page, base);

  // 1. Open a card's shortlist button: no lists yet, so just the New list input and one line of help.
  await page.goto(`${base}${resultsPath}`);
  await total(page);
  const name = (await firstCard(page).locator('h3 a').textContent()) ?? '';
  const button = trigger(firstCard(page));
  report.add('shortlist button on a card', (await button.count()) === 1 && (await button.getAttribute('aria-pressed')) === 'false', name);
  await button.click();
  await panel(page).getByLabel('New list name').waitFor();
  report.add(
    'popover empty state',
    await panel(page).getByText('Create your first list to start shortlisting.').isVisible(),
    'help line + New list input',
  );
  await shot(page, 'shortlist-empty', size);

  // 2. Create a list from the popover: the person is added to it at once.
  await panel(page).getByLabel('New list name').fill('E2E Hiring');
  await panel(page).getByLabel('New list name').press('Enter');
  await page.getByText('Added to E2E Hiring').waitFor();
  const row = panel(page).getByRole('checkbox', { name: /E2E Hiring/ });
  report.add('create list from popover adds the person', (await row.getAttribute('aria-checked')) === 'true' && (await button.getAttribute('aria-pressed')) === 'true', 'row checked, button filled');
  report.add('tooltip has the count', (await button.getAttribute('title')) === 'Shortlisted on 1 list', String(await button.getAttribute('title')));
  await shot(page, 'shortlist-popover', size);

  // 3. Toggle off and on again; Undo puts it back.
  await row.click();
  await page.getByText('Removed from E2E Hiring').waitFor();
  report.add('toggle off', (await row.getAttribute('aria-checked')) === 'false' && (await button.getAttribute('aria-pressed')) === 'false', 'row unchecked, button outline');
  await page.locator('[data-sonner-toast]', { hasText: 'Removed from E2E Hiring' }).getByRole('button', { name: 'Undo' }).click();
  // Pressing Undo (outside the popover) closes it; the button shows the restored state.
  await page.waitForFunction(() => document.querySelector('button[aria-label^="Shortlist "]')?.getAttribute('aria-pressed') === 'true');
  report.add('Undo puts the person back', (await button.getAttribute('aria-pressed')) === 'true');
  await button.click();
  await row.waitFor();
  await row.click();
  await page.waitForFunction(() => document.querySelector('[role="dialog"] [role="checkbox"]')?.getAttribute('aria-checked') === 'false');
  await row.click();
  await page.waitForFunction(() => document.querySelector('[role="dialog"] [role="checkbox"]')?.getAttribute('aria-checked') === 'true');
  report.add('toggle on', (await button.getAttribute('aria-pressed')) === 'true');

  // 4. Rollback: the API fails, the row goes back and an error toast shows.
  await page.route('**/api/shortlists/*/people/*', (route) =>
    route.request().method() === 'DELETE'
      ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'internal', message: 'Something went wrong on our side. Try again.' }) })
      : route.continue(),
  );
  await row.click();
  await page.getByText('Could not remove from E2E Hiring').waitFor();
  report.add('failed toggle rolls back + error toast', (await row.getAttribute('aria-checked')) === 'true' && (await button.getAttribute('aria-pressed')) === 'true', 'still on the list');
  await page.unroute('**/api/shortlists/*/people/*');

  // 5. Escape closes it and focus is back on the trigger.
  await page.keyboard.press('Escape');
  await panel(page).waitFor({ state: 'detached' });
  await settle(page);
  const focused = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '');
  report.add('focus returns to the trigger', focused.startsWith('Shortlist '), focused);

  // 6. Open the candidate page from the card, highlighted skills, shortlist from there.
  await firstCard(page).locator('h3 a').click();
  await page.waitForURL(/\/people\/cand_\d+\?search=/);
  const personUrl = page.url();
  await page.getByRole('heading', { level: 1, name }).waitFor();
  const personButton = trigger(page);
  await personButton.waitFor();
  report.add('candidate page: shortlist state is shared', (await personButton.getAttribute('aria-pressed')) === 'true', 'already on E2E Hiring');
  const highlighted = await page.locator('ul[aria-label="Skills"] li.bg-highlight').count();
  report.add('candidate page highlights searched skills', highlighted > 0, `${highlighted} highlighted`);
  report.add('candidate page sections', (await page.getByRole('heading', { name: 'Experience' }).isVisible()) && (await page.getByRole('heading', { name: 'Education' }).isVisible()) && (await page.getByRole('heading', { name: 'Skills' }).isVisible()));
  await shot(page, 'person', size);
  await personButton.click();
  await panel(page).getByLabel('New list name').fill('E2E Second');
  await panel(page).getByLabel('New list name').press('Enter');
  await page.getByText('Added to E2E Second').waitFor();
  report.add('shortlist from the candidate page', (await personButton.getAttribute('title')) === 'Shortlisted on 2 lists', String(await personButton.getAttribute('title')));
  await page.keyboard.press('Escape');
  await panel(page).waitFor({ state: 'detached' });
  await page.getByRole('link', { name: 'Back to results' }).click();
  await page.waitForURL(`${base}${resultsPath}`);
  report.add('back to results', true, resultsPath);

  // A card on the results page shows the same state without reloading.
  report.add('card button filled after returning', (await trigger(firstCard(page)).getAttribute('aria-pressed')) === 'true');

  // The from parameter only accepts our own results pages.
  const personId = personUrl.match(/\/people\/(cand_\d+)/)![1];
  await page.goto(`${base}/people/${personId}?from=${encodeURIComponent('//evil.example')}`);
  await page.getByRole('heading', { level: 1, name }).waitFor();
  const backHref = await page.getByRole('link', { name: /^Back to/ }).getAttribute('href');
  report.add('back link rejects a foreign path', backHref === '/', `${await page.getByRole('link', { name: /^Back to/ }).textContent()} -> ${backHref}`);
  await page.goto(`${base}/people/cand_999999`);
  await page.getByText('We can’t find that person').waitFor();
  await shot(page, 'person-404', size);
  report.add('candidate 404 state', true);

  // 7. Shortlists page: newest first, rename, create.
  await page.locator('header').getByRole('link', { name: 'Shortlists' }).click();
  await page.waitForURL(`${base}/shortlists`);
  await listLink(page, 'E2E Second').waitFor();
  const names = await page.locator('main ul > li a[href^="/shortlists/"]').allTextContents();
  report.add('lists newest first', names[0]?.startsWith('E2E Second') && names[1]?.startsWith('E2E Hiring'), names.map((n) => n.slice(0, 20)).join(' | '));
  report.add('count and age on each list', (await page.getByText(/1 person · created /).count()) >= 2);
  await shot(page, 'shortlists', size);

  await page.getByRole('button', { name: 'Rename E2E Second' }).click();
  await page.getByLabel('List name').fill('zzz');
  await page.getByLabel('List name').press('Escape');
  report.add('Esc cancels a rename', await listLink(page, 'E2E Second').isVisible());
  await page.getByRole('button', { name: 'Rename E2E Second' }).click();
  await page.getByLabel('List name').fill('   ');
  await page.getByLabel('List name').press('Enter');
  report.add('empty name shows a message', await page.getByText('Give the list a name.').isVisible());
  await page.getByLabel('List name').fill('x'.repeat(81));
  await page.getByLabel('List name').press('Enter');
  report.add('81 characters shows a message', await page.getByText(/80 characters/).isVisible());
  await page.getByLabel('List name').fill('  E2E Renamed  ');
  await page.getByLabel('List name').press('Enter');
  await listLink(page, 'E2E Renamed').waitFor();
  report.add('rename (trimmed) with Enter', true, 'E2E Renamed');

  await page.getByRole('button', { name: 'New list' }).click();
  await page.getByLabel('New list name').fill('E2E Third');
  await page.getByLabel('New list name').press('Enter');
  await listLink(page, 'E2E Third').waitFor();
  report.add('create list on the page', true, '0 people');

  // 8. Detail page: the person as a card, another company cannot open it, remove animates out.
  await listLink(page, 'E2E Hiring').click();
  await page.waitForURL(/\/shortlists\/[0-9a-f-]{36}$/);
  const listPath = page.url().replace(base, '');
  await page.getByRole('heading', { level: 1, name: 'E2E Hiring' }).waitFor();
  await page.locator('ul[aria-label="People on this list"] > li').first().waitFor();
  report.add('list detail shows the person', (await page.getByText('1 person', { exact: true }).isVisible()) && (await page.locator('ul[aria-label="People on this list"] h3 a').first().textContent()) === name, name);
  await shot(page, 'list-detail', size);
  await page.getByRole('button', { name: 'Rename E2E Hiring' }).click();
  await page.getByLabel('List name').fill('E2E Hiring 2');
  await page.getByLabel('List name').press('Enter');
  await page.getByRole('heading', { level: 1, name: 'E2E Hiring 2' }).waitFor();
  report.add('rename on the detail page', true);

  const other = await newContext(browser, size);
  const otherPage = await other.newPage();
  await signIn(otherPage, base, 'recruiter@globex.test');
  await otherPage.goto(`${base}${listPath}`);
  await otherPage.getByText('We can’t find that list').waitFor();
  report.add("another company's list id shows the 404 state", !(await otherPage.getByText('E2E Hiring').count()), 'as globex');
  await shot(otherPage, 'list-404', size);
  // Globex has no lists: the empty states.
  await otherPage.goto(`${base}/shortlists`);
  await otherPage.getByText('No shortlists yet').waitFor();
  await shot(otherPage, 'shortlists-empty', size);
  report.add('shortlists empty state', await otherPage.getByRole('link', { name: 'Go to Search' }).isVisible(), 'New list + pointer to Search');
  await other.close();

  await page.getByRole('button', { name: `Remove ${name} from E2E Hiring 2` }).click();
  await page.getByText('No one here yet').waitFor();
  report.add('remove a person from a list', (await page.getByText('0 people', { exact: true }).isVisible()) && (await page.getByText('Shortlist people from a search.').isVisible()));
  await shot(page, 'list-empty', size);
  await page.getByRole('link', { name: 'Shortlists', exact: true }).first().click();
  await page.waitForURL(`${base}/shortlists`);

  // 9. Delete: the confirm says how many people are on the list.
  await page.getByRole('button', { name: 'Delete E2E Renamed' }).click();
  report.add('delete confirm names the people count', await page.getByText(/1 person is on it/).isVisible());
  await shot(page, 'delete-confirm', size);
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await listLink(page, 'E2E Renamed').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Delete E2E Third' }).click();
  report.add('delete confirm for an empty list', await page.getByText(/No one is on it/).isVisible());
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Delete E2E Third' }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await listLink(page, 'E2E Third').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Delete E2E Hiring 2' }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByText('No shortlists yet').waitFor();
  report.add('delete lists', true, 'all three gone, empty state shows');

  report.add('no page errors (shortlists desktop)', errors.length === 0, errors.join(' | ').slice(0, 200));
  await context.close();
}

async function shortlistMobile(browser: Browser, base: string, resultsPath: string) {
  const size = 'mobile';

  // Empty states, as globex (no lists).
  const g = await newContext(browser, size);
  const gp = await g.newPage();
  await signIn(gp, base, 'recruiter@globex.test');
  await gp.goto(`${base}/shortlists`);
  await gp.getByText('No shortlists yet').waitFor();
  await shot(gp, 'shortlists-empty', size);
  await noHorizontalScroll(gp, 'shortlists empty 375');
  await gp.goto(`${base}/people/cand_0001`);
  await trigger(gp).waitFor();
  await trigger(gp).click();
  await panel(gp).getByText('Create your first list to start shortlisting.').waitFor();
  await shot(gp, 'shortlist-empty', size);
  await g.close();

  // Acme: sheet with lists, candidate page with the sticky bar, lists pages.
  const context = await newContext(browser, size);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await signIn(page, base);
  await page.goto(`${base}${resultsPath}`);
  await total(page);
  const name = (await firstCard(page).locator('h3 a').textContent()) ?? '';
  // A CSS selector: the open sheet is modal and hides the page behind it from role queries.
  const button = firstCard(page).locator('button[aria-label^="Shortlist "]');
  report.add('tap target: card shortlist button', (await button.boundingBox())!.width >= 44 && (await button.boundingBox())!.height >= 44, await tapTargetOk(button));
  await button.click();
  await panel(page).getByLabel('New list name').waitFor();
  await panel(page).getByLabel('New list name').fill('E2E Mobile');
  await panel(page).getByLabel('New list name').press('Enter');
  await page.getByText('Added to E2E Mobile').waitFor();
  report.add('bottom sheet creates a list', (await button.getAttribute('aria-pressed')) === 'true', 'filled');
  const rowBox = await panel(page).getByRole('checkbox', { name: /E2E Mobile/ }).boundingBox();
  report.add('tap target: list row', (rowBox?.height ?? 0) >= 44, `${Math.round(rowBox?.height ?? 0)}px high`);
  await shot(page, 'shortlist-popover', size);
  await page.keyboard.press('Escape');
  await panel(page).waitFor({ state: 'detached' });

  await firstCard(page).locator('h3 a').click();
  await page.waitForURL(/\/people\/cand_\d+\?search=/);
  await page.getByRole('heading', { level: 1, name }).waitFor();
  await trigger(page).waitFor();
  await settle(page);
  const bar = await trigger(page).boundingBox();
  const nav = await page.getByRole('navigation', { name: 'Main' }).boundingBox();
  report.add('sticky Shortlist bar sits above the bottom nav', Boolean(bar && nav && bar.y + bar.height <= nav.y + 1 && bar.height >= 44), `button bottom ${Math.round((bar?.y ?? 0) + (bar?.height ?? 0))}, nav top ${Math.round(nav?.y ?? 0)}`);
  await shot(page, 'person', size);
  await noHorizontalScroll(page, 'candidate 375');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await shot(page, 'person-bottom', size);

  await page.goto(`${base}/shortlists`);
  await listLink(page, 'E2E Mobile').waitFor();
  await shot(page, 'shortlists', size);
  await noHorizontalScroll(page, 'shortlists 375');
  await page.getByRole('button', { name: 'Delete E2E Mobile' }).click();
  await shot(page, 'delete-confirm', size);
  await page.getByRole('button', { name: 'Cancel' }).click();
  await listLink(page, 'E2E Mobile').click();
  await page.locator('ul[aria-label="People on this list"] > li').first().waitFor();
  await shot(page, 'list-detail', size);
  await noHorizontalScroll(page, 'list detail 375');
  const removeBox = await page.getByRole('button', { name: new RegExp(`^Remove ${name}`) }).boundingBox();
  report.add('tap target: Remove', (removeBox?.width ?? 0) >= 44 && (removeBox?.height ?? 0) >= 44, `${Math.round(removeBox?.width ?? 0)}x${Math.round(removeBox?.height ?? 0)}`);
  await page.getByRole('button', { name: new RegExp(`^Remove ${name}`) }).click();
  await page.getByText('No one here yet').waitFor();
  await shot(page, 'list-empty', size);

  report.add('no page errors (shortlists mobile)', errors.length === 0, errors.join(' | ').slice(0, 200));
  await context.close();
}

// ---------------------------------------------------------------------------
// Recent searches, on the FREE plan with the search not used yet
// ---------------------------------------------------------------------------

const DALLAS_BRIEF = 'senior React engineers in Dallas';

async function recentSearchesFlow(browser: Browser, base: string) {
  await setPlan('free', 0);
  const context = await newContext(browser, 'desktop');
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await signIn(page, base);

  // The one free search ends with no one: a city the data does not have.
  const path = await runSearch(page, base, DALLAS_BRIEF);
  const zero = await total(page);
  const unsupported = await page.getByText('Can’t filter by:').isVisible();
  report.add('free search with an unsupported city -> zero', zero === 0 && unsupported, `${zero} people`);
  const { data: used } = await admin.from('companies').select('searches_used').eq('id', 'acme').single();
  report.add('that search used the free one', used?.searches_used === 1, `searches_used=${used?.searches_used}`);

  // Go home: the search is still reachable.
  await page.getByRole('link', { name: 'New search', exact: true }).click();
  await page.waitForURL(`${base}/`);
  const section = page.getByRole('region', { name: 'Recent searches' });
  const item = section.getByRole('link', { name: new RegExp(DALLAS_BRIEF) });
  await item.waitFor();
  report.add('zero-result search listed under Recent searches', (await item.getByText('No results').isVisible()), 'brief, "No results", date');
  report.add('free-plan note points to past searches', await page.getByText('You’ve used your company’s free search. Open a past search below, or edit its filters for free.').isVisible());
  report.add('recent row says it is free', ((await item.getAttribute('title')) ?? '').includes('does not run a new search'), String(await item.getAttribute('title')).slice(0, 60));
  await shot(page, 'home-recent', 'desktop');

  const mobile = await newContext(browser, 'mobile');
  const mp = await mobile.newPage();
  await signIn(mp, base);
  await mp.getByRole('region', { name: 'Recent searches' }).getByRole('link', { name: new RegExp(DALLAS_BRIEF) }).waitFor();
  await shot(mp, 'home-recent', 'mobile');
  await noHorizontalScroll(mp, 'home with recent searches 375');
  await mp.goto(`${base}${path}`);
  await mp.getByText('We can’t search by part of your brief').waitFor();
  await shot(mp, 'empty-unsupported', 'mobile');
  await noHorizontalScroll(mp, 'unsupported empty state 375');
  await mobile.close();

  // Open it from Recent searches: free, no model call.
  await item.click();
  await page.waitForURL(`${base}${path}`);
  await page.getByText('We can’t search by part of your brief').waitFor();
  const button = page.getByRole('button', { name: /^Search without/ });
  report.add('main button is "Search without ..."', (await button.textContent())?.includes('Dallas') === true, String(await button.textContent()));
  report.add('empty state says it does not use a search', await page.getByText(/doesn’t use a search/).isVisible());
  await shot(page, 'empty-unsupported', 'desktop');
  await button.click();
  await page.getByRole('button', { name: /^Search without/ }).waitFor({ state: 'detached' });
  const people = await total(page);
  const { data: after } = await admin.from('companies').select('searches_used').eq('id', 'acme').single();
  const { count } = await admin.from('searches').select('*', { count: 'exact', head: true }).eq('company_id', 'acme').gte('created_at', startedAt).like('brief', 'senior React engineers in Dallas');
  report.add('Search without "Dallas" shows people for free', people > 0 && after?.searches_used === 1 && count === 1, `${people} people, searches_used=${after?.searches_used}, ${count} Dallas search`);
  await shot(page, 'after-search-without', 'desktop');

  report.add('no page errors (recent searches)', errors.length === 0, errors.join(' | ').slice(0, 200));
  await context.close();
}

// ---------------------------------------------------------------------------
// Failed search: the friendly error card
// ---------------------------------------------------------------------------

const ERROR_CARD = '[role="alert"][data-error-kind]';
const RAW_TEXT = /Request failed|Internal Server Error|<html|\b50\d\b|nginx/i;

type Failure = { name: string; title: string; fail: (route: import('playwright').Route) => Promise<void> };
const FAILURES: Failure[] = [
  {
    name: 'html-500',
    title: 'The search didn’t finish',
    fail: (route) => route.fulfill({ status: 500, contentType: 'text/html', body: '<!DOCTYPE html><html><body><h1>500 Internal Server Error</h1><hr>nginx</body></html>' }),
  },
  {
    name: 'json-500',
    title: 'The search didn’t finish',
    fail: (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'internal_error', message: 'Something went wrong.' }) }),
  },
  { name: 'network', title: 'Can’t reach Findlark', fail: (route) => route.abort('connectionreset') },
  {
    name: 'session-401',
    title: 'Your session has expired',
    fail: (route) => route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'unauthorized', message: 'Invalid or expired access token.' }) }),
  },
];

/** Every failure answer for POST /api/search shows the card, with Retry (or Sign in), and no raw status or body. */
async function failedSearchFlow(browser: Browser, base: string, size: 'desktop' | 'mobile', width: number) {
  await setPlan('free', 0);
  const context = await newContext(browser, size, width);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await signIn(page, base);
  const box = page.getByLabel('Describe who you are looking for');
  const label = `${width}px`;

  for (const failure of FAILURES) {
    let calls = 0;
    const isSearch = (url: URL) => url.pathname === '/api/search';
    await page.route(isSearch, (route) => {
      calls += 1;
      return failure.fail(route);
    });
    await box.fill(`backend engineers in Austin (${failure.name})`); // typing clears an earlier card
    await page.locator(ERROR_CARD).waitFor({ state: 'detached' });
    await box.press('Enter');

    const card = page.locator(ERROR_CARD);
    await card.waitFor({ timeout: 10_000 });
    const text = (await card.innerText()).replace(/\s+/g, ' ');
    const signInCase = failure.name === 'session-401';
    const button = card.getByRole('button', { name: signInCase ? 'Sign in again' : 'Retry' });
    report.add(`failed search card: ${failure.name} ${label}`, text.includes(failure.title) && (await button.isVisible()), text.slice(0, 90));
    report.add(`  no raw status or body: ${failure.name} ${label}`, !RAW_TEXT.test(text), '');
    report.add(`  says the search was not used: ${failure.name} ${label}`, text.includes('Your search was not used.'), '');
    if (size === 'mobile') {
      const { height } = (await button.boundingBox()) ?? { height: 0 };
      report.add(`  button is a 44px tap target: ${failure.name} ${label}`, height >= 44, `${Math.round(height)}px`);
      await noHorizontalScroll(page, `failed search card ${failure.name} ${label}`);
    }
    if (failure.name === 'html-500' || failure.name === 'network') await shot(page, `search-error-${failure.name}`, label);

    if (signInCase) {
      // No redirect: the card stays so the recruiter can choose to sign in.
      report.add(`  401 stays on the page: ${label}`, new URL(page.url()).pathname === '/', page.url());
    } else {
      await button.click();
      await page.waitForFunction(() => document.querySelector('[role="alert"][data-error-kind]') !== null);
      await page.waitForTimeout(300);
      report.add(`  Retry sends the search again: ${failure.name} ${label}`, calls === 2, `${calls} requests`);
    }
    await page.unroute(isSearch);
  }

  const { data } = await admin.from('companies').select('searches_used').eq('id', 'acme').single();
  report.add(`failed searches used no search: ${label}`, data?.searches_used === 0, `searches_used=${data?.searches_used}`);
  report.add(`no page errors (failed searches ${label})`, errors.length === 0, errors.join(' | ').slice(0, 200));
  await context.close();
}

// ---------------------------------------------------------------------------
// Phones: fixed and sticky bars are opaque and never cover content
// ---------------------------------------------------------------------------

type BarCheck = { name: string; alpha: number; opacity: number; ok: boolean };

/**
 * Every visible fixed or sticky element on screen, with the alpha of its surface
 * (its own background, or for a transparent positioning wrapper, the first
 * descendant that paints one) and its effective opacity. The decorative backdrop
 * and the dimmed scrim behind dialogs are meant to be see-through, so skipped.
 */
async function fixedBars(page: Page): Promise<BarCheck[]> {
  return page.evaluate(() => {
    const alphaOf = (c: string) => {
      if (!c || c === 'transparent') return 0;
      const slash = c.match(/\/\s*([\d.]+)(%?)\s*\)$/);
      if (slash) return slash[2] ? Number(slash[1]) / 100 : Number(slash[1]);
      const rgba = c.match(/^rgba\(([^)]+)\)$/);
      if (rgba) return Number(rgba[1].split(',')[3]);
      return 1;
    };
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
    };
    const opacity = (el: Element | null) => {
      let o = 1;
      for (let e = el; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity);
      return o;
    };
    const skip = (el: Element) =>
      el.closest('.backdrop') !== null || el.matches('[data-slot$="-overlay"], [data-base-ui-inert]') || el.tagName === 'NEXTJS-PORTAL';
    const name = (el: Element) =>
      [el.tagName.toLowerCase(), el.getAttribute('aria-label') ?? el.getAttribute('data-slot') ?? el.getAttribute('role') ?? (el.className.toString().split(' ').slice(0, 3).join('.'))].join(' ');

    const out: { name: string; alpha: number; opacity: number; ok: boolean }[] = [];
    for (const el of document.querySelectorAll('body *')) {
      const position = getComputedStyle(el).position;
      if ((position !== 'fixed' && position !== 'sticky') || !visible(el) || skip(el)) continue;
      // A fixed element inside another fixed one (e.g. a sheet's content) is checked on its own.
      let surface: Element | null = alphaOf(getComputedStyle(el).backgroundColor) > 0 ? el : null;
      const queue = [...el.children];
      while (!surface && queue.length) {
        const next = queue.shift()!;
        if (visible(next) && alphaOf(getComputedStyle(next).backgroundColor) > 0) surface = next;
        else queue.push(...next.children);
      }
      const alpha = surface ? alphaOf(getComputedStyle(surface).backgroundColor) : 0;
      const o = opacity(surface ?? el);
      out.push({ name: name(el), alpha, opacity: o, ok: alpha === 1 && o > 0.999 });
    }
    return out;
  });
}

/** At the very bottom of the page, the last content ends above the bars pinned to the bottom. */
async function contentClearsBottomBars(page: Page): Promise<{ ok: boolean; detail: string }> {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(300);
  return page.evaluate(() => {
    const pinned = (el: Element) => {
      for (let e: Element | null = el; e; e = e.parentElement) {
        const p = getComputedStyle(e).position;
        if (p === 'fixed' || p === 'sticky') return true;
      }
      return false;
    };
    let barTop = window.innerHeight;
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      if ((cs.position !== 'fixed' && cs.position !== 'sticky') || el.closest('.backdrop')) continue;
      const r = el.getBoundingClientRect();
      // Any bar in the lower half of the screen (bottom nav, Apply bar, Shortlist bar, sticky pagination).
      if (r.height > 0 && r.top > window.innerHeight / 2 && r.top < window.innerHeight) barTop = Math.min(barTop, r.top);
    }
    let contentBottom = 0;
    for (const el of document.querySelectorAll('main a, main button, main p, main h1, main h2, main img, main li')) {
      if (pinned(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.height > 0) contentBottom = Math.max(contentBottom, r.bottom);
    }
    return { ok: contentBottom <= barTop + 1, detail: `content ends at ${Math.round(contentBottom)}, bars start at ${Math.round(barTop)}` };
  });
}

async function checkBars(page: Page, state: string, width: number) {
  await settle(page);
  const bars = await fixedBars(page);
  const bad = bars.filter((b) => !b.ok);
  report.add(
    `opaque fixed/sticky bars: ${state} ${width}px`,
    bars.length > 0 && bad.length === 0,
    bad.length ? bad.map((b) => `${b.name} alpha=${b.alpha} opacity=${b.opacity.toFixed(2)}`).join(' | ') : `${bars.length} checked: ${bars.map((b) => b.name).join(', ')}`,
  );
  await page.screenshot({ path: `${OUT}/e2e-bars-${state}-${width}.png` });
}

async function opaqueBarsFlow(browser: Browser, base: string) {
  // A long result list (mobile engineers who know Kotlin: 213 people, 11 pages),
  // stored with the same SQL functions POST /api/search uses, minus the model call.
  await setPlan('paid', 0);
  const { userId } = await apiSignIn(ACCOUNT);
  const reserved = await admin.rpc('reserve_search', { p_company: 'acme', p_recruiter: userId, p_brief: 'mobile engineers who know Kotlin' });
  if (reserved.error) throw new Error(`reserve_search: ${reserved.error.message}`);
  const filters = Filters.parse({ roles: ['Mobile Engineer'], skills: ['Kotlin'] });
  const finished = await admin.rpc('finish_search', { p_search: reserved.data, p_filters: filters });
  if (finished.error) throw new Error(`finish_search: ${finished.error.message}`);
  const path = `/search/${reserved.data}`;

  for (const width of [360, 390, 430]) {
    const context = await newContext(browser, 'mobile', width);
    const page = await context.newPage();
    await signIn(page, base);

    // Results, scrolled so cards pass under the top bar, sticky pagination and bottom nav.
    await page.goto(`${base}${path}`);
    await total(page);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight / 2));
    await checkBars(page, 'results', width);
    const clear = await contentClearsBottomBars(page);
    report.add(`  content clears bottom bars: results ${width}px`, clear.ok, clear.detail);
    await noHorizontalScroll(page, `results ${width}px`);

    // Staged edit: the Apply bar over the list.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator('button[aria-label^="Remove "]').first().click();
    await page.getByRole('region', { name: 'Unapplied filter changes' }).waitFor();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight / 2));
    await checkBars(page, 'apply-bar', width);
    const clearApply = await contentClearsBottomBars(page);
    report.add(`  content clears bottom bars: apply bar ${width}px`, clearApply.ok, clearApply.detail);
    await page.getByRole('button', { name: 'Reset' }).click();

    // A chip editor opens as a bottom sheet.
    await page.evaluate(() => window.scrollTo(0, 0));
    await chipTriggers(page).first().click();
    await page.getByRole('combobox').waitFor();
    await checkBars(page, 'sheet', width);
    await page.keyboard.press('Escape');

    // A candidate: the sticky Shortlist bar above the bottom nav.
    await firstCard(page).getByRole('link').first().click();
    await page.waitForURL(/\/people\//);
    await page.getByRole('heading', { name: 'Skills' }).waitFor();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight / 3));
    await checkBars(page, 'person', width);
    const clearPerson = await contentClearsBottomBars(page);
    report.add(`  content clears bottom bars: person ${width}px`, clearPerson.ok, clearPerson.detail);
    await context.close();
  }
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  let failed = 1;
  try {
    await setPlan('paid', 0);
    failed = await withServer(async (base) => {
      const browser = await chromium.launch();
      try {
        if (!ONLY || ONLY.has('main')) {
          const paths = await desktopFlow(browser, base);
          await shortlistDesktop(browser, base, paths.resultsPath);
          await mobileShots(browser, base, paths);
          await shortlistMobile(browser, base, paths.resultsPath);
          await recentSearchesFlow(browser, base);
        }
        if (!ONLY || ONLY.has('errors')) {
          await failedSearchFlow(browser, base, 'desktop', 1280);
          await failedSearchFlow(browser, base, 'mobile', 390);
        }
        if (!ONLY || ONLY.has('bars')) await opaqueBarsFlow(browser, base);
      } catch (err) {
        report.add('flow finished', false, err instanceof Error ? err.message.split('\n').slice(0, 30).join(' ¦ ') : String(err));
      } finally {
        await browser.close();
      }
      return report.print();
    });
  } finally {
    await cleanUp();
    console.log('acme reset to free with 0 searches used; e2e saved searches deleted.');
  }
  process.exit(failed ? 1 : 0);
}

main().catch(async (err) => {
  console.error(`e2e failed: ${err instanceof Error ? err.message : err}`);
  await cleanUp().catch(() => {});
  process.exit(1);
});
