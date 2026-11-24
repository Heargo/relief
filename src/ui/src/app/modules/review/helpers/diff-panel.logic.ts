import type {
  DiffResponse,
  GraphSnapshot,
  NodeChange,
  SignatureReason,
} from '../../../core/models/contract';

const SYMBOL_MARK = '::sym:';
const FILE_MARK = '::file:';

function filePathOf(id: string): string | null {
  const at = id.indexOf(FILE_MARK);
  if (at < 0) return null;
  const rest = id.slice(at + FILE_MARK.length);
  const symbol = rest.indexOf(SYMBOL_MARK);
  const path = symbol < 0 ? rest : rest.slice(0, symbol);
  // In a workspace the paths of the diff carry their repository (`repo:<name>/<path>`).
  const repo = /^repo:([^/]+)\//.exec(id);
  return repo ? `repo:${repo[1]}/${path}` : path;
}

/** The changed symbols of a file, in the order of the diff. */
export function fileSymbolChanges(fileId: string, response: DiffResponse): NodeChange[] {
  const prefix = `${fileId}${SYMBOL_MARK}`;
  return response.diff.nodes.filter((change) => change.id.startsWith(prefix));
}

/** The id to read on the base side: the former id of a moved symbol, else its own. */
export function baseNodeId(id: string, response: DiffResponse): string {
  const change = response.diff.nodes.find((c) => c.id === id);
  return change?.status === 'moved' ? change.from : id;
}

/** Text diff lines of a format-only file (changed, no changed symbol); null for any other node. */
export function formatOnlyHiddenLines(id: string, response: DiffResponse): number | null {
  if (id.includes(SYMBOL_MARK)) return null;
  if (fileSymbolChanges(id, response).length > 0) return null;
  const path = filePathOf(id);
  const file = response.diff.files.find((f) => f.path === path);
  return file ? file.linesAdded + file.linesRemoved : null;
}

/** The translation key of a reason code, with the parameter name when it has one. */
export function reasonTranslation(reason: SignatureReason): {
  key: string;
  params: { param?: string };
} {
  const param = 'param' in reason ? reason.param : undefined;
  return {
    key: `review.reason.${reason.code}`,
    params: param === undefined ? {} : { param },
  };
}

/** A symbol that changed, or a file that changed (by a symbol or by its text). */
export function hasStructuralChange(id: string, response: DiffResponse): boolean {
  if (response.diff.nodes.some((c) => c.id === id)) return true;
  if (id.includes(SYMBOL_MARK)) return false;
  const path = filePathOf(id);
  return (
    fileSymbolChanges(id, response).length > 0 || response.diff.files.some((f) => f.path === path)
  );
}

/** First line of a symbol in its file (1 for a file, an unknown node or no graph). */
export function startLine(graph: GraphSnapshot | null, id: string): number {
  return graph?.nodes.find((n) => n.id === id)?.span?.startLine ?? 1;
}
