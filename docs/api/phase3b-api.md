# EMS 3B API 계약
상태: 확정 v1.1. 근거: 2026-10-16 3B 설계 검토와 상세안.
세부 정책은 설계 검토에서 채택했으며 사용자 직접 선택으로 기록하지 않는다. 범위는 조직도·직책·포트폴리오용 데모 급여·평가다. AI 기능과 급여 파일 다운로드는 제외한다.

## 1. 공통
- Base /api/v1, JSON, Authorization: Bearer <token>.
- 날짜 YYYY-MM-DD, 월 YYYY-MM, 시각 오프셋 포함 ISO-8601(Asia/Seoul).
- 페이지는 {content,page,size,totalElements,totalPages}, page 기본0, size 기본20/1~100.
- 공통 오류 {code,message,fieldErrors:[{field,reason}]}. 400 VALIDATION_ERROR,401 UNAUTHORIZED,403 FORBIDDEN,404 NOT_FOUND. message는 설명이며 분기는 code로 한다.
- 생성201, 수정·상태처리200, 카탈로그 삭제204. 별도 표기 없는 업무는 ADMIN 전용이다.
- 금액은 JSON number 정수 원 단위이며 기본급/수당 각각0~1,000,000,000이다. 총지급 최대2,000,000,000으로 JavaScript 안전정수 범위 안이다.
- 모든 상태 변경은 감사와 같은 트랜잭션이며 실패하면 업무도 롤백한다. 급여·평가 알림은 추가하지 않는다.

## 2. 조직도와 부서
### GET /organization
인증 사용자 누구나, 요청본문 없음. 200:
```json
{"departments":[{"id":1,"name":"가상개발부","parentId":null},{"id":2,"name":"가상플랫폼부","parentId":1}],"employees":[{"id":1,"employeeNo":"DEMO001","name":"가상사원001","department":{"id":2,"name":"가상플랫폼부"},"position":{"id":2,"name":"가상대리","level":2},"jobTitle":{"id":1,"name":"가상팀장"},"onLeave":false}]}
```
평탄 배열이다. 부서는 name ASC,id ASC, 사원은 employeeNo ASC,id ASC. 빈 부서 포함, 사원은 ACTIVE/ON_LEAVE만 포함한다. onLeave는 ON_LEAVE 여부다. 이메일·전화·급여·평가는 포함하지 않는다. 직책 없으면 jobTitle=null.
오류401.

### 기존 /departments 확장
GET /departments는 모든 인증 사용자, POST /departments·PUT/DELETE /departments/{id}는 ADMIN.
POST/PUT 요청:
```json
{"name":"가상플랫폼부","description":"합성 부서","parentId":1}
```
name1~100, description<=500, parentId는 양의ID 또는null. 생략/null이면 루트다. POST201/PUT200 응답:
```json
{"id":2,"name":"가상플랫폼부","description":"합성 부서","parentId":1}
```
GET은 해당 DTO 배열(name,id 순). DELETE는 본문 없이204.
계층 변경·삭제는 조직 잠금→부서 순서로 직렬화한다. 자기/하위 부서를 부모로 지정409 DEPARTMENT_CYCLE, 하위부서 존재 삭제409 DEPARTMENT_HAS_CHILDREN. 현재 사원(퇴사 포함)·과거발령 참조는 기존409 DEPARTMENT_IN_USE, 이름중복409 DUPLICATE_NAME, 없는부모/부서404. 조직 변경으로 사원 소속을 자동 이동하지 않는다.

## 3. 직책과 발령
### 카탈로그
GET /job-titles: 인증 사용자,200 배열, name ASC,id ASC.
POST /job-titles: ADMIN,201. PUT /job-titles/{id}: ADMIN,200. 공통 입력:
```json
{"name":"가상팀장","description":"합성 직책"}
```
응답/GET항목:
```json
{"id":1,"name":"가상팀장","description":"합성 직책"}
```
name1~100,description<=500. DELETE /job-titles/{id}: ADMIN,204. 현재사원/과거발령 참조409 JOB_TITLE_IN_USE, 중복409 DUPLICATE_NAME, 없는ID404.
사원당0~1개, 공석허용, 부서당 유일성·겸직 없음. 직책은 권한을 변경하지 않으며 휴가는 기존 ADMIN 결재를 유지한다.

### 기존 발령 POST /employees/{id}/appointments
기존 권한 ADMIN·201, 필수 departmentId/positionId/effectiveDate/reason 및 날짜 규칙은 유지한다.
```json
{"departmentId":1,"positionId":2,"effectiveDate":"2026-10-16","reason":"합성 직책 지정","changeJobTitle":true,"jobTitleId":1}
```
- changeJobTitle 기본false. false/생략은 jobTitleId와 무관하게 현재직책 유지.
- true+양의ID는 지정/변경, true+null/생략은 해제.
- 직책만 변경 가능. 부서·직급·직책 모두 동일하면400 VALIDATION_ERROR.
- 날짜는 입사일 이상·오늘 이하·마지막 발령일 이상, 퇴사자409 EMPLOYEE_RETIRED.
응답 및 GET /employees/{id}/appointments 페이지 항목에 fromJobTitle/toJobTitle을 추가한다:
```json
{"id":8,"employeeId":1,"effectiveDate":"2026-10-16","fromDepartment":{"id":1,"name":"가상개발부"},"toDepartment":{"id":1,"name":"가상개발부"},"fromPosition":{"id":2,"name":"가상대리","level":2},"toPosition":{"id":2,"name":"가상대리","level":2},"fromJobTitle":null,"toJobTitle":{"id":1,"name":"가상팀장"},"reason":"합성 직책 지정","createdBy":{"id":2,"name":"가상관리자"},"createdAt":"2026-10-16T10:00:00+09:00"}
```
이름은 스냅샷. 기존 과거 이력의null은 직책 복원을 뜻하지 않는다. 현재값·발령·감사 원자 처리. GET은 ADMIN/본인, effectiveDate DESC,id DESC. 기존 오류 유지, 없는직책404.
EmployeeView에 jobTitle:{id,name}|null을 추가한다. PUT /employees/{id}의 jobTitleId는 생략/null/현재값이면 유지, 다른값이면409 APPOINTMENT_REQUIRED. 해제도 발령에서만 한다. 사원등록/엑셀가져오기 양식은 변경하지 않고 초기직책은null.
퇴사 시 같은 트랜잭션에서 현재직책을 해제하고 EMPLOYEE_RETIRE 전후에 기록한다. 별도 발령은 생성하지 않는다. 과거 이력 보존.

## 4. 급여: 포트폴리오용 데모
고정 demoNotice:
> 포트폴리오용 데모 급여 — 실제 세법·4대보험 산정 아님
화면/명세/README에 표시한다. 파일 다운로드는 이번 범위에서 제외한다. 일할계산 없음(휴직·휴가·월중 입퇴사에도 설정액 전액).
과거월도 생성 시점의 설정·소속을 스냅샷하며 당시 이력을 복원한 것이 아니다.

### 4.1 설정 GET/PUT /employees/{id}/salary-setting
ADMIN. GET200, 미설정404. PUT은 신규설정/수정 모두200:
```json
{"baseSalary":3000000,"allowance":100000}
```
각 정수0~1,000,000,000. 공제율/산식은 서버고정이며 입력하지 않는다.
```json
{"employeeId":1,"baseSalary":3000000,"allowance":100000,"formulaVersion":"DEMO_V1","deductionRates":[450,350,300]}
```
없는사원404, 형식/범위400. 설정변경은 이미 생성한 명세를 자동 변경하지 않는다.

### 4.2 산식
총지급=baseSalary+allowance. 각 항목=총지급×rateBps÷10000, BigDecimal HALF_UP으로 원 단위 반올림. 총공제=반올림한 항목합, netPay=총지급-총공제.
| 항목 | rateBps | 비율 |
| --- | --- | --- |
| 데모 공제 1 |450|4.5%|
| 데모 공제 2 |350|3.5%|
| 데모 공제 3 |300|3.0%|
| 기본급 | 수당 | 총지급 | 공제1 | 공제2 | 공제3 | 총공제 | 실수령 |
| --- | --- | --- | --- | --- | --- | --- | --- |
|100|1|101|5 (4.545)|4 (3.535)|3 (3.03)|12|89|
|3000000|0|3000000|135000|105000|90000|330000|2670000|

### 4.3 월 단위 API
- GET /payrolls?month=2026-09&status=DRAFT&page=0&size=20: ADMIN,200 월DTO 페이지. month/status 선택, month DESC,id DESC.
- POST /payrolls: ADMIN,{"month":"2026-09"},201 월DTO.
- GET /payrolls/{month}: ADMIN,200 월상세 {payroll:<월DTO>,payslips:[<명세DTO>]}.
- POST /payrolls/{month}/recalculate: ADMIN,본문없음,200 월DTO.
- POST /payrolls/{month}/confirm: ADMIN,본문없음,200 월DTO.
월은1900-01~서울 현재월. 대상자는 hireDate<=월말 AND (retireDate=null OR retireDate>=월초), 상태를 과거 이력으로 추정하지 않는다.
대상0명400 VALIDATION_ERROR. 대상 중 설정누락 한 명이라도 있으면409 SALARY_SETTING_MISSING으로 전체 취소. 이미월존재409 PAYROLL_ALREADY_EXISTS. 재계산은 현재대상집합으로 초안전체를 교체하며 설정/소속스냅샷을 갱신한다.
월DTO:
```json
{"month":"2026-09","status":"DRAFT","count":26,"generatedAt":"2026-10-16T10:00:00+09:00","generatedBy":{"id":1,"name":"가상관리자"},"confirmedAt":null,"confirmedBy":null,"allowedActions":["RECALCULATE","CONFIRM"]}
```
| 상태 | ADMIN | EMPLOYEE |
| --- | --- | --- |
| 미생성 | GENERATE | 조회404 |
| DRAFT | RECALCULATE,CONFIRM,조회 | 명세조회404 |
| CONFIRMED | 조회만 | 본인명세만조회 |
월생성/재계산/확정은 각각 월전체 원자 처리. (월,사원) 유일. GET_LOCK(...,0)+행잠금으로 동시경합409 PAYROLL_BUSY, 트랜잭션 종료 이후 락 해제. 확정후 수정/삭제/취소/재생성은 허용하지 않는다. 재계산/중복확정409 PAYROLL_CONFIRMED. 없는월404.

### 4.4 명세
GET /payslips/me?month=2026-09&page=0&size=20: 본인 CONFIRMED만,200 페이지. month 선택, month DESC,id DESC.
GET /payslips/{id}: ADMIN은전체, EMPLOYEE는본인CONFIRMED만200. 타인/미확정/없는ID는404.
월상세 명세순서는 employeeNo ASC,id ASC. 명세DTO:
```json
{"id":10,"month":"2026-09","status":"CONFIRMED","employee":{"id":1,"employeeNo":"DEMO001","name":"가상사원001"},"department":{"id":1,"name":"가상개발부"},"position":{"id":1,"name":"가상사원","level":1},"jobTitle":null,"baseSalary":3000000,"allowance":0,"grossPay":3000000,"deductions":[{"name":"데모 공제 1","rateBps":450,"amount":135000},{"name":"데모 공제 2","rateBps":350,"amount":105000},{"name":"데모 공제 3","rateBps":300,"amount":90000}],"totalDeductions":330000,"netPay":2670000,"formulaVersion":"DEMO_V1","generatedAt":"2026-10-16T10:00:00+09:00","generatedBy":{"id":1,"name":"가상관리자"},"confirmedAt":"2026-10-16T11:00:00+09:00","confirmedBy":{"id":1,"name":"가상관리자"},"demoNotice":"포트폴리오용 데모 급여 — 실제 세법·4대보험 산정 아님"}
```
이름·사번·부서·직급·직책·금액·공제율·산식·처리자와 시각은 저장된 스냅샷이다. 나중의 발령/설정변경으로 확정명세가 바뀌지 않는다.
오류400 VALIDATION_ERROR,401,403(관리기능),404,409 SALARY_SETTING_MISSING/PAYROLL_ALREADY_EXISTS/PAYROLL_CONFIRMED/PAYROLL_BUSY.

## 5. 평가
### 5.1 주기 관리
GET /evaluation-cycles?page=0&size=20: ADMIN,200 페이지,id DESC.
POST /evaluation-cycles: ADMIN,201 주기DTO.
GET /evaluation-cycles/{id}: ADMIN,200 주기DTO.
PUT /evaluation-cycles/{id}: ADMIN,DRAFT만,200 주기DTO. 입력은 전체교체다.
```json
{"name":"합성 2026 하반기","startDate":"2026-07-01","endDate":"2026-12-31","items":[{"name":"업무 수행","sortOrder":1},{"name":"협업","sortOrder":2}],"assignments":[{"employeeId":2,"reviewerId":1}]}
```
이름1~100, 날짜시작<=종료. 항목1~20, 항목이름1~100, sortOrder0~10000 중복불가. 배정1명이상, employeeId 중복불가.
평가자=대상자가 아닌 enabled+ADMIN+ACTIVE+입사일도래 사원. 대상=배정시ACTIVE/ON_LEAVE 및입사일도래. 자기평가결재403, 유효하지 않은평가자409 EVALUATION_REVIEWER_INVALID.
주기DTO:
```json
{"id":1,"name":"합성 2026 하반기","startDate":"2026-07-01","endDate":"2026-12-31","status":"DRAFT","items":[{"id":1,"name":"업무 수행","sortOrder":1},{"id":2,"name":"협업","sortOrder":2}],"assignments":[{"employeeId":2,"reviewerId":1}],"allowedActions":["EDIT","OPEN"]}
```
항목은sortOrder ASC,id ASC, 배정employeeId ASC. OPEN시 평가서에 항목을 스냅샷한다.
POST /evaluation-cycles/{id}/open: ADMIN,본문없음,200 갱신주기.
POST /evaluation-cycles/{id}/close: ADMIN,본문없음,200 갱신주기.
| 주기 | 허용 |
| --- | --- |
| DRAFT | EDIT,OPEN |
| OPEN | CLOSE,평가작성,미확정재배정 |
| CLOSED | 조회만 |
종료일은 표시용이며 자동마감하지 않는다. OPEN에서만작성한다. 미완료가있어도마감하며 미완료서의state를보존하고 incomplete=true로표시한다. 항목/배정일괄수정은OPEN후불가, 예외는명시적재배정API다.
오류400 VALIDATION_ERROR,404,409 EVALUATION_STATE_CONFLICT/EVALUATION_CYCLE_CLOSED/EVALUATION_REVIEWER_INVALID.


### v1.1: 주기 상세 배정 요약
`GET /evaluation-cycles/{id}`의 `assignments`는 입력용 ID 쌍 대신 다음 조회 전용 요약을 반환한다. 다른 주기 API의 기존 응답 및 생성/수정 입력 `{employeeId,reviewerId}`는 변경하지 않는다.
```json
{"id":1,"name":"합성 2026 하반기","startDate":"2026-07-01","endDate":"2026-12-31","status":"OPEN","items":[{"id":1,"name":"업무 수행","sortOrder":1}],"assignments":[{"evaluationId":3,"employee":{"id":2,"employeeNo":"DEMO002","name":"가상사원002"},"reviewer":{"id":1,"employeeNo":"ADMIN001","name":"가상관리자"},"state":"SELF_SUBMITTED","incomplete":false,"allowedActions":["REASSIGN_REVIEWER"]}],"allowedActions":["CLOSE"]}
```
- 정렬: employee.employeeNo ASC, 배정 ID ASC.
- DRAFT는 평가서가 아직 생성되지 않았으므로 evaluationId=null, state=null, incomplete=false, allowedActions=[]다. 배정 변경은 기존 DRAFT 주기 수정으로 한다.
- OPEN이고 해당 평가서가 미확정이면 allowedActions=["REASSIGN_REVIEWER"]. FINALIZED 또는 주기 CLOSED이면 []다.
- incomplete는 기존과 같이 CLOSED && state!=FINALIZED다.
- employee/reviewer는 {id,employeeNo,name}. 점수·코멘트·등급·답변은 넣지 않는다. 주기 조회 권한은 ADMIN이며, 이것이 관계없는 평가 상세의 404 정책을 바꾸지 않는다.

### 5.2 평가서 조회
- GET /evaluations/me?cycleId=1&page=0&size=20: 본인대상목록,200 요약페이지.
- GET /evaluations/assigned?cycleId=1&page=0&size=20: 배정평가자목록,200 요약페이지.
- GET /evaluations/{id}: 본인 또는 배정평가자만200. 다른ADMIN도404.
목록cycleId선택, 정렬id DESC. 요약은 {id,cycle,employee,reviewer,state,incomplete,allowedActions}만 포함하며 답변/점수/코멘트/등급을 포함하지 않는다.
상세(평가자 또는확정후본인) 예:
```json
{"id":3,"cycle":{"id":1,"name":"합성 2026 하반기","status":"OPEN","startDate":"2026-07-01","endDate":"2026-12-31"},"employee":{"id":2,"employeeNo":"DEMO002","name":"가상사원002"},"reviewer":{"id":1,"employeeNo":"ADMIN001","name":"가상관리자"},"items":[{"id":1,"name":"업무 수행","sortOrder":1},{"id":2,"name":"협업","sortOrder":2}],"state":"FINALIZED","selfAnswers":[{"itemId":1,"score":4,"comment":"합성 자기평가"},{"itemId":2,"score":4,"comment":""}],"managerAnswers":[{"itemId":1,"score":5,"comment":"합성 관리자평가"},{"itemId":2,"score":4,"comment":""}],"finalScore":4.50,"grade":"S","incomplete":false,"allowedActions":[]}
```
공개전본인응답은 managerAnswers/finalScore/grade 키를 아예 제외한다(null반환도아님). 자기답변과항목은보인다. 주기관리가능ADMIN이라도배정관계없는평가상세는404. 평가자유효성을업무처리때도검사한다. 개방후대상퇴사시배정평가자는완료가능하며본인로그인은기존401이다.
incomplete는 CLOSED && state!=FINALIZED다. OPEN의미작성은state로표시한다.

### 5.3 작성·제출
PUT /evaluations/{id}/self: 본인,임시저장,200 갱신상세.
POST /evaluations/{id}/self/submit: 본인,200 갱신상세.
PUT /evaluations/{id}/manager: 배정평가자,임시저장,200 갱신상세.
POST /evaluations/{id}/manager/submit: 배정평가자,제출즉시확정,200 갱신상세.
네 API 공통본문:
```json
{"answers":[{"itemId":1,"score":4,"comment":"합성 코멘트"},{"itemId":2,"score":5,"comment":""}]}
```
각 호출의 answers는 그 단계 답변전체를 대체한다. 초안은부분항목/null점수허용, 제출은전항목1~5정수필수. comment선택/null 또는최대1000자. 알려지지않은/중복itemId는400. 모든항목유효할때만제출성공하며부분저장없음.
| 평가서 | 본인 | 배정평가자 |
| --- | --- | --- |
| SELF_DRAFT | SAVE_SELF,SUBMIT_SELF | 조회 |
| SELF_SUBMITTED | 조회 | SAVE_MANAGER,SUBMIT_MANAGER |
| MANAGER_DRAFT | 조회 | SAVE_MANAGER,SUBMIT_MANAGER |
| FINALIZED | 공개결과조회 | 조회 |
주기CLOSED면작성액션없음. ADMIN은자기결재불가403. 다른사람의쓰기/직접상세는404. 상태불일치409 EVALUATION_STATE_CONFLICT, 마감409 EVALUATION_CYCLE_CLOSED, 유효하지않은평가자409 EVALUATION_REVIEWER_INVALID. 자기제출후회수·반려·확정후재개방은없다.

### 5.4 재배정
PUT /evaluations/{id}/reviewer: ADMIN,{"reviewerId":4},200 갱신요약.
주기DRAFT/OPEN 및미확정만허용. 평가서가OPEN때생성되므로 DRAFT에서는주기의assignments전체수정으로배정한다.
재배정은 기존 관리자 초안(점수·코멘트)을 초기화한다. MANAGER_DRAFT는SELF_SUBMITTED로돌리고 SELF_DRAFT는유지한다. SELF_SUBMITTED도유지한다. 이전평가자는즉시상세404, 새평가자는배정권한을얻는다.
FINALIZED409 EVALUATION_STATE_CONFLICT, CLOSED409 EVALUATION_CYCLE_CLOSED. 자기평가자403/유효하지않은평가자409 EVALUATION_REVIEWER_INVALID.
REASSIGN_REVIEWER는미확정·주기OPEN에서관리자목록요약에제공한다. 이관리권한이민감답변조회권한을확대하지않는다.

### 5.5 점수·등급
최종=관리자점수평균을BigDecimal HALF_UP으로소수둘째자리반올림한값. 자기점수미포함. 서버가확정값·등급을스냅샷저장한다. 클라이언트최종점수/등급입력을사용하지않는다.
| 등급 | 최종점수 |
| --- | --- |
| S |>=4.50|
| A |>=3.50,<4.50|
| B |>=2.50,<3.50|
| C |>=1.50,<2.50|
| D |<1.50|
예: [5,4]→4.50/S, [4,3,3]→3.33/B, [1,2]→1.50/C. 등급은반올림된최종점수로비교한다.

## 6. 감사와 개인정보 경계
기존감사API의ADMIN조회권한을유지한다. 아래신규action/targetType을지원한다.
| action | targetType | 허용내용 |
| --- | --- | --- |
| JOB_TITLE_CREATE/UPDATE/DELETE | JOB_TITLE | 직책id/name/description 전후 |
| SALARY_SETTING_UPDATE | SALARY_SETTING | metadata.employeeId, 금액제외 |
| PAYROLL_GENERATE/RECALCULATE/CONFIRM | PAYROLL | before/after.status, metadata.month/count |
| EVALUATION_CYCLE_CREATE/UPDATE/OPEN/CLOSE | EVALUATION_CYCLE | before/after.state, metadata.cycleId |
| EVALUATION_SELF_SAVE/SUBMIT | EVALUATION | before/after.state, metadata.cycleId/employeeId/reviewerId |
| EVALUATION_MANAGER_SAVE/FINALIZE | EVALUATION | 동일 |
| EVALUATION_REASSIGN | EVALUATION | before/after.state, metadata.cycleId/employeeId/oldReviewerId/newReviewerId |
급여설정의before/after는null(상태없는설정), metadata에employeeId만. 생성before=null. PAYROLL targetId는월레코드ID, targetLabel은월, SALARY_SETTING targetId는사원ID다. 평가targetId는주기/평가서ID. ID/상태만남기고금액·코멘트원문·점수·등급은감사에넣지않는다.
기존사원/발령/퇴사before/after에jobTitle:{id,name}|null 추가. 부서감사parentId추가. 비밀번호/JWT제외는기존과동일. 급여·평가알림은추가하지않는다.

## 7. 시드·마이그레이션
V4만추가하고V1~V3은수정하지않는다. 빈DB의최초생성트랜잭션안에서만부서계층·직책카탈로그·일부직책을설정한다. 기존볼륨에는카탈로그도자동추가하지않는다.
31명전원급여설정, 직전월의정상지급대상에게만CONFIRMED명세를생성한다(31명전원명세라는뜻아님). 평가주기1개와혼합상태평가서, 합성코멘트만생성한다. 시드생성외업무API에서만발령/감사를만들며과거직책이력을추정하지않는다.
기존V3컬럼/ID결정적스냅샷·변경없는테이블CHECKSUM으로V4보존을검증하고, 새빈DB와재시작을별도검증한다. 3A의31명/31계정/퇴사5/기본26기준을유지한다.

## 8. 오류 코드 요약
400 VALIDATION_ERROR.
401 UNAUTHORIZED.
403 FORBIDDEN(권한/자기결재).
404 NOT_FOUND(없는대상, 비공개급여/관계없는평가).
409 DEPARTMENT_CYCLE,DEPARTMENT_HAS_CHILDREN,DEPARTMENT_IN_USE,DUPLICATE_NAME,JOB_TITLE_IN_USE,APPOINTMENT_REQUIRED,EMPLOYEE_RETIRED,SALARY_SETTING_MISSING,PAYROLL_ALREADY_EXISTS,PAYROLL_CONFIRMED,PAYROLL_BUSY,EVALUATION_STATE_CONFLICT,EVALUATION_CYCLE_CLOSED,EVALUATION_REVIEWER_INVALID.
```json
{"code":"PAYROLL_BUSY","message":"요청이 현재 데이터와 충돌합니다.","fieldErrors":[]}
```

## 변경 이력
v1.0 (2026-10-16): 설계 검토 상세안 최초 작성.
v1.1 (2026-10-16): GET /evaluation-cycles/{id} 배정 요약 확장(evaluationId/employee/reviewer/state/incomplete/allowedActions), employeeNo/배정ID 정렬, 민감 평가 필드 제외. Markdown 코드블록 구분자의 역슬래시 제거. 후속 설계 검토 반영.
