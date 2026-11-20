import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { describe, expect, it } from 'vitest';

import type { ReadingItem } from '../../../../core/models/contract';
import { TEST_PROVIDERS } from '../../../../../testing/test-providers';
import type { ReadingMode } from '../../business/reading-order.business';
import { ReadingOrderSectionComponent } from './reading-order-section.component';

const FILE = 'pkg:@acme/api/billing::file:apps/api/billing/invoice.ts';
const ITEMS = [{ id: FILE, reasons: [{ kind: 'lines', added: 3, removed: 1 }] }] as ReadingItem[];

async function render(
  options: { mode?: ReadingMode; selected?: string | null; selectedCommit?: string | null } = {},
) {
  TestBed.configureTestingModule({
    imports: [ReadingOrderSectionComponent],
    providers: TEST_PROVIDERS,
  });
  await TestBed.inject(TranslateService).use('en');
  const fixture = TestBed.createComponent(ReadingOrderSectionComponent);
  const ref = fixture.componentRef;
  ref.setInput('items', ITEMS);
  ref.setInput('progress', { seen: 0, total: 1 });
  ref.setInput('mode', options.mode ?? 'file');
  ref.setInput('selected', options.selected ?? null);
  ref.setInput('selectedCommit', options.selectedCommit ?? null);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const byId = (id: string) => el.querySelector(`[data-testid="${id}"]`) as HTMLElement;
  return { el, byId };
}

describe('ReadingOrderSectionComponent controls', () => {
  it('renders the reading mode as a segmented control, the active one on and pressed', async () => {
    const { byId } = await render({ mode: 'symbol' });
    const seg = byId('reading-mode-symbol').closest('.seg');
    expect(seg, 'a .seg around the mode buttons').not.toBeNull();
    expect(seg?.contains(byId('reading-mode-file'))).toBe(true);
    expect(seg?.contains(byId('reading-mode-commit'))).toBe(true);
    expect(byId('reading-mode-symbol').classList.contains('on')).toBe(true);
    expect(byId('reading-mode-symbol').getAttribute('aria-pressed')).toBe('true');
    expect(byId('reading-mode-file').classList.contains('on')).toBe(false);
    expect(byId('reading-mode-file').getAttribute('aria-pressed')).toBe('false');
  });

  it('"Mark seen" and "Seen, next" are .iconbtn buttons, disabled without a selection', async () => {
    const { byId } = await render();
    for (const id of ['reading-mark', 'reading-mark-next']) {
      expect(byId(id).classList.contains('iconbtn'), id).toBe(true);
      expect((byId(id) as HTMLButtonElement).disabled, id).toBe(true);
    }
  });

  it('keeps them enabled .iconbtn buttons once an entry is selected', async () => {
    const { byId } = await render({ selected: FILE });
    for (const id of ['reading-mark', 'reading-mark-next']) {
      expect(byId(id).classList.contains('iconbtn'), id).toBe(true);
      expect((byId(id) as HTMLButtonElement).disabled, id).toBe(false);
    }
  });

  it('"Show all" is an .iconbtn button', async () => {
    const { byId } = await render({ mode: 'commit', selectedCommit: 'abc1234' });
    expect(byId('commit-show-all').classList.contains('iconbtn')).toBe(true);
  });
});
