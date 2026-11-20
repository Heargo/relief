import { $, $$, browser, expect } from '@wdio/globals';
import { openRelief } from '../helpers/open-relief';
import { tid } from '../helpers/ui';

// Edge labels and node headers like the mockup, on acme-shop (main...feat/promo-codes), level 0:
//  - an edge label is an SVG `text.el` inside the `data-testid="map-edge"` element, never a circle;
//  - the label carries the status class (base | add | del | viol | mov);
//  - a node label is `.lb` in the `.hd` header of a `data-testid="map-node"`.
const WEB = 'pkg:@acme/web';
const DB = 'pkg:@acme/db';
const API = 'pkg:@acme/api';

// A large viewport, so that the level-0 edges are longer than the 60 px under which a label is hidden.
it('no edge label is a circle; web -> db reads "⚠ 2" (rule violation), web -> api "3 +1"', async () => {
  await openRelief({ size: { width: 3200, height: 2000 } });
  await expect(tid('current-level')).toHaveAttribute('data-level', '0');
  await expect($('[data-testid="map-edge"]')).toBeExisting();
  await expect($$('[data-testid="map-edges"] circle')).toBeElementsArrayOfSize(0);

  const violation = $(`[data-testid="map-edge"][data-from="${WEB}"][data-to="${DB}"] text.el`);
  await expect(violation).toBeExisting();
  await expect(violation).toHaveText('⚠ 2');
  await expect(violation).toHaveElementClass('viol');

  const changed = $(`[data-testid="map-edge"][data-from="${WEB}"][data-to="${API}"] text.el`);
  await expect(changed).toHaveText('3 +1');
  await expect(changed).toHaveElementClass('base');
});

it('shows the whole label of every system at 1280 px, without ellipsis', async () => {
  await openRelief({ size: { width: 1280, height: 720 } });
  await expect(tid('current-level')).toHaveAttribute('data-level', '0');
  const labels = await browser.execute(() =>
    Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-testid="map-node"][data-kind="package"] > .hd > .lb',
      ),
    ).map((lb) => ({
      text: lb.textContent ?? '',
      clipped: lb.scrollWidth > lb.clientWidth,
      flex: getComputedStyle(lb).flex,
      headFont: getComputedStyle(lb.parentElement!).fontSize,
      headHeight: getComputedStyle(lb.parentElement!).height,
    })),
  );
  expect(labels.length).toBeGreaterThan(0);
  for (const label of labels) {
    expect(label.text.length).toBeGreaterThan(0);
    expect({ text: label.text, clipped: label.clipped }).toEqual({
      text: label.text,
      clipped: false,
    });
    // Mockup, `.k-system>.hd`: 15 px, 38 px high; the label never shrinks while the box has room.
    expect({ text: label.text, head: [label.headFont, label.headHeight, label.flex] }).toEqual({
      text: label.text,
      head: ['15px', '38px', '0 0 auto'],
    });
  }
});
