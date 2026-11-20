import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DiffResponse, MetaResponse, NodeChange } from '../../../../core/models/contract';
import { ReliefApiService } from '../../../../core/services/relief-api.service';
import { TEST_PROVIDERS } from '../../../../../testing/test-providers';
import { MapPageComponent } from './map-page.component';

const META: MetaResponse = {
  repo: 'acme-shop',
  range: 'main...feat/promo-codes',
  branches: ['main', 'feat/promo-codes'],
  tags: [],
};
const SNAPSHOT = {
  graph: {
    commit: '0123456789abcdef0123456789abcdef01234567',
    edges: [],
    nodes: [
      {
        id: 'pkg:@acme/web',
        kind: 'package',
        subkind: 'ts',
        parent: null,
        visibility: 'public',
        contentHash: 'h',
      },
    ],
  },
  meta: {},
};
const FILE = 'pkg:@acme/web::file:src/a.ts';

/** `count` symbols per status, and `count` renamed files. */
function diffOf(count: number): DiffResponse {
  const nodes: NodeChange[] = [];
  for (const status of ['added', 'removed', 'modified', 'moved'] as const) {
    for (let i = 0; i < count; i++) {
      const id = `${FILE}::sym:${status}${i}`;
      const extra =
        status === 'modified'
          ? { body: true }
          : status === 'moved'
            ? { from: `${id}old`, body: false }
            : {};
      nodes.push({ id, status, linesAdded: 0, linesRemoved: 0, ...extra } as NodeChange);
    }
  }
  return {
    diff: { base: 'a'.repeat(40), head: 'b'.repeat(40), files: [], nodes, edges: [] },
    formatOnly: { files: 0, linesAdded: 0, linesRemoved: 0 },
    renames: Array.from({ length: count }, (_, i) => ({ from: `old${i}.ts`, to: `new${i}.ts` })),
  };
}

const api = { meta: vi.fn(), snapshot: vi.fn(), diff: vi.fn() };

async function cardText(lang: 'en' | 'fr', count: number): Promise<string> {
  api.diff.mockResolvedValue(diffOf(count));
  TestBed.configureTestingModule({
    imports: [MapPageComponent],
    providers: [...TEST_PROVIDERS, { provide: ReliefApiService, useValue: api }],
  });
  await TestBed.inject(TranslateService).use(lang).toPromise();
  const fixture = TestBed.createComponent(MapPageComponent);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const stats = el.querySelector<HTMLElement>('[data-testid="pr-stats"]');
  return (stats?.textContent ?? '').replace(/\s+/g, ' ');
}

describe('MapPageComponent, PR card plurals', () => {
  beforeEach(() => {
    api.meta.mockReset().mockResolvedValue(META);
    api.snapshot.mockReset().mockResolvedValue(SNAPSHOT);
    api.diff.mockReset();
  });

  it('uses the singular in English for a count of 1', async () => {
    const text = await cardText('en', 1);
    expect(text).toContain('1 file moved');
    expect(text).not.toContain('1 files moved');
  });

  it('uses the plural in English for a count of 2', async () => {
    expect(await cardText('en', 2)).toContain('2 files moved');
  });

  it('uses the singular in French for a count of 1', async () => {
    const text = await cardText('fr', 1);
    expect(text).toContain('1 ajouté');
    expect(text).toContain('1 modifié');
    expect(text).toContain('1 supprimé');
    expect(text).toContain('1 déplacé');
    expect(text).toContain('1 fichier déplacé');
    expect(text).not.toMatch(/1 (ajoutés|modifiés|supprimés|déplacés|fichiers déplacés)/);
  });

  it('uses the plural in French for a count of 2', async () => {
    const text = await cardText('fr', 2);
    expect(text).toContain('2 ajoutés');
    expect(text).toContain('2 modifiés');
    expect(text).toContain('2 supprimés');
    expect(text).toContain('2 déplacés');
    expect(text).toContain('2 fichiers déplacés');
  });
});
