import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

interface LayerRow {
  layer: string;
  testId: string;
  labelKey: string;
  descriptionKey: string;
  shortcut: string | null;
  on: boolean;
  toggle: () => void;
}

/** The "Layers" section of the left panel: the toggles of what the map paints. */
@Component({
  selector: 'app-layers-section',
  imports: [TranslatePipe],
  templateUrl: './layers-section.component.html',
  styleUrl: './layers-section.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LayersSectionComponent {
  /** The diff and focus layers only make sense when reviewing a PR. */
  readonly hasDiff = input(true);
  readonly hasFocus = input(true);
  readonly diff = input(false);
  readonly unchangedEdges = input(false);
  readonly focus = input(false);
  readonly impact = input(false);
  readonly rules = input(false);
  readonly risk = input(false);
  readonly coChange = input(false);
  /** The logical coupling layer is offered by the map page, not by every host. */
  readonly hasCoChange = input(false);
  /** Offered only once the metrics of the ref are loaded. */
  readonly hasRisk = input(false);
  /** Offered only when the repository has rules. */
  readonly hasRules = input(false);
  readonly hideExternal = input(true);
  /** Offered by the map page, not by every host. */
  readonly hasHideExternal = input(false);
  readonly hideExternalChange = output<boolean>();
  readonly diffChange = output<boolean>();
  readonly unchangedEdgesChange = output<boolean>();
  readonly focusChange = output<boolean>();
  readonly impactChange = output<boolean>();
  readonly rulesChange = output<boolean>();
  readonly riskChange = output<boolean>();
  readonly coChangeChange = output<boolean>();

  protected readonly rows = computed<LayerRow[]>(() => [
    ...this.baseRows().filter(
      (row) =>
        !(row.layer === 'diff' && !this.hasDiff()) && !(row.layer === 'focus' && !this.hasFocus()),
    ),
    ...(this.hasHideExternal()
      ? [
          {
            layer: 'hide-external',
            testId: 'toggle-hide-external',
            labelKey: 'map.external.hide',
            descriptionKey: 'review.layers.description.hide-external',
            shortcut: null,
            on: this.hideExternal(),
            toggle: () => this.hideExternalChange.emit(!this.hideExternal()),
          },
        ]
      : []),
    ...(this.hasRules()
      ? [
          {
            layer: 'rules',
            testId: 'toggle-rules-layer',
            labelKey: 'rules.layer',
            descriptionKey: 'review.layers.description.rules',
            shortcut: null,
            on: this.rules(),
            toggle: () => this.rulesChange.emit(!this.rules()),
          },
        ]
      : []),
    ...(this.hasRisk()
      ? [
          {
            layer: 'risk',
            testId: 'toggle-risk-layer',
            labelKey: 'explore.risk.layer',
            descriptionKey: 'review.layers.description.risk',
            shortcut: null,
            on: this.risk(),
            toggle: () => this.riskChange.emit(!this.risk()),
          },
        ]
      : []),
    ...(this.hasCoChange()
      ? [
          {
            layer: 'co-change',
            testId: 'toggle-co-change-layer',
            labelKey: 'explore.coChange.layer',
            descriptionKey: 'review.layers.description.co-change',
            shortcut: null,
            on: this.coChange(),
            toggle: () => this.coChangeChange.emit(!this.coChange()),
          },
        ]
      : []),
  ]);

  private readonly baseRows = computed<LayerRow[]>(() => [
    {
      layer: 'diff',
      testId: 'toggle-diff-layer',
      labelKey: 'review.layers.diff',
      descriptionKey: 'review.layers.description.diff',
      shortcut: null,
      on: this.diff(),
      toggle: () => this.diffChange.emit(!this.diff()),
    },
    {
      layer: 'unchanged-edges',
      testId: 'toggle-unchanged-edges',
      labelKey: 'map.edges.unchanged',
      descriptionKey: 'review.layers.description.unchanged-edges',
      shortcut: null,
      on: this.unchangedEdges(),
      toggle: () => this.unchangedEdgesChange.emit(!this.unchangedEdges()),
    },
    {
      layer: 'focus',
      testId: 'toggle-focus-layer',
      labelKey: 'review.layers.focus',
      descriptionKey: 'review.layers.description.focus',
      shortcut: 'f',
      on: this.focus(),
      toggle: () => this.focusChange.emit(!this.focus()),
    },
    {
      layer: 'impact',
      testId: 'toggle-impact-layer',
      labelKey: 'review.impact.layer',
      descriptionKey: 'review.layers.description.impact',
      shortcut: 'i',
      on: this.impact(),
      toggle: () => this.impactChange.emit(!this.impact()),
    },
  ]);
}
