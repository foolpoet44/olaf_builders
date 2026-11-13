// P4.6 확장 2차 — events · digest · inviteText · materialThreads · bookmarks · tags · reports (docs/13 3절)
// 기능 하나당 함수 하나. 공통 접점은 deps.hooks 와 featureGate 뿐.
import { requireLogin } from '../../middleware/session.js';
import { featureGate } from '../../middleware/feature.js';
import { checkPost } from '../../domain/board.js';
import { privacyProblems } from '../../domain/privacy.js';
import { inviteText as composeInvite } from '../../domain/invite.js';
import { createPost, listPosts } from '../../repo/posts.js';
import { getMaterial } from '../../repo/materials.js';
import { ok, E, intParam } from '../../lib/http.js';
import { isoNow } from '../../lib/clock.js';
import { tx } from '../../db.js';

const KINDS = new Set(['launch', 'lab', 'session', 'review', 'demo', 'other']);

/** FR-EXT-03 일정 — 설정 events + sessions 날짜 · 날짜순 */
export function events(api, deps, key) {
  api.get('/events', featureGate(key), requireLogin, (req, res) => {
    const cfg = deps.settings.cfg;
    const items = [
      ...(cfg.events ?? []).map((e) => ({ date: e.date, title: e.title, kind: KINDS.has(e.kind) ? e.kind : 'other', ...(e.note ? { note: e.note } : {}) })),
      ...(cfg.sessions ?? []).filter((s) => s.date).map((s) => ({ date: s.date, title: s.title, kind: 'session' })),
    ].sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title, 'ko'));
    ok(res, { items });
  });
}

/** FR-EXT-04 이번 주 새 글 — 읽기 가능 공간 live 글 최신순 · 공간별 건수 (사람별 묶음 없음) */
export function digest(api, deps, key) {
  const { db, clock } = deps;
  api.get('/feed/recent', featureGate(key), requireLogin, (req, res) => {
    const d = deps.settings.cfg.digest ?? {};
    const days = Math.min(d.maxDays ?? 30, Math.max(1, Number(req.query.days) || d.defaultDays || 7));
    const since = new Date(clock.now().getTime() - days * 86400_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const spaces = deps.board.readable(req.user);
    const where = ["p.status = 'live'", 'p.created_at >= ?'];
    const args = [since];
    const tag = typeof req.query.tag === 'string' && req.query.tag ? req.query.tag : null;
    if (tag && deps.settings.feature('tags')) { where.push('p.id IN (SELECT post_id FROM post_tags WHERE tag = ?)'); args.push(tag); }
    const r = listPosts(db, { spaceIds: spaces.map((s) => s.id), includeHidden: false, page: 1, pageSize: d.maxItems ?? 50, extraWhere: where.join(' AND '), extraArgs: args });
    const label = Object.fromEntries(spaces.map((s) => [s.id, s.label]));
    const counts = {};
    for (const row of r.items) counts[row.space_id] = (counts[row.space_id] ?? 0) + 1;
    const items = r.items.map((row) => {
      const o = { id: row.id, spaceId: row.space_id, spaceLabel: label[row.space_id], title: row.title, author: { id: row.author_id, name: row.author_name }, createdAt: row.created_at, commentCount: row.comment_count };
      for (const h of deps.hooks.postListItem) h(o, row, req, deps);
      return o;
    });
    ok(res, { items, counts, days });
  });
}

/** FR-EXT-05 코드 안내 문안 — 응답에만 · 저장·발송 없음 */
export function inviteText(api, deps, key) {
  deps.hooks.codeIssue.push((data, person) => {
    if (deps.settings.feature(key)) data.inviteText = composeInvite(deps.settings.cfg, person, data.code);
  });
}

/** FR-EXT-08b 자료별 질문 스레드 — material_qa 공간 · ref_kind='material' */
export function materialThreads(api, deps, key) {
  const { db, clock, audit, hooks } = deps;
  const space = () => deps.board.byId('material_qa');
  const material = (req) => {
    const m = getMaterial(db, intParam(req.params.id));
    if (!m || m.status !== 'published') throw E.notFound();
    const sp = space();
    if (!deps.board.canRead(req.user, sp)) throw E.notFound();
    return [m, sp];
  };

  api.get('/materials/:id/threads', featureGate(key), requireLogin, (req, res) => {
    const [m, sp] = material(req);
    const r = listPosts(db, { spaceIds: [sp.id], includeHidden: req.user.role === 'office', page: 1, pageSize: 200,
      extraWhere: "p.ref_kind = 'material' AND p.ref_id = ?", extraArgs: [m.id] });
    const items = r.items.map((row) => {
      const o = deps.board.item(row, req.user);
      delete o.body;
      o.page = row.ref_page ?? null;
      for (const h of hooks.postListItem) h(o, row, req, deps);
      return o;
    });
    ok(res, { items, canWrite: deps.board.canWrite(req.user, sp) });
  });

  api.post('/materials/:id/threads', featureGate(key), requireLogin, (req, res) => {
    const [m, sp] = material(req);
    if (!deps.board.canWrite(req.user, sp)) throw E.forbidden();
    const r = checkPost(req.body, deps.settings.cfg);
    let page = null;
    if (req.body?.page !== undefined && req.body?.page !== null && req.body?.page !== '') {
      page = Number(req.body.page);
      if (!Number.isInteger(page) || page < 1 || page > m.pages) r.problems.push(`쪽 번호는 1~${m.pages} 사이여야 합니다`);
    }
    const extra = [];
    for (const d of hooks.postSaved) if (d.check) extra.push(...d.check(req.body, deps));
    if (r.problems.length || extra.length) throw E.validation([...r.problems, ...extra], '질문을 확인해 주세요');
    const now = isoNow(clock);
    const id = tx(db, () => {
      const pid = createPost(db, { spaceId: sp.id, author: req.user.id, title: r.title, body: r.body, now, extra: { ref_kind: 'material', ref_id: m.id, ref_page: page } });
      for (const d of hooks.postSaved) d.save?.(pid, req.body, deps, { created: true });
      audit(req.user.id, 'post_create', `post:${pid}`, `material:${m.id}`);
      return pid;
    });
    ok(res, { id }, 201);
  });

  hooks.postDetail.push((post, comments, row) => {
    if (!deps.settings.feature(key) || row.ref_kind !== 'material') return;
    const m = getMaterial(db, row.ref_id);
    post.ref = { kind: 'material', id: row.ref_id, page: row.ref_page ?? null, title: m?.status === 'published' ? m.title : null };
  });
}

/** FR-EXT-10 내 저장함 — 본인만 · 실제 삭제 허용 · 감사 없음 */
export function bookmarks(api, deps, key) {
  const { db, clock } = deps;
  const gate = [featureGate(key), requireLogin];

  api.get('/me/bookmarks', ...gate, (req, res) => {
    const rows = db.prepare('SELECT post_id, created_at FROM bookmarks WHERE person_id = ? ORDER BY created_at DESC, post_id DESC').all(req.user.id);
    const items = rows.map((b) => {
      try {
        const [row, sp] = deps.board.readablePost(req.user, b.post_id);
        const o = deps.board.item(row, req.user);
        delete o.body;
        if (row.status !== 'live' && req.user.role !== 'office') return { id: b.post_id, savedAt: b.created_at, notice: o.notice ?? '볼 수 없는 글입니다.' };
        return { ...o, spaceLabel: sp.label, savedAt: b.created_at };
      } catch {
        return { id: b.post_id, savedAt: b.created_at, notice: '지금은 볼 수 없는 글입니다.' };
      }
    });
    ok(res, { items });
  });

  api.put('/me/bookmarks/:postId', ...gate, (req, res) => {
    const [row] = deps.board.readablePost(req.user, intParam(req.params.postId));
    if (row.parent_id != null) throw E.notFound();
    db.prepare('INSERT OR IGNORE INTO bookmarks (person_id, post_id, created_at) VALUES (?, ?, ?)').run(req.user.id, row.id, isoNow(clock));
    ok(res, {});
  });

  api.delete('/me/bookmarks/:postId', ...gate, (req, res) => {
    db.prepare('DELETE FROM bookmarks WHERE person_id = ? AND post_id = ?').run(req.user.id, intParam(req.params.postId));
    ok(res, {});
  });

  deps.hooks.postDetail.push((post, comments, row, req) => {
    if (deps.settings.feature(key)) post.bookmarked = !!db.prepare('SELECT 1 FROM bookmarks WHERE person_id = ? AND post_id = ?').get(req.user.id, row.id);
  });
}

/** FR-EXT-11 키워드 태그 — 설정 목록에서만 · 수정 시 통째 교체 */
export function tags(api, deps, key) {
  const { db, hooks } = deps;
  const on = () => deps.settings.feature(key);
  const catalog = () => {
    const cfg = deps.settings.cfg;
    const out = [];
    const seen = new Set();
    for (const lab of cfg.labs) for (const t of lab.keywords ?? []) if (!seen.has(t)) { seen.add(t); out.push({ tag: t, lab: lab.code }); }
    for (const t of cfg.tags?.extra ?? []) if (!seen.has(t)) { seen.add(t); out.push({ tag: t, lab: null }); }
    return out;
  };
  const tagsOf = (id) => db.prepare('SELECT tag FROM post_tags WHERE post_id = ? ORDER BY tag').all(id).map((r) => r.tag);

  api.get('/tags', featureGate(key), requireLogin, (req, res) => {
    const ids = deps.board.readable(req.user).map((s) => s.id);
    const counts = ids.length ? Object.fromEntries(db.prepare(`SELECT t.tag, COUNT(*) n FROM post_tags t JOIN posts p ON p.id = t.post_id
      WHERE p.status = 'live' AND p.space_id IN (${ids.map(() => '?').join(',')}) GROUP BY t.tag`).all(...ids).map((r) => [r.tag, r.n])) : {};
    ok(res, { items: catalog().map((c) => ({ ...c, count: counts[c.tag] ?? 0 })) });
  });

  hooks.postSaved.push({
    check(body) {
      if (!on() || body?.tags === undefined) return [];
      if (!Array.isArray(body.tags) || body.tags.some((t) => typeof t !== 'string')) return ['태그 형식이 올바르지 않습니다'];
      const allowed = new Set(catalog().map((c) => c.tag));
      const p = [];
      const bad = body.tags.filter((t) => !allowed.has(t));
      if (bad.length) p.push(`고를 수 없는 태그입니다: ${bad.join(', ')}`);
      const max = deps.settings.cfg.tags?.maxPerPost ?? 5;
      if (new Set(body.tags).size > max) p.push(`태그는 ${max}개까지입니다`);
      return p;
    },
    save(id, body) {
      if (!on() || !Array.isArray(body?.tags)) return;
      db.prepare('DELETE FROM post_tags WHERE post_id = ?').run(id);
      const ins = db.prepare('INSERT OR IGNORE INTO post_tags (post_id, tag) VALUES (?, ?)');
      for (const t of new Set(body.tags)) ins.run(id, t);
    },
  });
  hooks.postsList.push((filter, extra, { req }) => {
    if (!on() || typeof req.query.tag !== 'string' || !req.query.tag) return;
    const w = 'p.id IN (SELECT post_id FROM post_tags WHERE tag = ?)';
    filter.extraWhere = filter.extraWhere ? `${filter.extraWhere} AND ${w}` : w;
    filter.extraArgs.push(req.query.tag);
  });
  hooks.postListItem.push((o, row) => { if (on()) o.tags = tagsOf(row.id); });
  hooks.postDetail.push((post, comments, row) => { if (on()) post.tags = tagsOf(row.id); });
}

/** FR-EXT-12 신고 — 즉시 숨김 사유 · 사무국 처리 · 신고자 신원은 사무국만 */
export function reports(api, deps, key) {
  const { db, clock, audit, hooks } = deps;
  const REASONS = ['confidential', 'personal_info', 'evaluative', 'other'];

  api.post('/posts/:id/report', featureGate(key), requireLogin, (req, res) => {
    const cfg = deps.settings.cfg;
    const mod = cfg.moderation ?? {};
    const [row] = deps.board.readablePost(req.user, intParam(req.params.id));
    if (row.status === 'deleted') throw E.notFound();
    const reason = req.body?.reason;
    const note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';
    const problems = [];
    if (!REASONS.includes(reason)) problems.push('신고 사유를 골라 주세요');
    if (note.length > (mod.noteMaxChars ?? 500)) problems.push(`메모는 ${mod.noteMaxChars ?? 500}자까지입니다`);
    problems.push(...privacyProblems([note], cfg.privacy));
    if (problems.length) throw E.validation(problems);
    if (db.prepare('SELECT 1 FROM reports WHERE post_id = ? AND reporter_id = ? AND resolved_at IS NULL').get(row.id, req.user.id)) throw E.conflict('이미 신고한 글입니다. 사무국 처리를 기다려 주세요');
    const dayAgo = new Date(clock.now().getTime() - 86400_000).toISOString();
    const n = db.prepare('SELECT COUNT(*) n FROM reports WHERE reporter_id = ? AND created_at > ?').get(req.user.id, dayAgo).n;
    if (n >= (mod.reportsPerPersonPerDay ?? 10)) throw E.rate(3600);
    const now = isoNow(clock);
    const autoHide = (mod.immediateHideReasons ?? []).includes(reason) && row.status === 'live';
    tx(db, () => {
      const r = db.prepare('INSERT INTO reports (post_id, reporter_id, reason, note, auto_hidden, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(row.id, req.user.id, reason, note || null, autoHide ? 1 : 0, now);
      audit(req.user.id, 'report_create', `post:${row.id}`, `report:${r.lastInsertRowid}`);
      if (autoHide) {
        db.prepare("UPDATE posts SET status = 'hidden', hide_reason = ?, updated_at = ? WHERE id = ?").run(reason, now, row.id);
        audit('SYSTEM', 'post_auto_hide', `post:${row.id}`, reason);
      }
    });
    ok(res, { autoHidden: autoHide }, 201);
  });

  const admin = deps.adminRouter;
  admin.get('/reports', featureGate(key), (req, res) => {
    const open = req.query.open === '1';
    const page = Math.max(1, Number(req.query.page) || 1);
    const size = 50;
    const rows = db.prepare(`SELECT r.*, pe.name reporter_name, p.space_id, p.parent_id, v.title FROM reports r
      JOIN people pe ON pe.id = r.reporter_id JOIN posts p ON p.id = r.post_id JOIN post_versions v ON v.post_id = p.id AND v.ver = p.ver
      ${open ? 'WHERE r.resolved_at IS NULL' : ''} ORDER BY r.created_at DESC, r.id DESC LIMIT ? OFFSET ?`).all(size, (page - 1) * size);
    const total = db.prepare(`SELECT COUNT(*) n FROM reports ${open ? 'WHERE resolved_at IS NULL' : ''}`).get().n;
    audit(req.user.id, 'view_operator_screen', 'reports');
    ok(res, {
      total, page, pageSize: size,
      items: rows.map((r) => ({ id: r.id, post: { id: r.post_id, spaceId: r.space_id, parentId: r.parent_id, title: r.title }, reporter: { id: r.reporter_id, name: r.reporter_name },
        reason: r.reason, note: r.note, autoHidden: !!r.auto_hidden, createdAt: r.created_at, resolvedAt: r.resolved_at, outcome: r.outcome })),
    });
  });

  admin.post('/reports/:id/resolve', featureGate(key), (req, res) => {
    const r = db.prepare('SELECT * FROM reports WHERE id = ?').get(intParam(req.params.id));
    if (!r) throw E.notFound();
    if (r.resolved_at) throw E.conflict('이미 처리된 신고입니다');
    const outcome = req.body?.outcome;
    if (!['hidden', 'kept'].includes(outcome)) throw E.validation(['처리 결과를 골라 주세요']);
    const hideReason = REASONS.includes(req.body?.reason) ? req.body.reason : r.reason;
    const now = isoNow(clock);
    tx(db, () => {
      const post = db.prepare('SELECT status FROM posts WHERE id = ?').get(r.post_id);
      if (outcome === 'hidden' && post.status === 'live') db.prepare("UPDATE posts SET status = 'hidden', hide_reason = ?, updated_at = ? WHERE id = ?").run(hideReason, now, r.post_id);
      const anyAuto = db.prepare('SELECT 1 FROM reports WHERE post_id = ? AND resolved_at IS NULL AND auto_hidden = 1').get(r.post_id);
      if (outcome === 'kept' && post.status === 'hidden' && anyAuto) db.prepare("UPDATE posts SET status = 'live', hide_reason = NULL, updated_at = ? WHERE id = ?").run(now, r.post_id);
      db.prepare('UPDATE reports SET resolved_at = ?, resolved_by = ?, outcome = ? WHERE post_id = ? AND resolved_at IS NULL').run(now, req.user.id, outcome, r.post_id);
      audit(req.user.id, 'report_resolve', `report:${r.id}`, outcome);
    });
    ok(res, {});
  });

  hooks.me.push((data, req) => {
    if (deps.settings.feature(key) && req.user.role === 'office') data.openReports = db.prepare('SELECT COUNT(*) n FROM reports WHERE resolved_at IS NULL').get().n;
  });
}
