# P0 · 뼈대

범위: `docs/10_ROADMAP.md` P0 · 요구사항 FR-SYS-01~09 · NFR-02·03·08·12.

## 만들 것

1. `package.json` — `"type":"module"`, `"engines":{"node":">=22.13"}`, scripts `start: node src/server.js`, `test: node --test test/`. 의존성 `express@^5`. `npm install`로 lockfile 생성.
2. `.gitignore`(`node_modules/`, `.local/`, `*.db*`, `.env*`, `secrets.json`, `logs/`) · `.gitattributes`(`* text=auto eol=lf`, `*.ps1 text eol=crlf`).
3. `src/config.js` — `docs/07_CONFIG.md` 1~3절 (병합·허용 키·검증·운영 모드 필수 변수·보호 포트 거부).
4. `src/lib/` — `http.js` · `log.js`(요청 ID, 접속 주소·본문 미기록) · `paths.js`(`safeJoin`) · `clock.js`.
5. `src/db.js` + `src/schema/001_init.sql`(`docs/03` 2절 전체) — 연결 PRAGMA · `migrate`(적용 전 `VACUUM INTO` 백업 · 코드보다 높은 버전이면 throw) · `tx` · `backup(dest)`.
6. `src/app.js` — `createApp({cfg, db, secrets, clock, paths})` · `x-powered-by` 끔 · 보안 머리글 · `/healthz` · `/readyz` · 정적 `public/`(dotfiles 거부) · API 404 JSON · 오류 500 JSON.
7. `src/server.js` — `docs/02` 3절 수명 순서 · secrets 자동 생성 · 종료 신호(SIGINT·SIGTERM·SIGBREAK) · 일일 백업 스케줄러 · 시작 시 30일 넘은 로그 회전 파일 정리.
8. `public/404.html` · `public/assets/app.css`(디자인 토큰 `docs/05` 2절).
9. `tools/check.js` — `--url`(기본 `http://127.0.0.1:$PORT`)로 healthz·readyz 확인 · `--integrity`로 `PRAGMA integrity_check`. 종료코드 0/1.
10. `deploy/pack.ps1` · `deploy/install.ps1`(DryRun 포함) · `deploy/check.ps1` — `docs/08` 3·4·6절. PowerShell 5.1 문법만.
11. `test/` — `docs/09` 2·3절 중 P0 해당 항목 전부(config·paths·트리거·마이그레이션·백업·health·readyz·정적 노출 금지·404 JSON).
12. `STATUS.md` · `README.md`에 개발 실행법 추가(`$env:APP_RELEASE='dev'; npm start`).

## 하지 말 것

로그인·자료·질문 카드·게시판 라우트(P1 이후) · 추가 의존성 · 빌드 도구 · 실제 서버 대상 실행.

## 보고

`npm test` 통과 수 · FR-SYS별 충족 · `install.ps1 -DryRun` 출력 예 · 미검증(실서버·NSSM·방화벽) 목록.
