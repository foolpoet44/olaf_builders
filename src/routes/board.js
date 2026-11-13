// 커뮤니티 (FR-BRD-01~11 · docs/04_API_SPEC.md 6절)
import { requireLogin } from '../middleware/session.js';
import { buildSpaces, can } from '../domain/spaces.js';
import { checkPost } from '../domain/board.js';
import * as P from '../repo/posts.js';
import { ok, E, intParam } from '../lib/http.js';
import { isoNow } from '../lib/clock.js';
import { tx } from '../db.js';

/** 공간 목록 · 판정 도우미 — 확장 모듈도 쓴다 (deps.board) */
export function boardHelpers(deps) {
  const spaces = () => buildSpaces(deps.settings.cfg);
  const byId = (id) => spaces().find((s) => s.id === id);
  const readable = (user) => spaces().filter((s) => can(user, 'read', s, deps.settings.cfg));
  const canRead = (user, space) => !!space && can(user, 'read', space, deps.settings.cfg);
  const canWrite = (user, space) => !!space && can(user, 'write', space, deps.settings.cfg);

  /** 화면용 글 항목 — 삭제·숨김 처리 포함 */
  const item = (row, user) => {
    const office = user.role === 'office';
    const P_ = deps.settings.cfg.posts;
    const hidden = row.status === 'hidden';
    const deleted = row.status === 'deleted';
    const masked = (deleted || hidden) && !office;
    const o = {
      id: row.id, spaceId: row.space_id, parentId: row.parent_id,
      title: masked ? null : row.title, body: masked ? null : row.body,
      notice: deleted && !office ? P_.deletedPlaceholder : hidden && !office ? '운영 규칙에 따라 숨김 처리된 글입니다.' : null,
      author: masked ? null : { id: row.author_id, name: row.author_name, title: row.author_title },
      status: row.status, hideReason: office ? row.hide_reason : undefined,
      createdAt: row.created_at, updatedAt: row.updated_at, edited: row.ver > 1, ver: row.ver,
      commentCount: row.comment_count, mine: row.author_id === user.id,
    };
    return o;
  };

  /** 글 하나를 읽을 수 있으면 [row, space] 아니면 404 */
  const readablePost = (user, id) => {
    const row = P.getPost(deps.db, id);
    if (!row) throw E.notFound();
    const space = byId(row.space_id);
    if (!canRead(user, space)) throw E.notFound();
    if (row.status === 'hidden' && user.role !== 'office' && row.author_id !== user.id) throw E.notFound();
    return [row, space];
  };

  return { spaces, byId, readable, canRead, canWrite, item, readablePost };
}

export function boardRoutes(api, deps) {
  const { db, clock, audit, hooks } = deps;
  const H = boardHelpers(deps);
  deps.board = H;

  api.get('/spaces', requireLogin, (req, res) => {
    const list = H.readable(req.user);
    const counts = P.countBySpace(db, list.map((s) => s.id));
    const items = list.map((s) => {
      const o = { id: s.id, code: s.code, label: s.label, lab: s.lab, grp: s.grp, canWrite: H.canWrite(req.user, s), postCount: counts[s.id] ?? 0 };
      for (const d of hooks.spaceItem) d(o, s, req, deps);
      return o;
    });
    ok(res, { items });
  });

  api.get('/spaces/:sid/posts', requireLogin, (req, res) => {
    const space = H.byId(req.params.sid);
    if (!H.canRead(req.user, space)) throw E.notFound();
    const page = Math.max(1, Number(req.query.page) || 1);
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
    const filter = { extraWhere: null, extraArgs: [], excludeIds: [] };
    const extraData = {};
    for (const d of hooks.postsList) d(filter, extraData, { req, space, deps });
    const r = P.listPosts(db, {
      spaceIds: [space.id], includeHidden: req.user.role === 'office', q, page, pageSize: deps.settings.cfg.posts.pageSize,
      extraWhere: filter.extraWhere, extraArgs: filter.extraArgs, excludeIds: filter.excludeIds,
    });
    const items = r.items.map((row) => {
      const o = H.item(row, req.user);
      delete o.body;
      for (const d of hooks.postListItem) d(o, row, req, deps);
      return o;
    });
    ok(res, { ...r, items, ...extraData, space: { id: space.id, label: space.label, canWrite: H.canWrite(req.user, space) } });
  });

  api.post('/spaces/:sid/posts', requireLogin, (req, res) => {
    const space = H.byId(req.params.sid);
    if (!H.canRead(req.user, space)) throw E.notFound();
    if (!H.canWrite(req.user, space)) throw E.forbidden();
    const r = checkPost(req.body, deps.settings.cfg);
    const extraProblems = [];
    for (const d of hooks.postSaved) if (d.check) extraProblems.push(...d.check(req.body, deps));
    if (r.problems.length || extraProblems.length) throw E.validation([...r.problems, ...extraProblems], '글을 확인해 주세요');
    const now = isoNow(clock);
    const id = tx(db, () => {
      const pid = P.createPost(db, { spaceId: space.id, author: req.user.id, title: r.title, body: r.body, now });
      for (const d of hooks.postSaved) d.save?.(pid, req.body, deps, { created: true });
      audit(req.user.id, 'post_create', `post:${pid}`);
      return pid;
    });
    ok(res, { id }, 201);
  });

  api.get('/posts/:id', requireLogin, (req, res) => {
    const [row, space] = H.readablePost(req.user, intParam(req.params.id));
    if (row.parent_id) throw E.notFound();
    const post = H.item(row, req.user);
    post.space = { id: space.id, label: space.label, canWrite: H.canWrite(req.user, space) };
    const comments = P.listComments(db, row.id)
      .filter((c) => c.status !== 'hidden' || req.user.role === 'office' || c.author_id === req.user.id)
      .map((c) => H.item(c, req.user));
    for (const d of hooks.postDetail) d(post, comments, row, req, deps);
    ok(res, { post, comments });
  });

  const ownOrOffice = (req, row) => {
    if (row.author_id !== req.user.id && req.user.role !== 'office') throw E.forbidden();
  };

  api.put('/posts/:id', requireLogin, (req, res) => {
    const [row, space] = H.readablePost(req.user, intParam(req.params.id));
    if (row.author_id !== req.user.id) throw E.forbidden();
    if (row.status !== 'live') throw E.validation(['삭제·숨김된 글은 고칠 수 없습니다']);
    if (!H.canWrite(req.user, space)) throw E.forbidden();
    const isComment = row.parent_id != null;
    const r = checkPost({ title: isComment ? '' : (req.body?.title ?? row.title), body: req.body?.body }, deps.settings.cfg, { comment: isComment });
    const extraProblems = [];
    if (!isComment) for (const d of hooks.postSaved) if (d.check) extraProblems.push(...d.check(req.body, deps));
    if (r.problems.length || extraProblems.length) throw E.validation([...r.problems, ...extraProblems], '글을 확인해 주세요');
    const now = isoNow(clock);
    const nv = tx(db, () => {
      const v = P.editPost(db, { id: row.id, ver: Number(req.body?.ver), title: r.title, body: r.body, now, editor: req.user.id });
      if (v === null) return null;
      if (!isComment) for (const d of hooks.postSaved) d.save?.(row.id, req.body, deps, { created: false });
      audit(req.user.id, 'post_edit', `post:${row.id}`, `v${v}`);
      return v;
    });
    if (nv === null) throw E.conflict();
    ok(res, { id: row.id, ver: nv });
  });

  api.delete('/posts/:id', requireLogin, (req, res) => {
    const [row] = H.readablePost(req.user, intParam(req.params.id));
    ownOrOffice(req, row);
    if (row.status === 'deleted') return ok(res, {});
    P.setStatus(db, row.id, 'deleted', null, isoNow(clock));
    audit(req.user.id, 'post_delete', `post:${row.id}`);
    ok(res, {});
  });

  api.post('/posts/:id/comments', requireLogin, (req, res) => {
    const [row, space] = H.readablePost(req.user, intParam(req.params.id));
    if (row.parent_id != null) throw E.validation(['댓글에는 댓글을 달 수 없습니다']);
    if (row.status !== 'live') throw E.validation(['삭제·숨김된 글에는 댓글을 달 수 없습니다']);
    if (!H.canWrite(req.user, space)) throw E.forbidden();
    const r = checkPost({ body: req.body?.body }, deps.settings.cfg, { comment: true });
    if (r.problems.length) throw E.validation(r.problems, '댓글을 확인해 주세요');
    const now = isoNow(clock);
    const id = tx(db, () => {
      const cid = P.createPost(db, { spaceId: space.id, parentId: row.id, author: req.user.id, title: null, body: r.body, now });
      audit(req.user.id, 'post_create', `comment:${cid}`);
      return cid;
    });
    ok(res, { id }, 201);
  });

  // ---- 사무국 ---------------------------------------------------------
  const admin = deps.adminRouter;
  const findAny = (id) => { const row = P.getPost(db, intParam(id)); if (!row) throw E.notFound(); return row; };

  admin.post('/posts/:id/hide', (req, res) => {
    const row = findAny(req.params.id);
    const reason = req.body?.reason;
    if (!deps.settings.cfg.posts.hideReasons.includes(reason)) throw E.validation(['숨김 사유를 골라 주세요']);
    P.hidePost(db, row.id, reason, isoNow(clock));
    audit(req.user.id, 'post_hide', `post:${row.id}`, reason);
    ok(res, {});
  });

  admin.post('/posts/:id/restore', (req, res) => {
    const row = findAny(req.params.id);
    P.setStatus(db, row.id, 'live', null, isoNow(clock));
    audit(req.user.id, 'post_restore', `post:${row.id}`);
    ok(res, {});
  });

  admin.get('/posts/:id/versions', (req, res) => {
    const row = findAny(req.params.id);
    audit(req.user.id, 'view_operator_screen', `post:${row.id}:versions`);
    ok(res, { items: P.postVersions(db, row.id), status: row.status, hideReason: row.hide_reason });
  });

  hooks.stats.push(() => ({
    posts: Object.fromEntries(db.prepare("SELECT space_id, COUNT(*) n FROM posts WHERE parent_id IS NULL AND status = 'live' GROUP BY space_id ORDER BY space_id").all().map((x) => [x.space_id, x.n])),
  }));
}
