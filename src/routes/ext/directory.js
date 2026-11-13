// FR-EXT-02 멤버 디렉터리 — 표시 칸 4개(+과제명 선택) · Lab→그룹→이름 고정 · 활성만
import { requireLogin } from '../../middleware/session.js';
import { featureGate } from '../../middleware/feature.js';
import { ok } from '../../lib/http.js';

export function directory(api, deps, key) {
  api.get('/directory', featureGate(key), requireLogin, (req, res) => {
    const cfg = deps.settings.cfg;
    const showChallenge = cfg.directory?.showChallenge === true;
    const rows = deps.db.prepare("SELECT id, role, name, title, lab, grp, challenge FROM people WHERE active = 1").all();
    const ko = (a, b) => a.name.localeCompare(b.name, 'ko') || a.id.localeCompare(b.id);
    const person = (p) => ({ id: p.id, name: p.name, title: p.title, lab: p.lab, grp: p.grp, ...(showChallenge && p.role === 'builder' ? { challenge: p.challenge ?? '' } : {}) });
    const groups = [];
    for (const lab of cfg.labs) {
      for (const g of lab.groups) {
        const people = rows.filter((p) => p.role === 'builder' && p.lab === lab.code && p.grp === g).sort(ko).map(person);
        if (people.length) groups.push({ label: `${lab.name} · ${g}`, lab: lab.code, grp: g, people });
      }
    }
    const masters = rows.filter((p) => p.role === 'master').sort(ko).map(person);
    if (masters.length) groups.push({ label: cfg.roles.master.label, lab: null, grp: null, people: masters });
    const office = rows.filter((p) => p.role === 'office').sort(ko).map(person);
    if (office.length) groups.push({ label: cfg.roles.office.label, lab: null, grp: null, people: office });
    ok(res, { groups });
  });
}
