import { computed, inject, Injectable, signal } from '@angular/core';

import type { GraphSnapshot } from '../../../core/models/contract';
import { ReliefApiService } from '../../../core/services/relief-api.service';
import {
  type CodeLine,
  codeLines,
  isHighlightable,
  nodePanelFacts,
  splitHighlightedLines,
} from '../helpers/node-panel.logic';

export type CodeStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface DisplayedLine extends CodeLine {
  /** Highlighted HTML of the line, when the highlighter loaded. */
  html: string | null;
}

/** State of the node panel: the facts of the selected node and its code, loaded on demand. */
@Injectable()
export class NodePanelBusiness {
  private readonly api = inject(ReliefApiService);

  private readonly _graph = signal<GraphSnapshot | null>(null);
  private readonly _nodeId = signal<string | null>(null);
  private readonly _status = signal<CodeStatus>('idle');
  private readonly _lines = signal<DisplayedLine[]>([]);
  private requestId = 0;

  readonly status = this._status.asReadonly();
  readonly lines = this._lines.asReadonly();
  readonly facts = computed(() => {
    const graph = this._graph();
    const id = this._nodeId();
    return graph && id ? nodePanelFacts(graph, id) : null;
  });

  /** Shows a node: its facts at once, its code (head side) when it has one. */
  async show(graph: GraphSnapshot, nodeId: string): Promise<void> {
    this._graph.set(graph);
    this._nodeId.set(nodeId);
    const request = ++this.requestId;
    const node = graph.nodes.find((n) => n.id === nodeId);
    this._lines.set([]);
    if (!node || (node.kind !== 'file' && node.kind !== 'symbol')) {
      this._status.set('idle');
      return;
    }
    const path = nodePanelFacts(graph, nodeId)?.path ?? null;
    this._status.set('loading');
    let text: string;
    try {
      text = await this.api.code(nodeId, 'head');
    } catch {
      if (request === this.requestId) this._status.set('error');
      return;
    }
    if (request !== this.requestId) return;
    const start = node.kind === 'symbol' && node.span ? node.span.startLine : 1;
    const plain = codeLines(text, start);
    this._lines.set(plain.map((line) => ({ ...line, html: null })));
    this._status.set('ready');

    if (!isHighlightable(path)) return;
    const html = await highlight(text);
    if (request !== this.requestId || html === null || html.length !== plain.length) return;
    this._lines.set(plain.map((line, i) => ({ ...line, html: html[i] })));
  }
}

/** Loads the highlighter on first use (lazy chunk); null when it fails: the code stays plain. */
async function highlight(text: string): Promise<string[] | null> {
  try {
    const [core, typescript] = await Promise.all([
      import('highlight.js/lib/core'),
      import('highlight.js/lib/languages/typescript'),
    ]);
    const hljs = core.default;
    if (!hljs.getLanguage('typescript')) hljs.registerLanguage('typescript', typescript.default);
    const result = hljs.highlight(text, { language: 'typescript', ignoreIllegals: true });
    return splitHighlightedLines(result.value);
  } catch {
    return null;
  }
}
