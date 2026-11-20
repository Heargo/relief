import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { LanguageBusiness } from '../../../../core/business/language.business';
import type { Rule, Violation } from '../../../../core/models/contract';

/** The box of the node and edge panels: the rule behind each violation, introduced or existing. */
@Component({
  selector: 'app-rule-box',
  imports: [TranslatePipe],
  templateUrl: './rule-box.component.html',
  styleUrl: './rule-box.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RuleBoxComponent {
  private readonly language = inject(LanguageBusiness);

  readonly violations = input.required<Violation[]>();
  readonly rules = input.required<Rule[]>();
  /** The base side of the range ("existed on main"); null when unknown. */
  readonly base = input<string | null>(null);

  protected readonly entries = computed(() =>
    this.violations().map((violation) => ({
      violation,
      rule: this.rules().find((r) => r.id === violation.rule) ?? null,
    })),
  );

  protected existing(): string {
    const base = this.base();
    return base
      ? this.language.t('rules.box.existing', { base })
      : this.language.t('rules.box.existingNoBase');
  }
}
