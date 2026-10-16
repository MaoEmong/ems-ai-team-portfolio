# 2026-10-16 백엔드 2단계
## 받은 지시
설계 검토 검증 작업: 확정 API 상세 문서를 먼저 작성하고 대시보드·발령·엑셀·감사를 구현한다. V1 보존, V2 마이그레이션, MVP 회귀 및 MySQL 검증, DOC-01, ADR0103~0105가 범위다. frontend/공통문서/Git 커밋 금지.
## 계약 확정
phase2-api.md를 먼저 작성했다. 계약에 없던 ZIP 해제 한도, 셀 형식, 참조 시트/파일명, 빈 행/1000행 초과, MySQL 중복 비교, 감사 허용 필드·metadata·target·errorCount를 으로 질문했다. 설계 검토에서 권장안을 승인하고 사번/날짜/비밀번호의 숫자셀은 '문자열 서식 필요'로 거절, 양식 텍스트 서식, keyword 감사100자 제한을 추가했다. 문서의 미정 표시를 제거하고 구현에 반영했다.
## 수행 내용
- 담당이 V2 발령/감사 테이블과 인덱스, DB 트랜잭션, 대시보드·발령·감사 API, 파일 DB 검증/가져오기·내보내기 경계를 구현.
- Codex 구현 담당 엑셀처리담당()에 SheetCodec.java/SheetCodecTest.java 및 별도 일지만 맡김. 기존 파일과 같은 파일을 동시에 편집하지 않으며 담당만 빌드·테스트 실행.
- 사원 PUT 선택 조직 필드, APPOINTMENT_REQUIRED, 발령일·입퇴사일 정합성, 참조 이력 삭제 거부 반영.
- 성공 업무+감사 단일 트랜잭션, 실패 로그인·롤백 후 실패 가져오기 별도 트랜잭션.
- 신규 DB와 V1 데이터 유지 업그레이드, 기존 MVP 회귀 및 2단계 통합 테스트 작성.
- DOC-01의 프론트 통합 예정 문구와 loopback 설명 수정. Compose3서비스와 frontend0.0.0.0:5173/mysql·backend127.0.0.1 바인딩을 명시.
## AI 판단과 근거
사용자가 요구한 전부 취소와 설계 검토에서 정한 PUT 호환 정책을 우선했다. 단순 소문자 비교는 MySQL 악센트/공백 의미와 다를 수 있어 실제 collation DB 비교를 택했다. 엔티티 통째 감사 직렬화는 비밀값 유출 우려 때문에 응답 DTO 허용 필드만 사용한다. 배우지 않은 과거 발령/과거 조직 분포는 생성하지 않는다. 구현 판단은 Codex 작업이며 사람 검수로 표현하지 않는다.
## 문제와 해결
기본 실행 및 파일 편집 도구에서 Windows CreateProcessWithLogonW1326이 재발하여 승인된 외부 실행으로 작업했다. 명령과 결과는 아래 확정 기록으로 보완한다.
## 검증
환경: Windows PowerShell, Java 21, Gradle 8.14.3, Docker 29.4.0, MySQL 8.0. 모든 명령은 backend/ 또는 명시된 프로젝트 루트에서 실행했다.

| 실행 명령 | 실제 결과 |
| --- | --- |
| backend: .\\gradlew.bat test integrationTest bootJar (첫 실행) | 컴파일/bootJar 성공. 당시 단위 46개 중 1개 실패로 통합 작업 중단. ZIP 테스트 정상 대조 파일의 OPC 콘텐츠 타입 누락으로 확인. |
| backend: .\\gradlew.bat integrationTest (첫 실행) | 당시 12개 중 2개 실패. 실패 주입용 Mockito 설정이 MANDATORY 트랜잭션 프록시를 호출하는 테스트 구성 문제였다. |
| backend: .\\gradlew.bat integrationTest (수정 후) | 14개 통과: Phase2MySqlTest 12, MigrationUpgradeTest 1, 기존 MVP MySqlIntegrationTest 1. 실패/오류 0. |
| backend: .\\gradlew.bat test bootJar (최종) | 단위·컨트롤러 49개 통과, 실패/오류 0. bootJar 성공. SheetCodecTest 27개 포함. |
| 루트: docker compose --project-name ems-backend-smoke --env-file backend/build/compose-smoke.env up --build -d | mysql/backend/frontend 모두 빌드·기동 성공. mysql healthy. |
| 루트: py -3 backend/build/phase2-http-smoke.py | 실제 HTTP 검증 통과. 아래 시나리오 참조. |
| PowerShell Invoke-WebRequest: localhost:5173 및 8080 import OPTIONS | 프론트 200, CORS 프리플라이트 200, 허용 Origin http://localhost:5173 확인. |
| Compose backend 로그 확인 | 유지 볼륨의 V1을 V2로 마이그레이션 1건 성공. 새 DB와 V1 데이터 보존 경로는 별도 MySQL 테스트에서도 통과. |
| 루트: docker compose --project-name ems-backend-smoke --env-file backend/build/compose-smoke.env down | 세 컨테이너와 전용 네트워크 종료·제거. -v를 사용하지 않아 볼륨과 합성 검증 데이터 유지. |
| 담당 backend/API/ADR/일지 대상 git diff --check | 공백 오류 없음. Windows CRLF 변환 안내만 출력. V1 변경 없음. |

실제 HTTP 확인: 대시보드 200/서울 날짜/12개월, 발령 201·이력 1건·감사 1건, PUT 우회 409 APPOINTMENT_REQUIRED, CSV BOM·검색 조건·page/size 무시·Content-Disposition 노출, 업로드 양식 200, 중간 오류 행 번호 3·전체 취소·조회 0건, 정상 2행 가져오기 201·조회 2건, 실제 multipart 5MiB 초과 413 FILE_TOO_LARGE.

MySQL 통합 확인: 발령 및 가져오기 후반 실패를 강제로 발생시켜 사원·계정·이력·성공 감사 롤백과 실패 감사 1건을 검증했다. 실제 DB collation의 대소문자/악센트 중복, 본인/타인·ADMIN 권한, 날짜 경계·빈 달·미래 제외, 이력 참조 삭제 거절, 감사 허용 필드·필터·시각 범위, 기존 MVP도 확인했다.

실패와 수정 근거: ZIP 정상 대조 파일에 entryN.bin의 application/octet-stream 콘텐츠 타입을 추가한 것은 테스트 데이터 수정이며 운영 코덱을 완화하지 않았다. 트랜잭션 실패 주입은 AopTestUtils로 실제 대상 객체에 Mockito 설정을 적용했다. Windows python 명령은 Store 별칭으로 실행되지 않아 설치된 py -3 런처를 사용했다. 비밀번호·토큰·환경 파일 내용은 출력하거나 문서에 기록하지 않았다. 외부 실행 승인을 기다린 시간은 테스트 실행 시간과 구분한다.

## 검수 인계
API 상세 문서, ADR 0103~0105, DOC-01 수정과 백엔드 검증은 완료했다. 프론트 2단계 브라우저 시나리오·스크린샷·Claude 디자인 검수는 이번 백엔드 실행에서 미실행이며 프론트/문서QA 통합 검수 대상이다. HTTP 통과를 브라우저 통과로 표현하지 않는다. frontend/공통 문서/Git 커밋은 수정·수행하지 않았다. Compose 파일은 기존 3서비스 설정으로 검증되어 추가 수정하지 않았다.
