import { browser, expect } from '@wdio/globals';
import { openRelief } from '../helpers/open-relief';
import { openLayersMenu, tid, toggleLayer } from '../helpers/ui';

// Contract with the UI (left panel like the mockup, `.sec` / `.seg` / `.tog`):
//  - the mode switch (`review-toggle`, `explore-toggle`) is a segmented control at the top of
//    `left-panel`, not in the top bar;
//  - the section titles (`h3` of `layout-section`) are 11 px, uppercase;
//  - the layers live in the Layers menu of the top bar (`menu-trigger-layers`, between Workspace
//    and Settings), as menu checkboxes (`role="menuitemcheckbox"`, `aria-checked`) on `toggle-*`;
//  - the PR card has a progress bar `pr-progress` (`role="progressbar"`).

const style = (testId: string, selector: string) =>
  browser.execute(
    (id: string, sel: string) => {
      const el = document.querySelector(`[data-testid="${id}"] ${sel}`);
      if (!el) throw new Error(`${id} ${sel} not found`);
      const s = getComputedStyle(el);
      return { size: s.fontSize, transform: s.textTransform };
    },
    testId,
    selector,
  );

it('a section title is 11 px and uppercase', async () => {
  await openRelief({ size: { width: 1280, height: 800 } });
  await expect(tid('layout-section')).toBeDisplayed();
  expect(await style('layout-section', 'h3')).toEqual({ size: '11px', transform: 'uppercase' });
});

it('the mode switch sits at the top of the left panel and switches the mode', async () => {
  await openRelief({ size: { width: 1280, height: 800 } });
  await expect(tid('review-toggle')).toBeDisplayed();
  const placed = await browser.execute(() => {
    const panel = document.querySelector('[data-testid="left-panel"]')!;
    const review = document.querySelector('[data-testid="review-toggle"]')!;
    const explore = document.querySelector('[data-testid="explore-toggle"]')!;
    return {
      inPanel: panel.contains(review) && panel.contains(explore),
      inTopbar: !!document.querySelector('header.topbar [data-testid="review-toggle"]'),
      first: panel.children[1].contains(review),
    };
  });
  expect(placed).toEqual({ inPanel: true, inTopbar: false, first: true });
  await expect(tid('review-toggle')).toHaveAttribute('aria-pressed', 'true');
  await tid('explore-toggle').click();
  await expect(tid('explore-toggle')).toHaveAttribute('aria-pressed', 'true');
  await expect(tid('review-toggle')).toHaveAttribute('aria-pressed', 'false');
});

it('the layers sit in the Layers menu of the top bar, between Workspace and Settings', async () => {
  await openRelief({ size: { width: 1280, height: 800 } });
  const triggers = await browser.execute(() =>
    [...document.querySelectorAll('header.topbar [data-testid^="menu-trigger-"]')].map((el) =>
      el.getAttribute('data-testid'),
    ),
  );
  expect(triggers).toEqual([
    'menu-trigger-workspace',
    'menu-trigger-layers',
    'menu-trigger-settings',
    'menu-trigger-help',
  ]);
  const inPanel = await browser.execute(
    () => !!document.querySelector('[data-testid="left-panel"] [data-testid="layers-section"]'),
  );
  expect(inPanel).toBe(false);
  await openLayersMenu();
  await expect(tid('toggle-focus-layer')).toBeDisplayed();
});

it('the layers are menu checkboxes that flip on click', async () => {
  await openRelief({ size: { width: 1280, height: 800 } });
  await expect(tid('toggle-focus-layer')).toHaveAttribute('role', 'menuitemcheckbox');
  const before = await tid('toggle-focus-layer').getAttribute('aria-checked');
  await toggleLayer('toggle-focus-layer');
  await expect(tid('toggle-focus-layer')).toHaveAttribute(
    'aria-checked',
    before === 'true' ? 'false' : 'true',
  );
});

it('the PR card shows the range and a progress bar', async () => {
  await openRelief({ size: { width: 1280, height: 800 } });
  await expect(tid('pr-card')).toBeDisplayed();
  await expect(tid('pr-progress')).toHaveAttribute('role', 'progressbar');
  await expect(tid('pr-progress')).toHaveAttribute('aria-valuenow', /^\d+$/);
  await expect(tid('pr-range')).toHaveText(expect.stringContaining('...'));
});

// U16: the left panel stacks the mode switch, the tools of the mode (`tools-section`), then the
// display block (`display-section`: the layout), common to both modes. The layers are in the top
// bar's Layers menu.
const orderOf = (ids: string[]) =>
  browser.execute((list: string[]) => {
    const found = list
      .map((id) => ({ id, el: document.querySelector(`[data-testid="${id}"]`) }))
      .filter((x) => x.el);
    found.sort((a, b) =>
      a.el!.compareDocumentPosition(b.el!) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
    );
    return found.map((x) => x.id);
  }, ids);

it('in PR mode the panel reads switch, PR tools, then display', async () => {
  await openRelief({ size: { width: 1280, height: 800 } });
  await expect(tid('tools-section')).toBeDisplayed();
  await expect(tid('display-section')).toBeDisplayed();
  expect(await orderOf(['review-toggle', 'tools-section', 'display-section'])).toEqual([
    'review-toggle',
    'tools-section',
    'display-section',
  ]);
  expect(await orderOf(['pr-card', 'reading-order', 'layout-section'])).toEqual([
    'pr-card',
    'reading-order',
    'layout-section',
  ]);
  const inTools = await browser.execute(() => {
    const tools = document.querySelector('[data-testid="tools-section"]')!;
    const display = document.querySelector('[data-testid="display-section"]')!;
    return {
      card: tools.contains(document.querySelector('[data-testid="pr-card"]')),
      layout: display.contains(document.querySelector('[data-testid="layout-section"]')),
    };
  });
  expect(inTools).toEqual({ card: true, layout: true });
  await openLayersMenu();
  await expect(tid('toggle-diff-layer')).toBeDisplayed();
  await expect(tid('toggle-co-change-layer')).not.toBeExisting();
});

it('in Explorer the panel reads switch, explore tools, then the same display block', async () => {
  await openRelief({ size: { width: 1280, height: 800 } });
  await tid('explore-toggle').click();
  await expect(tid('hotspots-section')).toBeDisplayed();
  expect(await orderOf(['explore-toggle', 'tools-section', 'display-section'])).toEqual([
    'explore-toggle',
    'tools-section',
    'display-section',
  ]);
  expect(await orderOf(['entry-points-section', 'hotspots-section', 'layout-section'])).toEqual([
    'entry-points-section',
    'hotspots-section',
    'layout-section',
  ]);
  await expect(tid('pr-card')).not.toBeExisting();
  await openLayersMenu();
  await expect(tid('toggle-diff-layer')).not.toBeExisting();
  await expect(tid('toggle-co-change-layer')).toBeDisplayed();
  await expect(tid('toggle-hide-external')).toBeDisplayed();
});
