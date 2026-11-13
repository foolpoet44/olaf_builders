// 글·댓글 입력 검사 (FR-BRD-04·09)
import { privacyProblems } from './privacy.js';

const str = (v) => (typeof v === 'string' ? v : v == null ? '' : null);

/**
 * @param {{title?:string, body?:string}} input
 * @param {{comment?:boolean}} opt
 * @returns {{problems:string[], title:string|null, body:string}}
 */
export function checkPost(input, cfg, { comment = false } = {}) {
  const P = cfg.posts;
  const problems = [];
  const title = str(input?.title);
  const body = str(input?.body);
  if (title === null || body === null) return { problems: ['입력 형식이 올바르지 않습니다'], title: null, body: '' };
  const t = title.trim();
  const b = body.replace(/\r\n/g, '\n').replace(/\s+$/, '');
  if (!comment) {
    if (!t) problems.push('제목을 써 주세요');
    else if (t.length > P.titleMaxChars) problems.push(`제목은 ${P.titleMaxChars}자까지입니다`);
  }
  if (!b.trim()) problems.push(comment ? '댓글을 써 주세요' : '본문을 써 주세요');
  else if (b.length > P.bodyMaxChars) problems.push(`본문은 ${P.bodyMaxChars}자까지입니다`);
  problems.push(...privacyProblems([comment ? '' : t, b], cfg.privacy));
  return { problems, title: comment ? null : t, body: b };
}
