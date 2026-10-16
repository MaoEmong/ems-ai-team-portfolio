# EMS 2단계 API 상세 계약

상태: 확정. 회의 계약과 설계 검토 추가 승인 을 반영한 병행 개발 기준.
근거: 2026-10-16 1단계 종료·2단계 착수 회의, 검증 작업.

## 공통

- Base `/api/v1`, `Authorization: Bearer <token>`.
- 아래 모든 API는 ADMIN 전용이다. 발령 이력 GET만 ADMIN 또는 해당 사원 본인에게 허용한다.
- 날짜 YYYY-MM-DD. 시각은 오프셋 포함 ISO-8601, 서울 기준. page=0부터, size 기본20·최대100.
- 페이지 응답 `{content,page,size,totalElements,totalPages}`.
- 오류 기본 형식 `{code,message,fieldErrors:[{field,reason}]}`. 가져오기 행 오류에만 `rowErrors`를 추가한다. message/reason에는 비밀번호·업로드 입력 원문을 포함하지 않는다.
- 공통 오류: 400 VALIDATION_ERROR, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND. 해당되는 추가 코드는 엔드포인트별 명시.
- 날짜와 인원 예시는 설명용 합성값이다. 목록의 인원이나 시드 수를 실제 유지 DB의 고정값으로 가정하지 않는다.

## 사원 PUT 변경

`PUT /employees/{id}`, ADMIN, 200 Employee 객체. 나머지 필드와 응답은 [MVP 계약](mvp-api.md)을 따른다.

```json
{"name":"가상사원001","email":"demo001@example.invalid","phone":"000-0000-0001","hireDate":"2026-01-01","status":"ACTIVE","role":"EMPLOYEE"}
```

departmentId와 positionId는 선택 입력이다. 생략/null은 현재 값 유지, 같은 값은 허용, 다른 값은 409 APPOINTMENT_REQUIRED다. 신규 POST에서는 둘 다 필수다. 프론트 수정 화면은 두 필드를 생략한다. 사원 hireDate를 최초 발령일 이후로 변경하면 400 VALIDATION_ERROR(field=hireDate). 퇴사 API에서 retireDate를 마지막 발령일 이전으로 지정해도 400(field=retireDate). 퇴사 사원 수정은 기존 409 EMPLOYEE_RETIRED다.

```json
{"code":"APPOINTMENT_REQUIRED","message":"부서와 직급은 발령으로 변경해 주세요.","fieldErrors":[]}
```

## GET /dashboard

권한 ADMIN. 요청 본문/파라미터 없음. 200:
```json
{
 "asOfDate":"2026-10-16",
 "headcount":{"active":2,"onLeave":1,"employed":3,"retired":1},
 "byDepartment":[{"departmentId":1,"name":"가상개발부","count":3}],
 "byPosition":[{"positionId":1,"name":"가상사원","level":1,"count":3}],
 "thisMonth":{"hires":1,"retirements":1},
 "monthly":[
  {"month":"2025-11","hires":0,"retirements":0},
  {"month":"2025-12","hires":0,"retirements":0},
  {"month":"2026-01","hires":3,"retirements":0},
  {"month":"2026-02","hires":0,"retirements":0},
  {"month":"2026-03","hires":0,"retirements":0},
  {"month":"2026-04","hires":0,"retirements":0},
  {"month":"2026-05","hires":0,"retirements":0},
  {"month":"2026-06","hires":0,"retirements":0},
  {"month":"2026-07","hires":0,"retirements":0},
  {"month":"2026-08","hires":0,"retirements":0},
  {"month":"2026-09","hires":0,"retirements":0},
  {"month":"2026-10","hires":1,"retirements":1}
 ]
}
```

상태 집계는 현재 status 기준이며 employed=ACTIVE+ON_LEAVE다. 분포도 재직 사원의 현재 소속 기준이다. 날짜 집계는 서울의 오늘까지 발생한 hireDate/retireDate만 센다. 미래 날짜는 제외한다. monthly는 이번 달 포함 12개이며 오래된 달부터 정렬, 빈 달은0이다. 과거 조직 분포·월말 인원을 추정하지 않는다. 상태 집계와 날짜 집계는 서로 다른 기준이다.
오류: 401 UNAUTHORIZED, 403 FORBIDDEN.

## 발령

### POST /employees/{id}/appointments

ADMIN. 요청:
```json
{"effectiveDate":"2026-10-16","departmentId":2,"positionId":2,"reason":"합성 조직 개편"}
```

201 응답:
```json
{
 "id":10,"employeeId":1,"effectiveDate":"2026-10-16",
 "fromDepartment":{"id":1,"name":"가상개발부"},
 "toDepartment":{"id":2,"name":"가상운영부"},
 "fromPosition":{"id":1,"name":"가상사원","level":1},
 "toPosition":{"id":2,"name":"가상대리","level":2},
 "reason":"합성 조직 개편","createdBy":{"id":2,"name":"가상관리자"},
 "createdAt":"2026-10-16T10:00:00+09:00"
}
```

부서·직급 모두 필수이며 하나 이상 현재와 달라야 한다. reason 필수 1~200자.
effectiveDate는 입사일 이상·서울 오늘 이하·마지막 발령일 이상이다. 같은 날짜는 id 순서로 구분한다. 사원 행 잠금 후 현재 값을 읽고, 현재 소속 갱신·발령·감사를 하나의 트랜잭션으로 저장한다. 오래된 화면 요청을 자동 거절하는 기능은 없다.
도입 이전의 과거 발령 이력을 추정해 자동 생성하지 않는다. 등록 요청의 과거 날짜는 위 날짜 규칙 범위 안에서 허용한다. 이름은 등록 당시 스냅샷으로 보존한다.
오류: 400 VALIDATION_ERROR(날짜/사유/변경 없음/입력 형식), 401,403,404 NOT_FOUND(사원/부서/직급), 409 EMPLOYEE_RETIRED.

### GET /employees/{id}/appointments?page=0&size=20

ADMIN 또는 본인. 200 페이지 응답의 content는 위 발령 객체 배열이다. 정렬 effectiveDate DESC,id DESC 고정.
빈 목록:
```json
{"content":[],"page":0,"size":20,"totalElements":0,"totalPages":0}
```
오류: 400 VALIDATION_ERROR,401 UNAUTHORIZED,403 FORBIDDEN(타인 이력),404 NOT_FOUND.

발령 이력이 참조하는 부서·직급의 삭제는 현재 사원이 없어도 기존 409 DEPARTMENT_IN_USE/POSITION_IN_USE로 거절한다.

## GET /employees/export

ADMIN. 예:
`/employees/export?format=xlsx&keyword=DEMO&departmentId=1&positionId=1&status=ACTIVE&sort=employeeNo,asc`

검색·필터·정렬 의미는 MVP 목록과 동일하며 status 생략 시 RETIRED 제외. page/size는 무시하고 전체 일치 결과를 내보낸다. 10,000행 초과 시 400 EXPORT_LIMIT_EXCEEDED이며 일부 파일을 반환하지 않는다.
200 파일 응답:
- xlsx: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
- csv: text/csv;charset=UTF-8, UTF-8 BOM 포함
- Content-Disposition: attachment; filename*=UTF-8''ems-employees-20261016.xlsx (CSV이면 .csv)
- Access-Control-Expose-Headers에 Content-Disposition 포함.

열 순서:
```text
employeeNo,name,email,phone,hireDate,status,retireDate,departmentName,positionName,role
```
CSV 내용 예(맨 앞 UTF-8 BOM은 표시 생략):
```csv
employeeNo,name,email,phone,hireDate,status,retireDate,departmentName,positionName,role
DEMO001,가상사원001,demo001@example.invalid,000-0000-0001,2026-01-01,ACTIVE,,가상개발부,가상사원,EMPLOYEE
```
xlsx는 모든 셀을 문자열로 쓴다. CSV는 =,+,-,@,탭,CR로 시작하는 셀 앞에 작은따옴표를 붙인다. 비밀번호/해시는 포함하지 않는다. 성공 감사는 파일 생성 성공을 뜻하며 브라우저 저장 완료를 뜻하지 않는다.
오류: 400 VALIDATION_ERROR(형식/필터/정렬),400 EXPORT_LIMIT_EXCEEDED,401,403.

## GET /employees/import-template

ADMIN. 본문 없음. 200 xlsx 파일, 다운로드 Content-Disposition 및 CORS 노출.
employees 시트 헤더:
```text
employeeNo,name,email,phone,hireDate,departmentId,positionId,role,initialPassword
```
참조 시트는 departments(id,name), positions(id,name,level)이다. 파일명은 ems-employees-import-template.xlsx. employeeNo/hireDate/initialPassword 열을 텍스트 서식으로 미리 지정한다.
오류: 401 UNAUTHORIZED,403 FORBIDDEN.

## POST /employees/import

ADMIN. multipart/form-data, file 필드에 .xlsx. employees 시트만 등록 대상으로 읽는다.
```text
POST /api/v1/employees/import
Authorization: Bearer <token>
Content-Type: multipart/form-data; boundary=<boundary>
file: <xlsx 바이너리>
```

양식 열 기준 요청 행 예:
```json
{"employeeNo":"000101","name":"가상신입","email":"new101@example.invalid","phone":"000-0000-0101","hireDate":"2026-10-16","departmentId":"1","positionId":"1","role":"EMPLOYEE","initialPassword":"<로컬 초기 비밀번호>"}
```
위 JSON은 셀 내용을 설명하는 예시이며 실제 요청은 xlsx 파일이다. 사번·날짜는 문자열, 날짜는 YYYY-MM-DD, 초기 상태 ACTIVE. 파일 최대5MiB(5,242,880바이트), 데이터 최대1000행, 수식 셀 거절, 압축 해제 크기 제한 적용. 부서·직급은 기존 참조 대상이어야 한다. 파일 내부와 DB 중복 검사는 같은 비교 기준을 사용한다.

201:
```json
{"importedCount":2}
```
400 행 오류:
```json
{"code":"IMPORT_VALIDATION_ERROR","message":"전체 등록이 취소되었습니다.","fieldErrors":[],"rowErrors":[{"row":3,"field":"email","reason":"이미 사용 중인 이메일입니다."}]}
```
행 번호는 실제 Excel 번호(헤더1, 첫 데이터2). 오류가 하나라도 있으면 사원·계정 등록을 전부 롤백하고 실패 감사1건만 남긴다. 오류에는 입력 원문·비밀번호를 반환하지 않는다.
파일 전체 충돌 예:
```json
{"code":"IMPORT_CONFLICT","message":"동시 변경으로 전체 등록이 취소되었습니다.","fieldErrors":[]}
```
오류:
- 400 IMPORT_VALIDATION_ERROR: 필드 검증·중복·수식 등 행 오류와 rowErrors.
- 413 FILE_TOO_LARGE: 파일 크기 초과.
- 400 IMPORT_INVALID_FILE: 형식·시트·헤더 오류.
- 409 IMPORT_CONFLICT: 사전 검증 후 동시 DB 충돌, 임의 행 번호 없음.
- 401 UNAUTHORIZED,403 FORBIDDEN.

성공 감사: EMPLOYEE_IMPORT 1건(metadata.importedCount) 및 사원별 EMPLOYEE_CREATE(metadata.source=IMPORT)를 같은 트랜잭션으로 기록한다.
실패 감사: 롤백 후 별도 트랜잭션에 EMPLOYEE_IMPORT success=false 1건(metadata.code,errorCount). 비밀번호·파일 원문은 저장하지 않는다.

## GET /audit-logs

ADMIN. 예:
`/audit-logs?actorId=2&targetType=EMPLOYEE&targetId=1&action=EMPLOYEE_UPDATE&success=true&from=2026-10-01T00:00:00%2B09:00&to=2026-11-01T00:00:00%2B09:00&page=0&size=20`

필터는 모두 선택이며 함께 주면 AND. 정렬 occurredAt DESC,id DESC 고정. from/to는 오프셋 포함 ISO-8601, [from,to). 프론트 날짜 선택은 시작일 서울00:00부터 종료일 다음날 서울00:00까지로 변환한다.
200:
```json
{
 "content":[{
  "id":20,"occurredAt":"2026-10-16T10:01:00+09:00",
  "actor":{"id":2,"employeeNo":"ADMIN001","name":"가상관리자"},
  "action":"EMPLOYEE_UPDATE","targetType":"EMPLOYEE","targetId":1,
  "targetLabel":"가상사원001","success":true,
  "before":{"name":"가상사원001","status":"ACTIVE"},
  "after":{"name":"가상사원001","status":"ON_LEAVE"},
  "metadata":{}
 }],
 "page":0,"size":20,"totalElements":1,"totalPages":1
}
```
예시 스냅샷은 구조 설명용이며 실제 스냅샷은 아래 허용 필드를 담는다.
오류: 400 VALIDATION_ERROR(필터/날짜/페이지),401 UNAUTHORIZED,403 FORBIDDEN.

### action 및 metadata
| action | targetType | metadata 계약 |
| --- | --- | --- |
| LOGIN_SUCCESS | null | {} |
| LOGIN_FAILURE | null | reason: BAD_CREDENTIALS 또는 DISABLED |
| EMPLOYEE_CREATE | EMPLOYEE | 가져오기 생성에만 source=IMPORT |
| EMPLOYEE_UPDATE | EMPLOYEE | 추가 필드 없음 |
| EMPLOYEE_RETIRE | EMPLOYEE | 추가 필드 없음 |
| APPOINTMENT_CREATE | EMPLOYEE | appointmentId |
| DEPARTMENT_CREATE/UPDATE/DELETE | DEPARTMENT | 추가 필드 없음 |
| POSITION_CREATE/UPDATE/DELETE | POSITION | 추가 필드 없음 |
| EMPLOYEE_IMPORT | EMPLOYEE | 성공 importedCount, 실패 code/errorCount |
| EMPLOYEE_EXPORT | EMPLOYEE | format,rowCount,filters:{keyword,departmentId,positionId,status,sort} |

로그인 실패 시 기존 계정이면 actor를 기록하고, 계정이 없으면 null이다. 없는 계정의 입력 loginId 원문은 저장하지 않는다. 사용자 응답은 두 경우 모두 기존 401이며 계정 존재를 드러내지 않는다.
생성 before=null, 삭제 after=null, 로그인·내보내기 before/after=null. 성공 변경과 감사는 같은 트랜잭션, 실패 로그인/가져오기는 별도 트랜잭션이다. 감사 수정/삭제 API 없음.

## 추가 확정 사항()

- 압축 해제 실제 총합20MiB, 개별 ZIP 엔트리10MiB 제한. 초과·손상·암호화는400 IMPORT_INVALID_FILE.
- 데이터0행/1000행 초과는400 IMPORT_INVALID_FILE. 완전히 빈 행은 건너뛰지만 실제 Excel 행 번호는 유지한다.
- 사번/날짜/비밀번호는 문자열 셀 필수. 숫자 또는 날짜 셀을 자동변환하지 않으며 해당 행·필드의 rowErrors에 '문자열 서식 필요'를 반환한다. 부서·직급ID는 양의 정수 숫자셀 또는 정수문자열, 나머지는 문자열이다. 공백을 자동 제거하지 않는다.
- 파일 내부 중복은 employee 열의 실제 MySQL collation 기준으로 DB에서 비교한다. 단순 소문자화로 대신하지 않는다.
- export format 생략/미지원은400 VALIDATION_ERROR.
- 발령 from/toPosition.level 및 createdBy.name도 당시 스냅샷이다.
- 감사 actor는 당시 사원id/employeeNo/name 스냅샷이다. 로그인은 targetType/targetId/targetLabel=null. IMPORT/EXPORT는 targetType=EMPLOYEE,targetId/targetLabel=null, before/after=null.
- before/after 허용 필드: 사원은 id,employeeNo,name,email,phone,hireDate,status,retireDate,department{id,name},position{id,name,level},role. 부서는 id,name,description. 직급은 id,name,level. 비밀번호·해시·JWT·업로드 원문은 제외한다.
- metadata는 위 action 표의 허용 키만 기록하며 추가 필드가 없는 경우 {}. EXPORT filters.keyword는 최대100자로 잘라 저장한다. 다른 필터 키는 departmentId,positionId,status,sort다.
- 감사 from/to 역전은400 VALIDATION_ERROR. 파일 전체 오류의 실패 감사 errorCount=1, 행 오류는 rowErrors 항목 수다.
