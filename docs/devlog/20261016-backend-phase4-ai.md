# 2026-10-16 백엔드 4단계 AI (검증 작업)

## 받은 지시·승인
개발 도구는 Codex, 제품 제공자는 Mock/Anthropic/Ollama로 구분한다. Claude Code(설계 검토)이 정책과 계약을 결정했다. AI3기능·제공자 추상화·안전 검증·증거·문서를 담당하며 frontend/공통문서/커밋은 수정하지 않는다.
기존 검색이 직책·입사일 범위를 지원하지 않아 로 먼저 질문했다. 설계 검토에서는 기존5필드만 제안하고 나머지는 UNSUPPORTED로 결정했다. 목록 API를 몰래 확장하지 않았다.
phase4-ai-api.md v1.0 SHA-256 E117946FE967747697A8AD6A3D0AF9A729991DB1A547BB6A468D7B09601A5617를 작성하고 의 [AI 계약 승인] 이후 구현했다.

## 수행과 AI 판단
Codex 담당이 계약·제공자·서비스·테스트·Compose·문서를 직접 수행했다. 구현 담당 추가 역할 지정/작업 분담은 없다. Claude의 UI 디자인은 다른 팀 담당이다.
Mock 기본·명시 오류·비스트리밍·재시도0을 채택해 키 없이 시연하되 실제 추론처럼 기록하지 않는다. HTTP 어댑터·업무 출력 검증·권한/데이터 투영을 분리했다. 정해진 버전의 합성 규정과 프롬프트만 사용한다. 신규 DB 구조가 필요 없어 Flyway를 만들지 않았고 V1~V4는 유지한다.

## 문제·수정 이력
초기 컴파일 명령 묶음에서 작업 디렉터리를 backend로 두고 상대경로에 backend를 중복해 설정/Mock 수정을 적용하지 못했다. 절대경로 파일 작성은 성공했고 컴파일은 성공했다. 적용 실패한 두 변경은 프로젝트 루트에서 정확한 경로로 다시 적용했다.
최초 AI 단위/어댑터34개 중1개 실패: 동시 호출 테스트의 Mockito when이 이전 예외 스텁을 실행했다. doReturn으로 고친 뒤 전체 실행했다.
첫 전체 실행은 단위 통과, MySQL73개 중72개 통과였다. 평가 요약의 내부 변환에 상세 응답 전체를 전달해 날짜 직렬화가 실패했다. 허용 items/selfAnswers/managerAnswers만 직접 변환하도록 수정했다. 원인 분류만으로 완료를 판정하지 않고 최종 전체 재실행으로 검증한다.

## 검증 상태
명령: .\gradlew.bat test integrationTest bootJar
2026-10-16 19:46 KST 종료, BUILD SUCCESSFUL(2m44s), exit0.
최종 XML: 단위·컨트롤러141개, MySQL73개, 실패/오류/스킵0. 기존107/66은 기준선이며 합산해 중복 계산하지 않았다. AI 단위·로컬 HTTP 어댑터34개와 AI MySQL7개를 추가했다. 테스트 이름과 수치는 verification/20261016-phase4-tests.json에 보존한다.
실제 Claude: 명시적 프로세스 환경에 ANTHROPIC_API_KEY가 없어 미실행. Ollama: 기존 호스트 서비스·모델을 확인하지 못해 미실행이며 모델을 내려받지 않았다. 19:47:58 KST 확인 결과를 제공자 실행표에 기록했다. 모델 ID 공식 문서 확인은 실호출 성공이 아니다.
초기 Compose 전체 빌드는 병행 프론트의 employees.tsx59 TS2322(status:string 대 좁은 enum 타입)로 실패했다. 프론트를 수정하지 않고 검토 기록에 재현 위치를 전달했다. finally down으로 정리했다. 이후 --backend-only로 MySQL/backend 이미지만 검증하며 최종 프론트/Chromium은 이 결과에 포함하지 않는다.

## 실제 Mock Compose 최종 결과
명령: py -3 backend/verification/phase4_compose_verify.py --backend-only
시각: 2026-10-16T19:50:51.699653+09:00 ~ 2026-10-16T19:54:18.465391+09:00; exit0. 기존 V4 전체 테이블 기동 전후 체크섬 보존, 신규 스키마 변경 없음, 기존/새 DB의 AI3기능 HTTP, 권한/미확정 거절과 AI감사0, 필터 제안만 수행, 인용/근거 부족, 확정 요약 읽기 전용, 감사 원문 제외, 과대 입력400과 CORS를 확인했다. 새 DB31사원/31계정/퇴사5/기본26/급여설정31 및 재시작 보존을 통과했다. down(-v 미사용)으로 볼륨을 유지했다. 병렬 동시성/실패 검증은 자동 테스트 증거이며 이 HTTP 스크립트는 순차 실행이다.

## backend-only 완료 당시 인계·미실행
확인된 미해결 백엔드 기능 결함은 없다. 실제 Claude/Ollama 추론, 프론트 최신 이미지/Chromium/스크린샷/Claude 디자인 검수는 미실행으로 구분한다. 프론트 빌드 문제는 프론트팀/설계 검토에 전달했으며 백엔드 코드로 수정하지 않았다. 루트 .env.example 및 ai-workflow 등 공통 문서는 문서QA 소유다. frontend/공통문서/커밋은 수정하지 않았다. 마지막 포트/볼륨 결과는 handoff JSON으로 인계한다.


## 9단계 전체3서비스 재확인 (검증 작업)
검증 작업의 배정 자체가 설계 검토의 [프론트 완료 통지]이며, 그 뒤 실행했다. 계약 해시와 기존 백엔드 manifest가 일치하여 기존141/73 실행을 재사용했고 새 테스트 실행이라고 기록하지 않았다. 프론트 최종 소스는 별도 full-source-manifest에 식별했다.
명령: py -3 backend/verification/phase4_full_compose_verify.py
시각: 2026-10-16T21:01:36.905227+09:00 ~ 2026-10-16T21:04:49.989217+09:00; exit0.
mysql/backend/frontend를 --build로 기동하고 frontend200, Mock AI-01~03 HTTP와 CORS200, 유지 볼륨 기동 전후 전체 테이블 체크섬 보존, 별도 빈 프로젝트 시드(31사원/31계정/퇴사5/기본26/급여설정31/평가4상태), 재시작 보존을 통과했다. 스키마 변경 없이V4를 유지했다.
기존 backend-only 기록은 compose-result의 기존 필드에 보존하고 additionalExecutions에 이번 실행을 추가했다. full-compose-result에도 동일 실행을 별도로 남겼다. 서비스 범위·이미지ID·소스·DB프로젝트/볼륨·실행 전후 행수와 결과를 기록했다. 종료는 down(-v미사용)이며 마지막 포트/볼륨 확인은 handoff의 fullComposeHandoff에 연결한다.
최종 프론트 이미지200은 이번에 실행했다. 앞선 프론트 타입 오류와 당시 backend-only 미실행 기록은 이력으로 유지한다. 이 팀의 Chromium/모바일/Claude 이미지 검수 및 실제Claude/Ollama 추론은 별도 미실행이며 기존사유를 유지한다. 정상Mock에서 직접 재현할 수 없는 오류·지연·AI_BUSY·호출0회는 승인된 QA 인계표의 테스트명/19:46 실행에 연결한다.
frontend/공통문서/커밋 수정은 하지 않았다.
