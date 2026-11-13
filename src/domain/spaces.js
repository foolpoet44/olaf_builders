// 공간 펼치기 · 열람/쓰기 판정 (FR-BRD-01~03) — 기본 거부
// 기존 리포 scripts/spaces.py 의 build_spaces · can · master_covers 와 같은 판정표

/** config.spaces → 실제 공간 목록. feature 가 지정된 공간은 그 기능이 켜졌을 때만 */
export function buildSpaces(cfg) {
  const out = [];
  let sort = 0;
  for (const spec of cfg.spaces) {
    if (spec.feature && !cfg.features?.[spec.feature]) continue;
    const base = { code: spec.code, read: spec.read, write: spec.write, template: spec.template ?? null, acceptAnswers: !!spec.acceptAnswers };
    if (spec.per === 'none') out.push({ ...base, id: spec.code, label: spec.label, lab: null, grp: null, sort: sort++ });
    else if (spec.per === 'lab') {
      for (const lab of cfg.labs) out.push({ ...base, id: `${spec.code}/${lab.code}`, label: `${spec.label} · ${lab.name}`, lab: lab.code, grp: null, sort: sort++ });
    } else if (spec.per === 'group') {
      for (const lab of cfg.labs) for (const g of lab.groups) out.push({ ...base, id: `${spec.code}/${g}`, label: `${spec.label} · ${g}`, lab: lab.code, grp: g, sort: sort++ });
    }
  }
  return out;
}

const groupLab = (cfg) => Object.fromEntries(cfg.labs.flatMap((l) => l.groups.map((g) => [g, l.code])));

export function masterCovers(person, space, cfg) {
  const scope = cfg.roles.master.scope;
  const assigned = new Set(person.assigned ?? []);
  if (scope === 'all') return true;
  if (scope === 'lab') {
    if (space.lab == null) return false;
    // 담당에 그룹 코드가 들어 있어도 그 그룹의 Lab 이면 닿는다
    if (assigned.has(space.lab)) return true;
    const gl = groupLab(cfg);
    return [...assigned].some((a) => gl[a] === space.lab);
  }
  if (scope === 'group') {
    if (space.grp != null) return assigned.has(space.grp);
    if (space.lab != null) { const gl = groupLab(cfg); return [...assigned].some((g) => gl[g] === space.lab); }
  }
  return false;
}

function isMember(person, space, level, cfg) {
  if (person.role === 'master') return masterCovers(person, space, cfg);
  if (person.role === 'builder') {
    if (level === 'group') return space.grp != null && person.grp === space.grp;
    return space.lab != null && person.lab === space.lab;
  }
  return false;
}

/** 이 사람이 이 공간에서 action(read|write) 을 할 수 있는가. 규칙에 없으면 false */
export function can(person, action, space, cfg) {
  if (!person || !space || !['read', 'write'].includes(action)) return false;
  if (person.active === false) return false;
  if (person.role === 'office') return true;
  if (!['builder', 'master'].includes(person.role)) return false;
  const rule = space[action];
  if (rule === 'all') return true;
  if (rule === 'lab') return isMember(person, space, 'lab', cfg);
  if (rule === 'group') return isMember(person, space, 'group', cfg);
  if (rule === 'lab_scope') return cfg.visibility?.labLoungeCrossLabRead ? true : isMember(person, space, 'lab', cfg);
  return false; // operator · 그 밖의 값
}
