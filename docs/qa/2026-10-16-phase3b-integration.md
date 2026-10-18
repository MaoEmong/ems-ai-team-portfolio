# EMS 3B 실제 통합 검수

## 1. 범위·착수·환경

실행 주체: **Codex 문서QA담당**, 2026-10-16 19:11~19:18 KST(각 JSON은 UTC ISO 시각). 설계 검토 의 **통합 검수 시작** 뒤 시작했다. 계약은 [phase3b API v1.1](../api/phase3b-api.md), SHA-256 9A56EAD34B8E4B8134FBD3A8E92B4D0F3FCFAFAF22495EC0D5ACB20AA6F0B3B2. 실제 Docker Compose 3서비스·MySQL8·Playwright Chromium,5173/8080,목업 없음. backend/frontend 코드를 수정하지 않았다.

결과: **기존20+14+3A13=47 PASS, 3B15 PASS, 새DB PASS, 제품 결함0건**. [집계 JSON](phase3b-summary.json). 첫 QA 시도3개 실패는 아래 검사 오류로 구분한다. 모든 요구사항의 법률/세무 적합성·접근성까지 보증하는 결과가 아니다.

## 2. 실행·증거 주체 분리

| 주체 | 시각(KST)·명령/범위 | 결과·근거 |
| --- | --- | --- |
| Codex 백엔드 |17:00:03 종료 gradlew.bat test integrationTest bootJar|단위107/MySQL66, [원본 JSON](../../backend/verification/20261016-phase3b-tests.json), QA 재실행 아님|
| Codex 백엔드 |16:49:24~16:57:24 별도 V3→V4|기존11테이블 기존컬럼/ID 보존, [원본](../../backend/verification/20261016-phase3b-compose-result.json)|
| Codex 백엔드 |19:02:51~19:06:33 최종 이미지HTTP|[원본](../../backend/verification/20261016-phase3b-final-compose-result.json), 선행 실행과 분리|
| Codex 프론트 |17:52~17:53 최종전체테스트·타입·빌드·5174목업|166/166,Chromium8/8, [일지](../devlog/20261016-frontend-phase3b.md), 실제API E2E 미실행|
| Claude Code(디자인) |시안·실제 이미지 검수/재확인|[검수10~11절](../design/design-review-phase3b.md), 최종63장 중22장 직접·41장 직전판정 유지. 코드 테스트와 구분|
| Codex 문서QA |19:11~19:18,아래 명령|실제62개/새DB, source-manifest59파일 모두 일치,[종료 JSON](phase3b-final-state.json)|

검증 작업 구현 담당은 빌드/Compose를 실행하지 않았다. 평가 MySQL 예정29가 아닌 최종31개를 백엔드66개 안의 해당 테스트로 기록하며 합산하지 않는다.

## 3. 유지 볼륨 기준값과 보존

mysql만 기동하고 QA 업무쓰기 전에 [사전 스냅샷](phase3b-before.json)을 확보했다. 행수와 모든 기존 컬럼/ID를 정렬한 행 데이터의 SHA-256을 저장하며 비밀번호 해시 원문/비밀값은 출력하지 않았다. 이미Flyway V4였다. 최종 이미지 기동 후 [스냅샷](phase3b-after-start.json)과 **20테이블 전체 동일**이다. 이 결과는 재기동 보존/재시드 없음이며 V3→V4 재적용이 아니다. 별도 업그레이드는 백엔드 원본에 연결한다.

시작 행수: 사원55,계정55,발령6,급여설정55. 과거 QA 데이터가 누적된 유지 볼륨이므로31명으로 기대하지 않았다. 회귀 스크립트는 실행 전 dashboard 및 목록 기준값과 생성/퇴사 증감을 비교한다. QA 합성데이터는 고유 접두어를 사용해 볼륨에 남는다. 첫 실패 시도의 합성데이터도 삭제하지 않았으며 재실행 급여 대상 기대값은 SQL 날짜 조건으로 재계산했다.

## 4. 시나리오별 결과

### 기존 MVP20

[결과 JSON](phase3b-regression20-results.json)

| ID/시나리오 | 결과 |
| --- | --- |
| UI admin login and actual employee list | PASS |
| UI pagination and sorting | PASS |
| API all supported sorts and page metadata | PASS |
| UI department position status filters and empty search | PASS |
| UI employee create 201 | PASS |
| API duplicate employee number 409 | PASS |
| UI employee edit 200 | PASS |
| API keyword name number email and combined filters | PASS |
| UI EMPLOYEE login own profile | PASS |
| UI EMPLOYEE management guard and other profile 403 | PASS |
| API EMPLOYEE own only and catalog read exceptions | PASS |
| UI departments CRUD and in-use 409 | PASS |
| UI positions CRUD and in-use 409 | PASS |
| UI retire employee 200 and hide edit | PASS |
| UI retired excluded by default and status query includes | PASS |
| API retired edit and repeated retirement 409, old JWT 401 | PASS |
| UI retired existing session redirects login and clears token | PASS |
| API retired-only department and position references block deletion | PASS |
| API validation 400, missing 404, duplicate email and names 409 | PASS |
| UI admin logout clears session | PASS |

### 2단계14

[결과 JSON](phase3b-regression14-results.json)

| ID/시나리오 | 결과 |
| --- | --- |
| Dashboard current data baseline and 12-month date aggregates | PASS |
| Dashboard creation delta and current-month hires | PASS |
| Real UI appointment synchronizes organization history and audit | PASS |
| PUT omitted null same preserved and changed organization rejected | PASS |
| Appointment date no-change reason and hire-retire boundaries | PASS |
| EMPLOYEE history own only and phase2 admin authorization | PASS |
| Actual UI CSV XLSX downloads parsed vs filtered sorted list | PASS |
| Actual template download has import and reference sheets | PASS |
| UI invalid XLSX row3 total rollback and exactly one failure audit | PASS |
| UI valid XLSX two rows preserves leading zero and success audit | PASS |
| Audit filters exact half-open boundary and secrets excluded | PASS |
| Unknown login failure actor null and no input stored | PASS |
| Retirement delta and retired appointment rejection | PASS |
| Actual API mobile dashboard no document overflow | PASS |

### 3A13

[결과 JSON](phase3b-regression13-results.json)

| ID/시나리오 | 결과 |
| --- | --- |
| UI own check-in checkout and duplicate API conflicts | PASS |
| UI blank past workday means unrecorded not absent | PASS |
| ADMIN correction requires reason and writes audit and recipient notification | PASS |
| UI existing employee GET identity and corrected values | PASS |
| Future ADMIN PUT rejected with fieldErrors and no side effects | PASS |
| UI leave request reserves balance and targets all other active admins | PASS |
| Overlap and insufficient balance conflicts do not change reservation | PASS |
| UI different ADMIN approval moves reservation once and notifies applicant | PASS |
| UI pre-start cancellation restores used balance | PASS |
| ADMIN self approval and rejection forbidden | PASS |
| Different ADMIN rejection restores reservation and sends private notification | PASS |
| Notification read idempotence owner isolation and read-all upper bound | PASS |
| UI notifications privacy and account switch clears prior inbox | PASS |
| Past PENDING Clock-controlled transition, exact time and leap-year boundaries | NOT_RUN |

### 3B15

[결과 JSON](phase3b-results.json)

| ID/시나리오 | 결과 |
| --- | --- |
| ORG-01 · Hierarchy cycle and child/in-use deletion 409 | PASS |
| ORG-02 · Organization minimal fields empty departments and authenticated UI | PASS |
| ORG-03 · Appointment assigns retains clears title with snapshots and PUT refusal | PASS |
| PAY-01 · Missing salary rejects whole month without month slips or audit writes | PASS |
| PAY-02 · Invalid fractional string negative overlimit money 400 and setting unchanged | PASS |
| PAY-03 · Actual parallel generation one 201 one 409 and exactly two slips | PASS |
| PAY-04 · Exact HALF_UP integer formula upper bound and draft secrecy | PASS |
| PAY-05 · Recalculate refreshes whole draft then confirmed snapshot immutable | PASS |
| EVAL-01 · Self reviewer forbidden and DRAFT assignments safe sorted null false empty | PASS |
| EVAL-02 · Pre-final keys absent own submission and other ADMIN 404 | PASS |
| EVAL-03 · Reassignment clears manager draft revokes old access keeps SELF_DRAFT | PASS |
| EVAL-04 · UI manager finalizes server average grade excluding self and publishes | PASS |
| EVAL-05 · CLOSED preserves incomplete state rejects reassignment and writing | PASS |
| AUDIT-01 · Salary and evaluation audit allowlist excludes money answers comments grades | PASS |
| ORG-04 · Retirement clears title audit before after no extra appointment | PASS |

3A의 자기 결재403·겹침/잔액부족/중복409·다른ADMIN 승인/반려·취소복원·사유미노출/타인차단은 regression13 표의 해당 행에 있다. 실제 시각의 지각/조퇴만 관찰했고 지난PENDING·정각·윤년은 NOT_RUN으로 유지한다.

PAY-03 실제 Promise.all 병렬 응답은 **201 / 409 PAYROLL_BUSY**, DB 명세4건으로 SQL 대상조건 기대값4건과 일치했다. 순차 재시도로 대체하지 않았다. 생성 실패 전후 월/명세/급여감사 건수 동일, 확정 후 재계산·재확정409와 설정/발령 변경 후 명세 JSON 불변을 확인했다. 소수/문자열/음수/10억 초과 모두400이고 설정도 불변이다. 총지급101→5/4/3·net89,100→5/4/3·net88,20억→9천만/7천만/6천만·net17억8천만을 확인했다.

EVAL은 자기점수1/1과 별개로 관리자5/4의 평균4.50/S가 확정됐다. 공개 전 본인 응답은 managerAnswers/finalScore/grade 키가 없었다. 재배정 후 기존 관리자 접근404·관리자초안빈배열·SELF_DRAFT유지, CLOSED 미완료표시/재배정409를 확인했다. assignments는 DRAFT null/null/false/[]·employeeNo순·민감키없음, OPEN액션을 대조했다.

## 5. QA 검사 실패와 보정

[최초 실행 JSON](phase3b-attempt1-results.json)을 보존했다. 제품 결함이 아니라 검사 설계 오류다.

| 최초 실패 | 원인 | QA 보정·재검증 |
| --- | --- | --- |
| ORG-02 이름이 안 보임 | 조직도는 선택 부서 소속만 표시하는데 해당 부서를 선택하지 않고 정확 이름만 조회 | 생성 부서를 먼저 선택, 이름+사번 문자열 확인 → PASS |
| PAY-05 다른 사원 명세404 기대에200 | 조회 역할이 다른 ADMIN이어서 계약상200이 맞음 | 별도 EMPLOYEE로 타인명세404 대조 → PASS |
| EVAL-02 submitted private | UI 클릭 후 제출 HTTP 완료 전에 API를 조회한 경쟁 | self/submit 응답 완료 대기 뒤 상태/키부재 확인 → PASS |

제품 코드 변경 없음. 최종15개 전체 재실행 PASS. 결과 문구의 'exactly two'는 최초 시나리오 이름이었으며 실제 판정은 재실행 대상조건 기대값4건/저장4건이다.

## 6. 새 빈 DB·화면·종료

별도 프로젝트 ems-docqa3b-fresh-20261016에서 해당 볼륨이 없음을 확인하고 새로 생성했다. [새DB JSON](phase3b-fresh-results.json): 사원31/계정31/퇴사5/기본26/급여설정31, DEMO001 ADMIN 로그인 PASS,12개월 분산차트,부서계층/직책,평가주기1개와4가지 상태. 서울 서버기준일2026-10-16로 직전월2026-09의 입사일<=2026-09-30, 퇴사일없음 또는>=2026-09-01를 전체 사원에 적용해 기대ID26개와 명세ID26개를 직접 대조했다. 과거월 명세는 생성 시점 설정/조직이며 과거 이력 복원이 아니다.

화면: [조직도](phase3b-screenshots/organization-desktop.png)·[모바일](phase3b-screenshots/organization-mobile.png)·[발령](phase3b-screenshots/title-appointments.png)·[본인명세](phase3b-screenshots/own-payslip.png)·[공개전평가](phase3b-screenshots/self-evaluation-private.png)·[확정결과 모바일](phase3b-screenshots/evaluation-result-mobile.png)·[CLOSED](phase3b-screenshots/evaluation-closed.png)·[새대시보드](phase3b-screenshots/dashboard-fresh.png)·[새데모급여](phase3b-screenshots/payroll-fresh.png). QA가 최종 모바일평가와 새DB급여 이미지를 직접 열어 서버4.50/S·데모고지·표시내용을 확인했다. Claude 디자인 재검수로 표현하지 않는다. 회귀 화면은 phase3b-regression-screenshots와 phase3b-regression13-screenshots에 있다.

두 프로젝트 모두 down, -v 미사용. 종료시 실행컨테이너0개, 유지/새볼륨 존재를 [JSON](phase3b-final-state.json)에 저장했다.

## 7. 재현 명령

비밀값을 출력하거나 커밋하지 않는다. 로컬 env는 ADMIN_LOGIN_ID/비밀번호·DB·JWT·선택DEMO_ADMIN 비밀번호를 설정한다. 아래는 이미 준비된 로컬 env 경로를 사용한다. 재실행은 데이터를 추가하므로 시작 기준값을 새로 저장하고 기존 증거를 먼저 보존한다.

```powershell
# 유지DB: mysql만 먼저 기동해 업무쓰기 전 스냅샷 확보
docker compose --project-name ems-backend-smoke --env-file backend/build/compose-smoke.env up -d mysql
node docs/qa/phase3b-db.cjs docs/qa/phase3b-before.json
docker compose --project-name ems-backend-smoke --env-file backend/build/compose-smoke.env up --build -d
node docs/qa/phase3b-db.cjs docs/qa/phase3b-after-start.json
node docs/qa/run-phase3b-regressions.cjs
node docs/qa/run-phase3b-integration.cjs
docker compose --project-name ems-backend-smoke --env-file backend/build/compose-smoke.env down
# 새고유프로젝트/빈볼륨, .env.qa3b-local은 로컬에서만 생성
docker compose -f docker-compose.yml -f docs/qa/fresh.compose.yml --project-name ems-docqa3b-fresh-20261016 --env-file .env.qa3b-local up --no-build -d
$env:QA_PROJECT='ems-docqa3b-fresh-20261016'
$env:QA_ENV='.env.qa3b-local'
node docs/qa/check-phase3b-fresh.cjs
docker compose -f docker-compose.yml -f docs/qa/fresh.compose.yml --project-name ems-docqa3b-fresh-20261016 --env-file .env.qa3b-local down
```

## 8. 미실행·잔여·결함 담당

- 제품 결함: 발견0건, 신규 수정 배정 없음. 검사 오류3건은 문서QA가 보정했다.
- 실제시계 변경·지난PENDING·정각/윤년 경계: 브라우저 미실행. [백엔드3A 일지](../devlog/20261016-backend-phase3a.md)와 Clock/MySQL 테스트 근거에 연결하며 QA 브라우저 통과로 쓰지 않는다.
- 모든 등급 경계·실패 주입 원자성·동시 조직 이동: QA 브라우저 미실행. 백엔드107/66 자동테스트 및 [ADR0109](../adr/0109-organization-lock-and-title-appointments.md)·[0110](../adr/0110-demo-payroll-month-snapshots.md)·[0111](../adr/0111-evaluation-state-and-private-drafts.md)에 연결. 실제 급여 병렬과 설정누락 원자성은 직접 실행했다.
- 실측대비·스크린리더·태블릿/확대: 미실행. Claude 원본 범위와 구분.
- 프론트 담당 잔여: 수용 낮음3건(L01 배지 일관성,L11 ID 의존,L13 사이드바 제목 잘림),기존 ExcelJS 큰 청크 경고. EOF 공백은 프론트가3B 담당수정 범위에서 정리했고 최종diff 검사에서 별도로 확인한다. QA가 프론트코드를 고치지 않았다.
- 급여는 데모이며 법률·세무 검증은 미실행. 팀장 휴가 승인·급여다운로드/평가알림·AI는 이번 범위에서 제외했다.

## 9. 커밋 전 정적·비밀값 검사

일회성 safe.directory를 사용했다. 백엔드41파일·프론트136파일 단계별로 로컬 실제비밀값5종과 대조해 검출0, 빌드/로컬env 산출물0을 확인했다. 백엔드gradlew100755, API해시일치,V1~V3변경없음, 공통문서상대링크누락0. [검사JSON](phase3b-secret-checks.json),[정적검사](phase3b-static-checks.json).

추가 낮음 문서 잔여: 프론트디자인 소유 docs/design/phase3b-screens.md:523 trailing whitespace1건. 신규파일을 포함한 프론트 staged diff에서 발견했다. 앞선 tracked working-tree diff의 통과범위와 다르며 전체문서 공백0으로 주장하지 않는다. 검토 기록으로 담당프론트·재현 git show --check 3da431c를 보고했고 타팀파일은 수정하지 않았다. 기능영향없음. 백엔드 d1f88b5·프론트 3da431c·후속 문서QA의3논리커밋이며 각본문에 실제엔진/팀역할을 기록한다.
