# DB 마이그레이션·복구 가이드

## 1. 범위

OLAF Builders는 SQLite를 사용한다. 서버나 관리 CLI가 DB를 열 때 `src/schema/`의 마이그레이션을 번호순으로 자동 적용한다.

- 런타임 DB 기본 위치: `.local/data/olaf.db`
- 자동 마이그레이션 전 백업: `.local/backups/pre-migrate-v<기존버전>-<시각>.db`
- 현재 기본 스키마: v4
- Git 보관 콘텐츠: `data/legacy-content.json`
- Git에서 제외: 실제 DB, 비밀번호 해시, 세션, 로그인 기록, 서버 비밀정보

v3에서 v4로 올라갈 때 접속코드 표를 제거하고 ID/비밀번호 자격증명 표를 만든다. 기존 세션은 모두 종료되며 비밀번호는 자동 변환되지 않으므로 관리자가 다시 설정해야 한다.

## 2. 기존 서버 DB 업그레이드

### 2.1 사전 확인

```powershell
cd C:\path\to\olaf-builders
node --version
git status --short
node tools\check.js --integrity-only --db .local\data\olaf.db
```

Node.js는 22.13 이상이어야 한다. 커밋하지 않은 변경이 있으면 먼저 별도 보관한다.

### 2.2 서버 중지와 수동 백업

서비스 또는 실행 중인 `npm start`를 중지한 다음 DB와 `-wal`, `-shm` 파일이 정리됐는지 확인한다.

```powershell
$stamp = Get-Date -Format yyyyMMdd-HHmmss
New-Item -ItemType Directory -Force .local\backups | Out-Null
Copy-Item .local\data\olaf.db ".local\backups\manual-before-$stamp.db"
```

실행 중인 SQLite 파일을 단순 복사하지 않는다. 서버를 중지할 수 없다면 앱의 SQLite 백업 기능을 사용한다.

### 2.3 코드 갱신과 마이그레이션

```powershell
git pull --ff-only origin main
npm ci
node tools\admin.js list
```

`admin.js list`가 DB를 열면서 필요한 마이그레이션을 적용한다. v3 이상 DB라면 자동으로 `pre-migrate-*` 백업도 만든다.

### 2.4 관리자 로그인 재설정

비밀번호를 명령행 인수로 쓰지 않는다. 아래 명령은 화면에서 비밀번호를 가려 입력하고 표준입력으로만 전달한다.

```powershell
$secure = Read-Host '관리자 비밀번호' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) |
    node tools\admin.js set-credentials OP-01 --username dk.cho --password-stdin --actor OP-01
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
  Remove-Variable secure -ErrorAction SilentlyContinue
}
```

### 2.5 기동과 검증

```powershell
npm start
```

별도 터미널에서 다음을 실행한다.

```powershell
node tools\check.js --url http://127.0.0.1:8091 --integrity --db .local\data\olaf.db
```

기대 결과는 `healthz 200`, `readyz 200`, `integrity_check=ok`, `user_version=4`이다. 이후 관리자 로그인과 질문카드 44건 조회를 확인한다.

## 3. 새 클론에서 DB 재구축

저장소를 클론하는 것만으로 `olaf.db`가 생기지는 않는다. 다음 절차로 스키마, 관리자, 승인된 콘텐츠를 복원한다.

### 3.1 설치와 관리자 생성

```powershell
git clone https://github.com/foolpoet44/olaf_builders.git
cd olaf_builders
npm ci
```

```powershell
$secure = Read-Host '관리자 비밀번호' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) |
    node tools\admin.js bootstrap OP-01 --name '사무국' --username dk.cho --password-stdin
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
  Remove-Variable secure -ErrorAction SilentlyContinue
}
```

이 명령이 빈 SQLite DB를 만들고 스키마 v4까지 적용한다.

### 3.2 콘텐츠 복원

먼저 실제 저장 없이 검증한다.

```powershell
node tools\import-legacy.js snapshot data\legacy-content.json --actor OP-01 --dry-run
```

예상 원본 수량은 작성자 26명, 질문카드 44건, 감사기록 24건이다. 문제가 없으면 적용한다.

```powershell
node tools\import-legacy.js snapshot data\legacy-content.json --actor OP-01
```

같은 명령을 다시 실행해도 카드 UID와 감사 필드로 중복을 건너뛴다.

### 3.3 복원 범위와 별도 복구 대상

저장소만으로 복원되는 것은 승인된 레거시 콘텐츠다.

| 복원됨 | 별도 조치 필요 |
|---|---|
| 레거시 작성자 26명 | 관리자 비밀번호 |
| 질문카드 44건 | Master·추가 사무국·추가 참여자 명단 |
| 레거시 감사기록 24건 | 교육 자료 파일과 업로드 파일 |
| 스키마와 기본 설정 | 운영 설정 덮어쓰기 파일 |

추가 명단은 `node tools\admin.js import-roster <명단.csv> --actor OP-01 --dry-run`으로 검증한 뒤 적용한다.

## 4. 운영 경로를 별도로 사용할 때

운영 모드에서는 다음 환경변수가 필수다.

```powershell
$env:NODE_ENV = 'production'
$env:APP_DATA_DIR = 'D:\OLAF\data'
$env:APP_UPLOAD_DIR = 'D:\OLAF\uploads'
$env:APP_CONFIG_FILE = 'D:\OLAF\config\app-settings.json'
$env:APP_RELEASE = '20261114-01'
```

관리 CLI와 서버에 동일한 환경변수를 설정해야 같은 DB를 사용한다. `APP_BACKUP_DIR`과 `APP_LOG_DIR`을 생략하면 데이터 폴더의 형제 폴더를 사용한다.

## 5. 롤백

1. 서버를 중지한다.
2. 실패한 DB를 다른 이름으로 보존한다.
3. `.local/backups/pre-migrate-*.db` 또는 수동 백업을 원래 DB 경로로 복사한다.
4. 백업 스키마와 호환되는 이전 코드로 되돌리거나, 수정된 마이그레이션으로 다시 기동한다.
5. `tools/check.js --integrity-only`로 무결성을 확인한다.

새 코드로 v3 백업을 바로 열면 v4 마이그레이션이 다시 실행된다. 원인 분석 없이 같은 코드로 반복 기동하지 않는다.

## 6. 완료 체크리스트

- [ ] 마이그레이션 전 백업 파일 존재
- [ ] `integrity_check=ok`
- [ ] `user_version=4`
- [ ] 관리자 ID/비밀번호 로그인 성공
- [ ] `/api/admin/qcards` 질문카드 44건
- [ ] 사용자·Master·사무국 권한 확인
- [ ] 교육 자료와 업로드 파일 별도 복구 확인
- [ ] 운영 DB·비밀번호 해시·세션 파일이 Git에 포함되지 않음
