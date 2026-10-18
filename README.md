# EMS — 사원관리 시스템

사원 정보와 인사 업무를 한곳에서 관리하는 백엔드 중심 풀스택 포트폴리오입니다. 기능 구현뿐 아니라 AI 협업의 설계 결정, 검수 근거와 한계를 남깁니다.

## 핵심 기능

- 로그인·권한, 사원·부서·직급 관리, 검색·대시보드
- 발령·퇴사 이력, XLSX 가져오기·내보내기, CSV 내보내기, 감사 기록
- 근태 정정, 휴가 예약·결재·복원, 개인 알림
- 조직도·직책, 월별 데모 급여 생성·확정, 자기·관리자 평가
- AI 검색 필터 제안, 확정 평가의 읽기 전용 요약, 합성 규정 Q&A

## 대표 화면

실제 API + Mock AI로 촬영한 합성 데이터 화면입니다. 촬영셋은 37화면·53장(원본 49장 + AI 재촬영 4장)입니다. 화면마다 촬영 시점이 달라 인원 수는 달라질 수 있습니다.

![사원 현황 대시보드](docs/screenshots/2026-10-18T18-54-38-906Z-f170b270/desktop-dashboard.png)

![Mock 규정 Q&A와 인용 근거](docs/screenshots/2026-10-18T18-54-38-906Z-f170b270/desktop-policy-qa.png)

![데모 급여 명세서](docs/screenshots/2026-10-18T18-54-38-906Z-f170b270/desktop-payslip-detail.png)

[전체 갤러리](docs/screenshots/README.md) · [통합 manifest](docs/screenshots/capture-set.json) · [Claude 실제 이미지 검수](docs/screenshots/claude-image-review.md)

Codex 촬영과 Claude 검수는2026-10-19 KST 기준이며, QA가 대표3장을 직접 열어 마스크·Mock/데모 고지를 대조했습니다. 이미지 출처는 이 프로젝트의 합성 데이터 화면이며 외부 이미지가 아닙니다.

## 기술 스택과 구조

| 영역 | 구성 |
|---|---|
| 화면 | React, TypeScript, Vite, nginx |
| API | Java 21, Spring Boot 3, JPA, Spring Security, JWT |
| 데이터 | MySQL, Flyway V1~V4 |
| 실행·검증 | Docker Compose, Gradle, Vitest, Playwright Chromium |
| 제품 LLM | LlmClient → Mock / Anthropic Messages API / Ollama HTTP |

브라우저 → 프론트 → 인증·권한 검사 API → MySQL 순서로 처리합니다. AI도 서버 권한 검사 후 필요한 필드만 제공자에게 보내고 응답을 검증합니다. 개발용 Codex·Claude와 제품 LLM 제공자는 별개입니다. [ERD·API 구조](docs/02-architecture.md)

## 로컬 실행

Docker Desktop Linux 엔진과 Compose v2가 필요합니다. 컨테이너 실행만 할 때 호스트 Java·Node는 필요하지 않습니다. 이미지 빌드에 네트워크와 시간이 필요하며 첫 빌드 시간을 5분으로 보장하지 않습니다. PowerShell에서 저장소 루트로 이동하고 3306·8080·5173 포트를 비웁니다.

~~~powershell
# 기존 .env를 덮어쓰지 않습니다.
if (-not (Test-Path -LiteralPath .env)) {
    Copy-Item -LiteralPath .env.example -Destination .env
}
~~~

로컬 편집기에서 .env의 DB_PASSWORD, DB_ROOT_PASSWORD, JWT_SECRET, ADMIN_INITIAL_PASSWORD를 교체합니다. JWT_SECRET은 암호학적으로 생성한 최소 32바이트 무작위 값으로 정합니다. 초기 관리자 비밀번호는 공백이 아니고 UTF-8 72바이트 이하입니다. ADMIN_LOGIN_ID는 DEMO숫자 형식을 피합니다. EMS_AI_PROVIDER=mock과 빈 ANTHROPIC_API_KEY를 유지하면 키 없이 실행됩니다. .env와 실제 키는 커밋하지 않습니다.

~~~powershell
# 새 데모는 기존 데이터와 분리한 고유 이름을 사용합니다.
docker compose --project-name ems-portfolio-local up --build -d
docker compose --project-name ems-portfolio-local ps
~~~

backend가 준비되면 [웹 화면](http://localhost:5173)에 접속해 .env의 관리자 ID·비밀번호로 로그인합니다. API는 localhost:8080/api/v1입니다. 실제 API에 연결되며 LLM만 Mock입니다. Mock은 결정적인 예시이고 실제 추론이 아닙니다.

빈 DB에는 관리자 포함 합성 사원 31명, 급여 설정, 직전 월 대상자의 확정 명세, 혼합 상태 평가가 생성됩니다. DEMO001의 알려진 비밀번호가 필요하면 첫 기동 전에 DEMO_ADMIN_INITIAL_PASSWORD를 로컬에서 설정합니다. 일반 사원 시연은 관리자 화면에서 합성 사원을 등록하고 직접 정한 초기 비밀번호로 로그인합니다. 기존 볼륨에서는 환경변수를 바꿔도 비밀번호가 초기화되지 않습니다.

~~~powershell
# 같은 프로젝트 이름으로 종료합니다. 볼륨은 유지합니다.
docker compose --project-name ems-portfolio-local down
~~~

기존 볼륨은 삭제하지 않습니다. 다른 빈 데모가 필요하면 고유 프로젝트명을 새로 정합니다. 프론트 5173은 LAN에 노출될 수 있으므로 신뢰하지 않는 네트워크에 공개하지 않습니다. [상세 실행·합성 상태 준비](backend/docs/portfolio-local-runbook.md)

## 제품 AI 제공자 전환

기본값은 Mock입니다. 로컬 .env의 EMS_AI_PROVIDER를 계약의 anthropic 또는 ollama로 설정하고 모델·URL·키를 맞춘 뒤 backend를 재생성합니다. 키는 서버 환경변수에만 두고 VITE_*에는 넣지 않습니다. Ollama는 이미 설치된 모델을 사용합니다. 실패 시 Mock으로 자동 대체하지 않습니다. 실제 Claude·Ollama 추론은 아직 미실행입니다. [설정·오류·전송 범위 계약](docs/api/phase4-ai-api.md)

## AI 협업 사례

- 사용자 목표를 Claude Code가 계약·정책으로 정리하고 Codex가 구현·검증했습니다. 급여의 월 단위 원자 처리와 확정 스냅샷은 [ADR 0110](docs/adr/0110-demo-payroll-month-snapshots.md)과 [백엔드 일지](docs/devlog/20261016-backend-phase3b.md)에 연결됩니다.
- Claude 디자이너의 이미지 지적을 Codex가 반영하고 재검증·재확인했습니다. [3A 디자인 검수](docs/design/design-review-phase3a.md), [프론트 일지](docs/devlog/20261016-frontend-phase3a.md)에 지적·반영·미확인 범위가 남아 있습니다.
- AI 출력의 명시적 적용과 읽기 전용 결과는 [ADR 0206](docs/adr/0206-ai-explicit-execution-and-ephemeral-results.md), [AI 일지](docs/devlog/20261016-frontend-phase4.md), [통합 검수](docs/qa/2026-10-16-phase4-ai-integration.md)로 추적합니다. 측정하지 않은 시간·비용 절감이나 엔진 우열은 주장하지 않습니다.

## 검수와 문서

| 시점 | 근거 |
|---|---|
| 2026-10-16 과거 검수 | 실제 Compose·MySQL·Chromium 회귀 62개 + AI Mock 12개 통과. 당시 소스의 결과 |
| 2026-10-18~19 보안·공개 정리 | 백엔드 integrationTest 79/79 새 실행, 프론트 HTTP3헤더 확인. 단위147은 기존 결과 재사용. 보안 요약 참조 |

2026-10-19 05:04~05:05 KST, Codex 문서QA가 HEAD6822129와 문서 수정 상태에서 새 프로젝트 ems-qa-final-1792353857091로 위 절차를 재현했습니다. 로그인200, API5개200, Chromium 대시보드·사원목록·조직도·규정Q&A 확인 후 down(exit0)했고 볼륨과 포트 반환을 확인했습니다. [실행 근거](docs/security/history-scan-candidates.json)

- [화면 목록·갤러리 준비](docs/screenshots/README.md)
- [보안 점검 요약](docs/security/README.md) · [보안 적용 범위와 보고](SECURITY.md)
- [요구사항](docs/01-requirements.md) · [설계 결정](docs/adr/README.md)
- [AI 협업 기록](docs/ai-workflow.md) · [회고](docs/retrospective.md)
- [문서 색인](docs/README.md) · [기존 단계별 상세 README](docs/project-details.md)

백엔드 검증은 backend에서 .\gradlew.bat test integrationTest bootJar, 프론트는 frontend에서 npm ci 후 npm run typecheck, npm test, npm run build로 수행합니다. MySQL 통합 테스트에는 Docker가 필요합니다. 과거 통과 수치를 현재 소스의 재실행 결과로 합산하지 않습니다.

## 한계

실제 Claude·Ollama 추론 및 응답 품질, 포괄적인 접근성 검증, 침투 테스트와 운영 보안은 미검증입니다. 급여는 실제 세법·4대보험 산정이 아닌 고정 비율 데모이며 근태·연차 규칙도 단순화했습니다. 기존 낮음 디자인6건과 빌드 청크 경고가 남아 있습니다. 이번 촬영 검수의 중간2건·낮음10건은 별도 지적이며 [확인 범위와 제한](docs/screenshots/claude-image-review.md)에 기록했습니다. sessionStorage 토큰의 XSS 위험, 전체 CSP·로그인 속도 제한 미구현도 보안 요약에 기록합니다. 배포, 범용 HR 질의, 평가 초안 자동 작성·적용은 제외했습니다. 라이선스 미지정으로 LICENSE 파일은 없습니다. 비공개 저장소 ems-ai-team-portfolio를 만들 예정이며 사용자 확인 후 공개 전환 여부를 결정합니다. 이번 QA 작업에서는 원격 생성·push하지 않습니다.
