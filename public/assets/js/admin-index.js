import { requireMe, api, el, $ } from './common.js';

const me = await requireMe(['office'], 'admin');
const LINKS = [
  ['/admin/people.html', '명단 · 접속 코드', '사람 목록 · 코드 재발급 · 비활성화'],
  ['/admin/materials.html', '교육 자료', '꾸러미 올리기 · 공개 · 숨김'],
  ['/admin/intake.html', '질문 접수', '제출 현황 · 카드 전체 화면 공유', 'intake'],
  ['/admin/qcards.html', '질문 카드', '목록 · 한 장 보기 · 선정 · CSV · 마감'],
  ['/admin/reports.html', '신고 처리', '처리 대기 신고', 'reports'],
  ['/admin/surveys.html', '설문', '설문 만들기 · 결과', 'surveys'],
  ['/admin/audit.html', '감사 기록', '추가만 하는 기록'],
];
const links = $('#links');
for (const [href, title, desc, feature] of LINKS) {
  if (feature && !me.features[feature]) continue;
  links.append(el('a', { class: 'menu-card', href }, el('h3', {}, title), el('div', { class: 'muted small' }, desc)));
}

const LABEL = { people: '사람(역할별)', materials: '교육 자료', qcards: '질문 카드', posts: '커뮤니티 글', reportsOpen: '처리 대기 신고' };
const s = await api('/api/admin/stats');
const box = $('#stats');
for (const [k, v] of Object.entries(s)) {
  const val = typeof v === 'object' ? Object.entries(v).map(([a, b]) => `${a} ${b}`).join(' · ') || '0' : String(v);
  box.append(el('div', { class: 'row' }, el('b', { style: 'min-width:140px' }, LABEL[k] || k), el('span', {}, val)));
}
