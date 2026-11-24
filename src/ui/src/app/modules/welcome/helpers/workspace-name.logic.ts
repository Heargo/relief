/** The name of a new workspace: the name of its folder (`workspace` for a root folder). */
export function workspaceNameOf(dir: string): string {
  const parts = dir.split(/[/\\]/).filter((part) => part !== '' && !part.endsWith(':'));
  return parts.at(-1) ?? 'workspace';
}
