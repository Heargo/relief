import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import type { Hotspot } from '../../helpers/risk.logic';

/** The "Hotspots" section of the exploration mode: the riskiest symbols. */
@Component({
  selector: 'app-hotspots-section',
  imports: [TranslatePipe, DecimalPipe],
  templateUrl: './hotspots-section.component.html',
  styleUrl: './hotspots-section.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HotspotsSectionComponent {
  readonly hotspots = input.required<Hotspot[]>();
  readonly label = input.required<(id: string) => string>();
  readonly nodeSelect = output<string>();
}
