import { $, $$, expect } from '@wdio/globals';
import { openRelief } from '../helpers/open-relief';
import { waitForNode, waitForNodeMatching } from '../helpers/map-scene';
import { press, tid, tids, typeText } from '../helpers/ui';

// Contract with the UI (data attributes, no i18n dependency):
//  - the search field is `data-testid="search"`, its results `search-results` with one
//    `search-result` per hit (the active one has `aria-selected="true"`);
//  - the breadcrumbs are `data-testid="breadcrumbs"`, one `breadcrumb` per crumb;
//  - the help window is `data-testid="shortcuts-help"`; the Shortcuts row of the settings menu is `menu-item-shortcuts`;
//  - the selected node shows in `selected-node` with `data-node-id`.
const CRUMBS = 'acme-shop › apps/api › auth/ › session.ts › SessionStore.refresh';
const REFRESH_ID = expect.stringMatching(/sym:SessionStore\.refresh$/);

async function openMap() {
  await openRelief();
  await waitForNode('pkg:@acme/api');
}

async function searchRefresh() {
  await press('/');
  await expect(tid('search')).toBeFocused();
  await typeText('refresh');
  await expect(tid('search-results')).toBeDisplayed();
}

async function selectRefresh() {
  await searchRefresh();
  await press('Enter');
  await expect(tid('selected-node')).toHaveAttribute('data-node-id', REFRESH_ID);
}

it('/, refresh, Enter selects SessionStore.refresh and shows it in the breadcrumbs', async () => {
  await openMap();
  await searchRefresh();
  await expect(tids('search-result')[0]).toHaveText(
    expect.stringContaining('SessionStore.refresh'),
  );
  await press('Enter');

  await expect(tid('selected-node')).toHaveAttribute('data-node-id', REFRESH_ID);
  await waitForNodeMatching((id) => id.endsWith('sym:SessionStore.refresh'));
  await expect(tid('breadcrumbs')).toHaveText(CRUMBS);
  await expect(tid('search-results')).not.toBeDisplayed();
});

it('the arrow keys move in the results list', async () => {
  await openMap();
  await press('/');
  await typeText('session');
  const results = tids('search-result');
  await expect(results[1]).toBeDisplayed();
  await expect(results[0]).toHaveAttribute('aria-selected', 'true');
  await press('ArrowDown');
  await expect(results[1]).toHaveAttribute('aria-selected', 'true');
  await expect(results[0]).toHaveAttribute('aria-selected', 'false');
  await press('ArrowUp');
  await expect(results[0]).toHaveAttribute('aria-selected', 'true');
});

it('typing in the search field does not change the level', async () => {
  await openMap();
  await expect(tid('current-level')).toHaveAttribute('data-level', '0');
  await press('/');
  await typeText('3 2 1 ?');
  await expect(tid('search')).toHaveValue('3 2 1 ?');
  await expect(tid('current-level')).toHaveAttribute('data-level', '0');
  await expect(tid('shortcuts-help')).not.toBeDisplayed();
});

it('Escape in the search field closes the results and clears the field', async () => {
  await openMap();
  await searchRefresh();
  await press('Escape');
  await expect(tid('search-results')).not.toBeDisplayed();
  await expect(tid('search')).toHaveValue('');
});

it('clicking an ancestor in the breadcrumbs frames it', async () => {
  await openMap();
  await selectRefresh();
  await $('//*[@data-testid="breadcrumb"][contains(., "auth/")]').click();
  await expect(tid('selected-node')).toHaveAttribute('data-node-id', 'pkg:@acme/api/auth');
  await expect(tid('breadcrumbs')).toHaveText('acme-shop › apps/api › auth/');
});

it('Escape deselects, then goes up a level, then shows everything', async () => {
  await openMap();
  await selectRefresh();
  await press('3');
  await expect(tid('current-level')).toHaveAttribute('data-level', '3');

  await press('Escape');
  await expect($$('[data-testid="selected-node"]')).toBeElementsArrayOfSize(0);
  await expect(tid('current-level')).toHaveAttribute('data-level', '3');

  await press('Escape');
  await expect(tid('current-level')).toHaveAttribute('data-level', '2');

  await press('Escape');
  await press('Escape');
  await expect(tid('current-level')).toHaveAttribute('data-level', '0');
});

it('? opens the shortcuts help, Escape closes it', async () => {
  await openMap();
  await expect(tid('shortcuts-help')).not.toBeDisplayed();
  await press('?');
  const help = tid('shortcuts-help');
  await expect(help).toBeDisplayed();
  for (const key of ['0', '1', '2', '3', '/', '?', 'Esc']) {
    await expect(help.$(`.//kbd[starts-with(normalize-space(.), "${key}")]`)).toBeDisplayed();
  }
  await press('Escape');
  await expect(help).not.toBeDisplayed();
  await tid('menu-trigger-settings').click();
  await tid('menu-item-shortcuts').click();
  await expect(tid('menu-panel')).not.toBeDisplayed();
  await expect(help).toBeDisplayed();
});

it('the level keys still work outside the search field', async () => {
  await openMap();
  await press('2');
  await expect(tid('current-level')).toHaveAttribute('data-level', '2');
});
