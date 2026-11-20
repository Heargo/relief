import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

export type InspectorKind = 'none' | 'node' | 'edge';

/** Sticky header of the right panel: what is inspected (badge), its type, and the cross. */
@Component({
  selector: 'app-inspector-header',
  imports: [TranslatePipe],
  templateUrl: './inspector-header.component.html',
  styleUrl: './inspector-header.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InspectorHeaderComponent {
  readonly kind = input.required<InspectorKind>();
  readonly subtitle = input<string>('');
  readonly close = output<void>();
}
