import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { describe, expect, it, vi } from 'vitest';

import type { MetaResponse } from '../models/contract';
import { DocumentTitleService } from './document-title.service';
import { ReliefApiService } from './relief-api.service';

function setup(meta: () => Promise<MetaResponse>): Title {
  TestBed.configureTestingModule({
    providers: [{ provide: ReliefApiService, useValue: { meta } }],
  });
  const title = TestBed.inject(Title);
  title.setTitle('relief');
  return title;
}

describe('DocumentTitleService', () => {
  it('puts the repository name from ReliefApiService.meta() in the title', async () => {
    const title = setup(() => Promise.resolve({ repo: 'acme-shop' } as MetaResponse));
    await TestBed.inject(DocumentTitleService).init();
    expect(title.getTitle()).toBe('acme-shop · relief');
  });

  it('keeps the default title when meta() fails', async () => {
    const meta = vi.fn(() => Promise.reject(new Error('no api')));
    const title = setup(meta);
    await TestBed.inject(DocumentTitleService).init();
    expect(title.getTitle()).toBe('relief');
  });
});
