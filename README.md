# EMS — Employee Management System

백엔드 중심 풀스택 사원관리 웹 애플리케이션이자 **AI 활용 포트폴리오**입니다. AI 팀의 설계·구현·검수 과정을 기록하며, 제품 내부 AI 기능은 4단계에 추가합니다. 현재 2단계까지 구현했으며 실제 Chromium·MySQL 검수에서 기존 회귀20개와 신규14개 시나리오를 통과했습니다. 3~4단계는 미구현입니다.

## 기술 스택

- 백엔드: Spring Boot 3, JPA, Spring Security, JWT, Flyway
- 프론트엔드: React, TypeScript, Vite
- 데이터 및 실행: MySQL, Docker Compose
- 제품 AI: Claude API / Ollama 공통 LLM 인터페이스(4단계)
- 개발 AI: Codex 중심 구현·문서화, Claude Code 조율·검수

## 단계 로드맵

| 단계 | 범위 |
| --- | --- |
| 1 MVP | 사원·부서·직급 CRUD, 검색·필터·정렬·페이징, 로그인·권한 |
| 2 확장 1 | 대시보드, 발령 이력, xlsx 입출력·CSV 내보내기, 감사 로그 |
| 3 확장 2 | 근태, 휴가 결재·잔여 연차, 급여, 평가, 조직도·직책, 알림 |
| 4 AI | Claude API/Ollama, 자연어 사원 검색, 평가 요약, HR 규정 챗봇 |

## 실행 방법

Docker Desktop 또는 Docker Engine과 Compose가 필요합니다. 3306/8080/5173 포트를 비워 두고 프로젝트 루트에서 실행합니다. 배포는 범위에 포함하지 않습니다.

```powershell
Copy-Item .env.example .env
# .env의 DB 비밀번호, JWT_SECRET, 관리자 ID/비밀번호를 로컬 값으로 편집
docker compose up --build -d
docker compose ps
docker compose logs backend
```

백엔드 준비가 끝난 뒤 [웹 화면](http://localhost:5173)에 접속합니다. API는 `http://localhost:8080/api/v1`, MySQL은 `localhost:3306`입니다. Compose는 frontend를 실제 API 모드로 빌드합니다. 브라우저에서는 localhost 주소를 사용합니다.

- `ADMIN_LOGIN_ID`: 필수 관리자 사번, 최대 50자, `DEMO###` 형식 금지.
- `ADMIN_INITIAL_PASSWORD`: 공백이 아닌 값, UTF-8 72바이트 이하.
- `JWT_SECRET`: 충분히 무작위인 로컬 값, 최소 UTF-8 32바이트. `.env.example`의 예시 문자열은 교체합니다.
- `DB_NAME`, `DB_USERNAME`, `DB_PASSWORD`, `DB_ROOT_PASSWORD`: Compose MySQL 설정. `DB_HOST`/`DB_PORT`는 로컬 백엔드 실행용이며 Compose 내부는 mysql:3306입니다.

초기 관리자 계정은 `.env`에서 정한 ID/비밀번호로 로그인합니다. 사원 테이블이 비어 있으면 관리자 1명과 합성 사원 30명이 생성됩니다. 데모 사원의 비밀번호는 알 수 없는 무작위 값이므로 일반 사원 시연은 관리 화면에서 사원을 등록하고 직접 정한 초기 비밀번호를 사용합니다. 기존 볼륨에서는 환경변수를 바꿔도 관리자 비밀번호가 초기화되지 않습니다. 실제 비밀값과 `.env`는 커밋하지 않습니다.

```powershell
# 사용 후 종료, 데이터 볼륨 유지
docker compose down
```

실제 통합 검수 재현은 [QA 문서](docs/qa/2026-10-16-mvp-integration.md)를 참조합니다. 백엔드 테스트는 Java 21에서 `backend/gradlew.bat test integrationTest`, 프론트는 `npm ci`, `npm run typecheck`, `npm test`, `npm run build`로 실행합니다. 상세 절차는 각 팀 README에 있습니다.

## 실제 API 화면

![관리자 대시보드 — 합성 데이터](docs/qa/phase2-screenshots/dashboard-fresh.png)

![발령 이력 — 합성 데이터](docs/qa/phase2-screenshots/appointment-history.png)

## 문서

- [요구사항 및 인수 조건](docs/01-requirements.md)
- [아키텍처·ERD·API 요약](docs/02-architecture.md)
- [킥오프 결정](docs/meetings/2026-10-16-kickoff.md)
- [AI 협업 방식](docs/ai-workflow.md)
- [개발 일지](docs/devlog/README.md) · [ADR](docs/adr/README.md) · [회고](docs/retrospective.md)

[상세 API 계약](docs/api/mvp-api.md) · [MVP 통합 검수·결함 목록](docs/qa/2026-10-16-mvp-integration.md). 각 팀의 자동 테스트 결과와 이번 실제 API 검수를 구분해 기록합니다.


## 2단계 기능과 증거

대시보드(현재 상태·12개월 입퇴사), 발령 전용 조직 변경·본인 이력, 실제 xlsx/CSV 다운로드·오류 시 전체 취소 가져오기, 관리자 감사 로그를 제공합니다. 관리자 첫 화면은 대시보드, 일반 사원은 내 정보입니다.

- [2단계 API](docs/api/phase2-api.md) · [실제 통합 검수](docs/qa/2026-10-16-phase2-integration.md)
- [종료·착수 회의](docs/meetings/2026-10-16-phase1-closing.md) · [역할별 엔진 배분 ADR](docs/adr/0002-task-based-engine-allocation.md)
- [디자인 시스템](docs/design/design-system.md) · [시안](docs/design/mockups.html) · [Claude 검수 기록](docs/design/design-review-phase2.md)

디자인은 Claude, 구현·실제 검수는 Codex가 담당했습니다. 목업 디자인 검수와 실제 API 검증의 범위는 각각의 문서에서 구분합니다.
