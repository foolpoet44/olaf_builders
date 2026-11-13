# PRI 로컬 윈도우 웹앱 배포환경 명세

버전: 1.0  
기준일: 2026-11-13  
대상: 바이브코딩 도구·코딩 에이전트·개발자·배포 담당자  
사용법: 프로젝트 루트에 이 파일을 넣고, 구현 시작 전에 읽도록 지시한다.

> 이 문서는 기존 현황, 미확인 항목, 신규 앱의 설계 계약을 구분한다. 기존 PC에 설치·접속·설정 변경을 수행했다는 의미가 아니다. 프로젝트 생성 시 아래 보호 경계와 미확인 항목을 보존하라. 신규 앱 예제명 `pri-webapp`, 포트 `8082`, 신규 저장 경로는 확정 환경이 아닌 제안값이다.

## 1. 가장 중요한 제약

1. 배포 대상은 **사내망 로컬 윈도우 PC 한 대**다. Linux·Vercel·Docker·WSL을 전제로 구현하지 않는다.
2. 기존 메인 앱과 HR 포털을 수정·재시작·교체하지 않는다. 새 앱은 별도 폴더·포트·서비스로 분리한다.
3. 기존 `8080`, `8081`과 `prihr-main`, `hrportal`, `HRPortal8081` 이름을 사용하지 않는다.
4. `D:\https`에 프로젝트를 복사하는 것만으로 Node/Next.js 앱이 실행된다고 가정하지 않는다.
5. 사내망은 인증의 대체물이 아니다. 민감 데이터의 운영 개통은 승인된 HTTPS·인증·권한 검증 후 진행한다.
6. 원격 접속정보·비밀번호·API 키·직원 원본자료를 소스·공유 ZIP·프롬프트·로그에 넣지 않는다.
7. 현재 첨부 `hr_portal.zip`은 완전한 배포본이 아니다. 누락 파일을 추측해서 만들거나 기존 앱으로부터 무단 복사하지 않는다.

## 2. 기존 현황 — 문서·소스에 근거한 값

| 키 | 값 | 근거 수준 |
|---|---|---|
| 서버 수 | 로컬 윈도우 PC 1대 | 사용자 지정 범위 |
| 내부 IP | 10.164.202.198 | 첨부 문서들과 HR 포털 소스 |
| OS 명칭 | Windows Server 2025 Standard | summary.html 기재, 실측 미확인 |
| 사내 호스트명 | lgprihr.lge.com | 문서의 HR 포털 접속 주소; DNS 조회 미수행 |
| RDP | 운영 문서 1234 / 초기 기록 3389 | 현행 포트 확인 필요, 변경 금지 |
| Node 실행 파일 | C:\Program Files\nodejs\node.exe | 기존 메인 NSSM 설정으로 문서에 기재 |
| Node 버전 | 미확인 | 과거 ‘14.x 이상’은 요구조건이지 설치 버전 아님 |
| NSSM 경로 | C:\apps\meeting_recorder_v2\nssm.exe | 기존 메인 서비스 문서 |
| 기존 메인 | prihr-main / windows_server.js / 8080 | 문서상 NSSM, Auto, LocalSystem |
| 기존 메인 루트 | C:\apps\meeting_recorder_v2 | 보호 경로 |
| HR 포털 루트 | C:\apps\hr-portal | 문서상 배포 경로 |
| HR 포털 진입 | hrportal_server.js / 기본 8081 / 0.0.0.0 | 첨부 소스; HRPORTAL_PORT로 변경 가능 |
| HR 포털 실행 관리 | hrportal 또는 HRPortal8081 | 스크립트는 NSSM 우선·예약 작업 대체, 실제 등록 상태 미조회 |
| 자동배포 입력 | D:\https | 외부 Hosting API로 파일 내용 전송 |
| 자동배포 기록 | C:\apps\meeting_recorder_v2\data\auto_hosted.json | 영구 감사 원장 아님 |
| 기타 기존 처리 영역 | D:\save, D:\tech | 새 앱의 공용 저장소로 사용 금지 |
| 외부 연계 | Azure VM / prihr.com / Cloudflare Pages | 로컬 PC와 다른 환경; 신규 앱 사용 권한·연결 미확정 |

**현재 있다고 가정하지 말 것:** 신규 DB·Redis, Docker, WSL, 로컬 Caddy의 유효한 TLS 바인딩, IIS 역방향 프록시, 공인 도메인 연결, 외부 Azure에서 사설 IP로 접근 가능한 경로, 범용 SSO API, 배포 자동화·모니터링 서비스.

IIS·PM2는 초기 이력에만 등장한다. 기존 메인의 현재 운영 기준은 NSSM이다. 새로운 앱을 PM2로 추가 기동하거나 기존 프로세스 관리 체계를 바꾸지 않는다.

## 3. 배포 전 운영자가 채울 값 — 미입력 상태는 개통 차단

```yaml
environment_id: pri-local-windows
server_ip: 10.164.202.198
server_hostname_documented: lgprihr.lge.com
os_actual: "[실제 조회값 입력]"
architecture_actual: "[실제 조회값 입력]"
node_executable: 'C:\Program Files\nodejs\node.exe'
node_version_approved: "[지원 LTS·실제 버전·앱 호환성 확인]"
nssm_executable: 'C:\apps\meeting_recorder_v2\nssm.exe'
nssm_version_actual: "[실제 확인값 입력]"
app_id_approved: "[예: pri-webapp / 중복 확인 필요]"
service_name_approved: "[승인된 신규 서비스명]"
port_approved: "[예: 8082 / 충돌·할당 승인 필요]"
release_id: "[실제 릴리스 ID]"
runtime_entry: "[실제 운영 진입 파일]"
service_account: "[승인된 최소 권한 계정]"
allowed_client_ranges: ["[승인된 IP 또는 CIDR]"]
firewall_profile: "[실제 프로필과 승인 범위 확인]"
public_base_url: "[승인된 HTTPS 진입 주소; 미정이면 운영 개통 금지]"
reverse_proxy_location: "[해당 여부·위치·관리자 확인]"
authentication_method: "[승인된 인증·권한 설계]"
config_secret_delivery: "[승인된 보관·공급 방법]"
backup_destination: "[승인된 별도 백업 저장소]"
backup_retention: "[승인된 보존기간]"
owner: "[업무 담당자]"
operator: "[운영 담당자]"
```

CPU·RAM·여유 디스크·동시 사용자 수·업로드 한도·복구시간/복구시점 목표도 앱별로 확정한다. 미확인값을 임의 사실로 채우지 않는다. 8082가 비어 있다는 이유만으로 확정하지 않는다.

## 4. 신규 앱 권장 배치 구조 — 기존 현황과 구분

```text
C:\apps\<app-id>\releases\<release-id>\
    package.json
    package-lock.json
    소스·정적 자산·빌드 결과·운영 의존성

C:\ProgramData\PRI\<app-id>\
    config\      비밀·설정; 웹 노출 금지
    data\        영구 업무 데이터
    uploads\     허용된 업로드
    logs\        out.log / err.log
    backups\     단기 복구본; 별도 백업 저장소도 필요
```

- 릴리스 폴더는 새로 만들고 실행 중 내용을 덮어쓰지 않는다.
- 데이터·업로드·로그·비밀 설정은 릴리스 밖에 저장한다.
- 코드 경로는 읽기·실행 중심, 쓰기 폴더는 서비스 계정에만 필요한 권한을 부여한다.
- 운영 코드의 절대경로·사용자 홈·바탕화면·현재 셸 작업 디렉터리에 데이터 저장을 의존하지 않는다.
- 파일 경로는 `path.join`/`path.resolve` 등으로 처리한다. 경로 이탈, 심볼릭 링크·재분석 지점, 확장자·파일 크기·업로드 파일명 검증을 설계한다.
- UTF-8을 사용하고 한글·공백 포함 파일명과 새로고침 동작을 테스트한다.

## 5. 런타임·빌드 계약

### 공통

- 지원 중인 Node LTS 중 앱·설치 OS에 맞는 **정확한 승인 버전**을 정한다. 공용 Node를 자동 업그레이드하지 않는다.
- npm 기반일 때 `package-lock.json`을 제공하고 대상 Windows에서 `npm.cmd ci`로 설치한다.
- Linux/macOS `node_modules`를 운영본에 그대로 포함하지 않는다. 네이티브 모듈의 Windows 호환성과 아키텍처를 검증한다.
- npm 외 패키지 매니저를 선택하면 설치 승인·버전·lockfile·명령을 명시한다. 기본 제공된 것으로 가정하지 않는다.
- 빌드가 있으면 `npm.cmd run build`가 성공해야 한다. `dev` 서버를 운영 서비스로 사용하지 않는다.
- npm 생명주기 스크립트·외부 다운로드·폰트/CDN·외부 API 의존성을 목록화한다. 오프라인 또는 사내 프록시 제약을 고려한다.
- bash 전용 환경변수 구문·cp/rm·systemd·Linux chmod·/tmp를 배포 필수요소로 쓰지 않는다. PowerShell 5.1 호환 명령을 기본으로 하며 PowerShell 7 필요 시 명시한다.
- npm.cmd 사용 예: `& 'C:\Program Files\nodejs\npm.cmd' ci`. 순수 Node의 .env 자동 로딩은 가정하지 않는다.

### Node / Express / 정적 SPA 서버

- 예시 운영 진입 파일은 `dist\server.js`. 실제 파일을 배포 문서와 일치시킨다.
- `PORT`, `HOST`를 읽어 listen한다. 직접 사내 테스트는 0.0.0.0, 로컬 프록시 뒤에서는 승인에 따라 127.0.0.1.
- SPA는 실제 파일·API가 아닌 화면 경로에만 index fallback을 적용한다. API·health의 404/503을 HTML 200으로 숨기지 않는다.
- 정적 제공 범위를 `public` 또는 `dist/client` 등으로 제한한다. 프로젝트 루트·소스·설정·data·세션·로그를 정적 공개하지 않는다.

### Next.js

- 일반 Node 서버 배포를 기본으로 한다. `next build` 후 `next start` 사용.
- NSSM은 node.exe를 직접 실행하고 상대 인수 예시를 `node_modules\next\dist\bin\next start -p <port> -H <host>`로 문서화한다.
- `.next`, `public`, 운영 의존성·설정 파일을 포함한다. standalone 선택 시 별도 출력·복사·실행 계약을 제공하고 일반 start와 혼용하지 않는다.
- `NEXT_PUBLIC_` 값은 공개·빌드 고정 값으로 취급한다. 비밀값을 넣지 않는다.
- 데이터 영구 저장에 빌드 폴더나 Next 캐시를 사용하지 않는다.

## 6. 신규 앱 환경변수 계약

아래는 **새 앱 구현 요구사항**이다. 기존 HR 포털에 이 변수를 넣으면 자동 적용되는 것이 아니다.

| 변수 | 의미 | 예시·조건 |
|---|---|---|
| NODE_ENV | 운영 모드 | production |
| PORT | 앱 포트 | 운영자 승인값; 8080/8081 금지 |
| HOST | 리스닝 주소 | 직접 사내 테스트 0.0.0.0 / 프록시 설계 시 127.0.0.1 |
| APP_DATA_DIR | 영구 데이터 경로 | C:\ProgramData\PRI\<app-id>\data |
| APP_UPLOAD_DIR | 업로드 경로 | C:\ProgramData\PRI\<app-id>\uploads |
| APP_CONFIG_FILE | 외부 설정 파일 | C:\ProgramData\PRI\<app-id>\config\app-settings.json |

앱 ID·릴리스 정보는 빌드 메타데이터 또는 추가 명시된 비밀 아닌 설정으로 공급한다. `APP_CONFIG_FILE`의 파일 형식·필수 키·검증·접근권한을 README에 정의한다. 설정 파일이 필요한 앱에서 누락·형식 오류가 나면 시작을 중단하거나 ready 503으로 실패를 명시한다. 의도치 않은 무인증 모드로 전환하지 않는다.

환경 예시 파일에는 비밀 아닌 샘플·명확한 플레이스홀더만 넣는다. NSSM `AppEnvironmentExtra`는 비밀 아닌 경로·운영값만 전달하는 기본안이며, 비밀 파일·저장소의 실제 공급 방법은 관리자가 정한다. 개발 셸의 `$env:` 설정이 Windows 서비스에 자동 전달된다고 가정하지 않는다.

## 7. 서비스·네트워크 계약

- 신규 서비스 하나에 신규 앱 프로세스 하나를 기본으로 한다. 파일 기반 저장을 쓸 때 임의 다중 인스턴스·클러스터를 금지한다.
- NSSM 절대경로를 사용한다. PATH 검색 실패 시 예약 작업으로 **조용히 대체하지 않는다**. 대체가 필요하면 관리자 승인을 받아 별도 실행·로그·복구 절차를 제공한다.
- 서비스 등록은 처음에 수동 시작으로 두고 계정·ACL·실행 인수를 검토한 뒤 자동 시작으로 전환한다.
- NSSM AppDirectory는 해당 릴리스 경로, Application은 승인된 node.exe, AppParameters는 실제 상대 진입 인수다.
- stdout/stderr를 분리하고 로그 보존·회전·디스크 한도를 정한다. 재시작 시 회전만으로 실행 중 로그 증가를 통제했다고 하지 않는다.
- 종료 시 진행 중 쓰기·요청을 마무리하고 리소스를 정리한다. 종료·복구 동작을 실제 Windows 서비스에서 검증한다.
- 방화벽은 앱 전용 이름·프로그램·포트·허용 클라이언트·프로필로 제한한다. 더 넓은 기존 규칙·GPO도 검토한다.
- 도메인·TLS·Caddy·IIS·인증서를 자동 구성하거나 기존 80/443 바인딩을 바꾸지 않는다.
- 브라우저 API는 가능한 동일 출처 상대 URL을 사용한다. 브라우저의 localhost는 서버가 아니라 사용자 PC를 뜻하므로 서버 주소로 하드코딩하지 않는다.
- 외부 통신·메일·AI API·인증 서버는 기본 사용 가능으로 간주하지 않는다. 연결·승인·프록시·인증서·타임아웃·실패 동작을 정의한다.
- Outlook COM은 기존 소스의 의존성일 뿐 신규 앱 공통 기반이 아니다. 서비스 계정에서 동작 검증 없이 정상 발송을 보장하지 않는다.

## 8. 인증·보안·데이터 계약

- 실운영에 인증·역할별 권한 검사를 구현한다. 화면 숨김만으로 관리자 기능을 보호하지 않는다.
- 미인증·권한 없음은 각각 401/403 또는 승인된 로그인 흐름으로 처리한다. 쓰기 API에는 CSRF·입력·출처 검증을 적용한다.
- 세션 파일·서명키·직원정보를 브라우저 번들에 포함하지 않는다. 세션 쿠키는 HTTPS·HttpOnly·SameSite 정책에 맞춰 설계한다.
- 기존 sessions.json·admin_sessions.json을 임의 쓰거나 기존 키·토큰을 재사용하지 않는다. 기존 인증 연계는 명시적 API 계약·권한 승인 후 별도 구현한다.
- JSON 저장은 단일 쓰기 직렬화·임시파일 후 교체·실패 복구·동시성 테스트가 필요하다. 동시 사용자·트랜잭션 요구가 크면 승인된 DB를 선택하고 별도 명세를 작성한다.
- DB가 이미 설치된 것으로 가정하지 않는다. 도입 시 버전·연결·계정·네이티브 모듈·백업·마이그레이션·롤백을 명시한다.
- 테스트에는 합성 데이터를 사용한다. 업무 데이터의 외부 전송은 승인 전 금지한다.
- 메일·배치·외부 쓰기 기능은 잠금 기본값과 테스트 모드를 제공한다. 복제 테스트 인스턴스가 실제 수신자에게 보내거나 운영 데이터를 쓰지 않도록 한다.
- 파일 업로드 한도·보존기간·로그 마스킹·의존성 보안 점검 결과를 인수 문서에 기록한다.

## 9. 헬스·준비 상태 계약 — 새로 구현할 엔드포인트

### GET /healthz

프로세스 생존 상태, HTTP 200 + application/json. 비민감 고정 식별 정보만 반환한다.

```json
{"status":"ok","app":"<approved-app-id>","release":"<release-id>"}
```

### GET /readyz

필수 설정·업무 저장소·핵심 의존성이 준비됐을 때 200, 아니면 503을 반환한다. 외부 의존성 검사에는 타임아웃을 두고 비밀·내부 경로·개인정보를 응답하지 않는다. 준비 판정이 형식적 상수 200이 되지 않게 구현한다. 조회마다 DB 마이그레이션·실제 메일 발송·업무 데이터 변경을 수행하지 않는다.

```json
{"status":"ready","app":"<approved-app-id>","release":"<release-id>"}
```

위 JSON은 예시 계약이다. 기존 HR 포털은 `/api/health`이며 `/healthz`, `/readyz`가 이미 있다고 주장하지 않는다. 헬스 공개 여부는 내부 점검 주체와 함께 설계하고 비밀정보 없는 접근 범위로 제한한다.

## 10. 개발 산출물 요구사항

다음은 신규 프로젝트에서 개발 도구가 **생성해야 할 파일·기능 목록**이다. 이 문서와 함께 모두 구현됐다는 뜻은 아니다.

- [ ] 실제 앱 소스·화면·API·필수 로컬 모듈·자산 전체.
- [ ] package.json, 잠긴 의존성 파일, 운영 build/start 명령.
- [ ] 환경 예시·설정 파일 스키마와 검증·비밀 공급 설명.
- [ ] healthz/readyz, 인증·권한·데이터 유지 테스트.
- [ ] Windows PowerShell용 설치·업데이트·점검·제거 스크립트 또는 동등한 명확한 수동 절차.
- [ ] 스크립트는 관리자·파일·포트·기존 서비스 충돌을 검사하고 네이티브 실행 파일 종료코드를 확인.
- [ ] DryRun은 변경·설치·빌드·서비스 제어 없이 예정 작업만 표시. 설치가 끝난 것처럼 출력하지 않음.
- [ ] 배포·계정·방화벽 변경은 명시적 승인 후만 실행. 이미 있는 다른 서비스는 재시작하지 않음.
- [ ] 오류 시 성공 메시지를 출력하지 않고 적용 완료·미완료 항목 및 복구 절차 표시.
- [ ] README에 실제 파일 트리·진입 파일·환경변수·계정 권한·빌드·기동·인증·백업·롤백·제거를 포함.
- [ ] 전체 배포 ZIP 목록과 누락 검사·버전/해시 목록. 비밀과 실데이터 제외.
- [ ] 코드와 별도로 데이터·설정을 복원할 수 있는 백업·마이그레이션 명세.

## 11. 인수 테스트와 완료 판정

1. 대상 Windows에서 지정 Node 버전·npm lockfile로 깨끗한 설치·운영 빌드가 성공한다.
2. 전경 실행 후 서비스 실행도 성공한다. 서비스 계정으로 쓰기·외부 통신 권한을 별도 확인한다.
3. 포트 소유 프로세스가 새 앱과 일치하고 health/ready JSON의 앱·릴리스가 일치한다.
4. 서버 내부→다른 허용 PC→승인된 HTTPS 주소 순서로 확인한다. 미허용 접근도 검증한다.
5. 인증 실패·권한 거부·저장 실패·외부 API 단절·업로드 과대 요청을 테스트한다.
6. 서비스 재시작 후 데이터·업로드·설정이 유지되고 앱 단독 롤백·백업 복원이 가능하다.
7. 기존 prihr-main:8080과 HR 포털의 서비스·포트·대표 업무가 유지된다.
8. 재부팅 복구는 PC 전체의 승인된 점검 시간에 검증하고, 미수행이면 미검증으로 표시한다.
9. ‘실행됨’, ‘200 응답’, ‘서비스 Running’만으로 전체 정상·운영 개통 완료라고 쓰지 않는다.

## 12. 기존 HR 포털 소스에서 확인된 차이·주의사항

- 원본 `service-install.ps1`을 신규 앱 설치용으로 실행·재사용하지 않는다. 기본 실행이 기존 hrportal 서비스를 재시작하거나 HRPortal8081 예약 작업을 강제 재등록할 수 있다.

- 로그인 기본값: README의 무인증 설명과 달리 첨부 서버 소스는 `HRPORTAL_REQUIRE_LOGIN=true`가 기본이다.
- 세션: 기존 메인 세션 파일 읽기 외에 자체 `data\hrportal_sessions.json` 쓰기가 있다.
- npm 외부 의존성이 없다는 설명과 별개로 `attmail.js`, `vacation_mail.js`, `parsers/xlsx-lite` 등 로컬 파일 의존성이 있다.
- 첨부 ZIP에는 파일이 5개뿐이며 화면·자산·데이터·install.ps1·attmail.js가 없다. 소스만 복사해 정상 실행을 주장하지 않는다.
- 문서의 `/api/port`는 첨부 서버 소스에서 처리 분기를 확인하지 못했다.
- 서비스 스크립트는 NSSM PATH 검색 실패 시 예약 작업으로 등록하므로 실제 관리 대상을 조회해야 한다.
- 폴더 삭제만으로 서비스·방화벽까지 완전히 제거되지 않는다. 제거는 별도 승인·보존 절차를 따른다.

## 13. 바이브코딩 시작 프롬프트

아래를 새 작업의 첫 지시로 사용하고 앱 기능 요구사항을 뒤에 덧붙인다.

> 먼저 DEPLOYMENT_ENVIRONMENT.md를 읽고 이 프로젝트의 배포 제약으로 적용하라. 배포 대상은 기존 앱이 운영 중인 사내 로컬 윈도우 PC 한 대이며 Linux/서버리스가 아니다. 신규 앱은 별도 릴리스 폴더·승인 포트·NSSM 서비스로 분리하고 prihr-main, hrportal, 기존 8080/8081과 기존 데이터는 변경하지 마라. 사실·미확인값·제안값을 구분하라. 필수 운영값이 미정이면 기능 구현은 진행하되 실제 배포 변경은 중단하라. Windows 호환 운영 빌드, PORT/HOST 및 외부 데이터·설정 경로, healthz/readyz, 인증·권한, UTF-8, 로그, 백업·롤백을 구현하라. 비밀·실데이터를 소스에 넣지 마라. 현재 첨부 ZIP을 완전 배포본으로 가정하지 마라. 실제 존재하는 파일과 테스트 결과에 근거해 완료를 판단하고 미검증 범위를 명시하라. 우선 적용할 아키텍처·실제 필요 런타임·파일 트리·외부 의존성을 제시한 뒤 구현하고, 대상 PC의 서비스·방화벽·계정 변경은 운영자 승인 없이 실행하지 마라.

## 14. 근거

### 첨부 자료

- [로컬서버 운영 매뉴얼](https://www.genspark.ai/api/files/s/2oCmTxmj)
- [윈도우 서버 웹 호스팅 가이드](https://www.genspark.ai/api/files/s/xhZeIJj8)
- [구성요소 역할](https://www.genspark.ai/api/files/s/XP0i4wwq)
- [초기 구축 기록](https://www.genspark.ai/api/files/s/XVURS8Lj)
- [HR 포털 ZIP](https://www.genspark.ai/api/files/s/IBKzhNmn) — 내부 소스·서비스 스크립트·문서 대조.

### 공식 문서 — 2026-11-13 조회

- [Node.js 운영 LTS 정책](https://nodejs.org/en/about/previous-releases)
- [Next.js CLI](https://nextjs.org/docs/app/api-reference/cli/next)
- [Next.js 자체 호스팅](https://nextjs.org/docs/app/guides/self-hosting)
- [NSSM 명령](https://nssm.cc/commands)
- [NSSM 사용법](https://nssm.cc/usage)
- [Microsoft 방화벽 규칙](https://learn.microsoft.com/en-us/powershell/module/netsecurity/new-netfirewallrule?view=windowsserver2025-ps)

이 문서는 코딩·배포 계약이며 실제 PC의 상태 조회 결과나 설치 완료 보고서가 아니다. 이후 실제 조회·변경 승인으로 확정한 값은 근거와 변경일을 기록해 갱신한다.
