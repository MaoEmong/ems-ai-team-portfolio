# EMS — Employee Management System

백엔드 중심 풀스택 사원관리 웹 애플리케이션이자 **AI 활용 포트폴리오**입니다. AI 팀의 설계·구현·검수 과정과 제품 내부의 AI 기능을 함께 보여줍니다. 현재는 초기 구조와 문서 작성 단계이며 기능 구현 완료를 의미하지 않습니다.

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

TBD — 1단계 완료 시 갱신. 배포는 범위에 포함하지 않습니다.

예정 포트: MySQL 3306, backend 8080, frontend 5173. `.env.example`에는 예시만 있으며 실제 로컬 설정은 Git에서 제외되는 `.env`로 관리합니다. 환경변수 이름은 백엔드 구현과 대조 후 확정합니다.

## 문서

- [요구사항 및 인수 조건](docs/01-requirements.md)
- [아키텍처·ERD·API 요약](docs/02-architecture.md)
- [킥오프 결정](docs/meetings/2026-10-16-kickoff.md)
- [AI 협업 방식](docs/ai-workflow.md)
- [개발 일지](docs/devlog/README.md) · [ADR](docs/adr/README.md) · [회고](docs/retrospective.md)

상세 API 문서 `docs/api/mvp-api.md`는 백엔드팀 작성 예정입니다. 주요 로직 테스트와 MySQL·웹 통합 검수 결과, 실행 안내 및 스크린샷은 실제 수행 후 추가합니다.
