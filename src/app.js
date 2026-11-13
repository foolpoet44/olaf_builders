// Express 앱 조립 — createApp(deps). 테스트는 메모리 DB 로 같은 함수를 쓴다.
import path from 'node:path';
import express from 'express';
import { ROOT } from './config.js';
import { securityHeaders } from './middleware/security.js';
import { requestId, apiNotFound, errorHandler } from './middleware/errors.js';
import { healthRoutes } from './routes/health.js';

export const PUBLIC_DIR = path.join(ROOT, 'public');

/**
 * @param {object} deps
 * @param {object} deps.settings  createSettings() 결과
 * @param {object} deps.env       resolveEnv() 결과
 * @param {import('node:sqlite').DatabaseSync} deps.db
 * @param {object} deps.secrets   { sessionKey }
 * @param {object} deps.clock
 * @param {Function} deps.audit
 * @param {number} deps.schemaVersion
 */
export function createApp(deps) {
  const app = express();
  app.disable('x-powered-by');
  app.set('etag', false);
  if (deps.env.trustProxy) app.set('trust proxy', 1);
  app.locals.settings = deps.settings;

  app.use(requestId);
  app.use(securityHeaders);
  app.use(healthRoutes(deps));

  // --- API -----------------------------------------------------------
  const api = express.Router();
  api.use(express.json({ limit: '64kb' }));
  // (P1~) 라우트 등록 지점
  for (const register of deps.apiRoutes ?? []) register(api, deps);
  api.use(apiNotFound);
  app.use('/api', api);

  // --- 정적 화면 (public/ 만) -------------------------------------------
  app.use(express.static(PUBLIC_DIR, {
    dotfiles: 'deny',
    index: 'index.html',
    redirect: false,
    setHeaders(res, file) {
      // 화면 HTML 은 캐시하지 않는다 (로그인 상태에 따라 바뀜) · 자산은 짧게
      res.setHeader('Cache-Control', file.endsWith('.html') ? 'no-store' : 'public, max-age=300');
    },
  }));
  app.use((req, res) => {
    res.status(404).sendFile(path.join(PUBLIC_DIR, '404.html'), { headers: { 'Cache-Control': 'no-store' } });
  });

  app.use(errorHandler);
  return app;
}
