# 2026-10-18 백엔드 보안 점검·실행 자료

## 지시와 담당

기능 추가 없이 공개 준비를 진행했다. Codex(백엔드)가 직접 소스·의존성 검토, 최소 보안 수정, 테스트와 문서 정리를 수행했다. 기존 파일 코덱 작업과 분리해 수행했다. 프론트 촬영·Claude Code 이미지 검수·공통 문서·원격 게시를 백엔드 실적으로 기록하지 않는다.

## 수행과 판단

- 착수 Git 기준 `9bc7afb`, worktree clean. 공유 포트와 Compose는 사용하지 않았다.
- 인증·현재 계정 권한·업로드·CSV/ZIP·AI 전송/출력·환경 설정과 오류/감사 경로를 정적으로 검토했다.
- 런타임 해결 버전 91개를 OSV에 조회해 advisory 68건을 발견했다. 버전 매칭, 조건부 미설정 경로, 잠재 파서/전송 위험을 나누었다. 전부 실제 도달하거나 해소되었다고 판단하지 않았다.
- 후속 설계 검토로 항목별 3분류 표와 심각도·근거를 추가했다. 패치는 실제 도달 가능한 High/Critical의 동일 마이너 변경과 전체 재검증 조건에서만 허용되며 이번에는 의존성 버전을 바꾸지 않았다.
- 공식 Spring Security CVE-2026-22732 공지의 eager 헤더 우회를 `SecurityConfig`에 최소 적용했다. 버전 강제 업데이트·Flyway 변경·API/화면 변경은 없다.
- 보안 필터 새 MVC 테스트 6개를 추가했다. 실제 filter chain과 JWT를 사용하며 account repository는 mock이다. DB 검증을 대신한다고 표현하지 않았다.
- MySQL 기반 보안 테스트 6개도 작성·컴파일했지만 Docker Linux engine이 준비되지 않아 실행되지 않았다.

## 실패와 해결·한계

OSV 조회는 22:29 KST에 완료되고 JSON이 저장되었으나 Windows cp949 콘솔 출력이 실패했다. 저장된 JSON의 status·91개·68건을 재확인했고 재현 스크립트의 콘솔 출력은 ASCII로 바꿨다. 감사 결과를 네트워크 미실행으로 잘못 기록하지 않았다.

`./gradlew.bat test integrationTest bootJar` 두 번은 Docker named pipe 부재로 통합 클래스 8개 초기화에 실패했다. 승인된 숨김 Docker Desktop 시작 한 번도 엔진을 준비하지 못했다. 반복 우회·서비스 권한 변경을 하지 않고 검토 기록에 환경 문제를 남겼다. 기존 73개 MySQL 통과 이력을 현재 결과로 이월하지 않았다.

최종 `./gradlew.bat test bootJar`는 BUILD SUCCESSFUL(18초). XML 합계 단위/MVC 147개, 실패·오류·건너뜀 0개. suite UTC 시각은 13:50:50~13:50:58이며 KST는 22:50:50~22:50:58이다. 해당 실행 뒤 운영 코드 수정은 없고 문서·증거만 정리했다. 실제 MySQL 업무 검증, 실제 HTTP/Compose, 실모델 추론과 침투 테스트는 미실행이다.

## 산출물과 인계

- [보안 점검과 잔여 위험](../security/backend-security-review.md)
- [신규 사용자 실행·정상 API 촬영 준비](../../backend/docs/portfolio-local-runbook.md)
- `backend/verification/20261018-backend-*.json`: 해결 버전·감사·테스트 증거
- 재현용 감사/Gradle 스크립트는 `backend/verification/security/`에 보존했다. 기존 ignored QA env 없이 실행하는 안내와 과거 QA 절차를 분리했다.

프론트는 이 헤더 수정이 포함된 백엔드 소스로 촬영해야 한다. DTO·화면 흐름에 영향은 없다. Docker 엔진 복구와 새 사용자 실제 Compose 재현은 프론트/QA 실행에 필요하다. 잠재 의존성 위험과 로그인 제한 부재 등은 보고서에 남겼으며 자동 대규모 업데이트는 하지 않았다. 초기 LICENSE 미발견 사실은 QA 검토에 인계한다. GitHub push와 이력 재작성은 수행하지 않았다.
