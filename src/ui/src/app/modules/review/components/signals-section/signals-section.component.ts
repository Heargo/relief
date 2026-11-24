import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { LanguageBusiness } from '../../../../core/business/language.business';
import type { ReviewSummary } from '../../../../core/models/contract';
import { splitViolations } from '../../../rules/helpers/rules.logic';
import { displayPath, nodeLabel, signalCount } from '../../helpers/review-summary.logic';

/** The "Signals" section of the left bar: what a reviewer should look at first. */
@Component({
  selector: 'app-signals-section',
  imports: [TranslatePipe],
  templateUrl: './signals-section.component.html',
  styleUrl: './signals-section.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignalsSectionComponent {
  private readonly language = inject(LanguageBusiness);

  readonly summary = input.required<ReviewSummary>();
  readonly nodeSelect = output<string>();

  protected readonly label = nodeLabel;
  protected readonly path = displayPath;
  protected readonly count = computed(() => signalCount(this.summary()));
  protected readonly violations = computed(() => splitViolations(this.summary().violations));
  protected readonly breaking = computed(() => this.summary().signatures.filter((s) => s.breaking));

  protected plural(key: string, count: number): string {
    return this.language.t(count === 1 ? `${key}_one` : key, { count });
  }
}
