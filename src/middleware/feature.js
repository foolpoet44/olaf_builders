// 확장 기능 공통 게이트 (docs/13 1절) — 꺼지면 404 (존재 자체를 숨김)
export const featureGate = (key) => (req, res, next) =>
  req.app.locals.settings.feature(key)
    ? next()
    : res.status(404).json({ ok: false, error: { code: 'not_found', message: '없는 주소입니다' } });
