# 1단계 종료·2단계 착수 회의 — 2026-10-16

참석: 설계 검토(Claude, 의장), 백엔드·프론트·문서QA 담당(Codex). 두 차례 의견 수렴 후 의장 결정. 작업 기록 ``, 확정 근거 검증 작업 전달 회의록.

## 1단계 회고

실제 Compose·Chromium·MySQL 20개 시나리오 PASS, 당시 검수 범위의 기능 결함 0건. 프론트 자체 완료 시점의 실제 연동 미실행과 이후 QA 통과는 서로 다른 시점의 기록입니다. 계약 선확정, 코드 소유권 분리, 목업 기반 병행 개발, 실제 검수 분리와 미실행 명시를 유지합니다. 개발 세션 중단, Windows 실행 계정·Docker 권한, Docker 29/Testcontainers 호환 문제는 재현·해결 근거로 남깁니다. 유지 볼륨은 기준값·증감으로 검수하며 31명은 새 빈 DB 시드에만 적용합니다. DOC-01은 백엔드 수정 후 QA 재확인으로 종료합니다.

## 사용자 결정과 엔진 배분

사용자의 "확인사항은 권장으로가자"에 따라 조직 변경은 발령만, 오류 있는 일괄 등록은 전부 취소, 일반 사원은 본인 이력 조회만 허용합니다. 사용자의 "코덱스가 코딩작업은 잘한다고 생각하지만 디자인 작업은 다른 ai가 낫다고 생각하거든 / 물론 이미지 생성은 코덱스가 좋긴 해"라는 설명을 근거로 설계 검토에서는 Claude 디자이너의 디자인·이미지 검수와 Codex 구현·테스트를 분담했습니다. 이미지 생성은 필요할 때만 Codex가 담당합니다. 효과는 실제 전후 화면과 피드백·반영 기록으로만 설명합니다.

## 주요 쟁점 결정

- 사원 PUT의 departmentId/positionId는 선택입니다. 생략/null/현재와 같은 값은 유지, 다른 값은 409 APPOINTMENT_REQUIRED. 프론트는 읽기 전용 표시와 필드 생략, POST에서는 필수입니다. 2차 QA의 기존 값 전송 제안 대신 이 최종안을 채택했습니다.
- 동시 발령은 사원 행 잠금 후 DB의 전 값을 읽어 직렬 처리합니다. 오래된 화면 자동 충돌 감지는 범위 밖입니다.
- 발령일은 입사일 이상·서울 오늘 이하·직전 발령일 이상. 같은 날은 ID로 구분합니다. 날짜 위반/변경 없음/사유 누락은 400, 퇴사자는 409 EMPLOYEE_RETIRED. hireDate를 최초 발령일 이후로 또는 retireDate를 마지막 발령일 이전으로 변경하면 400입니다.
- 과거 발령·조직 분포·월말 인원은 추정하지 않습니다. 발령 참조 부서·직급 삭제도 기존 IN_USE 409입니다.
- 가져오기 성공은 IMPORT 1건과 사원별 CREATE(source=IMPORT)를 업무와 같은 트랜잭션에 기록합니다. 실패는 업무 0건 및 별도 트랜잭션의 실패 IMPORT 1건(code,errorCount)입니다.
- 로그인 실패 시 기존 계정은 actorId, 없는 계정은 null이며 없는 계정 loginId 원문을 남기지 않습니다. reason은 BAD_CREDENTIALS/DISABLED, 사용자 응답은 구분 없는 401입니다.

## 확정 API와 검증 기준

상세 필드·예시와 후속 승인()은 [2단계 API](../api/phase2-api.md)를 참조합니다. 공통 `/api/v1`, 기존 페이지·오류·날짜 형식을 유지합니다. 아래는 모두 ADMIN이며 이력 GET만 본인에게도 허용합니다.

| 기능 | 계약 |
| --- | --- |
| GET /dashboard | 서울 asOfDate, 현재 ACTIVE+ON_LEAVE 및 현재 조직 분포, 이번 달 입퇴사, 이번 달 포함 12개월 입퇴사·빈 달 0·오래된 순. 날짜 집계는 오늘까지, 미래 날짜 제외. 상태 집계와 날짜 집계는 구분. |
| POST /employees/{id}/appointments | effectiveDate, departmentId, positionId, reason(1~200). 201, 소속·이력·감사 원자적 저장. 이름·직급 level·작성자 스냅샷. |
| GET /employees/{id}/appointments | ADMIN 또는 본인, 페이지, effectiveDate DESC/id DESC. |
| GET /employees/export | xlsx/csv, 전체 검색·필터·정렬 결과, page/size 무시, 10,000행 초과 400 EXPORT_LIMIT_EXCEEDED. 비밀번호 제외. |
| GET /employees/import-template | employees 및 부서·직급 참조 시트. 사번·날짜·초기 비밀번호 텍스트 형식. |
| POST /employees/import | multipart file, xlsx, 5MiB/1000행, 오류 시 전체 취소. 201 importedCount. 실제 Excel 행 번호 rowErrors. |
| GET /audit-logs | actor/target/action/success/기간 필터, occurredAt DESC/id DESC, 시간 [from,to). 수정·삭제 API 없음. |

내보내기 열은 employeeNo,name,email,phone,hireDate,status,retireDate,departmentName,positionName,role. xlsx 모든 셀 문자열, CSV UTF-8 BOM 및 =,+,-,@,탭,CR 시작 값의 앞에 작은따옴표. 파일명 ems-employees-YYYYMMDD.확장자, filename*=UTF-8'' 및 Content-Disposition CORS 노출.

가져오기 employees 헤더는 employeeNo,name,email,phone,hireDate,departmentId,positionId,role,initialPassword. 앞자리 0 유지, 날짜 YYYY-MM-DD 문자열, ACTIVE 생성, 수식 거부. 400 IMPORT_VALIDATION_ERROR+rowErrors, 413 FILE_TOO_LARGE, 400 IMPORT_INVALID_FILE, 동시 DB 충돌은 409 IMPORT_CONFLICT로 파일 전체 오류이며 행 번호를 지어내지 않습니다. 입력 원문·비밀번호는 오류·감사·내보내기에 포함하지 않습니다.

감사 성공 변경은 업무와 같은 트랜잭션, 실패 로그인/가져오기는 별도 트랜잭션입니다. 생성 before=null, 삭제 after=null, 로그인/내보내기 둘 다 null. 전후 허용 필드와 metadata만 기록합니다. 내보내기 성공은 서버 파일 생성 성공입니다. 프론트 날짜는 서울 시작일 00:00부터 종료일 다음 날 00:00까지로 변환합니다.

## 소유권과 순서

백엔드는 backend/Compose/상세 API/V2 이후 마이그레이션/ADR0103~/DOC-01, 프론트는 frontend/docs/design/ADR0202~를 담당합니다. V1은 변경 금지입니다. 프론트는 Claude 디자인→Codex 구현→Claude 스크린샷 검수→반영이며 관리자 첫 화면은 대시보드, 일반 사원은 내 정보입니다. 문서QA는 공통 문서·ADR0002·실제 검수·커밋을 맡습니다. 계약 기반 병행 구현을 두 팀이 완료한 뒤 QA가 통합합니다. 계약 변경과 팀 간 질문은 설계 검토을 통합니다.
