import type { SnapshotMeta } from '../../../core/models/contract';

const LANGUAGE_NAMES: Record<string, string> = {
  typescript: 'TypeScript',
  python: 'Python',
  rust: 'Rust',
};

/** The grey line after the repo name: the languages read, then the detector. */
export function repoMetaLine(meta: SnapshotMeta): string {
  const languages = (meta.adapters ?? []).map((name) => LANGUAGE_NAMES[name] ?? name);
  return [...languages, meta.detector].filter((part) => part !== '').join(' · ');
}
