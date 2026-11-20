import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import type { EntryGroup, Overview } from '../../helpers/explore.logic';

/** The left-bar sections of the exploration mode: the entry points and the overview figures. */
@Component({
  selector: 'app-explore-section',
  imports: [TranslatePipe],
  templateUrl: './explore-section.component.html',
  styleUrl: './explore-section.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExploreSectionComponent {
  readonly groups = input.required<EntryGroup[]>();
  readonly overview = input.required<Overview | null>();
  readonly label = input.required<(id: string) => string>();
  readonly nodeSelect = output<string>();

  protected links(overview: Overview): { kind: string; count: number }[] {
    return Object.entries(overview.links).map(([kind, count]) => ({ kind, count }));
  }
}
