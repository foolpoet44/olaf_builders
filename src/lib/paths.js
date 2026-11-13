import path from 'node:path';

export class PathError extends Error {}

/** base 아래로만 경로를 잇는다. 기준 폴더를 벗어나거나 절대경로 조각이 오면 throw. */
export function safeJoin(base, ...parts) {
  const root = path.resolve(base);
  for (const p of parts) {
    const s = String(p);
    if (path.isAbsolute(s) || /^[a-zA-Z]:/.test(s) || s.includes('\0')) throw new PathError('absolute or invalid path segment');
  }
  const full = path.resolve(root, ...parts.map(String));
  const rel = path.relative(root, full);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new PathError('path escapes base');
  return full;
}
