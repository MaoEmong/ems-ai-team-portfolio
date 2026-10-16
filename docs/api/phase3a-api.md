# EMS 3A API 계약
상태: 확정. 근거: 3A 회의 및 설계 검토 / 답변. 정책 결정 주체는 설계 검토에서다. 아래 규칙은 포트폴리오용 데모이며 법률 적합성을 판정하지 않았다.

## 공통
Base /api/v1, Bearer 인증. 날짜 YYYY-MM-DD, 시각 오프셋 포함 ISO-8601(서울), 초 단위. 페이지 기본0/20, size1~100, {content,page,size,totalElements,totalPages}. 목록은 createdAt DESC,id DESC. 요청 본문을 명시하지 않은 GET/POST는 본문 없음.
오류 {code,message,fieldErrors:[{field,reason}]}. 모든 API는 401 UNAUTHORIZED, 권한 위반403 FORBIDDEN, 없는 대상404 NOT_FOUND, 형식/필드 오류400 VALIDATION_ERROR를 사용할 수 있다.
사원은 ACTIVE이고 hireDate<=서울 오늘일 때 출퇴근/휴가신청 가능. 아니면409 EMPLOYEE_NOT_ACTIVE. 퇴사 계정은 기존 인증에서401.

## 근태 DTO 및 API
하루 예시:
```json
{"date":"2026-10-16","checkIn":"2026-10-16T14:00:00+09:00","checkOut":null,"late":false,"earlyLeave":false,"status":"INCOMPLETE","expectedStart":"14:00:00","expectedEnd":"18:00:00","leaves":[{"id":12,"type":"HALF_AM"}],"corrected":false}
```
status: NO_RECORD, INCOMPLETE, COMPLETE, LEAVE. 없는 출퇴근은 null, 승인 휴가 없으면 leaves=[]. 미기록/미퇴근의 해당 boolean은 false. 종일 ANNUAL/SICK 또는 양쪽 반차 승인일은 LEAVE, late/earlyLeave=false. 반차 두 건이면 leaves에 둘 다 반환. expectedStart/End는 오전반차14:00/오후반차14:00을 각각 적용한다.
- POST /attendance/me/check-in: 본인(ADMIN도 가능), 본문 없음, 200 갱신된 하루 DTO.
- POST /attendance/me/check-out: 본인, 본문 없음, 200 하루 DTO.
- GET /attendance/me/today: 본인, 200 오늘 하루 DTO(주말도 조회 가능).
- GET /attendance/me?month=2026-10: 본인, 200 아래 월 DTO.
- GET /attendance?employeeId=1&month=2026-10: ADMIN, 200 월 DTO.
- PUT /attendance/{employeeId}/{date}: ADMIN, 200 정정된 하루 DTO.
```json
{"employeeId":1,"month":"2026-10","days":[{"date":"2026-10-01","checkIn":null,"checkOut":null,"late":false,"earlyLeave":false,"status":"NO_RECORD","expectedStart":"09:00:00","expectedEnd":"18:00:00","leaves":[],"corrected":false}]}
```
위 days는 축약 예시이며 실제 응답에는 해당 월의 모든 월~금 날짜가 포함된다. 기록없음은 출퇴근 null이며 자동결근을 만들지 않는다.
정정 요청:
```json
{"checkIn":"2026-10-16T09:00:00+09:00","checkOut":"2026-10-16T18:00:00+09:00","reason":"합성 시각 정정"}
```
checkIn 필수, checkOut 선택/null 허용. 사유1~200자. 날짜는 입사일~오늘, 시각은 해당 서울 날짜 안·미래불가·초 단위, checkIn<checkOut. 주말 정정 불가, 종일 휴가일 정정 허용. corrected=true 및 감사/대상자 알림을 함께 저장. 일반 출퇴근은 서버 시각을 초로 절삭해 기록하고 오늘 기록만 처리. 클라이언트 시각은 받지 않는다.

| 승인 휴가 | 출근 기준 | 퇴근 기준 | 경계 예 |
| --- | --- | --- | --- |
| 없음 |09:00:00|18:00:00|09:00정상,09:00:01지각;17:59:59조퇴,18:00정상|
| HALF_AM |14:00:00|18:00:00|14:00정상,14:00:01지각|
| HALF_PM |09:00:00|14:00:00|13:59:59조퇴,14:00정상|
| 종일/양쪽 반차 |반차 기준 적용 또는 기본|동일|LEAVE, 두 판정 false|
판정은 조회 시 당시 승인 상태를 사용하므로 승인/취소/정정 뒤 바뀐다. 근무시간 합산·점심공제·공휴일·야간근무는 제외.
409: NOT_A_WORKDAY, ON_LEAVE_DAY(종일 휴가 출근), EMPLOYEE_NOT_ACTIVE, ALREADY_CHECKED_IN, NOT_CHECKED_IN, ALREADY_CHECKED_OUT.

## 휴가 DTO 및 API
요청 POST /leaves (본인,201):
```json
{"type":"HALF_AM","startDate":"2026-10-19","endDate":"2026-10-19","reason":"합성 휴가 신청"}
```
응답 예:
```json
{"id":12,"employee":{"id":1,"employeeNo":"DEMO001","name":"가상사원001"},"type":"HALF_AM","startDate":"2026-10-19","endDate":"2026-10-19","days":0.5,"reason":"합성 휴가 신청","status":"PENDING","rejectReason":null,"decidedBy":null,"decidedAt":null,"cancelledBy":null,"createdAt":"2026-10-16T10:00:00+09:00","allowedActions":["CANCEL"]}
```
종류 ANNUAL/HALF_AM/HALF_PM/SICK. 사유1~200. 시작일>=오늘, 종료>=시작; 반차는 동일 하루. 주말 제외 평일이 없으면400. SICK days는 평일수, 잔액 차감0. 현재 산정 기간 안으로 제한하며 경계 초과400 LEAVE_PERIOD_BOUNDARY. 평일 AM/PM 구간 기준 PENDING/APPROVED 중복409 LEAVE_OVERLAP. 같은 날 서로 다른 반차는 허용.
- GET /leaves/me?status=PENDING&page=0&size=20: 본인,200 페이지(content 위 DTO). status 선택.
- GET /leaves?status=PENDING&employeeId=1&page=0&size=20: ADMIN,200 페이지. 필터 선택.
- GET /leaves/{id}: ADMIN 또는 본인,200 DTO; 타인403, 없는ID404.
- POST /leaves/{id}/approve: ADMIN(본인불가),본문없음,200 갱신DTO.
- POST /leaves/{id}/reject: ADMIN(본인불가),{"reason":"합성 반려 사유"},200 갱신DTO.
- POST /leaves/{id}/cancel: 본인,본문없음,200 갱신DTO.
승인/반려 시 decidedBy={id,name}, decidedAt 기록. 취소는 cancelledBy=SELF 또는 SYSTEM. decidedBy/At은 기존 결정 기록을 보존한다.

| 상태/날짜 | 본인(ADMIN 포함) | 다른 ADMIN | 다른 EMPLOYEE |
| --- | --- | --- | --- |
| PENDING, 시작일>=오늘 | CANCEL | APPROVE,REJECT | 조회403 |
| PENDING, 시작일<오늘 | CANCEL | REJECT | 조회403 |
| APPROVED, 시작일>오늘 | CANCEL | 없음 | 조회403 |
| APPROVED, 시작일<=오늘 | 없음 | 없음 | 조회403 |
| REJECTED/CANCELLED | 없음 | 없음 | 조회403 |
상태 전이 PENDING→APPROVED/REJECTED/CANCELLED, APPROVED→CANCELLED. 자기 승인/반려403. 지난 시작일 PENDING 승인409 LEAVE_START_PASSED, 이미 처리된 상태에 중복 처리409 LEAVE_ALREADY_PROCESSED. PENDING은 시작일과 무관하게 본인이 취소할 수 있다. APPROVED는 시작일 전날까지만 취소할 수 있으며 시작일부터409 LEAVE_START_PASSED다. 신청시 예약, 승인시 예약→사용, 반려/취소시 복원. 미래 승인분도 used다. 초과409 INSUFFICIENT_LEAVE_BALANCE. 잔액행 잠금 후 업무·감사·알림 단일 트랜잭션.

## 잔액·산정
GET /leaves/me/balance (본인), GET /employees/{id}/leave-balance (ADMIN): 200
```json
{"periodStart":"2026-01-01","periodEnd":"2026-12-31","granted":9,"used":1,"reserved":0.5,"available":7.5,"approverAvailable":true}
```
periodEnd 포함. available=granted-used-reserved. approverAvailable은 본인 제외 활성 ADMIN 존재 여부이며 false여도 신청 허용.
| 입사일 | 기준일 | 산정 기간 | 부여 |
| --- | --- | --- | --- |
|2026-01-31|2026-02-27|2026-01-31~2027-01-30|0|
|2026-01-31|2026-02-28|동일|1|
|2026-01-31|2026-03-31|동일|2|
|2025-10-16|2026-10-15|2025-10-16~2026-10-15|11|
|2025-10-16|2026-10-16|2026-10-16~2027-10-15|15|
|2023-10-16|2026-10-16|2026-10-16~2027-10-15|16|
|2004-10-16|2026-10-16|2026-10-16~2027-10-15|25|
|2024-02-29|2025-02-28|2025-02-28~2026-02-27|15|
|2024-02-29|2028-02-29|2028-02-29~2029-02-27|16|
첫해 원입사일.plusMonths(k) 월말보정, 오늘까지 최대11. 만n년>=1: min(25,15+floor((n-1)/2)). 기념일은 원입사일.plusYears(n); 윤년2/29는 평년2/28. 첫기념일 및 각 기간전환시 이전 잔여 소멸, 이월 없음. 현재기간 휴가만 신청, 미발생 연차 선사용 불가. Clock 주입 테스트로 고정한다.
휴가 기록 있으면 hireDate 변경409 LEAVE_RECORDS_EXIST. 근태 첫 기록 뒤로 hireDate 변경400 VALIDATION_ERROR. 퇴사 트랜잭션은 모든PENDING과 오늘보다 늦게 시작하는APPROVED를 SYSTEM취소하고 잔액·감사·알림 반영.

## 알림
항목:
```json
{"id":21,"type":"LEAVE_APPROVED","targetType":"LEAVE","targetId":12,"targetDate":null,"message":"휴가가 승인되었습니다.","read":false,"createdAt":"2026-10-16T11:00:00+09:00"}
```
근태 알림 예: targetType=ATTENDANCE,targetId=null,targetDate="2026-10-16". 사유/반려사유는 넣지 않는다.
- GET /notifications/me?unreadOnly=false&page=0&size=20: 본인,200 페이지(content 알림DTO), createdAt DESC,id DESC.
- GET /notifications/me/unread-count: 본인,200 {"count":1}.
- POST /notifications/{id}/read: 본인,본문없음,204; 반복204,타인/없는ID404.
- POST /notifications/me/read-all: 본인,{"upToId":21},200 {"updatedCount":1}; 본인의 id<=upToId만 갱신.
| 사건 | 수신자 |
| --- | --- |
|LEAVE_REQUESTED|활성 ADMIN 전원, 신청자 제외|
|LEAVE_APPROVED/LEAVE_REJECTED|신청자|
|LEAVE_CANCELLED(시스템 포함)|활성 ADMIN 전원, 신청자 제외|
|ATTENDANCE_CORRECTED|대상 사원|
로그인 중 보이는 화면30초 폴링·복귀/업무후갱신. DB 알림 저장 실패는 업무 롤백, 성공 후 목록 조회 실패는 별도 오류. 업무 중복처리는409로 막아 중복알림 방지.

## 감사 확장
- ATTENDANCE_CORRECT: targetType=EMPLOYEE,targetId=사원ID; metadata={date,reason}, before/after={checkIn,checkOut,corrected}, 신규기록 before=null.
- LEAVE_REQUEST/LEAVE_APPROVE/LEAVE_REJECT/LEAVE_CANCEL: targetType=LEAVE,targetId=신청ID; before/after는 allowedActions 제외 휴가 DTO, 신규 before=null.
- LEAVE_CANCEL 시스템 처리 metadata={system:true}, 나머지 metadata={}. 사유는 감사에 허용, 비밀번호/JWT 제외.
- 출퇴근 자체와 알림 읽음은 감사 이벤트를 만들지 않는다.

## 오류 코드 요약
400 VALIDATION_ERROR, LEAVE_PERIOD_BOUNDARY.
401 UNAUTHORIZED. 403 FORBIDDEN. 404 NOT_FOUND.
409 EMPLOYEE_NOT_ACTIVE, NOT_A_WORKDAY, ON_LEAVE_DAY, ALREADY_CHECKED_IN, NOT_CHECKED_IN, ALREADY_CHECKED_OUT, LEAVE_OVERLAP, INSUFFICIENT_LEAVE_BALANCE, LEAVE_ALREADY_PROCESSED, LEAVE_START_PASSED, LEAVE_RECORDS_EXIST.
```json
{"code":"LEAVE_OVERLAP","message":"LEAVE_OVERLAP","fieldErrors":[]}
```
기존 사원/조직 API 오류는 기존 계약 유지.
