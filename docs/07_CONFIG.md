# 07. 설정 계약

설정은 세 층이다. 뒤가 앞을 덮는다.

| 층 | 위치 | 내용 | 비밀 | 바꾸는 사람 |
|---|---|---|---|---|
| 1. 기본 설정 | 릴리스 `config/app.json` | 브랜드·Lab·역할·규칙 수치·공간 | 없음 | 개발(커밋) |
| 2. 운영 덮어쓰기 | `APP_CONFIG_FILE` (`…\config\app-settings.json`) | 마감 스위치·세션 시간·백업 시각 등 | 없음 | 운영·사무국(화면 일부) |
| 3. 환경변수 | NSSM `AppEnvironmentExtra` | 포트·경로·릴리스 | 없음 | 운영(설치 스크립트) |
| (비밀) | `…\config\secrets.json` | 세션·HMAC 키 | **있음** | 앱이 자동 생성 |

## 1. 환경변수

| 변수 | 필수 | 기본값 | 설명 |
|---|---|---|---|
| `NODE_ENV` | 권장 | `development` | `production`이면 상세 오류 숨김·정적 캐시 헤더 |
| `PORT` | 아니오 | `8091` | 8080·8081·80·443·1234·3389이면 **시작 거부** |
| `HOST` | 아니오 | `127.0.0.1` | 사내 공개는 `0.0.0.0` (결정 B3) |
| `APP_DATA_DIR` | 운영 필수 | `./.local/data` (개발) | DB 폴더 |
| `APP_UPLOAD_DIR` | 운영 필수 | `./.local/uploads` | 자료 이미지 |
| `APP_CONFIG_FILE` | 운영 필수 | `./.local/config/app-settings.json` | 운영 덮어쓰기 파일. 같은 폴더에 `secrets.json` |
| `APP_BACKUP_DIR` | 아니오 | `APP_DATA_DIR\..\backups` | 백업 폴더 |
| `APP_RELEASE` | 운영 필수 | `dev` | `/healthz`의 `release` |
| `TRUST_PROXY` | 아니오 | `0` | `1`이면 `X-Forwarded-For`·`X-Forwarded-Proto` 신뢰 |

`NODE_ENV=production`인데 `APP_DATA_DIR`·`APP_UPLOAD_DIR`·`APP_CONFIG_FILE`·`APP_RELEASE` 중 하나라도 없으면 시작 거부.
개발 기본 경로 `./.local/`은 `.gitignore`에 넣는다.

## 2. 병합 규칙 (`src/config.js`)

1. `app.json` 읽기(없거나 JSON 오류 → 시작 거부).
2. `APP_CONFIG_FILE` 있으면 읽어 **깊은 병합**(객체는 병합, 배열·원시값은 교체). 없으면 건너뜀. JSON 오류 → 시작 거부.
3. 덮어쓰기 파일에서 허용하는 최상위 키만 받는다: `qcards` · `auth` · `backup` · `logs` · `materials` · `visibility` · `sessions` · `brand` · `meta` · (확장) `site` · `features` · `events` · `directory` · `qcardAnswer` · `notifications` · `digest` · `invite` · `tags` · `moderation` · `surveys`. 그 밖의 키 → 시작 거부(오타 방지).
4. 검증 실패 메시지는 키 경로만(`qcards.readAloudSeconds must be integer 10..120`).
5. 결과는 `Object.freeze` 깊게. 단 `qcards.closed`는 사무국 화면에서 바꾸므로 **런타임 설정 저장소**(`settingsStore.get/set`)를 통해 읽고, 바꿀 때 덮어쓰기 파일을 원자적으로 다시 쓴다(`임시 파일 → fs.renameSync`).

## 3. 검증 규칙 (요점)

| 키 | 규칙 |
|---|---|
| `appId` | `^[a-z][a-z0-9-]{2,40}$` |
| `labs[].code` | 대문자 2~4자, 중복 없음 · `groups[]` 전역 중복 없음 |
| `roles.*.idPattern` | 정규식으로 컴파일 가능 |
| `roles.master.scope` | `lab` · `group` · `all` |
| `spaces[].per` | `none` · `lab` · `group` |
| `spaces[].read/write` | `all` · `lab` · `group` · `lab_scope` · `operator` |
| `qcards.*Chars` | 정수, min ≤ max |
| `qcards.readAloudSeconds` | 10~120 |
| `sessions[].code` | 중복 없음 · `leadLab`은 `labs`에 존재 |
| `auth.sessionHours` | 1~24 · `officeSessionHours` 1~12 |
| `backup.hourLocal` | 0~23 · `keep` 1~90 |
| `privacy.*Pattern` | 컴파일 가능 |
| `features.*` | 불리언 · 알 수 없는 키 거부 · `helpful`·`surveys`가 true인데 DB `user_version < 4`면 시작 거부 |
| `spaces[].template` | 문자열 배열(≤ 8개) · `acceptAnswers` 불리언 · `feature`가 있으면 그 기능이 켜졌을 때만 공간을 시드·노출 |
| `site.publicBaseUrl` | `null` 또는 `http(s)://`로 시작하는 문자열 |
| `events[]` | `date` `YYYY-MM-DD` · `kind` ∈ `launch·lab·session·review·demo·other` |
| `invite.template` | `{code}` 포함 필수 · 허용 자리표시자 `{name}` `{community}` `{url}` `{code}` |
| `tags` | `labs[].keywords` + `extra` 합집합에 중복 없음 · `maxPerPost` 1~10 |
| `moderation.immediateHideReasons` | `posts.hideReasons`의 부분집합 |
| `qcardAnswer.space` | `spaces`에 있는 `per:"none"` 공간 코드 |

## 4. `app.json` 구역 설명

실제 파일: `config/app.json` (이 패키지에 포함 — 기존 `config.yaml`에서 사람·비밀·Vercel 항목을 뺀 이식본).

| 구역 | 내용 | 기존 `config.yaml` 대응 |
|---|---|---|
| `meta` | 보안 띠 문구 | `meta.security_label` |
| `brand` | 브랜드 이름·메시지 (제안안) | `brand` |
| `cohort` | 기수 코드·이름 | `cohort` |
| `labs` | Lab·그룹 | `labs.items` |
| `roles` | 역할 이름·ID 패턴·Master 범위 | `roles` · `roster.id_patterns` (`operator` → `office`) |
| `menus` · `menuItems` | 역할별 첫 화면 메뉴 | (신규) |
| `auth` | 세션 시간·쿠키·횟수 제한 | `auth` |
| `privacy` | 사번·이메일·전화 패턴 | `privacy` · `content_scan` |
| `roster` | 명단 CSV 열 규칙 | `roster` (이메일 열을 **버림**으로 바꿈) |
| `materials` | 꾸러미 상한·워터마크 문구 | `materials` |
| `qcards` | 질문 카드 규칙 | `question_cards` |
| `sessions` | W/S 세션 | `sessions` |
| `visibility` · `spaces` · `posts` | 커뮤니티 | `visibility` · `spaces` · `posts` · `moderation` |
| `backup` · `logs` | 운영 | (신규) |
| `site` | 안내 문안용 공개 주소 (운영값) | (신규) |
| `features` | 확장 기능 켜고 끄기 15종 (`docs/13` 2절) | (신규) |
| `directory` · `qcardAnswer` · `notifications` · `digest` · `events` · `invite` · `tags` · `moderation` · `surveys` | 확장 기능별 세부값 | `moderation` 일부 · `labs.keywords` · `demo_day_template` |

> `config/app-settings.example.json`의 `events`·`site.publicBaseUrl` 값은 **형식 예시**다. 실제 일정·주소로 바꾸거나 지우고 쓴다.

## 5. 설정 바꾸기 절차

| 바꿀 것 | 방법 | 재시작 |
|---|---|---|
| 질문 카드 마감 | 사무국 화면 스위치 | 불필요 |
| 확장 기능 켜고 끄기 · 일정 · 안내 문안 | `app-settings.json`의 `features`·`events`·`invite` 편집 | 필요 (해당 앱 서비스만) |
| 세션 시간·백업 시각 | `app-settings.json` 편집 | 필요 (해당 앱 서비스만) |
| 브랜드·Lab·공간 구조 | `app.json` 수정 → 새 릴리스 | 릴리스 교체 |
| 포트·호스트 | NSSM 환경변수 (+방화벽) | 필요 |
