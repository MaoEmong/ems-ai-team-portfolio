# 3A 실제 통합 검수 — 2026-10-16

수행: 문서QA 담당 Codex, 검증 작업(배정 자체가 QA착수 통지). **기존34개 회귀·3A13개 실제 시나리오 PASS**, 새DB시드와 유지DB보존 확인. 브라우저 시간경계는 별도 미실행이다. 이번 검수 범위에서 신규 제품결함은 발견하지 못했다. 단계 완료/사용자 인수는 설계 검토의 후속 판단 대상이다.

## 1. 인계 확인과 환경

착수 전 실제로 확인한 프론트 인계물: design-review-phase3a.md7.2/7.5/8, ADR0204, 프론트 개발일지. 최종 소스15:36 타입검사·전체97/97·빌드,15:37 목업5174 Chromium6/6,재촬영24장·Claude재확인이다. 해당 검사는 QA가 재실행한 것이 아니다. 최초18개ID의 반영/수용·재확인,낮음7건수용,실측대비/스크린리더/실제API 미확인을 확인했다.

QA는 Windows/Node24.14.1,실제Docker Compose·MySQL8·Spring Boot·nginx프론트·Playwright Chromium을 사용했다. QA만3306/8080/5173을 사용하며 네트워크 목업·서버시계 변경·운영DB 날짜조작은 하지 않았다. 기존 검증용Git제외 환경파일과 유지볼륨을 사용했고 최신프론트 이미지를 빌드했다. 정확한 최종실행시각은 각JSON의UTC timestamp(서울+9시간) 참조.

## 2. 실행 명령·재현

```powershell
docker compose --project-name ems-backend-smoke --env-file backend/build/compose-smoke.env up --build -d
node docs/qa/run-phase3a-regressions.cjs
node docs/qa/run-phase3a-integration.cjs
```

다른 환경에서는 README대로 로컬.env를 설정하고 두Node명령에.env경로를 인자로 넘긴다. frontend의npm ci·Chromium 설치가 필요하다. 스크립트는 고유 합성사원/ADMIN/조직/휴가를 추가하므로 누적데이터를 고정시드와 혼동하지 않는다. 비밀번호는 메모리에서 생성하며 결과·스크린샷에 기록하지 않는다.

회귀runner는 기존20개/14개 검사를 복사해 출력경로만3A로 분리하고 준비완료 대기를 추가한다. [20개결과](phase3a-regression20-results.json),[14개결과](phase3a-regression14-results.json),[3A결과·기준값](phase3a-results.json),[재현스크립트](run-phase3a-integration.cjs). 생성된regression20/14.cjs도보관한다.

최초재시작 직후20개로그인검사의대기시간초과가 있었으나 이후실제14개흐름은통과했다. 서버준비확인후20개를다시실행해PASS했다. 신규검사의전본문'결근'검색은 안내문'미기록은결근판정이아닙니다'를오판했으므로배지와안내문을별도확인하도록QA만보정하고13개전체를재실행했다. 새환경파일작성의PowerShell한줄단위파싱오류는Get-Content -Raw로수정했다. 앱파일변경이나권한우회는없다.

## 3. 기존34개 회귀

모두 실제로 재실행했다. 20개: 관리자로그인/목록,UI페이지·정렬,API6종정렬·메타,조직/상태필터·빈검색,사원등록,사번중복,수정,이름/사번/이메일검색,일반사원본인,관리화면·타인403,본인PUT거부/조직GET예외,부서CRUD/409,직급CRUD/409,퇴사,기본제외/퇴사필터,퇴사수정·재퇴사409/기존JWT401,세션복귀,퇴사자참조삭제409,입력/404/중복/페이지상한/잘못된토큰,로그아웃.

14개: 대시보드기준값/12개월집계,생성증감,UI발령/소속이력감사,PUT조직정책,발령날짜/입퇴사경계,본인이력/ADMIN권한,CSV/xlsx실제다운로드파싱,양식파싱,오류xlsx행3/0건/실패감사1,정상2행/앞자리0/감사,감사AND필터/[from,to)/비밀값제외,없는계정로그인실패,퇴사증감/발령거부,실제모바일대시보드.

기준값과증감은각JSON에있고유지DB를31명으로가정하지않았다. 실제파일파싱·엑셀부분저장0건도이번회귀에서재확인했다.

## 4. 3A 신규13개

| # | 시나리오 | 관찰·판정 |
| --- | --- | --- |
|1|본인UI출퇴근/중복|출근전퇴근409,UI출근200·중복ALREADY_CHECKED_IN409,UI퇴근200·중복ALREADY_CHECKED_OUT409. 서버관찰시각16:03:50/16:03:51 KST,late/earlyLeave true. 정각경계통과를뜻하지않음.|
|2|미기록|API NO_RECORD/null,UI과거미기록배지·'결근판정아님'안내. 미래빈행을결근으로표시하지않음.|
|3|관리자정정|빈사유400,과거일09:10/17:30정정corrected/late/earlyLeave,ATTENDANCE_CORRECT1·사유,대상자알림+1·사유미노출.|
|4|기존사원식별|실제GET/employees/{id}200과UI성명/사번일치,월표·정정값표시캡처. 신규API없음.|
|5|미래정정|ADMIN미래평일PUT400 VALIDATION_ERROR,fieldErrors.field=date. 전후월근태JSON동일·감사수동일·대상알림수동일.|
|6|UI휴가신청|201·allowedActions CANCEL,예약+1/가용-1,기본ADMIN/추가ADMIN에REQUESTED,신청자제외.|
|7|겹침/부족|LEAVE_OVERLAP409,INSUFFICIENT_LEAVE_BALANCE409,잔액불변.|
|8|타관리자UI승인|200,예약→사용1회,신청자승인알림1,재승인409·알림중복없음.|
|9|시작전UI취소|200,사용/예약원복,서버상태와UI일치.|
|10|자가결재|합성ADMIN본인신청승인/반려403,본인취소허용.|
|11|타관리자반려|반차예약0.5→반려복원,신청자반려알림·사유미노출,중복반려409.|
|12|읽음/편집 범위|단건반복204·타인404,read-all upToId이하만읽음·이후알림미읽음유지,최종count0.|
|13|알림UI/계정전환|알림대화상자에사유없음,로그아웃→다른ADMIN로그인후이전사원정정알림미노출·API목록도별도.|

지난PENDING은실제서버시간을되돌리지않아브라우저미실행이다. 아래Clock근거에연결하고위13개에포함하지않았다.

## 5. DB 경로

### 유지볼륨 직접결과

이미V3인ems-backend-smoke_mysql_data에서버전1/2/3성공,시드마커1을확인했다. 검수업무추가전에재시작전후사원44/계정44/발령3·각체크섬이같았다. [기계판독보존결과](phase3a-preservation.json),16:02:35 KST. 기존사원/계정/발령재시드가없음을검증했으며이후고유QA데이터추가는의도된변화다.

V2→V3실제이행은백엔드의[체크섬근거](../../backend/verification/20261016-phase3a-compose-result.json)(13:38~13:41 KST,기존43/43/발령3/감사49·행수/체크섬동일)에연결한다. QA가다시V2→V3를적용했다고쓰지않는다.

### 새빈DB 직접결과

사전볼륨부재확인후별도ems-docqa3a-fresh-20261016프로젝트·mysql_data를생성했다. 로컬루트.env.qa3a-local은Git제외이며기존DB설정과새DEMO001비밀번호를로컬생성했다. 기존이미지는[override](fresh.compose.yml)로재사용했다.

```powershell
# 유지프로젝트down:볼륨유지
docker compose --project-name ems-backend-smoke --env-file backend/build/compose-smoke.env down
docker compose --project-name ems-docqa3a-fresh-20261016 --env-file .env.qa3a-local -f docker-compose.yml -f docs/qa/fresh.compose.yml up -d --no-build
node docs/qa/check-phase3a-fresh.cjs .env.qa3a-local
docker compose --project-name ems-docqa3a-fresh-20261016 --env-file .env.qa3a-local -f docker-compose.yml -f docs/qa/fresh.compose.yml down
```

직접SQL사원31/계정31/퇴사5,Flyway1/2/3성공. 실제API기본26·퇴사5·DEMO001 ADMIN및로컬비밀번호로그인,월별12개와입사분포최소10개월이상·대시보드캡처PASS. [결과](phase3a-fresh-results.json). 같은볼륨재사용은새DB검증이아니므로삭제대신다른고유프로젝트를선택한다.

최종두프로젝트ps --all은빈목록,기존/신규mysql_data볼륨유지확인. -v는사용하지않았다.

## 6. 이미지·독립근거·미실행

- [새DB분산대시보드](phase3a-screenshots/dashboard-fresh.png),[모바일](phase3a-screenshots/dashboard-fresh-mobile.png)
- [근태/식별/미기록](phase3a-screenshots/admin-attendance.png),[출퇴근](phase3a-screenshots/attendance.png)
- [휴가신청](phase3a-screenshots/leave-pending.png),[승인](phase3a-screenshots/leave-approved.png),[취소](phase3a-screenshots/leave-cancelled.png),[알림](phase3a-screenshots/notifications.png)

QA는새대시보드와관리근태이미지를직접열어차트·상태·성명/사번·미기록표시를확인했다. 나머지는실제흐름의스크린샷이며Claude가이실제API화면을재검수했다고주장하지않는다. 회귀이미지는별도phase3a-regression-screenshots에보존한다.

백엔드93/93·MySQL28/28은13:23최종실행JSON/일지근거이며이번QA가재실행한것은아니다. [테스트요약](../../backend/verification/20261016-phase3a-tests.json),Phase3MySqlTest.selfDecisionsForbiddenAndPastPendingCanCancelOrReject,exactAttendanceBoundariesAndDuplicates,LeavePolicyTest의기념일/윤년40개산정근거에연결한다. 프론트97/97·목업6/6·Claude24장도각실행주체의근거다.

**이번브라우저미실행:** 지난PENDING취소/승인409/반려,정각·윤년·기념일경계,동시요청/저장실패주입,주말/종일휴가/양쪽반차전체조합,실측대비·스크린리더·모든키보드/모바일모달스크롤·다중브라우저. Clock/MySQL자동테스트와분리하고미실행을통과로확대하지않는다.

## 7. 결함·잔여

신규제품결함미발견. QA하네스의기동대기·미기록설명검색·환경파일파싱은문서QA수정후재검증/기동완료했으며제품코드는수정하지않았다.

| 잔여 | 담당/근거 | 처리 |
| --- | --- | --- |
|낮음N-01~07|프론트·Claude Code 검수7/8절|Codex담당이비차단수용,QA수정없음|
|ExcelJS929.39kB청크경고|프론트빌드·이번이미지빌드|알려진경고,동작실패아님|
|EOF빈줄3건(api.ts/mock-phase2.ts/mock.ts)|프론트인계|스타일검사잔여,QA수정없음|

Git비밀값/산출물검사·세논리커밋및최종상태는개발일지와완료보고에연결한다.
