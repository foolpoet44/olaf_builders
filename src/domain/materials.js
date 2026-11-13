// 자료 꾸러미 검사 (FR-MAT-05) — zip 항목 목록만 받는다
import { privacyProblems } from './privacy.js';

const PAGE_RE = /^p(\d{3})\.webp$/;

export const isWebp = (b) => b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP';

/**
 * @param {Array<{name:string,data:Buffer,dir:boolean}>} entries
 * @returns {{manifest:object|null, pages:Buffer[], problems:string[]}}
 */
export function checkPackage(entries, cfg) {
  const M = cfg.materials;
  const problems = [];
  let manifest = null;
  const pages = new Map();
  for (const e of entries) {
    const n = e.name;
    if (e.dir) { problems.push(`폴더 항목은 넣지 않습니다: ${n}`); continue; }
    if (n.includes('/') || n.includes('\\') || n.includes('..') || /^[a-zA-Z]:/.test(n)) { problems.push(`경로가 들어간 항목은 받지 않습니다: ${n}`); continue; }
    if (n === 'manifest.json') {
      try { manifest = JSON.parse(e.data.toString('utf8').replace(/^\uFEFF/, '')); } catch { problems.push('manifest.json 형식 오류'); }
      continue;
    }
    const m = PAGE_RE.exec(n);
    if (!m) { problems.push(`허용되지 않은 파일: ${n} (manifest.json 과 p001.webp 형식만)`); continue; }
    if (!isWebp(e.data)) problems.push(`webp 이미지가 아닙니다: ${n}`);
    if (e.data.length > M.maxPageKb * 1024) problems.push(`쪽 이미지가 너무 큽니다 (${M.maxPageKb}KB 상한): ${n}`);
    pages.set(Number(m[1]), e.data);
  }
  if (!manifest) problems.push('manifest.json 이 없습니다');
  const count = pages.size;
  if (count === 0) problems.push('쪽 이미지가 없습니다');
  if (count > M.maxPages) problems.push(`쪽 수가 너무 많습니다 (${M.maxPages}쪽 상한)`);
  for (let i = 1; i <= count; i++) if (!pages.has(i)) { problems.push(`쪽 번호가 비어 있습니다: p${String(i).padStart(3, '0')}.webp`); break; }
  if (manifest) {
    if (typeof manifest.title !== 'string' || !manifest.title.trim() || manifest.title.length > 200) problems.push('manifest.title 은 1~200자');
    if (manifest.lecturer != null && (typeof manifest.lecturer !== 'string' || manifest.lecturer.length > 100)) problems.push('manifest.lecturer 는 100자까지');
    if (manifest.session != null && !cfg.sessions.some((s) => s.code === manifest.session)) problems.push('manifest.session 이 설정의 세션 코드가 아닙니다');
    if (manifest.pages !== count) problems.push(`manifest.pages(${manifest.pages}) 와 실제 쪽 수(${count}) 가 다릅니다`);
    problems.push(...privacyProblems([manifest.title, manifest.lecturer], cfg.privacy));
  }
  return {
    manifest,
    pages: [...pages.keys()].sort((a, b) => a - b).map((k) => pages.get(k)),
    problems,
  };
}
