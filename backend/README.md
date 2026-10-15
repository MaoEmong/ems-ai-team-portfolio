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

백엔드 http://localhost:8080/api/v1, MySQL localhost:3306. frontend 서비스는 프론트 Dockerfile 확정 후 통합한다. CORS는 http://localhost:5173만 허용한다. Compose 서비스는 호스트 loopback에 바인딩한다.

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

PowerShell에서 .\compose-smoke.ps1은 ems-backend-smoke 프로젝트로 실제 Compose 이미지를 빌드하고 로그인·31명 시드를 검사한다. 포트 3306/8080이 비어 있어야 한다. 임시 자격증명은 Git 제외 build/compose-smoke.env에 생성하고 재실행 시 재사용한다. 검증 후 프로젝트 루트에서 docker compose --project-name ems-backend-smoke --env-file backend/build/compose-smoke.env down으로 컨테이너를 종료한다(볼륨 유지).

API 계약: ../docs/api/mvp-api.md. 실행 결과 및 미실행 항목: ../docs/devlog/20261016-backend-mvp.md.

## 설계
외부 응답에는 DTO만 사용한다. 계정 비밀번호는 BCrypt로 저장하고 매 인증 요청에서 enabled와 role을 DB에서 확인한다. 사원 변경과 퇴사, 참조 부서/직급 삭제는 트랜잭션·행 잠금으로 보호한다. 스키마는 Flyway로만 변경하고 JPA는 validate로 검증한다. 현 MVP의 최대 페이지는 100이며 단순한 eager 관계 로딩을 사용한다. 대규모 목록 최적화와 감사 로그는 후속 단계에서 별도 측정·구현한다.
