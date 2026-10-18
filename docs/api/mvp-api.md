# MVP API 상세 계약

확정 근거: 2026-10-16 초기 설계 검토 및 API 정책 확인. 구현 대상 계약이며 검증 결과는 백엔드 개발일지를 참조한다.

## 공통

- Base `/api/v1`, JSON, `Authorization: Bearer <accessToken>`.
- 인증 없는 요청/만료/비활성 계정은 401. 권한 부족은 403. ADMIN은 관리 권한, EMPLOYEE는 자신의 사원 상세 및 `/auth/me`, 부서·직급 목록 조회만 가능하다.
- 날짜 `YYYY-MM-DD`, 시각을 제공할 경우 ISO-8601 오프셋 포함 Asia/Seoul. 현재 DTO에는 날짜만 있다.
- 성공: 생성 201 + 객체와 Location, 조회·수정·퇴사 200, 삭제 204(본문 없음).
- 로그인 ID는 employeeNo. ADMIN 시드 ID와 비밀번호는 `ADMIN_LOGIN_ID`, `ADMIN_INITIAL_PASSWORD` 환경변수로 지정한다. 비밀번호/해시는 응답하지 않는다.
- page 기본 0, size 기본 20·최대 100, sort 기본 `employeeNo,asc`; employeeNo/name/hireDate 및 asc/desc만 허용. 잘못된 값은 400.
- 요청 문자열/날짜/enum 형식 및 필수값 오류는 400. 알 수 없는 리소스는 404.

## 응답 객체 예시

`User` (id는 계정 ID가 아닌 사원 ID):
```json
{"id":1,"employeeNo":"DEMO001","name":"가상사원001","role":"EMPLOYEE"}
```

`Employee`:
```json
{"id":1,"employeeNo":"DEMO001","name":"가상사원001","email":"demo001@example.invalid","phone":"000-0000-0001","hireDate":"2026-01-01","status":"ACTIVE","retireDate":null,"department":{"id":1,"name":"가상개발부"},"position":{"id":1,"name":"가상사원","level":1},"role":"EMPLOYEE"}
```

`Department`: `{"id":1,"name":"가상개발부","description":"합성 데모 부서"}`

`Position`: `{"id":1,"name":"가상사원","level":1}`

## 인증

### POST /auth/login — 공개

요청: `{"loginId":"DEMO001","password":"<설정한 비밀번호>"}`

200 응답:
```json
{"accessToken":"<JWT>","tokenType":"Bearer","expiresIn":3600,"user":{"id":1,"employeeNo":"DEMO001","name":"가상사원001","role":"EMPLOYEE"}}
```
오류: 400 VALIDATION_ERROR, 401 UNAUTHORIZED(없는 계정/비밀번호 불일치/비활성 계정). JWT 유효기간 1시간, refresh 없음.

### GET /auth/me — 인증 사용자

요청 본문 없음. 200 응답은 위 User 예시. 오류 401 UNAUTHORIZED.

## 사원

### GET /employees — ADMIN

요청 예: `/employees?keyword=DEMO&departmentId=1&positionId=1&status=ACTIVE&page=0&size=20&sort=hireDate,desc`

keyword는 이름·사번·이메일 부분 일치. 필터를 동시에 주면 AND 조건. status 생략 시 RETIRED 제외, 명시 시 해당 상태만 조회. status는 ACTIVE/ON_LEAVE/RETIRED.

200 응답 예(각 content 원소는 전체 Employee 객체):
```json
{"content":[{"id":1,"employeeNo":"DEMO001","name":"가상사원001","email":"demo001@example.invalid","phone":"000-0000-0001","hireDate":"2026-01-01","status":"ACTIVE","retireDate":null,"department":{"id":1,"name":"가상개발부"},"position":{"id":1,"name":"가상사원","level":1},"role":"EMPLOYEE"}],"page":0,"size":20,"totalElements":1,"totalPages":1}
```
빈 결과: `{"content":[],"page":0,"size":20,"totalElements":0,"totalPages":0}`. 오류 400 VALIDATION_ERROR, 401 UNAUTHORIZED, 403 FORBIDDEN.

### GET /employees/{id} — ADMIN 또는 본인

요청 예 `/employees/1`, 본문 없음. 200 응답은 전체 Employee 예시. 오류 401 UNAUTHORIZED, 403 FORBIDDEN(타인 조회), 404 NOT_FOUND.

### POST /employees — ADMIN

요청:
```json
{"employeeNo":"DEMO001","name":"가상사원001","email":"demo001@example.invalid","phone":"000-0000-0001","hireDate":"2026-01-01","departmentId":1,"positionId":1,"role":"EMPLOYEE","initialPassword":"<초기 비밀번호>"}
```
201 응답은 전체 Employee 예시(status=ACTIVE, retireDate=null), Location `/api/v1/employees/1`. 계정 enabled=true, BCrypt 저장.
오류 400 VALIDATION_ERROR, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND(부서/직급), 409 DUPLICATE_EMPLOYEE_NO 또는 DUPLICATE_EMAIL. 퇴사 사번도 재사용 불가.

### PUT /employees/{id} — ADMIN

요청:
```json
{"name":"가상사원001","email":"demo001@example.invalid","phone":"000-0000-0001","hireDate":"2026-01-01","status":"ON_LEAVE","departmentId":1,"positionId":1,"role":"EMPLOYEE"}
```
200 응답은 전체 Employee 예시에서 status가 ON_LEAVE인 객체. employeeNo는 변경 불가, 상태 입력은 ACTIVE/ON_LEAVE만 허용.
2단계 변경: departmentId/positionId는 선택 입력이다. 생략/null은 현재 값 유지, 동일 값은 허용, 다른 값이면 409 APPOINTMENT_REQUIRED. 프론트는 두 필드를 생략한다. hireDate는 최초 발령일 이후로 변경할 수 없다(400). 상세 규칙과 발령 API는 [2단계 계약](phase2-api.md)을 따른다.
오류 400 VALIDATION_ERROR, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 DUPLICATE_EMAIL / EMPLOYEE_RETIRED / APPOINTMENT_REQUIRED.

### POST /employees/{id}/retire — ADMIN

요청 `{"retireDate":"2026-10-16"}`. 200 응답은 전체 Employee 예시에서 status=RETIRED, retireDate=2026-10-16인 객체. 계정 비활성화, 기존 JWT도 다음 요청부터 401. 사원 물리 삭제 API 없음.
오류 400 VALIDATION_ERROR(누락/형식/입사일 이전; fieldErrors.field=retireDate), 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 EMPLOYEE_RETIRED(중복 퇴사).

## 부서

| 엔드포인트 | 권한 | 요청 예시 | 성공 응답 예시 | 오류 |
| --- | --- | --- | --- | --- |
| GET /departments | 인증 사용자 | 본문 없음 | 200 `[{"id":1,"name":"가상개발부","description":"합성 데모 부서"}]` | 401 |
| POST /departments | ADMIN | `{"name":"가상개발부","description":"합성 데모 부서"}` | 201 `{"id":1,"name":"가상개발부","description":"합성 데모 부서"}` + Location | 400,401,403,409 DUPLICATE_NAME |
| PUT /departments/1 | ADMIN | `{"name":"가상연구부","description":"변경 설명"}` | 200 `{"id":1,"name":"가상연구부","description":"변경 설명"}` | 400,401,403,404,409 DUPLICATE_NAME |
| DELETE /departments/1 | ADMIN | 본문 없음 | 204 본문 없음 | 401,403,404,409 DEPARTMENT_IN_USE |

description은 생략/null 가능. 목록은 이름순. 삭제 시 퇴사자 포함 소속 사원이 있으면 거절한다.

## 직급

| 엔드포인트 | 권한 | 요청 예시 | 성공 응답 예시 | 오류 |
| --- | --- | --- | --- | --- |
| GET /positions | 인증 사용자 | 본문 없음 | 200 `[{"id":1,"name":"가상사원","level":1}]` | 401 |
| POST /positions | ADMIN | `{"name":"가상사원","level":1}` | 201 `{"id":1,"name":"가상사원","level":1}` + Location | 400,401,403,409 DUPLICATE_NAME |
| PUT /positions/1 | ADMIN | `{"name":"가상대리","level":2}` | 200 `{"id":1,"name":"가상대리","level":2}` | 400,401,403,404,409 DUPLICATE_NAME |
| DELETE /positions/1 | ADMIN | 본문 없음 | 204 본문 없음 | 401,403,404,409 POSITION_IN_USE |

level은 필수 정수. 목록은 level,id순. 삭제 시 퇴사자 포함 참조 사원이 있으면 거절한다.

## 오류 공통 예시

```json
{"code":"VALIDATION_ERROR","message":"입력값을 확인해 주세요.","fieldErrors":[{"field":"retireDate","reason":"입사일 이전일 수 없습니다."}]}
```
```json
{"code":"EMPLOYEE_RETIRED","message":"퇴사한 사원은 변경할 수 없습니다.","fieldErrors":[]}
```
| HTTP | code | 의미 |
| --- | --- | --- |
| 400 | VALIDATION_ERROR | 필수값·길이·형식·날짜·쿼리 검증 실패 |
| 401 | UNAUTHORIZED | 인증 실패·토큰 만료/변조·계정 비활성 |
| 403 | FORBIDDEN | 역할 또는 본인 접근 권한 부족 |
| 404 | NOT_FOUND | 리소스 없음 |
| 409 | DUPLICATE_EMPLOYEE_NO | 사번 중복(퇴사자 포함) |
| 409 | DUPLICATE_EMAIL | 이메일 중복 |
| 409 | DUPLICATE_NAME | 부서 또는 직급 이름 중복 |
| 409 | DEPARTMENT_IN_USE | 부서 소속 사원 존재 |
| 409 | POSITION_IN_USE | 직급 참조 사원 존재 |
| 409 | EMPLOYEE_RETIRED | 퇴사 사원 수정·중복 퇴사 |

모든 오류는 위 객체 형식이며 필드별 오류가 없으면 fieldErrors=[]이다. message/reason은 표시용 문자열이며 클라이언트 분기는 code를 기준으로 한다. 문자열 상한은 사번 50, 이름 100, 이메일 254, 전화 30, 설명 500자이다. 비밀번호는 필수이고 BCrypt 입력 한계인 UTF-8 72바이트를 초과할 수 없다.
