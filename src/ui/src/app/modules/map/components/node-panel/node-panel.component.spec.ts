import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Edge, GraphSnapshot, Node } from '../../../../core/models/contract';
import { ReliefApiService } from '../../../../core/services/relief-api.service';
import { TEST_PROVIDERS } from '../../../../../testing/test-providers';
import { NodePanelComponent } from './node-panel.component';

const INVOICE = 'pkg:@acme/api/billing::file:apps/api/billing/invoice.ts';
const TOTAL = `${INVOICE}::sym:computeTotal`;
const CHECKOUT = 'pkg:@acme/api/routes::file:apps/api/routes/checkout.ts::sym:checkout';
const RENEW = 'pkg:@acme/api/jobs::file:apps/api/jobs/renewals.ts::sym:renewSubscription';
const MONEY = 'pkg:@acme/api/billing::file:apps/api/billing/money.ts::sym:formatMoney';

function sym(id: string, extra: Partial<Node> = {}): Node {
  return {
    id,
    kind: 'symbol',
    subkind: 'function',
    parent: null,
    visibility: 'public',
    contentHash: 'h',
    ...extra,
  };
}
function calls(from: string, to: string): Edge {
  return { from, to, kind: 'calls', precision: 'resolved' };
}

const GRAPH: GraphSnapshot = {
  commit: 'c0ffee',
  nodes: [
    sym(TOTAL, { span: { startLine: 7, endLine: 8 } }),
    sym(CHECKOUT),
    sym(RENEW),
    sym(MONEY),
  ],
  edges: [calls(CHECKOUT, TOTAL), calls(RENEW, TOTAL), calls(TOTAL, MONEY)],
};

const CODE = 'export function computeTotal(lines) {\n  return sum(lines);\n}\n';
const api = { code: vi.fn() };

async function render(nodeId = TOTAL) {
  TestBed.configureTestingModule({
    imports: [NodePanelComponent],
    providers: [...TEST_PROVIDERS, { provide: ReliefApiService, useValue: api }],
  });
  const fixture = TestBed.createComponent(NodePanelComponent);
  fixture.componentRef.setInput('graph', GRAPH);
  fixture.componentRef.setInput('nodeId', nodeId);
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

const ids = (list: Element | null) =>
  Array.from(list?.querySelectorAll('[data-testid="node-link"]') ?? []).map((e) =>
    e.getAttribute('data-node-id'),
  );
const byId = (el: HTMLElement, id: string) =>
  el.querySelector<HTMLElement>(`[data-testid="${id}"]`);

describe('NodePanelComponent', () => {
  beforeEach(() => {
    api.code.mockReset().mockResolvedValue(CODE);
  });

  it('shows the used-by list (2 callers) and the uses list (1 dependency)', async () => {
    const { el } = await render();
    expect(ids(byId(el, 'node-used-by'))).toEqual([CHECKOUT, RENEW]);
    expect(ids(byId(el, 'node-uses'))).toEqual([MONEY]);
    expect(byId(el, 'node-used-by')?.textContent).toContain('calls');
  });

  it('shows name, path and visibility of the node', async () => {
    const { el } = await render();
    expect(byId(el, 'node-name')?.textContent).toContain('computeTotal');
    expect(byId(el, 'node-path')?.textContent).toContain('apps/api/billing/invoice.ts');
    expect(byId(el, 'node-visibility')?.textContent).toContain('public');
  });

  it('asks /api/code for the head side and shows the code with line numbers from the span', async () => {
    const { el } = await render();
    expect(api.code).toHaveBeenCalledWith(TOTAL, 'head');
    expect(byId(el, 'node-code')?.textContent).toContain('export function computeTotal');
    const lines = Array.from(el.querySelectorAll('[data-testid="code-line"]'));
    expect(lines.map((l) => l.getAttribute('data-line'))).toEqual(['7', '8', '9']);
  });

  it('emits the target node when a link is clicked', async () => {
    const { fixture, el } = await render();
    const picked: string[] = [];
    fixture.componentInstance.selectNode.subscribe((id: string) => picked.push(id));
    el.querySelector<HTMLElement>(
      `[data-testid="node-used-by"] [data-node-id="${RENEW}"]`,
    )?.click();
    await fixture.whenStable();
    expect(picked).toEqual([RENEW]);
  });
});
