import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { LanguageBusiness } from '../../../../core/business/language.business';
import type { Rule, Violation } from '../../../../core/models/contract';
import { ruleCounters } from '../../helpers/rules.logic';

/** The "Architecture rules" section of the left bar: one row per rule, and the YAML file. */
@Component({
  selector: 'app-rules-section',
  imports: [TranslatePipe],
  templateUrl: './rules-section.component.html',
  styleUrl: './rules-section.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RulesSectionComponent {
  private readonly language = inject(LanguageBusiness);

  readonly rules = input.required<Rule[]>();
  readonly violations = input.required<Violation[]>();
  readonly source = input<string | null>(null);
  readonly ruleSelect = output<string>();

  protected readonly fileOpen = signal(false);
  protected readonly rows = computed(() => ruleCounters(this.rules(), this.violations()));

  protected plural(key: string, count: number): string {
    return this.language.t(count === 1 ? `${key}_one` : key, { count });
  }
}
