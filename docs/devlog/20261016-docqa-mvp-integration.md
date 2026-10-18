# 2026-10-16 · 문서QA · MVP 통합 검수

## 작업 범위

설계 검토 검증 작업: Compose 3서비스·실제 브라우저/API로 MVP 검수, 결함 보고(코드 직접 수정 금지), 공통 문서 갱신, gradlew 실행비트 및 비밀값 제외 확인, 의미 단위 커밋, down 후 볼륨 유지.

## 수행 내용

- 팀별 개발일지·ADR·상세 API·실제 Flyway V1·설정을 대조했습니다.
- 기존 Git 제외 `backend/build/compose-smoke.env`와 검증 볼륨을 재사용했습니다. `.env`를 추가 생성하지 않았습니다.
- docs/qa/run-mvp.cjs로 실제 Chromium/UI와 HTTP 검수 20개를 수행하고 결과 JSON·스크린샷·검수표를 남겼습니다. 애플리케이션 소스는 수정하지 않았습니다.
- .env.example에 관리자 ID와 비밀번호/JWT 제약을 반영했습니다. ERD를 job_position/user_account.enabled와 실제 제약에 맞췄습니다. README 실행 절·스크린샷, 기능 후속 결정, ADR/일지 색인, AI 사례·회고 초안을 갱신했습니다.

## 판단 근거

계약을 따라 UI 동작과 서버 권한을 별도로 검증했습니다. 관리 화면 접근 차단을 HTTP 403과 혼동하지 않았습니다. 실제 403 API와 퇴사자 기존 JWT 401을 함께 확인했습니다. 처음 18개 통과 후 퇴사자만 참조하는 삭제와 오류 경계를 추가한 이유는 단순 사용 중 참조 검사만으로 퇴사자 정책을 증명할 수 없기 때문입니다. 최종 20개 모두 통과했습니다.

백엔드·프론트 기존 테스트는 재실행한 것으로 쓰지 않았고 별도 증거로 인용했습니다. 기존 백엔드 README 불일치는 다른 팀 편집 범위을 지켜 결함 목록 DOC-01로 보고합니다. 사용자 판단은 실제 요구사항 결정, 세부 검수·문서 판단은 Codex 수행으로 구분했습니다.

## 문제와 해결

Docker named pipe 접근 거부와 Node 결과 쓰기 EPERM은 승인된 실행으로 해결했습니다. 기존 환경파일을 출력하지 않고 메모리에서 읽어 로그인했으며 JWT/비밀번호를 결과나 스크린샷에 남기지 않았습니다. 초기 Git 단계에서 확인된 계정별 소유자 차이는 필요한 명령에만 safe.directory를 지정하는 방식으로 대응합니다.

초기 .gitignore의 Wrapper JAR 예외가 루트 gradle/만 대상으로 해 backend/gradle/wrapper/gradle-wrapper.jar까지 제외되는 문제를 커밋 사전 검사에서 발견했습니다. 문서QA 소유 .gitignore를 `!**/gradle/wrapper/gradle-wrapper.jar`로 수정하여 재현 가능한 체크아웃에 필요한 Wrapper를 포함했습니다. 앱 소스 수정은 없습니다.

## 검증 결과

| 명령/확인 | 결과 |
| --- | --- |
| docker compose ... up -d | MySQL healthy, backend/frontend 기동 |
| node docs/qa/run-mvp.cjs | 최초 18개, 보강 후 최종 20개 PASS |
| 스크린샷 직접 열기 | 관리자 목록·일반 사원 프로필 확인, 합성 데이터만 포함 |
| backend/build/test-results XML | 기존 단위/슬라이스 16개·통합 1개 실패/오류/스킵 0 확인 |
| docker compose ... down | 컨테이너·네트워크 제거, ps --all 비어 있음 |
| docker volume ls 필터 | 기존 mysql_data 볼륨 유지 |
| git update-index --chmod=+x 및 ls-files --stage | backend/gradlew 100755, Wrapper JAR 100644 확인 |
| 커밋 후보 84파일 검사 | .env/build/dist/node_modules 등 금지 경로 0, 로컬 실제 비밀값·JWT 일치 0 |
| Markdown 상대 링크 검사 | docs 내 미해결 링크 0 |
| git diff --cached --check | 백엔드·프론트·Compose 커밋 전 통과 |

검증 세부·미실행 범위·결함 재현은 [QA 보고서](../qa/2026-10-16-mvp-integration.md)에 기록했습니다. 백엔드(acd2210), 프론트(6ef1109), Compose, 문서·QA의 네 의미 단위로 커밋하며 최종 커밋 해시는 완료 보고에 남깁니다. 요청에 따라 Claude Co-Authored-By 문구를 넣지 않았습니다.

## 후속 작업

설계 검토에서 DOC-01을 백엔드팀에 배정하고 1단계 종료 회의에서 다음 단계 범위를 확정합니다. QA 생성 합성 퇴사자 및 전용 조직은 유지 볼륨에 남으므로 초기 인원은 재실행마다 달라질 수 있습니다.
