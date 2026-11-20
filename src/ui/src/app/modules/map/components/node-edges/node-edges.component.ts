import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import type { AggregatedEdge } from '../../helpers/edges.logic';
import type { NodeEdges } from '../../helpers/node-edges.logic';

/** The edges of a selected node, "depends on" and "used by"; a row selects the edge. */
@Component({
  selector: 'app-node-edges',
  imports: [TranslatePipe],
  templateUrl: './node-edges.component.html',
  styleUrl: './node-edges.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NodeEdgesComponent {
  readonly edges = input.required<NodeEdges>();
  readonly label = input.required<(id: string) => string>();
  readonly edgeSelect = output<AggregatedEdge>();
}
