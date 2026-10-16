# EMS 4단계 AI 실제 통합 검수

## 1. 착수·범위·결과

실행 주체 **Codex 담당**. 검증 작업 배정이 통합 검수 시작라는 설계 검토 결정 뒤2026-10-16 21:11~21:18 KST 실행했다. 실제 Docker Compose(MySQL/backend/frontend),MySQL8,Playwright Chromium,localhost5173/8080이며 목업라우팅을 삽입하지 않았다. 서버 제공자는 기본Mock이다. 계약 [v1.0](../api/phase4-ai-api.md) SHA-256 E117946FE967747697A8AD6A3D0AF9A729991DB1A547BB6A468D7B09601A5617·7~10단계 결정 기준이다.

**기존47+15=62회귀와AI12개 PASS, 새빈DB PASS, 제품결함0건.** [집계JSON](phase4-summary.json). backend/frontend코드를수정하지않았으며 이번 QA에는 검사실패/보정도없다. 과거3B 검사실패 이력은 과거보고서에 보존했다. 실Claude/Ollama추론·환각방지품질을 검증한 결과가 아니다.

## 2. 제공자·실행 주체별 표

| 구분 | 주체·시각(KST) | 범위·결과 | 근거 |
| --- | --- | --- | --- |
| Mock·자동테스트 | Codex백엔드,19:46전체종료 | 단위141/MySQL73,실패/오류/스킵0. suite 시작은각각상이 | [tests](../../backend/verification/20261016-phase4-tests.json),[인계표](../../backend/verification/20261016-phase4-qa-handoff.md) |
| HTTP스텁계약 | Codex백엔드,LlmAdapterTest suite19:43:55.539 | 14사례,가짜키/로컬HTTP.실모델아님 | [provider-runs](../../backend/verification/20261016-phase4-provider-runs.json) |
| backend-only Mock HTTP | Codex백엔드,19:50:51~19:54:18 | mysql/backend만,당시frontend미실행 | [compose](../../backend/verification/20261016-phase4-compose-result.json) 기존필드 |
| 전체3서비스 Mock HTTP | Codex백엔드,21:01:36~21:04:49 | frontend200/Mock3기능/CORS/보존/새DB/down | [full-compose](../../backend/verification/20261016-phase4-full-compose-result.json),additionalExecutions |
| 프론트목업·자동검증 | Codex 담당,20:50~20:51 | 최종276/276,타입/빌드PASS,5174Chromium10/10.실백엔드E2E미실행 | [프론트일지](../devlog/20261016-frontend-phase4.md) |
| Claude디자인 | Claude UIUX디자이너,최종20:51본확인 | 최종18장중대표6조각직접열람,나머지2차판정유지.높음/중간0,낮음수용6 | [검수8절](../design/design-review-phase4.md) |
| QA브라우저/API | Codex문서QA,21:11~21:18 | 실제기존62+AI12·보존/새DB,Mock제공자 | 아래JSON·스크립트·화면 |
| Anthropic실추론 | 백엔드19:47:58환경확인 | **NOT_RUN**: 명시프로세스환경의ANTHROPIC_API_KEY없음.키탐색없음 | provider-runs |
| Ollama실추론 | 백엔드19:47:58환경확인 | **NOT_RUN**: 기존호스트서비스/모델확인불가.다운로드없음 | provider-runs |

QA는 실키/기존모델이 새로 제공되지 않아 위 사유를 유지했으며 키를 탐색하거나 모델을 내려받지 않았다. config의model은설정값이며접근성/성공보장이아니다. 개발Codex/Claude와제품Mock/Anthropic/Ollama는별개다. Claude가자동테스트를실행했거나QA이미지를디자인재검수했다고쓰지않는다.

## 3. 유지 DB 사전 스냅샷·소스

mysql만먼저기동해업무쓰기전 [before](phase4-before.json)을 저장했다. 모든기존컬럼/ID의결정적정렬·행수·SHA256과Flyway버전1~4다. 전체기동후 [after](phase4-after-start.json)의 **20업무테이블동일**,재시드/스키마변경없음이다. **V5/새마이그레이션을적용하지않았다.**

기준값은사원73/계정73/발령19/급여설정59. 유지볼륨은누적QA데이터이므로31명고정값을쓰지않고각회귀의기준값/증감으로판정했다. 고유합성자료는유지하며기존데이터를삭제하지않았다. 새DB는별도프로젝트다.

인계manifest와현재소스 **backend73+frontend56=129개모두해시일치**, [검사](phase4-source-check.json). 이미지ID는 [종료JSON](phase4-final-state.json)에저장했다. 로컬 --build의이미지식별과백엔드이전실행식별을분리하고같은실행이라고쓰지않는다.

## 4. 시나리오별 결과

### MVP20

[결과 JSON](phase4-regression20-results.json)

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

### 확장1 14

[결과 JSON](phase4-regression14-results.json)

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

[결과 JSON](phase4-regression13-results.json)

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

[결과 JSON](phase4-regression15-results.json)

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

### AI12

[결과 JSON](phase4-ai-results.json)

| ID/시나리오 | 결과 |
| --- | --- |
| AI-CFG · Safe config Mock badge no credentials and no external transfer | PASS |
| AI01-AUTH · EMPLOYEE search 403 and no AI audit for rejected request | PASS |
| AI01-FILTER · Admin safe filter proposal and source database unchanged | PASS |
| AI01-STATUS · Ambiguous unsupported job title/date range and SQL injection examples | PASS |
| AI01-C01 · UI comparison explicit full replacement GET params edit and undo | PASS |
| AI02-AUTH · Finalized owner reviewer allowed other ADMIN404 unfinalized409 | PASS |
| AI02-UI · Owner readonly summary UI and unfinalized summary control absent | PASS |
| AI03-CITATION · Policy citation ID version section excerpt exact source and UI | PASS |
| AI03-NO-EVIDENCE · Out of corpus and injection fixed examples reveal no unsupported answer | PASS |
| AI-INPUT · Unknown fields types question limit and 16KiB request body rejected | PASS |
| AI-RATE · Ten attempts then 429 rate limited without extra invoke audit | PASS |
| AI-AUDIT-LOG · AI audit allowlist and backend logs contain zero synthetic source markers | PASS |

AI-01은정상Mock이status/sort/departmentId를생성했고5필드화이트리스트를대조했다. keyword/positionId/hireDate정렬을모두실모델이생성한다고검증한것은아니다. 기존GET의해당필터/정렬은62회귀로확인하고제공자출력스키마·전송캡처는인계테스트에연결한다. 직책/입사일범위와SQL문구는UNSUPPORTED/빈필터였다. 제공자SQL키/없는ID거절502는QA직접미실행이며API에그키/ID를입력한400과다르다.

C01: 기존keyword/department/position/status/sort를넣고AI제안후GET0회,비교표확인뒤명시적용했다. 실제GET은{"status":"ACTIVE","sort":"name,asc","size":"20","page":"0"}로미제안keyword/departmentId/positionId가제거됐다. 직접상태수정과이전5조건복원도확인했다.

요약전후원본상세SHA256동일. 본인/배정자200·다른ADMIN404·미확정409. 소스점수/등급/코멘트를JSON에복제하지않았다. 규정은DEMO-ATTENDANCE/1.0/HALF_DAY와발췌원문일치를확인했고문서밖/주입고정사례는answer=null/citations=[]였다. 이는고정Mock동작이며의미적정확성/환각방지품질검증이아니다.

사용자별10성공후11번째429 AI_RATE_LIMITED(retryable=true),AI감사증가10건. GETconfig는제한되지않았다. 감사34건의허용키/대상null검사·합성식별문구검출0건,backend로그검출0건. 이검사는해당합성문구기준이며모든민감정보탐지나제공자진입0회측정을대신하지않는다.

## 5. 정상 Mock에서 QA 직접 미실행

[백엔드인계표](../../backend/verification/20261016-phase4-qa-handoff.md)의원본테스트명·시점·범위를유지한다. 전체19:46완료이며suite시작은AiServiceTest19:43:50.300,LlmAdapterTest19:43:55.539,AiMySqlTest19:44:27.834KST다. QA가그테스트를재실행한것은아니다.

| QA직접미실행항목 | 연결테스트 |
| --- | --- |
| 잘못된제공자JSON/금지필드/없는ID·타입·중복키·후행토큰 | AiServiceTest.malformedOrUnsafeFiltersAreRejectedWithoutRepair |
| 봉투오류·응답64/128KiB상한 | LlmAdapterTest.malformedEnvelopeRejected / outputAndEnvelopeByteLimits |
| 시간초과·재시도0 | LlmAdapterTest.timeoutAndNoRetry |
| 동시슬롯AI_BUSY·실패후해제 | AiServiceTest.simultaneousCallsHaveOneSlotAndReleaseOnFailure |
| 권한거절의제공자진입0회 | AiServiceTest.employeeCannotSearchOrInvoke / otherAdminAndUnfinalizedEvaluationCannotInvoke; AiMySqlTest.unauthorizedSearchAndOtherAdminSummaryHaveZeroProviderCalls |
| 미확정409의진입0회 | AiMySqlTest.unfinalizedOwnerGets409AndFinalizedOwnerSummaryDoesNotMutateData |
| 전송자료캡처/식별자·점수제외 | AiServiceTest.searchCapturesOnlyCatalogNotEmployeeRowsAndDoesNotExecuteSearch / summaryStripsScoresIdentityAndIncludesUntrustedComments; AiMySqlTest.searchOnlyProposesAndDoesNotTransferEmployeeList |
| 제공자429/5xx·기타4xx/redirect | LlmAdapterTest.retryableProviderErrorsAreNotRetried / nonretryableAndRedirectErrors |
| 키없음503·대체없음/감사실패500 | AiServiceTest.missingKeyNeverFallsBackAndAuditFailureNeverLeaksProviderOutput |
| 잘못된인용의모델답변숨김 | AiServiceTest.invalidCitationReturnsNoModelAnswer; AiMySqlTest.malformedSchemaAndMissingCitationNeverExposeProviderText |

실제HTTP분당429는직접검수했지만실패호출횟수/Clock경계는인계표의minuteLimitAfterTenAndFailuresDoNotLeakText에연결한다. 사전거절감사0건을외부서버수신0회로바꾸지않는다. 정상Mock의externalTransfer=false화면은직접확인했고true제공자화면은실제환경미실행/프론트테스트범위로구분한다. 3A시계변경·지난PENDING/정각/윤년과실측접근성도직접미실행이다.

## 6. 새 DB·화면·종료

ems-docqa4-fresh-20261016의볼륨이없음을확인하고새로생성했다. [결과](phase4-fresh-results.json):사원31/계정31/퇴사5/기본26/급여설정31,DEMO001 ADMIN로그인,분산12개월대시보드·조직/직책·평가주기1개/4상태,Mockconfig PASS. 서울서버기준직전월2026-09,입사<=2026-09-30·퇴사없음또는>=2026-09-01를전체사원에적용해기대ID26/실제26일치. 과거명세는생성시점설정이며과거이력복원이아니다.

[조건비교](phase4-ai-screenshots/search-comparison.png)·[되돌리기](phase4-ai-screenshots/search-undo.png)·[지원불가모바일](phase4-ai-screenshots/unsupported-mobile.png)·[요약](phase4-ai-screenshots/evaluation-summary.png)·[인용](phase4-ai-screenshots/policy-citation.png)·[답변불가모바일](phase4-ai-screenshots/policy-no-evidence-mobile.png)·[새대시보드](phase4-ai-screenshots/dashboard-fresh.png). QA가조건비교와답변불가모바일이미지를직접열어고지/비교표/근거없음표시를확인했다. Claude디자인판정으로대체하지않는다. 캡처는합성시험자료만사용하며키/토큰은없다. 회귀이미지는phase4-regression-screenshots·phase4-regression13-screenshots·phase4-regression15-screenshots다.

양환경down(-v미사용),실행컨테이너0,유지/새볼륨존재 [종료JSON](phase4-final-state.json).

## 7. 재현 명령

로컬env는저장소에커밋하지않는다. 기존증거를보존하고각단계를완료한뒤다음명령을진행한다. 반복검수는합성자료가추가되며급여월은미사용월을선택한다. 새빈DB검수는새프로젝트/볼륨을사용하고기존볼륨을삭제하지않는다.

```powershell
docker compose --project-name ems-backend-smoke --env-file backend/build/compose-smoke.env up -d mysql
node docs/qa/phase3b-db.cjs docs/qa/phase4-before.json
docker compose --project-name ems-backend-smoke --env-file backend/build/compose-smoke.env up --build -d
node docs/qa/phase3b-db.cjs docs/qa/phase4-after-start.json
node docs/qa/run-phase4-regressions.cjs
node docs/qa/phase4-regression15.cjs
node docs/qa/run-phase4-ai.cjs
docker compose --project-name ems-backend-smoke --env-file backend/build/compose-smoke.env down
# .env.qa4-local: 로컬DB/JWT/관리자값·선택DEMO_ADMIN비밀번호·mock설정
docker compose -f docker-compose.yml -f docs/qa/fresh.compose.yml --project-name ems-docqa4-fresh-20261016 --env-file .env.qa4-local up --no-build -d
$env:QA_PROJECT='ems-docqa4-fresh-20261016'
$env:QA_ENV='.env.qa4-local'
node docs/qa/check-phase4-fresh.cjs
docker compose -f docker-compose.yml -f docs/qa/fresh.compose.yml --project-name ems-docqa4-fresh-20261016 --env-file .env.qa4-local down
```

## 8. 결함·잔여·전체목표

제품결함0건/새수정배정없음. 기존62+AI12실제검수와새DB는PASS. frontend기존ExcelJS청크경고,최종낮음디자인수용6건(L05/L07/L12=Claude,L11/N-01/N-02=Codex 담당)은잔여이며원본근거/미확인을유지한다. 3B시안523행공백은프론트정리본을staged검사로확인한다. 실추론·접근성등미실행과범용HR질의/평가자동작성등제외는 [전체목표대조표](../completion-matrix.md)에분리했다. 최종목표판정은설계 검토에서완료 검토로수행한다.

## 9. 커밋 전 검사

[정적검사](phase4-static-checks.json)·[비밀값검사](phase4-secret-checks.json). backend34/frontend106파일의 신규파일포함staged diff --check exit0, 실제 로컬비밀값5종 대조 검출0·빌드/로컬env산출물0. 3B시안523행공백정리 확인, 기존V1~V4변경0·계약해시일치·공통링크누락0. 프론트변경은프론트소유작업이며QA코드수정없음. 커밋은백엔드46365ad·프론트3e14f5b·후속문서QA로분리하며각본문에실제엔진/팀역할을기록한다. 해시3개와최종Git상태는최종보고로인계한다.
