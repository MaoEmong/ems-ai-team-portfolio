# 새 사용자 로컬 실행 및 합성 촬영 상태 준비

이 문서는 기존 QA용 build/compose-smoke.env나 유지 볼륨 없이 실행하는 절차다. 명령은 사용자가 로컬에서 실행한다. 검증 작업 보안 점검 중에는 공유 포트로 실행하지 않았다.

## 1. 필수 도구와 실행
- Docker Desktop의 Linux 엔진 및 Docker Compose v2. 엔진이 켜져 있어야 한다.
- Docker 실행만 할 때 호스트 Java/Node는 필수가 아니다. 이미지 빌드에 네트워크가 필요하다.
- 호스트 백엔드 개발/테스트는 Java21와 저장소 Gradle wrapper(8.14.3)를 사용한다. 프론트 직접 개발은 Node24와 npm이다.
- Windows PowerShell 기준 프로젝트 루트 ems에서 실행한다. 공유3306/8080/5173을 다른 팀이 사용 중이면 먼저 사용 시간을 조율한다.

```powershell
# 기존 .env가 있다면 덮어쓰지 않는다.
if (-not (Test-Path -LiteralPath .env)) {
    Copy-Item -LiteralPath .env.example -Destination .env
}
```

.env를 로컬 편집기로 열어 DB_PASSWORD, DB_ROOT_PASSWORD, JWT_SECRET, ADMIN_INITIAL_PASSWORD의 예시 placeholder를 실제 로컬 전용 값으로 교체한다. API 키는 기본 Mock에서 필요 없다.
- DB_USERNAME은 root가 아닌 별도 애플리케이션 계정으로 둔다.
- JWT_SECRET은 암호학적으로 생성한 최소32바이트 무작위 값이다. 32글자라는 뜻이 아니다.
- ADMIN_LOGIN_ID는 최대50자, DEMO숫자 패턴 제외. 기본 예시 ADMIN001은 공개 비밀값이 아니다.
- ADMIN_INITIAL_PASSWORD는 공백이 아니고 UTF-8 최대72바이트다. 강하고 다른 곳에서 쓰지 않는 값을 고른다.
- DEMO_ADMIN_INITIAL_PASSWORD는 두 번째 합성 관리자 DEMO001로 로그인할 때만 설정한다. 빈 값이면 알 수 없는 무작위 비밀번호여서 알려진 데모 비밀번호가 없다.
- EMS_AI_PROVIDER=mock, ANTHROPIC_API_KEY는 빈 값 그대로 둔다. 키를 VITE_*에 넣지 않는다.

필요하면 PowerShell 7에서 무작위 값은 아래처럼 변수로만 생성할 수 있다. 이 값들을 터미널/문서에 출력하지 말고 로컬 .env에만 사용한다.
```powershell
$localJwtValue = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
$localPasswordValue = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(24))
```

```powershell
docker compose up --build -d
docker compose ps
```

브라우저에서 http://localhost:5173을 연다. 실제 API와 연결되며 제품 LLM은 Mock이다. 프론트 전체 목업 모드와 다르다. 초기 관리자 로그인 ID/비밀번호는 .env에 설정한 값이다.
DB/backend는127.0.0.1:3306/8080으로 바인딩한다. 프론트5173은 현재 모든 호스트 인터페이스에 공개하므로 신뢰하지 않는 LAN에 노출하지 않는다. 외부 운영 배포용 HTTPS·프록시·전역 속도 제한 구성은 이 로컬 절차의 범위가 아니다.

### 시드 규칙
새 빈 DB에서만 관리자1명+합성사원30명(총31), DEMO001 추가ADMIN, 퇴사5명 등을 만든다. 마커와 사원 존재 여부로 재시드를 막는다. 급여설정31개·직전월 대상자만 확정명세·혼합상태 평가를 포함한다.
.env 비밀번호나 관리자 ID를 바꾸고 재시작해도 기존 계정은 재설정되지 않는다. 기존 볼륨을 삭제해 해결하지 말고, 새 데모가 필요하면 별도의 프로젝트명을 사용한다.
```powershell
# 촬영 담당자가 합의한 고유 프로젝트 이름을 정한다.
docker compose --project-name ems-portfolio-example up --build -d
```
프로젝트 이름이 달라도 기본 포트는 같으므로 동시 실행하지 않는다. 이번 사진 촬영은 프론트팀이 소유하고 QA가 같은 사진을 다시 만들지 않는다.

### 종료
```powershell
docker compose down
# 고유 프로젝트를 썼다면 같은 이름으로 종료한다.
docker compose --project-name ems-portfolio-example down
```
볼륨을 유지한다. -v, docker volume rm, prune은 사용하지 않는다. 다시 켜면 같은 프로젝트의 데이터가 남는다.

## 2. 정상 API로 만드는 촬영 상태

Base /api/v1. 토큰은 로그인 응답에서 메모리로만 전달하고 파일/로그/캡처/브라우저 개발자도구에 노출하지 않는다. 아래는 실행 순서이며 실제 호출은 촬영 담당자가 자신의 고유 빈 프로젝트에서 수행한다. 유지 DB나 프론트 숫자를 조작하지 않는다. 캡처일·소스·역할·뷰포트·실제API/LLM Mock을 manifest에 남긴다.

| 상태 | 정상 API와 순서 | 주의 |
|---|---|---|
| 초기/추가 관리자 | POST /auth/login {loginId,password}; GET /auth/me | 초기 관리자와 DEMO001은 각 로컬 설정 비밀번호. 자기 승인/평가 결재 금지 |
| 일반 사원 로그인 | ADMIN으로 GET /departments, /positions에서 ID 확인 → POST /employees에 고유 합성사번·이름·example.invalid 이메일·hireDate·부서/직급·role=EMPLOYEE·로컬 initialPassword → 일반 사원으로 로그인 | 기존 DEMO002~ 계정의 무작위 비밀번호를 추측하지 않는다. 재시도 시 기존 합성 사번을 조회해 중복 생성하지 않는다 |
| 발령/직책 | GET /employees/{id}로 현재값 확인 → POST /employees/{id}/appointments {effectiveDate,departmentId,positionId,reason,changeJobTitle,jobTitleId} | 입사일 이상·오늘 이하·직전 발령일 이상. 최소 한 값 변경. 조직 변경을 PUT으로 우회하지 않는다 |
| 과거 근태 | ADMIN PUT /attendance/{employeeId}/{date} {checkIn,checkOut,reason} | 과거 월~금·입사일 이후 날짜. 시각은 해당 서울 날짜의 오프셋 시각이며 미래 금지. 정정표시/감사/대상 알림이 생성된다 |
| 휴가 PENDING | 일반 사원 GET /leaves/me/balance → POST /leaves {type,startDate,endDate,reason} | ACTIVE·입사일 도래, 오늘 이상·현재 산정기간 내 근무일. ANNUAL1일 또는 HALF_AM/HALF_PM0.5. 신청하면 예약 |
| 휴가 APPROVED | 다른 ADMIN이 POST /leaves/{id}/approve | 자기 승인은403. 시작일이 지난 PENDING은409. 승인 알림은 신청자에게 간다 |
| 휴가 REJECTED | 다른 ADMIN이 POST /leaves/{id}/reject {reason} | 반려 사유 필수. 예약 복원·신청자 알림 |
| 휴가 CANCELLED | 신청자가 POST /leaves/{id}/cancel | PENDING은 시작일 무관, APPROVED는 시작일 전날까지만. 같은 기간을 여러 상태로 중복 생성하지 않는다 |
| 알림 | 위 신청/승인/반려/취소와 근태 정정 후 GET /notifications/me | 사유는 미리보기에 넣지 않는다. 읽음 처리는 본인만 가능하며 단건204 |
| 개인 급여명세 | 새로 만든 사원은 ADMIN PUT /employees/{id}/salary-setting {baseSalary,allowance} → POST /payrolls {month} → POST /payrolls/{month}/confirm | 현재/과거 월만. 대상 전원 설정 필요. 기본급/수당 정수0~10억. 기존 CONFIRMED는 수정/재생성 금지. 시드 직전월 명세 수를31로 가정하지 않는다 |
| 평가 자기초안 | ADMIN POST /evaluation-cycles에 항목·대상/다른ADMIN 평가자 배정 → POST /evaluation-cycles/{id}/open → GET /evaluation-cycles/{id}에서 evaluationId 확인 | 새 합성 일반 사원을 대상으로 할당하면 알려진 로컬 비밀번호로 자기평가 화면을 재현할 수 있다 |
| 평가 제출/관리자초안 | 본인 GET /evaluations/{id}의 item IDs 확인 → PUT /evaluations/{id}/self 및 POST /evaluations/{id}/self/submit → 배정자 PUT /evaluations/{id}/manager | 저장·제출 모두 {answers:[{itemId,score,comment}]} 본문을 보낸다. 점수1~5, 코멘트1000자 이하. 실제 인사평가처럼 쓰지 않는 합성 코멘트 |
| 평가 FINALIZED | 배정자가 POST /evaluations/{id}/manager/submit에 {answers:[...]} 본문 전송 | 전체 항목 유효해야 확정. 그때 본인에게 관리자 답변/최종점수/등급 공개. 다른ADMIN 상세는404 |
| AI3기능 | GET /ai/config → ADMIN POST /ai/employee-search {question}, 권한 있는 확정평가 POST /ai/evaluation-summary {evaluationId}, 인증 사용자 POST /ai/policy-qa {question} | Mock/실제추론 아님을 화면에 유지. 예시 질문은 '재직 사원 이름순', '오전 반차 기준'. 요약은 원문/점수 저장·변경 없음 |

### 평가 주기와 답변 예시
아래 ID는 실제 응답의 ID로 교체한다. 가짜 비밀번호나 토큰을 고정하지 않는다.
```json
{
  "name":"포트폴리오 합성 평가",
  "startDate":"<서울 오늘>",
  "endDate":"<오늘 이후 표시 종료일>",
  "items":[{"name":"협업","sortOrder":0},{"name":"문제 해결","sortOrder":1}],
  "assignments":[{"employeeId":123,"reviewerId":456}]
}
```
```json
{"answers":[{"itemId":1,"score":5,"comment":"합성 예시: 협업 과정을 명확히 공유했습니다."},{"itemId":2,"score":4,"comment":"합성 예시: 검증 근거 정리가 개선 과제입니다."}]}
```

### 날짜·촬영 유의
주말에는 일반 출퇴근 버튼이409 NOT_A_WORKDAY를 반환한다. 자동 출근/결근 수치를 만들지 말고 실제 '미기록' 상태 또는 정상 ADMIN 과거 근무일 정정으로 촬영한다. 공휴일·유연근무·급여 일할계산·법정 세액은 구현하지 않은 데모 정책이다.
휴가 신청일은 balance.periodStart~periodEnd 안에서 다음 근무일을 선택한다. 반차일 기준14:00과 종일휴가 상태는 서버 응답을 그대로 쓴다.
로그인 화면은 비밀번호 칸을 비운 상태로 촬영한다. Mock 고지·데모급여 고지는 제거하지 않는다. 실제API+Mock LLM 캡처를 과거 프론트 목업 이미지와 섞지 않는다.

## 3. 과거 QA 절차와의 구분
backend/verification의 이전 스크립트 중 build/compose-smoke.env를 읽는 파일은 당시 QA 재현용이며 새 사용자 시작에 필요하지 않다. 그 파일의 존재나 비밀번호를 요구하지 않는다. 과거 검증 수치는 당시 소스·시각의 근거이며 현재 촬영/보안 점검 통과로 재표시하지 않는다.
