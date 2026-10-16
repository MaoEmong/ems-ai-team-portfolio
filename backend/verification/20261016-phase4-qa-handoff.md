# 4단계 AI 백엔드 → QA 검증 인계표

기준 계약: phase4-ai-api.md v1.0, SHA-256 E117946FE967747697A8AD6A3D0AF9A729991DB1A547BB6A468D7B09601A5617.

이 표는 **기존 결과만 연결**한다. 검증 작업의 프론트 완료 통지 전 작성했으며 새 테스트·Compose·빌드·포트 점검을 실행하지 않았다. 아래 모든 실행은 2026-10-16 **19:46 KST에 완료된** Gradle test/integrationTest/bootJar 전체 성공(단위141/MySQL73, 실패·오류·스킵0)에 속한다. 테스트별 완료 시각을 임의로 19:46으로 바꾸지 않는다. JSON의 suite 시작 timestamp는 AiServiceTest 19:43:50.300, LlmAdapterTest 19:43:55.539, AiMySqlTest 19:44:27.834 KST다.

공통 증거: [최종 테스트 JSON](20261016-phase4-tests.json), [소스 식별](20261016-phase4-source-manifest.json).
원시 XML은 Git 제외 build/test-results/test 및 build/test-results/integrationTest에 있다. 파라미터 사례의 표시 이름에는 합성 테스트 입력이 있으며 실제 사용자 원문이나 실호출 응답이 아니다.

| 정상 Mock에서 재현하기 어려운 항목 | 테스트 이름 | 실행 시점 | 증거·검증 범위 | QA 직접 상태 |
|---|---|---|---|---|
| 잘못된 제공자 JSON·스키마·필터·ID | AiServiceTest.malformedOrUnsafeFiltersAreRejectedWithoutRepair (10개 파라미터) | 전체 실행 19:46 KST 완료; suite 시작19:43:50 | tests.json의 AiServiceTest 사례 [1]~[10]; 허용되지 않은 SQL키·ID·타입·정렬·중복키·후행토큰 등을 주입하고 AI_INVALID_OUTPUT로 거절. 입력400 검사와 다름 | QA 직접 미실행 |
| 잘못된 HTTP 응답 봉투 | LlmAdapterTest.malformedEnvelopeRejected (3개 파라미터) | 전체 실행19:46 완료; suite 시작19:43:55 | tests.json의 LlmAdapterTest raw 사례3개; 로컬 HTTP 스텁의 JSON 아님·tool_use·빈 content 거절. 실제 모델 출력 품질 검증 아님 | QA 직접 미실행 |
| 제공자 지연·504·재시도0 | LlmAdapterTest.timeoutAndNoRetry | 전체 실행19:46 완료; suite 시작19:43:55 | 로컬 서버 지연600ms, 클라이언트 제한60ms, AI_TIMEOUT 및 호출 횟수 최대1. 제품 기본 제한30초와 테스트 제한을 구분 | QA 직접 미실행 |
| 사용자 동시 슬롯 AI_BUSY | AiServiceTest.simultaneousCallsHaveOneSlotAndReleaseOnFailure | 전체 실행19:46 완료; suite 시작19:43:50 | CountDownLatch로 첫 요청 유지 후 같은 사용자 두 번째 요청 AI_BUSY, 첫 실패 후 슬롯 재사용. Java 서비스 병렬 테스트이며 실제 HTTP 병렬 브라우저 검수가 아님 | QA 직접 미실행 |
| 분당 제한과 실패 시 원문 제외 | AiServiceTest.minuteLimitAfterTenAndFailuresDoNotLeakText | 전체 실행19:46 완료; suite 시작19:43:50 | 실패 호출10회 후 AI_RATE_LIMITED, 감사 인자에 질문 원문 없음 | QA 직접 미실행 |
| 권한 거절 시 제공자 호출0 | AiServiceTest.employeeCannotSearchOrInvoke; AiServiceTest.otherAdminAndUnfinalizedEvaluationCannotInvoke; AiMySqlTest.unauthorizedSearchAndOtherAdminSummaryHaveZeroProviderCalls | 전체 실행19:46 완료; 각 suite 시작 시각 위 참조 | Mockito verifyNoInteractions로 LlmClient/HttpLlmClient 진입0을 확인. MySQL+MockMvc에서는 실제403/404도 검증. 감사0건만으로 호출0을 주장한 것이 아니며 실외부 서버 수신 횟수 측정은 아님 | QA 직접 미실행 |
| 미확정 평가 거절 시 호출0 | AiMySqlTest.unfinalizedOwnerGets409AndFinalizedOwnerSummaryDoesNotMutateData; AiServiceTest.otherAdminAndUnfinalizedEvaluationCannotInvoke | 전체 실행19:46 완료; MySQL suite 시작19:44:27 | 409 AI_EVALUATION_NOT_FINALIZED 직후 verifyNoInteractions. 이후 확정 본인 요약 성공·원문/등급 불변은 별도 단계 | QA 직접 미실행 |
| 전송 데이터 캡처: 사원 행·점수·식별자 제외 | AiServiceTest.searchCapturesOnlyCatalogNotEmployeeRowsAndDoesNotExecuteSearch; AiServiceTest.summaryStripsScoresIdentityAndIncludesUntrustedComments; AiMySqlTest.searchOnlyProposesAndDoesNotTransferEmployeeList | 전체 실행19:46 완료 | ArgumentCaptor/argThat로 제공자 요청 data를 검사. 사원 목록 조회 자체를 실행하지 않음, 평가에 이름/사번/점수/등급 없음. 자유 텍스트 자동 익명화 보장은 아님 | QA 직접 미실행 |
| 제공자429/5xx와 그 외4xx·리다이렉트 | LlmAdapterTest.retryableProviderErrorsAreNotRetried (429/500/503); LlmAdapterTest.nonretryableAndRedirectErrors (400/401/403/302) | 전체 실행19:46 완료; suite 시작19:43:55 | 로컬 HTTP 스텁에서 안전한 오류 코드·재시도 없음·리다이렉트 미추적. 사용자 제한429와 제공자429→502를 구분 | QA 직접 미실행 |
| 키 없음·무음 Mock 대체 금지 | AiServiceTest.missingKeyNeverFallsBackAndAuditFailureNeverLeaksProviderOutput | 전체 실행19:46 완료 | 키 없는 Anthropic 설정503과 제공자 진입0; 감사 저장 실패의 원문 없는500. 실제 키를 사용하지 않음 | QA 직접 미실행 |
| 응답 바이트 상한 | LlmAdapterTest.outputAndEnvelopeByteLimits | 전체 실행19:46 완료 | 모델 JSON64KiB·HTTP 봉투128KiB 초과를 로컬 스텁으로 거절 | QA 직접 미실행 |
| 없는 인용·답변 숨김 | AiServiceTest.invalidCitationReturnsNoModelAnswer; AiMySqlTest.malformedSchemaAndMissingCitationNeverExposeProviderText | 전체 실행19:46 완료 | 잘못된 인용/인용 없음의 모델 답변을 노출하지 않고 INSUFFICIENT_EVIDENCE. 의미 정확성·환각 방지 품질 보장 아님 | QA 직접 미실행 |
| API 입력400 (출력502와 별개) | AiMySqlTest.requestSizeUnknownKeysAndNonintegerIdAreRejected; AiServiceTest.inputKeysAndTypesAreStrictAndBounded | 전체 실행19:46 완료 | 본문 한도·미정의키·중복키·비정수 ID를 입력 단계에서 거절하고 제공자 진입0 | QA 직접 미실행 |

## 다른 증거와의 경계
- [backend-only Compose 결과](20261016-phase4-compose-result.json): 기존 V4 보존·새 DB 시드와 정상 Mock HTTP. 그 실행은 순차 요청이다. 위 주입·지연·슬롯 테스트를 실제 Compose에서 했다고 옮겨 쓰지 않는다.
- [제공자 실행표](20261016-phase4-provider-runs.json): Mock/로컬 어댑터 계약은 실행, Claude 키 부재·호스트 Ollama 기존 서비스/모델 확인불가로 실추론 미실행. 키 탐색·모델 다운로드 없음.
- frontend200·전체3서비스는 설계 검토의 [프론트 완료 통지] 이후 별도 실행으로 추가한다. 현재 이 표는 해당 실행의 통과를 주장하지 않는다.
- Chromium·모바일·Claude 실제 이미지 검수는 프론트/문서QA의 별도 증거다.

## 9단계 추가 인계
검증 작업 프론트 완료 통지 후 전체3서비스 실행 2026-10-16T21:01:36.905227+09:00 ~ 2026-10-16T21:04:49.989217+09:00 성공. [전체 실행](20261016-phase4-full-compose-result.json), [소스 식별](20261016-phase4-full-source-manifest.json) 참조. 기존 backend-only 기록과 분리했다. frontend200·정상 Mock HTTP 확인이며 위 표의 오류 주입/외부호출 캡처를 새로 실행한 것이 아니다. QA 직접 미실행 표기는 QA가 별도로 판단한다.
