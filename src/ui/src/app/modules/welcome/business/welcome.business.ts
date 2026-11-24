import { inject, Injectable, signal } from '@angular/core';

import { type RecentEntry, ReliefApiService } from '../../../core/services/relief-api.service';

/** The welcome screen: the recents, and the opening of a repository. */
@Injectable()
export class WelcomeBusiness {
  private readonly api = inject(ReliefApiService);

  private readonly _recents = signal<RecentEntry[]>([]);
  private readonly _error = signal<string | null>(null);

  readonly recents = this._recents.asReadonly();
  readonly error = this._error.asReadonly();

  async load(): Promise<void> {
    try {
      this._recents.set(await this.api.recents());
    } catch {
      this._recents.set([]);
    }
  }

  /** Asks for a folder, then opens it. False when cancelled or failed. */
  async pickAndOpen(): Promise<boolean> {
    this._error.set(null);
    try {
      const path = await this.api.pickRepoFolder();
      return path === null ? false : await this.open(path);
    } catch (error) {
      this._error.set(error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  /** Asks for a workspace folder, then opens it. False when cancelled or failed. */
  async pickAndOpenWorkspace(): Promise<boolean> {
    this._error.set(null);
    try {
      const path = await this.api.pickRepoFolder();
      return path === null ? false : await this.open(path, 'workspace');
    } catch (error) {
      this._error.set(error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  /** Starts the session on a repository or a workspace. False (with the error) when it fails. */
  async open(path: string, kind: 'repo' | 'workspace' = 'repo'): Promise<boolean> {
    this._error.set(null);
    try {
      if (kind === 'workspace') await this.api.openWorkspace(path);
      else await this.api.openRepo(path);
      return true;
    } catch (error) {
      this._error.set(error instanceof Error ? error.message : String(error));
      return false;
    }
  }
}
