import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

/** Head of the panel of an edge: both ends as buttons, then chips (type, precision, links). */
@Component({
  selector: 'app-edge-head',
  imports: [TranslatePipe],
  templateUrl: './edge-head.component.html',
  styleUrl: './edge-head.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EdgeHeadComponent {
  readonly from = input.required<string>();
  readonly to = input.required<string>();
  readonly fromLabel = input.required<string>();
  readonly toLabel = input.required<string>();
  readonly kinds = input.required<string>();
  readonly heuristic = input(false);
  readonly count = input.required<number>();
  readonly added = input(false);
  readonly nodeSelect = output<string>();
}
