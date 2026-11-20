import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { Checkbox } from '@openng/optimus-ui/checkbox';

import { LanguageBusiness } from '../../../../core/business/language.business';
import type { ImpactResponse } from '../../../../core/models/contract';
import {
  groupByDepth,
  type ImpactDirection,
  serviceCount,
  withoutTests,
} from '../../helpers/impact.logic';
import { nodeLabel } from '../../helpers/review-summary.logic';

/** The "impact radius" section of the right panel: who a symbol reaches, by depth. */
@Component({
  selector: 'app-impact-section',
  imports: [TranslatePipe, FormsModule, Checkbox],
  templateUrl: './impact-section.component.html',
  styleUrl: './impact-section.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImpactSectionComponent {
  private readonly language = inject(LanguageBusiness);

  readonly impact = input.required<ImpactResponse>();
  readonly direction = input<ImpactDirection>('callers');
  readonly followHttp = input(true);
  readonly directionChange = output<ImpactDirection>();
  readonly followHttpChange = output<boolean>();
  readonly nodeSelect = output<string>();

  protected readonly directions: ImpactDirection[] = ['callers', 'dependencies'];
  protected readonly label = nodeLabel;
  protected readonly groups = computed(() => groupByDepth(this.impact().reached));
  protected readonly total = computed(() => this.impact().reached.length);
  protected readonly untested = computed(() => withoutTests(this.impact().reached));
  protected readonly services = computed(() => serviceCount(this.impact().reached));

  protected plural(key: string, count: number): string {
    return this.language.t(count === 1 ? `${key}_one` : key, { count });
  }

  protected depthLabel(depth: number): string {
    return depth === 1
      ? this.language.t('review.impact.direct')
      : this.language.t('review.impact.hops', { count: depth });
  }
}
