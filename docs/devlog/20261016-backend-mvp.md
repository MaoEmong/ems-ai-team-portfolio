# 2026-10-16 백엔드 MVP 개발일지

## 받은 지시
개발 범위: 확정 MVP API 계약을 먼저 상세화하고 backend, Compose MySQL/backend, Flyway·시드, JWT·권한, 사원/부서/직급 CRUD, 테스트, ADR 3건과 실행 안내를 작성한다. 공통 문서·frontend 코드는 수정하지 않으며 Git 커밋은 문서QA가 수행한다.

## 계약 확인과 판단 주체
- Codex가 모호한 권한·HTTP 상태·퇴사 재요청 의미를 설계 검토에서 확인했다.
- 확정 정책: EMPLOYEE도 부서·직급 목록 가능, 사원 데이터만 본인 조회 제한. 생성 201+객체, 수정/퇴사 200+객체, 삭제 204.
- Codex의 퇴사자 수정/중복 퇴사 400 제안은 채택하지 않고 설계 검토에서 409 EMPLOYEE_RETIRED로 결정했다. 날짜 입력 오류는 400 유지.
- 사용자 실제 결정은 기존 요구사항과 킥오프에 근거하며 구현상의 AI 판단을 사람 검수로 표현하지 않는다.

## 수행 내용
- docs/api/mvp-api.md: 모든 엔드포인트의 권한·요청/응답 예시·오류 코드와 설계 검토 결과 반영.
- Spring Boot 3.5.6, Java 21, Gradle 8.14.3 Wrapper. Java 17+ 요구와 설치된 Java 21을 근거로 21 선택.
- 사원/부서/직급/계정 JPA, Flyway V1 제약·인덱스와 부서/직급 시드. 환경변수 관리자 및 합성 사원 30명은 시작 시 트랜잭션으로 생성.
- BCrypt 해시, JWT 3600초, issuer·서명·만료 검증, 매 요청 DB enabled/role 확인, CORS.
- 검색·필터·정렬·페이징, 사원 등록/수정/퇴사, 중복 제약과 공통 오류, 참조 중인 부서/직급 삭제 거부.
- 트랜잭션과 행 잠금으로 퇴사/수정 및 참조 대상 삭제 경쟁 보호. DB 유일·외래키 제약을 최종 방어로 유지.
- Docker Compose와 multi-stage/non-root 백엔드 이미지, 실행 README, ADR 0100~0102.
- 서비스/보안 MVC 테스트와 실제 MySQL Testcontainers 시나리오. Compose 스모크 스크립트는 비밀값을 출력하지 않으며 생성 파일은 backend/build 아래 Git 제외 경로에 둔다.

## AI 제안 채택·수정 근거
- JWT 역할 클레임만 신뢰하는 방식은 퇴사 차단 요구와 맞지 않아 사용하지 않았다. DB 활성·역할 조회 채택.
- 스키마 자동 update 대신 Flyway + JPA validate: 재현성과 이력 확보.
- 관리자 비밀번호를 SQL에 고정하지 않고 환경변수 기반 BCrypt 시드로 분리. 재시작 시 비밀번호 리셋 방지.
- 데모 사원은 출력하지 않는 임의 비밀번호 해시로 생성. 일반 계정 로그인 시연은 관리자 API로 생성해 initialPassword를 지정한다.
- 제품 LLM 연동은 이번 단계에 포함하지 않았다. 이 작업은 Codex 개발 활동이며 Claude API/Ollama 호출 증거가 아니다.

## 문제와 해결
1. 기본 셸이 CreateProcessWithLogonW 1326으로 실행되지 않음. 승인된 외부 실행 경로로 읽기·빌드·Docker 검증 수행.
2. 첫 compileJava에서 Employee 필드를 record 접근자처럼 호출한 오타 발견. e.hireDate 접근으로 수정.
3. 테스트 컴파일에서 JpaRepository/JpaSpecificationExecutor의 delete 오버로드가 any()와 모호함. any(Employee.class)로 수정.
4. Docker 엔진 미기동. 승인 후 Docker Desktop 백그라운드 시작.
5. Testcontainers 1.21.3이 Docker 29.4.0에 HTTP 400으로 연결 실패. 공식 릴리스 근거로 1.21.4로 올린 후 MySQL 테스트 통과. [공식 릴리스](https://github.com/testcontainers/testcontainers-java/releases/tag/1.21.4)
6. 서로 다른 실행 계정 때문에 Git dubious ownership 발생. 전역 설정을 변경하지 않고 읽기 명령에만 git -c safe.directory=E:/portfolio/ems 사용. 커밋하지 않음.

## 검증 결과
| 실행 명령/항목 | 결과 |
| --- | --- |
| Gradle 8.14.3 wrapper --gradle-version 8.14.3 compileJava | Wrapper 생성, 초기 컴파일 오타 발견 후 수정 |
| .\\gradlew.bat test bootJar | 초기 테스트 컴파일 오버로드 오류 수정; JAR 생성 성공 |
| .\\gradlew.bat test integrationTest bootJar --console=plain | Testcontainers 1.21.4 적용 후 BUILD SUCCESSFUL (1m 8s) |
| 서비스/컨트롤러 테스트 | 최초 14개 통과 후 JWT 만료·잘못된 토큰/비활성 계정 테스트 2개 추가. .\\gradlew.bat test 최종 16개 통과, 실패/스킵 0 (10s) |
| MySqlIntegrationTest | 1개 통합 시나리오 통과, 실패/스킵 0; MySQL 8.0 실제 컨테이너 |
| .\\compose-smoke.ps1 | multi-stage 이미지 빌드 성공, MySQL healthy 및 backend Up, 실제 HTTP 관리자 로그인 후 COMPOSE_SMOKE_PASS employees=31 departments=3 positions=3 |

MySQL 통합 시나리오: Flyway/JPA 검증 및 31명 시드, BCrypt, 관리자 로그인/오류, 사원 등록·조회·수정·퇴사, 일반 사원 본인/타인/목록/변경 권한, 부서·직급 조회 예외, 중복 사번/이메일, 검색·필터, 날짜 오류, 기존 토큰 차단, 퇴사자 수정/재퇴사 409, 퇴사자 참조 삭제 409, 빈 부서·직급 삭제 204.

로그·문서에 실제 비밀값/JWT를 복사하지 않는다. 테스트 리포트 위치는 backend/build/reports/tests/{test,integrationTest}/index.html. 백엔드 검증에 미실행 항목은 없다. 단계 전체 완료 판정이나 프론트 통합 검수는 별도 문서QA 작업이다.

## 인계
- 공통 .env.example에 ADMIN_LOGIN_ID를 추가하고 JWT_SECRET 최소 길이(UTF-8 32바이트)를 반영하도록 문서QA에 전달했다. 해당 공통 파일은 수정하지 않았다.
- Compose frontend는 요구대로 주석 자리로 유지했다. 당시 구현의 완료 조건은 mysql/backend 두 서비스이며 프론트 통합은 별도 작업으로 확정했다. 현재 프론트 파일 유무와 무관하게 프론트 계약이 확정된 뒤 통합한다.
- 같은 답변에 따라 backend/README.md에 환경변수 키·제약·교체용 예시를 추가했다. 공통 .env.example은 수정하지 않았다. MySQL 통합 테스트는 실제 실행·통과이며 미실행으로 분류하지 않는다.
- Git 커밋/스테이징은 수행하지 않았다. 문서QA가 Unix 환경에서 backend/gradlew 실행 비트(100755)를 함께 확인해 통합 커밋해야 한다.
- 검증용 Compose 프로젝트 이름은 ems-backend-smoke이며 생성한 환경파일은 Git 제외 backend/build/compose-smoke.env에 있다. 종료 시 down만 사용해 검증용 볼륨을 삭제하지 않는다.
