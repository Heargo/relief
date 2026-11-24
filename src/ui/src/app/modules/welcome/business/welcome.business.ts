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

  /** Shows a failure of the page (the same line as a failed opening). */
  fail(error: unknown): void {
    this._error.set(error instanceof Error ? error.message : String(error));
  }

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

  /** Asks for a repository then for the workspace folder, and opens the new workspace. */
  async pickAndCreateWorkspace(): Promise<boolean> {
    this._error.set(null);
    try {
      const repo = await this.api.pickRepoFolder();
      if (repo === null) return false;
      return await this.pickFolderAndOpenAsWorkspace(repo);
    } catch (error) {
      this.fail(error);
      return false;
    }
  }

  /** Asks for the workspace folder, then makes a workspace of `repo` there and opens it. */
  async pickFolderAndOpenAsWorkspace(repo: string): Promise<boolean> {
    this._error.set(null);
    try {
      const dir = await this.api.pickRepoFolder();
      if (dir === null) return false;
      await this.api.openRepoAsWorkspace(repo, dir);
      return true;
    } catch (error) {
      this.fail(error);
      return false;
    }
  }

  /** Asks for a repository and adds it, without labels, to the open workspace. */
  async pickAndAddRepo(): Promise<boolean> {
    this._error.set(null);
    try {
      const repo = await this.api.pickRepoFolder();
      if (repo === null) return false;
      await this.api.addWorkspaceRepo(repo, []);
      return true;
    } catch (error) {
      this.fail(error);
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
