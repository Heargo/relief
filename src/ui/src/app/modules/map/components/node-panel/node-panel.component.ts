import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  inject,
  input,
  output,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';

import type { GraphSnapshot, Metrics } from '../../../../core/models/contract';
import { NodePanelBusiness } from '../../business/node-panel.business';

/** Right panel of a selected node: facts of the graph, fine links and code. */
@Component({
  selector: 'app-node-panel',
  imports: [TranslatePipe, NgTemplateOutlet],
  providers: [NodePanelBusiness],
  templateUrl: './node-panel.component.html',
  styleUrl: './node-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NodePanelComponent {
  protected readonly panel = inject(NodePanelBusiness);

  readonly graph = input.required<GraphSnapshot>();
  readonly nodeId = input.required<string>();
  /** Metrics of the node over the churn window; none while they are not loaded. */
  readonly metrics = input<Metrics | null>(null);
  /** A line of the code to mark and scroll to. */
  readonly focusLine = input<number | null>(null);
  readonly selectNode = output<string>();
  private readonly host = inject(ElementRef<HTMLElement>);

  constructor() {
    effect(() => {
      void this.panel.show(this.graph(), this.nodeId());
    });
    afterRenderEffect(() => {
      const line = this.focusLine();
      this.panel.lines();
      if (line === null) return;
      const marked = (this.host.nativeElement as HTMLElement).querySelector(
        '[data-focused="true"]',
      );
      marked?.scrollIntoView?.({ block: 'center' });
    });
  }
}
