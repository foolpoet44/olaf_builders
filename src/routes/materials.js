// 교육 자료 (FR-MAT-01~07 · docs/04_API_SPEC.md 4절)
import fs from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import express from 'express';
import { requireLogin } from '../middleware/session.js';
import { listMaterials, getMaterial, insertMaterial, updateMaterial, addView } from '../repo/materials.js';
import { checkPackage } from '../domain/materials.js';
import { readZip, ZipError } from '../lib/zip.js';
import { safeJoin } from '../lib/paths.js';
import { privacyProblems } from '../domain/privacy.js';
import { ok, E, wrap, intParam } from '../lib/http.js';
import { isoNow } from '../lib/clock.js';
import { tx } from '../db.js';

const pub = (m, office) => ({
  id: m.id, title: m.title, lecturer: m.lecturer, session: m.session, pages: m.pages,
  ...(office ? { status: m.status, views: m.views, createdAt: m.created_at, updatedAt: m.updated_at } : {}),
});

export function materialDir(deps, folder) {
  return safeJoin(deps.env.uploadDir, 'materials', folder);
}

/** 보이는 자료만 (사무국은 전부). 없거나 비공개면 404 */
export function visibleMaterial(deps, user, id) {
  const m = getMaterial(deps.db, id);
  if (!m || (m.status !== 'published' && user.role !== 'office')) throw E.notFound();
  return m;
}

export function materialRoutes(api, deps) {
  const { db, clock, audit } = deps;

  api.get('/materials', requireLogin, (req, res) => {
    const office = req.user.role === 'office';
    const all = office && req.query.all === '1';
    ok(res, { items: listMaterials(db, { all }).map((m) => pub(m, office)) });
  });

  api.get('/materials/:id', requireLogin, (req, res) => {
    const m = visibleMaterial(deps, req.user, intParam(req.params.id));
    if (req.user.role !== 'office') addView(db, m.id);
    ok(res, pub(m, req.user.role === 'office'));
  });

  api.get('/materials/:id/pages/:n', requireLogin, (req, res) => {
    const m = visibleMaterial(deps, req.user, intParam(req.params.id));
    const n = intParam(req.params.n);
    if (n > m.pages) throw E.notFound();
    const file = safeJoin(materialDir(deps, m.folder), `p${String(n).padStart(3, '0')}.webp`);
    let data;
    try { data = fs.readFileSync(file); } catch { throw E.notFound(); }
    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.send(data);
  });

  const admin = deps.adminRouter;
  const maxBytes = deps.settings.cfg.materials.maxPackageMb * 1024 * 1024;

  admin.post('/materials', express.raw({ type: 'application/zip', limit: maxBytes }), wrap(async (req, res) => {
    if (!req.is('application/zip') || !Buffer.isBuffer(req.body) || !req.body.length) throw E.badRequest('Content-Type: application/zip 본문이 필요합니다');
    const cfg = deps.settings.cfg;
    let entries;
    try {
      entries = readZip(req.body, { maxEntries: cfg.materials.maxPages + 5, maxEntryBytes: Math.max(cfg.materials.maxPageKb * 1024 + 1, 1024 * 1024) });
    } catch (e) {
      if (e instanceof ZipError || e.code === 'ERR_BUFFER_TOO_LARGE' || /maxOutputLength|buffer/i.test(e.message)) throw E.validation([e instanceof ZipError ? e.message : '항목이 너무 큽니다']);
      throw e;
    }
    const { manifest, pages, problems } = checkPackage(entries, cfg);
    if (problems.length) throw E.validation(problems, '자료 꾸러미를 확인해 주세요');

    const folder = randomBytes(12).toString('hex');
    const dir = materialDir(deps, folder);
    fs.mkdirSync(dir, { recursive: true });
    try {
      pages.forEach((buf, i) => fs.writeFileSync(safeJoin(dir, `p${String(i + 1).padStart(3, '0')}.webp`), buf, { flag: 'wx' }));
      const now = isoNow(clock);
      const id = tx(db, () => {
        const newId = insertMaterial(db, {
          title: manifest.title.trim(), lecturer: manifest.lecturer?.trim() ?? '', session: manifest.session ?? null,
          pages: pages.length, folder, sha256: createHash('sha256').update(req.body).digest('hex'), now, actor: req.user.id,
        });
        audit(req.user.id, 'material_upload', `material:${newId}`, `${pages.length} pages`);
        return newId;
      });
      ok(res, { id, pages: pages.length, status: 'draft' }, 201);
    } catch (e) {
      fs.rmSync(dir, { recursive: true, force: true });
      throw e;
    }
  }));

  admin.patch('/materials/:id', (req, res) => {
    const id = intParam(req.params.id);
    if (!getMaterial(db, id)) throw E.notFound();
    const b = req.body ?? {};
    const fields = {};
    const problems = [];
    if (b.status !== undefined) { if (!['draft', 'published', 'hidden'].includes(b.status)) problems.push('상태 값 오류'); else fields.status = b.status; }
    if (b.title !== undefined) { if (typeof b.title !== 'string' || !b.title.trim() || b.title.length > 200) problems.push('제목은 1~200자'); else fields.title = b.title.trim(); }
    if (b.lecturer !== undefined) { if (typeof b.lecturer !== 'string' || b.lecturer.length > 100) problems.push('강사는 100자까지'); else fields.lecturer = b.lecturer.trim(); }
    if (b.session !== undefined) { if (b.session !== null && !deps.settings.cfg.sessions.some((s) => s.code === b.session)) problems.push('세션 코드 오류'); else fields.session = b.session; }
    problems.push(...privacyProblems([fields.title, fields.lecturer], deps.settings.cfg.privacy));
    if (problems.length) throw E.validation(problems);
    const m = updateMaterial(db, id, fields, isoNow(clock));
    audit(req.user.id, 'material_status', `material:${id}`, fields.status ?? 'meta');
    ok(res, pub(m, true));
  });

  deps.hooks.stats.push(() => ({
    materials: Object.fromEntries(db.prepare('SELECT status, COUNT(*) n FROM materials GROUP BY status').all().map((x) => [x.status, x.n])),
  }));
}
