import { ChangeDetectionStrategy, Component, inject, OnInit, output } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { WelcomeBusiness } from '../../business/welcome.business';

/** The screen shown when relief starts without a path: open a repository, or a recent one. */
@Component({
  selector: 'app-welcome',
  imports: [TranslatePipe],
  providers: [WelcomeBusiness],
  templateUrl: './welcome.component.html',
  styleUrl: './welcome.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WelcomeComponent implements OnInit {
  protected readonly welcome = inject(WelcomeBusiness);
  protected readonly translate = inject(TranslateService);

  /** A repository was opened: the session exists. */
  readonly opened = output<void>();

  ngOnInit(): void {
    void this.welcome.load();
  }

  protected async pick(): Promise<void> {
    if (await this.welcome.pickAndOpen()) this.opened.emit();
  }

  protected async pickWorkspace(): Promise<void> {
    if (await this.welcome.pickAndOpenWorkspace()) this.opened.emit();
  }

  protected async openRecent(path: string, kind: 'repo' | 'workspace'): Promise<void> {
    if (await this.welcome.open(path, kind)) this.opened.emit();
  }
}
