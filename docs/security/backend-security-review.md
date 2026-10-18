# 백엔드 보안 점검과 실행 재현성

- 점검일: 2026-10-18 (Asia/Seoul). 수행: Codex(백엔드). 설계 검토: Claude Code.
- 대상 기준 커밋: `9bc7afb`. 착수 시 worktree는 clean이고 해당 커밋 이후 백엔드/Compose 변경은 없었다. 이번 수정과 테스트는 후속 백엔드 커밋으로 구분한다.
- 범위: 소스 검토, 해결된 런타임 의존성 감사, 자동 보안 필터 테스트. 침투 테스트, 운영 배포 인증, 실제 AI 품질 검증은 아니다.
- 공유 포트 3306/8080/5173과 Compose를 사용하지 않았다. 기존 볼륨과 Flyway V1~V4를 변경하지 않았다.

## 결과와 수정

Spring Security 6.5.5는 [CVE-2026-22732 공식 공지](https://spring.io/security/cve-2026-22732/)의 영향 버전에 포함된다. 응답 시점에 따라 기본 보안/캐시 헤더가 누락될 수 있는 CRITICAL 항목이다. `SecurityConfig.java`에 공급자가 제시한 `HeaderWriterFilter.setShouldWriteHeadersEagerly(true)` 우회 조치를 적용했다. 라이브러리를 강제 교체하지 않았다. 실제 필터의 eager 플래그와 200/401/403 응답의 캐시·프레임·콘텐츠 유형 헤더를 새 MVC 테스트로 검증했다. 이 조치는 해당 헤더 경로의 완화이며 의존성 버전이 수정되었거나 다른 advisory가 해소되었다는 뜻은 아니다. 화면/DTO/DB/API 계약 변경은 없다.

런타임 91개 구성요소를 OSV와 대조해 서로 다른 advisory 68건을 찾았다(상류 severity: CRITICAL 9, HIGH 21, MODERATE 28, LOW 10). 버전 일치 수이며 실제 공격 성공 건수가 아니다. 선택 기능, 설정, 전송 계층 조건을 나누어 검토했으며 도달성을 입증하지 못한 항목도 남아 있다. 따라서 공개 전 검사가 끝났다는 이유로 운영 보안이 완성되었다고 판단하지 않는다.

후속 검토에 따라 [68건의 항목별 분류표](backend-dependency-triage.md)에 각각 심각도·근거와 ‘실제 도달 가능 / 조건 미충족 / 판단 불가’를 표시한다. 승인된 헤더 우회 외 라이브러리 패치는 수행하지 않았다. 실제 도달 가능한 High/Critical에 대한 동일 마이너 패치와 전체 재검증이라는 허용 조건을 유지하며, 마이너·메이저 교체는 하지 않는다.

## 항목별 근거와 한계

경로는 별도 표시가 없으면 `backend/src/main/java/com/portfolio/ems/` 기준이다. 정적 검토는 2026-10-18 22시대 KST에 수행했다. 당시 자동 테스트의 정확한 suite 시각과 수치는 [초기 테스트 증거](../../backend/verification/20261018-backend-security-tests.json)에 보존한다. 아래 표의 DB 미실행 설명은 10월 18일 점검 당시 상태이며, 10월 19일 후속 MySQL 실행 결과는 아래 별도 절에 추가했다. 실제 소켓 HTTP 검수·운영 보안·실추론 한계는 유지한다.

| 항목 / 심각도 | 경로와 점검 방법 | 확인·조치 / 잔여 |
|---|---|---|
| 응답 헤더 / CRITICAL 상류, 완화 적용 | `SecurityConfig`; 정적+`SecurityReviewWebTest` | 공급자 eager 헤더 우회 적용. 200/401/403 검증. 추후 호환 패치 업그레이드 필요 |
| 인증·JWT / 잔여 MEDIUM | `SecurityConfig`, `AuthService`; 정적+새 MVC 테스트 | HS256, issuer 검증, 만료 검증, 3600초 토큰, 변조/잘못된 issuer 거절. JWT 키 최소 32 UTF-8 바이트. 길이 검사만으로 엔트로피는 보장하지 않음 |
| 퇴사/권한 변경 / 정적 확인 | JWT authentication converter, `EmployeeService.retire`; 정적+MVC mocked repository | 매 요청 enabled와 현재 role 재조회. 이전 JWT role로 권한을 유지하지 않음. 실제 퇴사 DB 트랜잭션 재실행은 Docker 부재로 미실행 |
| 역할·본인·배정자 / 정적 확인 | `EmployeeService`, `EvaluationService`, `PayrollService`, `LeaveService`, `NotificationService`; 정적+기존 테스트 대조 | 사원 본인/ADMIN, 평가 본인·배정자, 급여 본인 CONFIRMED, 알림 수신자 검사. 직접 ID 접근도 서버 검사. 현재 MySQL 검증을 과거 통과로 대체하지 않음 |
| 비밀번호 / 잔여 MEDIUM | `AuthService`, `SecurityConfig`; 정적+BCrypt 테스트 | BCrypt와 salt 차이 확인, UTF-8 72바이트 제한. 최소 복잡도·서버 로그인 rate limit·잠금 없음. 없는 계정과 존재 계정의 해시 비용 차이에 따른 타이밍 관찰 가능성은 잔여 |
| 토큰 보관·회수 / 잔여 MEDIUM | 인증 설계·프론트 인계사항 | 퇴사 비활성화는 즉시 검사. 개별 JWT 폐기 목록은 없음. 클라이언트 로그아웃과 서버 토큰 폐기는 다름. sessionStorage의 XSS 위험은 프론트 보고서와 함께 관리 |
| 환경변수·비밀값 / 운영 전제 | `application.yml`, Compose, `.env.example`; 정적 | 키·DB·초기 계정은 환경변수 경로. 예시는 실제 비밀값이 아님. 사용자가 강한 값으로 바꿔야 함. 키 저장소/전체 Git 이력 검사는 QA 별도 담당 |
| 포트·CORS / 잔여 LOW | `docker-compose.yml`, `SecurityConfig`; 정적+MVC CORS | MySQL/backend는 127.0.0.1 바인딩. 허용 origin은 localhost:5173, credential cookie 허용 안 함. frontend 5173은 전체 인터페이스 바인딩이므로 LAN 노출 가능. 이번에 바꾸지 않음. 인터넷 배포용 TLS/프록시·방화벽 검증 미실행 |
| 요청 검증·SQL / 잔여 MEDIUM | 각 DTO/서비스, `CatalogService`, `AiInputFilter`; 정적 | Bean Validation, 허용 정렬/ID, JDBC 바인딩 사용. 카탈로그 charset/collation은 DB 메타데이터+문자 제한. 일반 JSON 전체에 애플리케이션 공통 body 상한은 없으므로 인터넷 공개 전 자원 제한 보강 필요 |
| 업로드·압축 / 정적 확인 | `SheetCodec`, `FileService`, multipart 설정; 정적+기존 단위 회귀 | 파일 5MiB, multipart 6MiB, 1000행, ZIP 엔트리/전체 압축 해제 크기·비율·개수·중복 이름 제한. 디스크 압축 해제 안 함. 실제 대용량 부하/침투 테스트는 미실행 |
| 수식 주입 / 정적 확인 | `SheetCodec`; 정적+기존 단위 회귀 | 가져오기 수식 셀 거부, XLSX 문자열 출력, CSV 위험 접두 문자 이스케이프. 외부 오피스 프로그램 전체 버전에서의 실행 실험은 미실행 |
| 오류·로그 / 정적 확인 | `Errors`, 인증 handler, main 소스 로깅 탐색; 정적+자동 오류 응답 | 응답에 stack/rejected value를 그대로 넣지 않음. main 소스 원문 콘솔 로깅 없음. 컨테이너/프록시/라이브러리의 모든 로그에 대한 보장은 아님 |
| 감사 / 정적 확인 | `AuditService`, AI 서비스; 정적+기존 회귀 | 비밀번호·토큰·키 저장 안 함. AI 감사는 허용 metadata만. 기존 HR 업무 감사의 사유 등 승인된 업무 데이터 저장은 별도 정책이며 모든 개인정보가 감사에 없다는 뜻은 아님 |
| AI 전송·권한 / 정적+회귀 | `AiService`, LLM 어댑터; 기존 캡처/Mock/계약 테스트를 현재 단위 실행에 포함 | 사원 목록 미전송, 평가 ID/점수/등급 제외 projection, FINALIZED·본인/배정자 먼저 확인. 자유 입력의 개인정보를 자동 익명화하는 기능은 없음 |
| AI 출력·제한 / 잔여 MEDIUM | `AiJson`, `AiInputFilter`, 어댑터; 정적+기존 단위 회귀 | strict JSON/화이트리스트/ID/길이/인용 검증, 입력 16KiB·출력 64KiB·봉투 128KiB, timeout·동시 1·분당 10. 제한은 메모리 기반이라 재시작/다중 인스턴스 전체 제한은 아님. 정확한 발췌 일치가 의미 정확성을 보장하지 않음 |
| 제공자 / 미실행 | Mock·HTTP stub 계약과 실추론 분리 | 명시한 provider 실패를 Mock으로 대체하지 않음. 실제 Claude/Ollama 실추론은 이번에도 수행하지 않음. 키 탐색·모델 다운로드 안 함 |

## 의존성 감사

- 명령: `./gradlew.bat -I build/security/inventory.init.gradle securityResolvedInventory` (Windows에서 실행). 해결된 `runtimeClasspath` 91개. 수집 시각 `2026-10-18T22:27:49.281803400+09:00`.
- OSV querybatch 및 advisory 상세 조회: 저장소 루트에서 `py -3 backend/build/security/osv-audit.py`. 조회 `22:29:06~22:29:13 KST`. JSON 저장 뒤 콘솔의 cp949 인코딩 오류가 있었으나 저장된 전체 응답으로 결과를 재확인했다.
- [재현용 Gradle 스크립트](../../backend/verification/security/runtime-inventory.init.gradle), [감사 스크립트](../../backend/verification/security/osv-audit.py), [해결 버전](../../backend/verification/20261018-backend-runtime-inventory.json), [68건 및 개별 판단](../../backend/verification/20261018-backend-dependency-audit.json).
- Gradle dependency locking은 설정되지 않았다. 캡처한 해결 버전 기준이며 lockfile 검사라고 표현하지 않는다. JDK/컨테이너 OS/Gradle 플러그인/테스트 전용 classpath는 이 감사 범위 밖이다.
- 도구: [OSV API](https://google.github.io/osv.dev/api/). 결과는 자동 버전 매칭과 소스 기반 조건 분류이며 68건 모두를 동적 재현한 것은 아니다. severity는 상류 데이터 값이다.

| 주요 해결 버전 | 사용 조건 검토 / 조치 또는 잔여 |
|---|---|
| Spring Security 6.5.5 | 헤더 CVE는 공식 우회 적용. X509/OTP/일부 인증 provider/issuer discovery 등 별도 기능 조건은 현재 custom JWT 경로와 구분. 상류 버전 수정은 별도 계획 필요 |
| Spring Framework 6.2.11 | multipart 사용은 있음. [CVE-2026-41853](https://spring.io/security/cve-2026-41853/)의 multipart 파싱 WAF/프록시 조건은 기본 Compose에 없지만 배포 구조 변경 시 다시 평가. JSP/SpEL 사용자 식 등 사용하지 않는 경로와 분리 |
| Tomcat 10.1.46 | FORM/DIGEST/WebDAV/AJP 등 선택 기능은 기본 설정과 구분. HTTP 파서·전송 계층 관련 항목은 도달 가능성을 제거하지 못했으므로 HIGH 잠재 위험으로 남김. [공식 10.1 보안 공지](https://tomcat.apache.org/security-10)와 호환 패치 버전 대조 후 업데이트 권고 |
| Jackson 2.19.2 | 특수 deserializer/다형성 등 미사용 경로와 일반 파서 경로를 분리. 숫자 파싱 자원 소모 가능성은 도달성 미입증의 잠재 위험으로 유지 |
| Boot 3.5.6, Logback 1.5.18, commons-lang3 3.17.0 등 | OSV JSON의 개별 조건·고정 버전·참조를 확인할 것. 임시 디렉터리/로컬 설정/전이 호출 경로 등 환경 또는 미확인 조건이 있으며 전부 해소로 분류하지 않음 |

이번에는 강제 업데이트하지 않았다. 다음 운영 준비 작업은 호환 가능한 Boot 패치 계열을 공급자 공지와 대조하고, dependency graph·전체 회귀·컨테이너 이미지까지 함께 검증하는 것이다. JSON에 나온 fixed 버전은 OSV 기록이지 현재 획득·호환성을 검증한 배포 추천 목록이 아니다.

## 실행 결과와 미실행

### 2026-10-18 당시 이력 (보존)

- 당시 최종 `./gradlew.bat test bootJar`: BUILD SUCCESSFUL, 단위/MVC 147개 PASS. 새 `SecurityReviewWebTest` 6개는 DB 대신 repository 경계를 mock한 실제 Spring Security MVC 필터 검증이다. MySQL 트랜잭션 검증으로 취급하지 않는다.
- 당시 `./gradlew.bat test integrationTest bootJar` 두 번은 Docker Desktop Linux engine named pipe 부재로 실패했다. 8개 통합 테스트 클래스가 초기화 실패했고 MySQL 업무 검증은 실행되지 않았다. 승인된 숨김 Docker Desktop 시작을 한 번 시도했지만 엔진이 준비되지 않았다. 서비스 강제 변경이나 반복 우회는 하지 않았다.
- 당시 새 `SecurityReviewMySqlTest` 6개는 컴파일되었으나 실행되지 않았다. 기존 MySQL 73개도 당시 실행에서 통과했다고 쓰지 않는다.
- 실제 Compose/공유 포트/브라우저/침투 테스트/Claude·Ollama 실추론은 이번 백엔드 배정에서 미실행이다. 프론트 촬영과 QA의 새 사용자 실행 검증은 별도 인계 대상이다.

### 2026-10-19 Docker 복구 후 실행과 문서화

- 수행: Codex(백엔드). Docker 연결 복구 확인 후 `backend`에서 `.\gradlew.bat test integrationTest bootJar`를 **1회** 실행했다. 이후 테스트 재실행·제품 수정·staging·커밋은 하지 않았다.
- 시작 `2026-10-19T03:08:55.2556911+09:00`, 종료 메타데이터 `03:14:29.0058592+09:00`. 종료 애플리케이션 로그의 마지막 시각은 `03:14:28 KST`다. 결과는 exit 0, `BUILD SUCCESSFUL in 5m 33s`.
- 이번 새 실행은 `integrationTest` **8 suite / 79개 PASS**, failures/errors/skipped 모두 0이다. suite timestamp는 UTC `2026-10-18T18:10:38.487Z~18:14:20.516Z` (KST 10월 19일 03:10~03:14). 새 보안 MySQL 6개도 포함한다.
- `test`와 `bootJar`는 **UP-TO-DATE**였다. 단위/MVC XML 147개 PASS는 같은 백엔드 소스의 10월 18일 결과를 재사용한 것이며 이번에 새로 실행한 수치가 아니다. 147+79를 이번 신규 실행 수로 합산하지 않는다.

| 이번 integrationTest suite | tests | failures | errors | skipped |
|---|---:|---:|---:|---:|
| AiMySqlTest | 7 | 0 | 0 | 0 |
| EvaluationMySqlTest | 31 | 0 | 0 | 0 |
| MigrationUpgradeTest | 1 | 0 | 0 | 0 |
| MySqlIntegrationTest | 1 | 0 | 0 | 0 |
| OrganizationPayrollMySqlTest | 7 | 0 | 0 | 0 |
| Phase2MySqlTest | 12 | 0 | 0 | 0 |
| Phase3MySqlTest | 14 | 0 | 0 | 0 |
| SecurityReviewMySqlTest | 6 | 0 | 0 | 0 |
| 합계 | 79 | 0 | 0 | 0 |

- [새 검증 JSON](../../backend/verification/20261019-backend-mysql-rerun.json)에 실제 XML 집계·suite 시각·명령·소스 SHA-256 manifest·task 실행 여부·정리 확인을 남겼다. 기존 초기화 실패 JSON은 덮어쓰지 않았다.
- 제품 백엔드 소스는 `89db9017fe3bbd025a26d4bb852c609fc7824607` 그대로다. 실행 시작 시 manifest와 후속 파일 해시도 일치한다. 전체 작업 트리에는 프론트 nginx 및 QA 문서 변경이 별도로 있으므로 전체 프로젝트가 clean 89db901이라고 표현하지 않는다. 촬영 **백엔드** 기준은 `89db901`이다.
- `2026-10-19T03:20:20.975112+09:00` 읽기 전용 확인에서 Testcontainers 라벨 컨테이너 0개, 모든 태그의 `testcontainers/ryuk` 잔여 0개였다. 자동 정리를 확인했으며 수동 stop/remove나 다른 팀 컨테이너 조작은 없었다. 공유 포트 3306/8080/5173, Compose, 기존 볼륨을 사용하지 않았다.
- 의존성 OSV **1/58/9 분류와 잔여 위험은 그대로**다. MySQL 통과가 실제 AI 품질·침투 테스트·운영 보안이나 판단 불가 advisory의 해소를 증명하지 않는다. shutdown 시 Hikari 연결 종료 경고가 있었으나 XML 실패·오류는 0이며 경고를 제품 결함 해소나 추가 검증의 근거로 확대하지 않는다.

## 실행·촬영 인계

[새 사용자 실행 및 합성 촬영 상태 준비](../../backend/docs/portfolio-local-runbook.md)에 `.env.example`만으로 설정하는 법, 관리자와 DEMO001의 새 DB 비밀번호 규칙, `up --build`, 정상 API를 통한 합성 평가·급여·발령·휴가·알림 준비, `down`과 볼륨 보존을 정리했다. ignored `compose-smoke.env`는 과거 QA 절차이며 새 사용자 필수 파일이 아니다.

초기 루트 검사에서 LICENSE 파일이 없었다. 라이선스 선택은 법적 판단 없이 QA 검토에 인계했다. 원격 생성·push·이력 재작성은 하지 않았다. 보고서의 제한을 README 공개 준비 상태와 함께 표시해야 한다.
