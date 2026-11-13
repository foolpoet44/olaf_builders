// 라우트·시드 등록 목록 — 단계가 늘 때 여기에 한 줄씩 더한다.

/** @type {Array<(api: import('express').Router, deps: object) => void>} */
export const apiRoutes = [];

/** 설정 → DB 시드 (멱등) */
export function seed(deps) { // eslint-disable-line no-unused-vars
}
