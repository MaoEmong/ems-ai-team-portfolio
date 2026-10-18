# ADR 0112: AI 제공자 추상화와 모델 설정
설계 검토: Claude Code. 구현·테스트: Codex(백엔드). 계약 phase4-ai-api.md v1.0을 확정한 이후 구현했다.

LlmClient를 경계로 MockLlmClient, AnthropicLlmClient, OllamaLlmClient를 두고 HttpLlmClient가 서버 설정만으로 선택한다. HTTP 전송은 공통 제한을 사용한다. 요청에서 provider/base URL을 받지 않는다. Mock 기본값은 키 없이 결정적 시연을 제공하며 실제 추론이 아니다. 오류·키 누락에 Mock으로 전환하지 않는다.
비스트리밍, 자동 재시도0, 사용자별 동시1·60초10회, 기본30초/1024토큰이다. 공유 결과 캐시는 없다. 외부 호출 중 DB 트랜잭션을 유지하지 않고 감사만 별도 짧은 트랜잭션으로 남긴다. 단일 서버 메모리 제한은 재시작 시 초기화되며 다중 서버 전역 제한은 아니다.
Anthropic/Ollama 모두 externalTransfer=true다. Ollama는 호스트 서비스로서 클라우드라는 뜻은 아니다. UI 실행 버튼과 전송 범위 고지를 사용하며 별도 승인 API는 없다. 브라우저 취소는 제공자 비용 취소를 보장하지 않는다.

## 모델 ID 확인과 실호출의 구분
설계 검토에서 채택한 기본 claude-sonnet-5-5를 사용하고 EMS_AI_MODEL로 바꾼다. 2026-10-16 공식 문서에서 모델 ID를 확인했다: [Claude Sonnet 5.5 변경점](https://platform.claude.com/docs/en/models/sonnet-5-5/whats-new-sonnet-5-5).
요청 형식은 [Messages API](https://platform.claude.com/docs/en/api/messages/create)와 [Ollama generate](https://docs.ollama.com/api/generate)를 참고했다. 공식 모델 표기 확인은 계정 접근 권한이나 실호출 성공 증거가 아니다.
키는 ANTHROPIC_API_KEY 환경변수로만 받고 기존 사용자 환경에서 명시된 키가 있을 때만 실호출한다. Ollama는 기존 서비스·모델만 사용하고 모델을 다운로드하지 않는다. 제공자별 실행/미실행·사유는 verification의 별도 실행표로 기록한다.

## 검증
로컬 스텁은 헤더·요청·비스트리밍·오류 매핑·시간/바이트 상한·재시도0만 검증하며 실제 추론과 다르다. 최종 실행 결과는 4단계 개발일지에 연결한다.

최종 자동검증: 단위·컨트롤러141/MySQL73 통과(실패·오류·스킵0). Mock 실제 HTTP와 실호출 미실행 사유는 [개발일지](../devlog/20261016-backend-phase4-ai.md) 및 backend/verification/20261016-phase4-*.json 참조. 실제 제공자 품질 검증으로 해석하지 않는다.
