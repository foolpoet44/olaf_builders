// /healthz · /readyz (docs/04_API_SPEC.md 2절 · 배포 계약 형식)
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { userVersion } from '../db.js';

function writable(dir) {
  try {
    const probe = path.join(dir, `.ready-${process.pid}`);
    fs.writeFileSync(probe, '');
    fs.unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

export function healthRoutes(deps) {
  const r = Router();
  const id = () => ({ app: deps.settings.cfg.appId, release: deps.env.release });

  r.get('/healthz', (req, res) => res.json({ status: 'ok', ...id() }));

  r.get('/readyz', (req, res) => {
    const failed = [];
    try {
      deps.db.prepare('SELECT 1').get();
      if (userVersion(deps.db) !== deps.schemaVersion) failed.push('schema');
    } catch {
      failed.push('db');
    }
    if (!deps.settings.cfg) failed.push('config');
    if (!writable(deps.env.dataDir)) failed.push('data_dir');
    if (!writable(deps.env.uploadDir)) failed.push('upload_dir');
    if (!deps.secrets?.sessionKey) failed.push('secrets');
    if (failed.length) return res.status(503).json({ status: 'not_ready', ...id(), checks: failed });
    res.json({ status: 'ready', ...id() });
  });
  return r;
}
