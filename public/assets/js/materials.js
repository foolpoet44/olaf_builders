import { requireMe, api, el, $, clear, qs } from './common.js';

const me = await requireMe(null, 'materials');
const cv = $('#cv');
const ctx = cv.getContext('2d');
let cur = null;     // 현재 자료
let page = 1;
let fit = true;
const cache = new Map();

cv.addEventListener('contextmenu', (e) => e.preventDefault());
cv.addEventListener('dragstart', (e) => e.preventDefault());

async function loadList() {
  const { items } = await api('/api/materials');
  const box = clear($('#list'));
  if (!items.length) { box.append(el('p', { class: 'muted' }, '공개된 자료가 없습니다.')); return; }
  const bySession = new Map();
  for (const m of items) {
    const k = m.session || '기타';
    if (!bySession.has(k)) bySession.set(k, []);
    bySession.get(k).push(m);
  }
  for (const [s, list] of bySession) {
    box.append(el('h3', { style: 'margin-top:18px' }, `세션 ${s}`));
    for (const m of list) {
      box.append(el('div', { class: 'list-item row' },
        el('a', { class: 'title', href: `?m=${m.id}` }, m.title),
        el('span', { class: 'muted small' }, [m.lecturer, `${m.pages}쪽`].filter(Boolean).join(' · '))));
    }
  }
}

async function bitmap(n) {
  const key = `${cur.id}:${n}`;
  if (!cache.has(key)) {
    cache.set(key, (async () => {
      const r = await api(`/api/materials/${cur.id}/pages/${n}`);
      return createImageBitmap(await r.blob());
    })());
  }
  return cache.get(key);
}

async function draw() {
  $('#page').value = page;
  const bmp = await bitmap(page);
  cv.width = bmp.width;
  cv.height = bmp.height;
  ctx.drawImage(bmp, 0, 0);
  cv.style.width = fit ? '100%' : `${bmp.width}px`;
  if (page < cur.pages) bitmap(page + 1).catch(() => {});
  window.dispatchEvent(new CustomEvent('olaf:page', { detail: { material: cur, page } }));
}

function go(n) {
  if (!cur) return;
  page = Math.min(cur.pages, Math.max(1, n));
  draw().catch(() => {});
}

async function openMaterial(id) {
  cur = await api(`/api/materials/${id}`);
  page = 1;
  $('#list-view').classList.add('hidden');
  $('#viewer-view').classList.remove('hidden');
  $('#v-title').textContent = cur.title;
  $('#total').textContent = `/ ${cur.pages}`;
  $('#page').max = cur.pages;
  await draw();
  if (me.features.materialThreads) {
    import('./material-threads.js').then((m) => m.mount(me, cur, $('#threads'), $('#viewer'), () => page)).catch(() => {});
  }
}

$('#back').addEventListener('click', () => { location.href = '/materials.html'; });
$('#prev').addEventListener('click', () => go(page - 1));
$('#next').addEventListener('click', () => go(page + 1));
$('#page').addEventListener('change', (e) => go(Number(e.target.value)));
$('#fit').addEventListener('click', () => { fit = !fit; $('#fit').textContent = fit ? '100%' : '맞춤'; draw(); });
document.addEventListener('keydown', (e) => {
  if (!cur || ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
  if (e.key === 'ArrowLeft') go(page - 1);
  if (e.key === 'ArrowRight') go(page + 1);
});

const m = qs('m');
if (m) openMaterial(m).then(() => { const pg = Number(qs('page')); if (pg > 1) go(pg); }).catch(() => { location.href = '/materials.html'; });
else loadList();
