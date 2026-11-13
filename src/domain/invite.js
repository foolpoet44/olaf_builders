// 코드 안내 문안 (FR-EXT-05) — 발송·저장하지 않는다
export function inviteText(cfg, person, code) {
  const url = cfg.site?.publicBaseUrl || '<사무국이 안내할 주소>';
  return String(cfg.invite?.template ?? '{name}님 접속 코드: {code}')
    .replaceAll('{name}', person.name)
    .replaceAll('{community}', cfg.brand.community)
    .replaceAll('{url}', url)
    .replaceAll('{code}', code);
}
