# EMS 백엔드

Spring Boot 3.5.6, Java 21(요구사항 Java 17+), Gradle 8.14.3, JPA, Spring Security JWT, MySQL 8, Flyway.

## 실행
프로젝트 루트 ems에서 .env.example을 .env로 복사한 뒤 로컬 값으로 바꾼다. 공통 .env.example은 문서QA 소유이며 아래 변수를 취합해야 한다.

| 변수 | 의미 |
| --- | --- |
| DB_NAME | DB 이름, 기본 ems |
| DB_USERNAME / DB_PASSWORD | MySQL 애플리케이션 계정 |
| DB_ROOT_PASSWORD | Compose MySQL root 비밀번호 |
| DB_HOST / DB_PORT | 로컬 bootRun은 localhost / 3306; Compose는 mysql / 3306 |
| JWT_SECRET | 최소 32 UTF-8 바이트의 충분히 무작위인 로컬 비밀값 |
| ADMIN_LOGIN_ID | 초기 관리자 사번 겸 로그인 ID, 필수, DEMO### 제외 |
| ADMIN_INITIAL_PASSWORD | 초기 관리자 비밀번호, 필수, UTF-8 72바이트 이하 |
| SEED_ENABLED | 선택, 기본 true; false면 관리자/사원 런타임 시드 생략 |

환경변수 형식 예시(실제 비밀값이 아니며 비밀번호·JWT 값은 로컬에서 생성한 값으로 교체):
```dotenv
DB_HOST=localhost
DB_PORT=3306
DB_NAME=ems
DB_USERNAME=ems_local
DB_PASSWORD=<local-db-password>
DB_ROOT_PASSWORD=<local-root-password>
ADMIN_LOGIN_ID=ADMIN001
ADMIN_INITIAL_PASSWORD=<local-admin-password>
JWT_SECRET=<random-secret-at-least-32-UTF8-bytes>
SEED_ENABLED=true
```

ADMIN_LOGIN_ID는 최대 50자이며 합성 사원에 쓰는 DEMO### 형식은 제외한다. ADMIN_INITIAL_PASSWORD는 공백만으로 구성할 수 없으며 UTF-8 72바이트 이하다. 예시의 꺾쇠괄호 값은 실행 전에 반드시 교체한다. 공통 .env.example 취합은 문서QA가 담당한다.

```sh
docker compose up --build -d
docker compose logs backend
```

Compose는 mysql/backend/frontend 세 서비스를 시작한다. 프론트 http://localhost:5173, 백엔드 http://localhost:8080/api/v1, MySQL localhost:3306. frontend는 0.0.0.0:5173(IPv6에서는 [::]:5173에도 노출), mysql과 backend는 127.0.0.1:3306/8080 loopback 바인딩이다. CORS는 http://localhost:5173만 허용하며 Content-Disposition을 노출한다. 프론트 VITE_API_URL=http://localhost:8080 및 VITE_MOCK_API=false는 빌드 인자이며 변경 후 다시 빌드해야 한다.

Flyway가 부서·직급과 스키마를 만들고 빈 employee 테이블에는 관리자 1명과 합성 사원 30명을 생성한다. 기존 DB 재시작 시 비밀번호를 재설정하지 않는다. 데모 사원은 알 수 없는 무작위 비밀번호로 생성되므로 로그인 시연용 사원은 관리자 API로 initialPassword를 지정해 생성한다. 환경변수나 토큰을 로그/커밋에 넣지 않는다.

로컬 실행은 Java 21을 설치하고 위 환경변수를 프로세스에 설정한 뒤 MySQL을 시작한다. Spring Boot가 .env 파일을 자동 로드하지는 않는다.
```sh
cd backend
./gradlew bootRun
```
Windows PowerShell에서는 .\gradlew.bat 사용.

## 테스트
```sh
./gradlew test
./gradlew integrationTest
./gradlew bootJar
```

test: Docker 없이 서비스 단위·보안 MVC 슬라이스 테스트. integrationTest: 실행 중인 Docker 엔진이 필요하며 mysql:8.0 Testcontainer와 별도 임시 DB를 사용한다. 이 작업은 Docker 부재를 성공/스킵으로 숨기지 않고 실패한다. 테스트의 고정 문자열은 격리된 테스트 전용 값이며 운영 자격증명이 아니다.

보고서: build/reports/tests/test/index.html 및 build/reports/tests/integrationTest/index.html. MySQL 통합 테스트는 실제 로그인→사원 생성→권한→수정→퇴사→기존 JWT 거부, 중복 제약, 부서/직급 CRUD와 참조 삭제 거부를 검증한다.

PowerShell에서 .\compose-smoke.ps1은 ems-backend-smoke 프로젝트로 실제 Compose 이미지를 빌드하고 로그인·현재 인원을 확인한다. 유지 볼륨에는 검수 데이터가 누적되므로 31명을 고정 기대하지 않는다. 포트 3306/8080/5173이 비어 있어야 한다. 임시 자격증명은 Git 제외 build/compose-smoke.env에 생성하고 재실행 시 재사용한다. 검증 후 프로젝트 루트에서 docker compose --project-name ems-backend-smoke --env-file backend/build/compose-smoke.env down으로 컨테이너를 종료한다(볼륨 유지).

API 계약: ../docs/api/mvp-api.md. 실행 결과 및 미실행 항목: ../docs/devlog/20261016-backend-mvp.md.

## 설계
외부 응답에는 DTO만 사용한다. 계정 비밀번호는 BCrypt로 저장하고 매 인증 요청에서 enabled와 role을 DB에서 확인한다. 사원 변경과 퇴사, 참조 부서/직급 삭제는 트랜잭션·행 잠금으로 보호한다. 스키마는 Flyway로만 변경하고 JPA는 validate로 검증한다. 현 MVP의 최대 페이지는 100이며 단순한 eager 관계 로딩을 사용한다. 감사·발령은 V2 마이그레이션과 같은 데이터소스의 JDBC로 저장하여 JPA 변경과 하나의 트랜잭션에 참여한다.

## 2단계 실행·검증

기존 DB는 V1을 유지한 채 시작 시 V2가 적용된다. 새 DB에는 V1→V2가 순서대로 적용된다. 볼륨을 지우거나 V1을 수정하지 않는다. 관리자는 대시보드·발령·파일 입출력·감사 조회를 사용하고 일반 사원은 본인 발령 이력을 조회한다. 조직 변경은 사원 PUT 대신 발령 API로 한다.

상세 계약: [phase2-api.md](../docs/api/phase2-api.md). 파일 한도5MiB/1000행, 압축 해제 총20MiB/엔트리10MiB, 내보내기10000행. 사번·날짜·비밀번호는 문자열 셀로 입력한다. 오류 시 전체 롤백하고 실제 행 번호를 반환한다.

`./gradlew test`는 기존 MVP·2단계 MVC·파일 코덱을 검증한다. `./gradlew integrationTest`는 MySQL에서 MVP 회귀, 발령·감사 원자성, 파일 롤백, 집계·권한, V1 데이터 보존 업그레이드와 새 DB를 검증한다. 결과는 [2단계 개발일지](../docs/devlog/20261016-backend-phase2.md)를 참조한다.

## 3A 근태·휴가·알림
API: [phase3a-api.md](../docs/api/phase3a-api.md). 근태는 서울 서버 시각과 승인 휴가로 조회 시 판정한다. 휴가는 예약/사용/복원과 감사·알림을 같은 트랜잭션으로 처리한다. 연차는 공휴일·출근율 등을 생략한 포트폴리오용 데모 정책이다.

V3는 V1/V2를 수정하지 않고 기존 DB에 적용된다. 새 시드는 사원이 없고 초기 시드 마커가 없을 때만 생성한다. 기존 볼륨은 보호한다. 총31명 중5명은 퇴사 상태여서 기본 사원 목록에는26명이 보인다. 최근12개월 입사와 일부1~3년 근속자가 있으며 퇴사5명은 여러 달에 분산된다.

초기 관리자 외 DEMO001도 ADMIN이다. 선택 환경변수 DEMO_ADMIN_INITIAL_PASSWORD를 지정하면 **새 DB 시드 시에만** DEMO001 비밀번호로 사용한다. 미지정은 알 수 없는 무작위 비밀번호이며 재시작으로 재설정하지 않는다. 지정값은 공백만일 수 없고 BCrypt 제한인 UTF-8 72바이트 이하로 둔다. 비밀값은 저장소·로그에 남기지 않는다. 루트 .env.example 취합은 문서QA 담당이다. 기존 환경은 API로 별도 합성 ADMIN을 생성해 자기 승인 금지 흐름을 시연한다.

근태·휴가 표본은 API로 생성한다. 시각 경계 검증을 위해 OS 시계를 바꾸지 않고 Clock 주입 테스트를 사용한다.
```sh
./gradlew test
./gradlew integrationTest
./gradlew bootJar
```
MySQL 통합은 동시 신청/승인, 알림 저장 실패 롤백, 알림 권한, 퇴사 자동취소, 기존 DB 업그레이드와 시드 보존을 검증한다. 결과: [3A 개발일지](../docs/devlog/20261016-backend-phase3a.md).

## 3A 최종 검증 결과 (2026-10-16)
최종 소스의 test/integrationTest/bootJar 성공을 XML로 확인했다. 단위·컨트롤러93개 및 MySQL28개, 실패/오류/스킵0. 동시 승인[200,409]·잔액이동1회·승인 감사/알림 각1·실패 주입 롤백을 포함한다.
PENDING은 시작일과 무관하게 본인이 취소할 수 있다. 지난 PENDING의 관리자 승인은409 LEAVE_START_PASSED, 반려는 허용한다. APPROVED는 시작일 전날까지만 본인 취소 가능하다.
실제 Compose 기존V2→V3 데이터 체크섬 보존과 신규31/31/퇴사5/기본26/DEMO001 ADMIN, 두 환경3A HTTP, 재시작 데이터 보존을 통과했다. 두 프로젝트는 down했고 볼륨을 유지했다. 최종 상세 결과는 [개발일지](../docs/devlog/20261016-backend-phase3a.md), 검증 JSON은 verification/에 있다. 실제 브라우저 서버연동·디자인 검수는 문서QA/프론트 담당이다.

## 3B 조직·직책·데모급여·평가
상세 계약: [phase3b-api.md](../docs/api/phase3b-api.md).
- V4만 추가하며 기존 V1~V3은 변경하지 않는다. 조직도는 평탄 배열, 직책은 발령으로만 변경한다.
- 급여는 **포트폴리오용 데모 급여 — 실제 세법·4대보험 산정 아님**이다. 고정450/350/300bps를 항목별 HALF_UP 원단위 반올림한다. 기본급/수당 각각0~10억, 일할계산·파일다운로드 없음.
- 월 생성/재계산/확정은 원자적이며 동시경합409. 확정본은 변경할 수 없고 사원은 본인 확정명세만 조회한다.
- 평가 주기·평가서 상태는 분리되고 본인에게 관리자초안은 공개하지 않는다. 재배정 시 이전 관리자초안이 초기화되므로 관리자 확인이 필요하다.
- 빈 DB 최초 트랜잭션에서만 계층/직책,31명 급여설정·정상대상 직전월확정명세, 혼합상태 합성평가를 생성한다. 기존 볼륨은 카탈로그도 자동추가하지 않는다.
검증 명령은 .\gradlew.bat test integrationTest bootJar이며 결과는 [3B 개발일지](../docs/devlog/20261016-backend-phase3b.md)에서 실행/미실행을 구분한다.

## 3B 최종 검증 결과 (2026-10-16)
최종 Gradle test/integrationTest/bootJar 성공: 단위·컨트롤러107개, MySQL66개, 실패·오류·스킵0. 최종 이미지 Compose HTTP 재확인(19:02:51~19:06:33 KST), 정수 금액400, v1.1 배정 요약, 새 DB31명/급여설정31개/직전월 대상명세26개와 평가4상태, 재시작 보존을 통과했다. 기존 V3→V4 보존은 별도 선행 전후 증거와 최종 MySQL 테스트로 확인했다. 검증 서비스는 down했고 볼륨을 유지했다.
증거: [verification](verification/), 상세 명령·시각·역할·미실행 범위: [3B 개발일지](../docs/devlog/20261016-backend-phase3b.md). Chromium/디자인 검수는 다른 팀 담당이며 백엔드 HTTP로 대체하지 않는다.

## 4단계 AI 설정·사용
API: [phase4-ai-api.md v1.0](../docs/api/phase4-ai-api.md). GET /api/v1/ai/config, POST /ai/employee-search, /ai/evaluation-summary, /ai/policy-qa(모두 /api/v1 기준). 검색은 ADMIN의 필터 제안만 반환하며 실제 검색은 확인 후 기존 API를 사용한다. 평가 요약은 FINALIZED 본인/배정 평가자만 가능하다. 규정은 합성 데모 자료이며 실제 회사 규정이나 법률 안내가 아니다.
Mock이 기본이며 **실제 추론 아님**을 응답/화면에서 구분한다. 실패 시 Mock으로 바꾸지 않는다. 비스트리밍·재시도0·동시1/사용자·60초10회이며 단일 서버 메모리 기준이다. 모든 키/URL은 서버 설정만 사용한다.

| 환경변수 | 기본값·설명 |
|---|---|
| EMS_AI_PROVIDER | mock / anthropic / ollama; 기본 mock |
| EMS_AI_MODEL | 비어 있으면 mock=deterministic-v1, anthropic=claude-sonnet-5-5; Ollama는 기존 설치 모델 명시 |
| ANTHROPIC_API_KEY | 선택 비밀값. anthropic에서만 필요, 없으면503. 저장소/로그에 넣지 않는다 |
| ANTHROPIC_BASE_URL | https://api.anthropic.com; 서버 운영 설정 |
| OLLAMA_BASE_URL | http://host.docker.internal:11434 (Compose); 호스트 직접 실행은 http://localhost:11434 |
| EMS_AI_TIMEOUT_MS | 30000, 1~30000 |
| EMS_AI_MAX_TOKENS | 1024, 1~8192 |
| EMS_AI_EMPLOYEE_SEARCH_ENABLED | true |
| EMS_AI_EVALUATION_SUMMARY_ENABLED | true |
| EMS_AI_POLICY_QA_ENABLED | true |

루트 .env.example 취합은 문서QA 담당이다. 비밀 키 값이 아닌 변수 이름/설명만 공유한다. provider/model을 환경에 설정하고 docker compose up --build -d로 재생성한다. Claude 키는 명시적으로 제공된 환경변수로만 받고, 키를 자동 탐색하지 않는다. Ollama는 기존 호스트 서비스와 모델만 사용하며 모델 다운로드는 하지 않는다.
질문500자, 평가20항목/코멘트12000자, 요청16KiB, 모델JSON64KiB/HTTP봉투128KiB를 제한한다. AI는 개인정보 자동 익명화나 의미 정확성을 보장하지 않으므로 원문과 인용을 확인한다. 서버 프로세스 밖으로 보내는 Anthropic/Ollama는 externalTransfer=true다.
테스트: backend에서 .\gradlew.bat test integrationTest bootJar. 실제 Mock Compose 검증: 프로젝트 루트에서 py -3 backend/verification/phase4_compose_verify.py. 기존 로컬 검증 환경파일 backend/build/compose-smoke.env가 필요하며 이 파일은 Git에 넣지 않는다. 스크립트는 공유3306/8080/5173을 사용하므로 팀 간 사용 시간을 조율한다. 종료 시 down(-v 없음)으로 볼륨을 유지한다.
제공자 확인: py -3 backend/verification/phase4_provider_smoke.py는 환경 키와 이미 설치된 Ollama만 확인한다. 실호출 가능할 때 합성 연결 테스트만 수행하고 원문 응답/키는 기록하지 않는다. Mock·어댑터 계약·실제 추론·Chromium·Claude 디자인 검수는 서로 다른 증거다. 최종 결과는 [개발일지](../docs/devlog/20261016-backend-phase4-ai.md)와 verification/20261016-phase4-*.json을 참조한다.

4단계 최종 자동 검증(2026-10-16 19:46 KST): test/integrationTest/bootJar 성공, 단위141/MySQL73, 실패·오류·스킵0. Claude 키 부재와 호스트 Ollama 기존 서비스/모델 확인 불가로 실제 추론은 미실행이다. Mock MySQL/backend HTTP와 프론트/Chromium 검수는 분리한다. 자세한 증거와 인계는 4단계 개발일지를 참조한다.

9단계 전체3서비스 재확인: 2026-10-16T21:01:36.905227+09:00 ~ 2026-10-16T21:04:49.989217+09:00; 최종 프론트 빌드·frontend200, Mock AI3기능/CORS, 유지DB보존·새DB시드·재시작·down/볼륨 유지를 확인했다. 기존 backend-only 증거는 보존했고 verification/20261016-phase4-compose-result.json의 additionalExecutions 및 full-compose-result.json에 별도 실행으로 남겼다. 프론트/백엔드 소스 식별은 full-source-manifest.json을 참조한다.
