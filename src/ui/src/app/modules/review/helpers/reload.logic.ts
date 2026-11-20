/** Only a range that touches the working tree or the index can change under the user's feet. */
export function isReloadable(range: string | null): boolean {
  return range === null || !/\.{2,3}/.test(range);
}
