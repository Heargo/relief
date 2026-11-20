import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MetaResponse, SnapshotResponse } from '../../../../core/models/contract';
import { ReliefApiService } from '../../../../core/services/relief-api.service';
import { TEST_PROVIDERS } from '../../../../../testing/test-providers';
import { MapPageComponent } from './map-page.component';

const META: MetaResponse = {
  repo: 'acme-shop',
  range: 'main...feat/promo-codes',
  branches: ['main', 'feat/promo-codes'],
  tags: [],
};
const PKG = 'pkg:@acme/api';
const FILE = `${PKG}::file:src/checkout.ts`;
const ROUTE = `${FILE}::sym:postCheckout`;
const CHARGE = `${FILE}::sym:chargeCustomer`;
const STRIPE = 'pkg:external/stripe-sdk';

function node(id: string, kind: string, parent: string | null, extra: object = {}) {
  return { id, kind, subkind: 'ts', parent, visibility: 'public', contentHash: 'h', ...extra };
}

const SNAPSHOT = {
  graph: {
    commit: '0123456789abcdef0123456789abcdef01234567',
    nodes: [
      node(PKG, 'package', null),
      node(FILE, 'file', PKG),
      node(ROUTE, 'symbol', FILE, { entry: true, entryType: 'route', route: 'POST /checkout' }),
      node(CHARGE, 'symbol', FILE),
      node('pkg:external', 'external', null),
      node(STRIPE, 'external', 'pkg:external'),
    ],
    edges: [{ from: ROUTE, to: CHARGE, kind: 'calls', precision: 'exact' }],
  },
  meta: { adapters: ['ts'], detector: 'workspace', warnings: [] },
} as unknown as SnapshotResponse;

const api = {
  meta: vi.fn(),
  snapshot: vi.fn(),
  diff: vi.fn(),
  impact: vi.fn(),
  rules: vi.fn(),
  reviewSummary: vi.fn(),
  readingOrder: vi.fn(),
  commitReading: vi.fn(),
  reviewState: vi.fn(),
  setReviewState: vi.fn(),
  openDocs: vi.fn(),
};

function byTestId(el: HTMLElement, id: string): HTMLElement | null {
  return el.querySelector<HTMLElement>(`[data-testid="${id}"]`);
}

async function exploreAndClickRoute() {
  TestBed.configureTestingModule({
    imports: [MapPageComponent],
    providers: [...TEST_PROVIDERS, { provide: ReliefApiService, useValue: api }],
  });
  await TestBed.inject(TranslateService).use('en').toPromise();
  const fixture = TestBed.createComponent(MapPageComponent);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  byTestId(el, 'explore-toggle')?.click();
  await fixture.whenStable();
  el.querySelector<HTMLElement>(
    `[data-testid="entry-point-row"][data-node-id="${ROUTE}"]`,
  )?.click();
  await fixture.whenStable();
  return el;
}

describe('MapPageComponent, flow trace from an entry point', () => {
  beforeEach(() => {
    localStorage.clear();
    api.meta.mockReset().mockResolvedValue(META);
    api.snapshot.mockReset().mockResolvedValue(SNAPSHOT);
    api.diff.mockReset().mockRejectedValue(new Error('no diff'));
    api.rules.mockReset().mockRejectedValue(new Error('no rules'));
    api.reviewSummary.mockReset().mockRejectedValue(new Error('no summary'));
    api.readingOrder.mockReset().mockRejectedValue(new Error('no order'));
    api.commitReading.mockReset().mockRejectedValue(new Error('no commits'));
    api.reviewState.mockReset().mockRejectedValue(new Error('no state'));
    api.setReviewState.mockReset().mockResolvedValue(undefined);
    api.openDocs.mockReset().mockResolvedValue(undefined);
    api.impact.mockReset().mockResolvedValue({
      reached: [
        { node: CHARGE, depth: 1, kind: 'calls', via: [ROUTE], outOfDiff: false, tested: false },
        {
          node: STRIPE,
          depth: 2,
          kind: 'calls',
          via: [ROUTE, CHARGE],
          outOfDiff: false,
          tested: false,
        },
      ],
    });
    document.documentElement.classList.remove('dark');
  });

  it('selects the entry point and asks for its dependencies', async () => {
    const el = await exploreAndClickRoute();
    expect(byTestId(el, 'selected-node')?.getAttribute('data-node-id')).toBe(ROUTE);
    expect(api.impact).toHaveBeenLastCalledWith(
      [ROUTE],
      'dependencies',
      8,
      true,
      expect.anything(),
    );
  });

  it('shows the dependencies direction and the reached nodes by depth', async () => {
    const el = await exploreAndClickRoute();
    const pressed = byTestId(el, 'impact-direction')?.querySelector('[aria-pressed="true"]');
    expect(pressed?.getAttribute('data-value')).toBe('dependencies');
    const rows = [...el.querySelectorAll('[data-testid="impact-row"]')].map((r) => r.textContent);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain('chargeCustomer');
    expect(rows[1]).toContain('stripe-sdk');
  });
});
