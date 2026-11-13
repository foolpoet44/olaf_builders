// 시계 — 테스트에서 고정할 수 있게 주입한다.
export const systemClock = {
  now: () => new Date(),
};

export function fixedClock(iso) {
  let t = new Date(iso).getTime();
  return {
    now: () => new Date(t),
    advance(ms) { t += ms; },
    set(isoStr) { t = new Date(isoStr).getTime(); },
  };
}

/** UTC ISO 문자열 (초 단위) */
export const isoNow = (clock) => clock.now().toISOString().replace(/\.\d{3}Z$/, 'Z');
/** 로컬 날짜 YYYYMMDD */
export const localDay = (d) =>
  `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
