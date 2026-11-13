import { requireMe, api, el, $, roleLabel } from './common.js';

const DESC = {
  materials: '교육 자료를 쪽 단위로 봅니다',
  qcards: '세션에 가져올 질문을 쓰고 제출합니다',
  board: '공지 · Lab 라운지 · 그룹 보드 · Q&A',
  directory: '1기 멤버를 Lab · 그룹별로 봅니다',
  events: '여정과 주요 일정',
  bookmarks: '내가 저장한 글',
  surveys: '진행 중인 설문',
  admin: '명단 · 자료 · 질문 카드 · 감사 기록',
};

const me = await requireMe(null, 'home');
$('#hello').textContent = `${me.name}님, 반갑습니다`;
api('/api/config/public').then((c) => { $('#brand-msg').textContent = `${c.cohort.name} · ${c.brand.messages.campaign}`; }).catch(() => {});

const menu = $('#menu');
for (const m of me.menu) {
  const desc = m.key === 'qcards' && me.features.qcardsClosed ? '제출이 마감되었습니다' : DESC[m.key] || '';
  menu.append(el('a', { class: 'menu-card', href: m.href, dataset: { key: m.key } },
    el('h3', {}, m.label), el('div', { class: 'muted small' }, desc), el('span', { class: 'badge hidden', dataset: { cardBadge: m.key } }, '')));
}
menu.append(el('div', { class: 'menu-card' }, el('h3', {}, '내 정보'),
  el('div', { class: 'muted small' }, [me.title, roleLabel(me.role), me.lab, me.grp].filter(Boolean).join(' · '))));

// 확장 블록 (portal-ext.js 가 기능별로 채운다)
import('./portal-ext.js').then((m) => m.render?.(me, $('#blocks'))).catch(() => {});
