// 커뮤니티 확장 등록 (docs/13 · ADR-10) — 기능 하나 = 파일 하나.
// 기존 코드와의 접점: registry.js 의 이 함수 한 줄 · deps.hooks (응답 칸 추가·저장 훅)
import { directory } from './directory.js';
import { pin } from './pin.js';
import { accept } from './accept.js';
import { qcardAnswer } from './qcard-answer.js';
import { notifications } from './notifications.js';
import { events, digest, materialThreads, bookmarks, tags, reports } from './more.js';

/** [기능 키, 등록 함수] — 기능이 꺼져 있어도 등록은 하고 featureGate·훅 안의 검사로 막는다 */
export const EXTENSIONS = [
  ['templates', templates],   // P4.5
  ['directory', directory],
  ['pin', pin],
  ['accept', accept],
  ['qcardAnswer', qcardAnswer],
  ['notifications', notifications],
  ['events', events],   // P4.6
  ['digest', digest],
  ['materialThreads', materialThreads],
  ['bookmarks', bookmarks],
  ['tags', tags],
  ['reports', reports],
];

export function registerExtensions(api, deps) {
  for (const [key, register] of EXTENSIONS) register(api, deps, key);
}

/** FR-EXT-01 글쓰기 틀 — GET /api/spaces 항목에 template 배열 */
function templates(api, deps, key) {
  deps.hooks.spaceItem.push((o, space) => {
    if (deps.settings.feature(key) && space.template) o.template = space.template;
  });
}
