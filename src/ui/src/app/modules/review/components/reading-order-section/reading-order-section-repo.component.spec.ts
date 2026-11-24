import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { describe, expect, it } from 'vitest';

import { TEST_PROVIDERS } from '../../../../../testing/test-providers';
import type { CommitRow } from '../../business/reading-order.business';
import { ReadingOrderSectionComponent } from './reading-order-section.component';

// K16: in a workspace a commit of the per-commit reading names its repository (`commit-repo`);
// on a single repository the tag is absent.
const row = (commit: string, repo?: string): CommitRow => ({
  commit,
  short: commit.slice(0, 7),
  message: `message ${commit}`,
  files: [],
  otherFiles: 0,
  progress: { seen: 0, total: 0 },
  ...(repo ? { repo } : {}),
});

async function render(commits: CommitRow[]) {
  TestBed.configureTestingModule({
    imports: [ReadingOrderSectionComponent],
    providers: TEST_PROVIDERS,
  });
  await TestBed.inject(TranslateService).use('en');
  const fixture = TestBed.createComponent(ReadingOrderSectionComponent);
  fixture.componentRef.setInput('mode', 'commit');
  fixture.componentRef.setInput('items', []);
  fixture.componentRef.setInput('progress', { seen: 0, total: 0 });
  fixture.componentRef.setInput('commits', commits);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('ReadingOrderSectionComponent, commits of a workspace', () => {
  it('names the repository before the commit', async () => {
    const el = await render([row('aaaaaaa1', 'web'), row('bbbbbbb2', 'api')]);
    const tags = [...el.querySelectorAll('[data-testid="commit-repo"]')].map((t) => t.textContent);
    expect(tags).toEqual(['web', 'api']);
  });

  it('shows no repository on a single repository', async () => {
    const el = await render([row('aaaaaaa1')]);
    expect(el.querySelector('[data-testid="commit-row"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="commit-repo"]')).toBeNull();
  });
});
