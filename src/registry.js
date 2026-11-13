// 라우트·시드 등록 목록 — 단계가 늘 때 여기에 한 줄씩 더한다.
import { authRoutes } from './routes/auth.js';
import { adminRoutes } from './routes/admin.js';
import { materialRoutes } from './routes/materials.js';
import { sweepSessions } from './repo/people.js';

/** @type {Array<(api: import('express').Router, deps: object) => void>} */
export const apiRoutes = [
  authRoutes,   // P1
  adminRoutes,  // P1 — 사무국 라우터(deps.adminRouter)를 만든다. 뒤 단계의 사무국 라우트는 그 라우터에 붙는다
  materialRoutes, // P2
];

/** 설정 → DB 시드 (멱등) · 주기 정리 함수 */
export function seed(deps) {
  deps.sweep = () => sweepSessions(deps.db, deps.clock);
}
