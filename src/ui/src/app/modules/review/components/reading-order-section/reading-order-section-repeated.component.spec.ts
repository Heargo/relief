import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { describe, expect, it } from 'vitest';

import type { ReadingItem, RepeatedChange } from '../../../../core/models/contract';
import { TEST_PROVIDERS } from '../../../../../testing/test-providers';
import { ReadingOrderSectionComponent } from './reading-order-section.component';

// R18. New input `repeated: RepeatedChange[]` and output `groupMark: string` (the representative).
//  - the representative's `reading-row` carries `data-group-size` ("4") and reads "×4";
//  - once the representative is seen and members are not, a `reading-group-prompt` shows under it
//    with a `reading-group-mark` button; clicking it emits `groupMark(representative)`;
//  - no prompt otherwise.
const F = (n: number) => `pkg:app/src/features::file:src/features/f${n}.ts`;
const GROUP: RepeatedChange = {
  representative: F(1),
  members: [F(1), F(2), F(3), F(4)],
  summary: [],
};
// The business already lists a group once.
const ITEMS = [F(1), F(5), F(6)].map((id) => ({
  id,
  reasons: [{ kind: 'lines', added: 1, removed: 0 }],
})) as ReadingItem[];

async function render(seen: string[] = []) {
  TestBed.configureTestingModule({
    imports: [ReadingOrderSectionComponent],
    providers: TEST_PROVIDERS,
  });
  await TestBed.inject(TranslateService).use('en');
  const fixture = TestBed.createComponent(ReadingOrderSectionComponent);
  const ref = fixture.componentRef;
  ref.setInput('items', ITEMS);
  ref.setInput('progress', { seen: seen.length, total: 3 });
  ref.setInput('repeated', [GROUP]);
  ref.setInput('seenIds', new Set(seen));
  const marked: string[] = [];
  fixture.componentInstance.groupMark.subscribe((id: string) => marked.push(id));
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const q = (id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const row = (id: string) =>
    el.querySelector<HTMLElement>(`[data-testid="reading-row"][data-node-id="${id}"]`);
  return { q, row, marked, el };
}

describe('ReadingOrderSectionComponent, repeated changes', () => {
  it('marks the group size on the representative row', async () => {
    const { row } = await render();

    expect(row(F(1))?.getAttribute('data-group-size')).toBe('4');
    expect(row(F(1))?.textContent).toContain('×4');
    expect(row(F(5))?.hasAttribute('data-group-size')).toBe(false);
  });

  it('proposes to mark the group once the representative is seen', async () => {
    const { q, marked } = await render([F(1)]);

    expect(q('reading-group-prompt')).not.toBeNull();
    q('reading-group-mark')!.click();

    expect(marked).toEqual([F(1)]);
  });

  it('proposes nothing while the representative is not seen', async () => {
    const { q } = await render([F(5)]);

    expect(q('reading-group-prompt')).toBeNull();
  });

  it('proposes nothing once the whole group is seen', async () => {
    const { q } = await render([F(1), F(2), F(3), F(4)]);

    expect(q('reading-group-prompt')).toBeNull();
  });
});
