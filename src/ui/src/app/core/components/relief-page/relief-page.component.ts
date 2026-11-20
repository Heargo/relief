import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { DocsBusiness } from '../../business/docs.business';

@Component({
  selector: 'app-relief-page',
  imports: [TranslatePipe],
  templateUrl: './relief-page.component.html',
  styleUrl: './relief-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReliefPageComponent {
  protected readonly docs = inject(DocsBusiness);
}
