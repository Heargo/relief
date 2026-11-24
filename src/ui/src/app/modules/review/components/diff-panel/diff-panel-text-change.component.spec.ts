import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { describe, expect, it, vi } from 'vitest';

import type { DiffResponse } from '../../../../core/models/contract';
import { ReliefApiService } from '../../../../core/services/relief-api.service';
import { TEST_PROVIDERS } from '../../../../../testing/test-providers';
import { DiffPanelComponent } from './diff-panel.component';

const TOTAL = 'pkg:shop::file:src/main/java/shop/Total.java';
const TEXTS: Record<string, string> = {
  [`${TOTAL}|base`]: 'int sum() {\n  return a + b;\n}',
  [`${TOTAL}|head`]: 'int sum() {\n  return a * b;\n}',
};

/** What the API answers for a file no adapter reads whose text changed: a `Modified` file node. */
const RESPONSE: DiffResponse = {
  diff: {
    base: 'a'.repeat(40),
    head: 'b'.repeat(40),
    files: [{ path: 'src/main/java/shop/Total.java', linesAdded: 1, linesRemoved: 1 }],
    nodes: [{ id: TOTAL, status: 'modified', body: true, linesAdded: 1, linesRemoved: 1 }],
    edges: [],
  },
  formatOnly: { files: 0, linesAdded: 0, linesRemoved: 0 },
  formatOnlyPaths: [],
  renames: [],
};

describe('DiffPanelComponent, text change of a file no adapter reads', () => {
  it('shows the text diff of the whole file without any click', async () => {
    const api = {
      code: vi.fn((id: string, side: string) => Promise.resolve(TEXTS[`${id}|${side}`])),
    };
    TestBed.configureTestingModule({
      imports: [DiffPanelComponent],
      providers: [...TEST_PROVIDERS, { provide: ReliefApiService, useValue: api }],
    });
    await TestBed.inject(TranslateService).use('en').toPromise();
    const fixture = TestBed.createComponent(DiffPanelComponent);
    fixture.componentRef.setInput('diff', RESPONSE);
    fixture.componentRef.setInput('nodeId', TOTAL);
    fixture.componentRef.setInput('range', 'main...feat/x');
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const q = (id: string) => el.querySelector(`[data-testid="${id}"]`);
    expect(q('diff-format-only')).toBeNull();
    expect(q('diff-show-anyway')).toBeNull();
    const kinds = Array.from(el.querySelectorAll<HTMLElement>('[data-testid="diff-line"]')).map(
      (l) => l.dataset['kind'],
    );
    expect(kinds).toEqual(['context', 'removed', 'added', 'context']);
  });
});
