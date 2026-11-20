import { browser, expect } from '@wdio/globals';
import { openRelief } from '../helpers/open-relief';
import { tid } from '../helpers/ui';

// Contract with the UI (left panel like the mockup, `.sec` / `.seg` / `.tog`):
//  - the mode switch (`review-toggle`, `explore-toggle`) is a segmented control at the top of
//    `left-panel`, not in the top bar;
//  - the section titles (`h3` of `layers-section`, `layout-section`) are 11 px, uppercase;
//  - the layers are switches (`role="switch"`, `aria-checked`) on `toggle-*` test ids;
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
  await expect(tid('layers-section')).toBeDisplayed();
  for (const id of ['layers-section', 'layout-section']) {
    expect(await style(id, 'h3')).toEqual({ size: '11px', transform: 'uppercase' });
  }
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
      first: panel.firstElementChild!.contains(review),
    };
  });
  expect(placed).toEqual({ inPanel: true, inTopbar: false, first: true });
  await expect(tid('review-toggle')).toHaveAttribute('aria-pressed', 'true');
  await tid('explore-toggle').click();
  await expect(tid('explore-toggle')).toHaveAttribute('aria-pressed', 'true');
  await expect(tid('review-toggle')).toHaveAttribute('aria-pressed', 'false');
});

it('the layers are switches that flip on click', async () => {
  await openRelief({ size: { width: 1280, height: 800 } });
  await expect(tid('toggle-focus-layer')).toBeDisplayed();
  await expect(tid('toggle-focus-layer')).toHaveAttribute('role', 'switch');
  const before = await tid('toggle-focus-layer').getAttribute('aria-checked');
  await tid('toggle-focus-layer').click();
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
// display block (`display-section`: layers, then layout), common to both modes.
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
  expect(await orderOf(['pr-card', 'reading-order', 'layers-section', 'layout-section'])).toEqual([
    'pr-card',
    'reading-order',
    'layers-section',
    'layout-section',
  ]);
  const inTools = await browser.execute(() => {
    const tools = document.querySelector('[data-testid="tools-section"]')!;
    const display = document.querySelector('[data-testid="display-section"]')!;
    return {
      card: tools.contains(document.querySelector('[data-testid="pr-card"]')),
      layers: display.contains(document.querySelector('[data-testid="layers-section"]')),
      layout: display.contains(document.querySelector('[data-testid="layout-section"]')),
    };
  });
  expect(inTools).toEqual({ card: true, layers: true, layout: true });
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
  expect(
    await orderOf(['entry-points-section', 'hotspots-section', 'layers-section', 'layout-section']),
  ).toEqual(['entry-points-section', 'hotspots-section', 'layers-section', 'layout-section']);
  await expect(tid('pr-card')).not.toBeExisting();
  await expect(tid('toggle-diff-layer')).not.toBeExisting();
  await expect(tid('toggle-co-change-layer')).toBeDisplayed();
  await expect(tid('toggle-hide-external')).toBeDisplayed();
});
