# 4단계 AI API 계약 v1.0

- 기준: AI 기능 설계 검토와 입력 상한 확정. 설계 검토에는 Claude Code를 활용했다.
- Base: /api/v1, JSON, Authorization: Bearer <token>. 모든 경로는 인증 필수.
- 이 계약을 작성·공유하고 설계 검토로 확정한 뒤 구현한다.
- AI-01의 직책·입사일 범위 예시는 후속 결정으로 대체한다. 기존 GET /employees의 keyword, departmentId, positionId, status, sort만 지원하고 기존 목록 API를 확장하지 않는다.
- 비스트리밍, 자동 재시도 0, 공유 결과 캐시 없음, 실패 시 Mock 자동 대체 없음.
- Claude 기본 모델은 설계 검토에서 채택한 claude-sonnet-5-5이며 환경 설정으로 바꾼다. 모델 설정과 실제 호출 성공은 별도다.

## 1. 공통 설정·응답

### GET /ai/config
모든 인증 사용자. 200. 서버 설정만 공개하며 키·base URL·준비 상태의 상세 자격증명은 공개하지 않는다.

```json
{
  "provider":"mock",
  "model":"deterministic-v1",
  "mock":true,
  "externalTransfer":false,
  "enabled":{"employeeSearch":true,"evaluationSummary":true,"policyQa":true},
  "promptVersion":"ems-ai-v1"
}
```

enabled는 기능 설정 여부다. 사용자별 권한을 대신하지 않고 실호출 성공도 보장하지 않는다. provider는 mock|anthropic|ollama다. Mock 모델 표시는 deterministic-v1, Anthropic/Ollama는 실제 요청 모델 설정이다. externalTransfer는 mock=false, anthropic=true, ollama=true로 표시한다. Ollama도 EMS 서버 프로세스 밖으로 전송하므로 true이며 클라우드라는 뜻은 아니다.

모든 성공 기능 응답은 meta와 result를 가진다. generatedAt은 Asia/Seoul 오프셋 포함 ISO-8601이다. requestId는 서버 생성 UUID이며 원문을 포함하지 않는다.

```json
{
  "meta":{
    "requestId":"94ee406e-e92a-4f9b-bc35-78617af97820",
    "provider":"mock","model":"deterministic-v1",
    "mock":true,"externalTransfer":false,
    "promptVersion":"ems-ai-v1",
    "generatedAt":"2026-10-16T20:00:00+09:00"
  },
  "result":{}
}
```

Mock은 결정적인 시연 결과이며 **실제 추론 아님**을 화면에 고지한다. externalTransfer=true인 경우 화면에서 아래 전송 필드를 고지하고 사용자가 실행 버튼을 명시적으로 누른 뒤 요청한다. 별도의 승인 API나 동의 플래그는 추가하지 않는다. 브라우저 요청 중단은 제공자 처리나 비용 취소를 보장하지 않는다.

## 2. AI-01 자연어 사원 검색 필터 제안

### POST /ai/employee-search
ADMIN 전용. EMPLOYEE는 403이며 제공자를 호출하지 않는다.

```json
{"question":"재직 중인 개발 부서 사원을 이름순으로"}
```

200 예시(아래 ID는 해당 서버 카탈로그에 존재하는 경우의 예시):

```json
{
  "meta":{"requestId":"94ee406e-e92a-4f9b-bc35-78617af97820","provider":"mock","model":"deterministic-v1","mock":true,"externalTransfer":false,"promptVersion":"ems-ai-v1","generatedAt":"2026-10-16T20:00:00+09:00"},
  "result":{"status":"OK","filters":{"departmentId":1,"status":"ACTIVE","sort":"name,asc"},"message":"제안된 조건을 확인한 뒤 적용하세요."}
}
```

result는 정확히 status, filters, message를 가진다.
- status: OK | AMBIGUOUS | UNSUPPORTED.
- filters: 허용 키만 갖는 객체. 생략된 조건은 적용하지 않는다. null 값은 허용하지 않는다.
- keyword: 공백 제거 후 1~100자 문자열. 기존 이름·사번·이메일 부분 검색 의미.
- departmentId, positionId: 해당 카탈로그에 존재하는 양의 JSON 정수. positionId는 직급이며 직책이 아니다.
- status: ACTIVE | ON_LEAVE | RETIRED. 생략하면 기존 API의 RETIRED 제외 기본값을 유지한다.
- sort: employeeNo|name|hireDate 각각 asc|desc로 조합한 정확한 문자열. 예: employeeNo,asc.
- message: 공백 아닌 일반 텍스트 1~300자.
- OK는 최소 하나의 필터가 있어야 한다.
- AMBIGUOUS/UNSUPPORTED는 filters={}이고 message에 확인할 사항 또는 지원 불가 사유를 안내한다. 부분 조건만 조용히 적용하지 않는다.
- 직책·입사일 범위 요구는 UNSUPPORTED다. SQL, 임의 연산자, OR 표현식, page/size, jobTitleId, hireDateFrom/To 등은 허용하지 않는다.
- 모델이 잘못된 키/ID/타입을 반환하면 502 AI_INVALID_OUTPUT이다. 서버가 임의로 삭제·보정해 성공시키지 않는다.
- 서버는 검색을 실행하지 않는다. 프론트가 제안을 보여 주고 사용자가 적용하면 기존 GET /employees에 허용 필터만 전달한다. 해당 API가 권한을 다시 검사한다.

```json
{"status":"UNSUPPORTED","filters":{},"message":"직책과 입사일 범위는 현재 필터 제안에서 지원하지 않습니다."}
```

```json
{"status":"AMBIGUOUS","filters":{},"message":"어떤 부서를 의미하는지 부서 이름을 구체적으로 입력해 주세요."}
```

## 3. AI-02 확정 평가 코멘트 요약

### POST /ai/evaluation-summary

```json
{"evaluationId":1}
```

evaluationId는 양의 JSON 정수. 대상은 FINALIZED 평가서만이다. 평가서 본인 또는 배정 평가자만 허용한다. 다른 사용자·관계없는 ADMIN·없는 ID는 404 NOT_FOUND, 해당 조회 권한이 있으나 미확정이면 409 AI_EVALUATION_NOT_FINALIZED. 모두 제공자 호출 0회다.
서버가 평가서에서 허용된 코멘트를 읽으며 클라이언트는 코멘트를 보내지 않는다. 본인·평가자 여부는 호출마다 재검사한다.
전송 자료는 평가 항목 이름과 항목별 자기/관리자 코멘트뿐이다. 항목20개 이하, 코멘트 합계12000자 이하. 초과하면 400 AI_INPUT_TOO_LARGE로 일부를 잘라 보내지 않는다. 양쪽 코멘트가 모두 비어 있으면 400 AI_NO_COMMENTS다.
200 result 예시:

```json
{"summary":"협업과 문제 해결에 대한 긍정적 피드백이 있으며, 일정 공유를 개선 과제로 제시했습니다."}
```

summary는 공백 아닌 일반 텍스트1~2000자. 서버는 원문·점수·등급을 변경하거나 저장하지 않는다. 초안 작성/제출/자동 적용 기능은 없다. 요약은 AI 생성 보조이며 원문 확인이 필요하다.

## 4. AI-03 합성 규정 Q&A

### POST /ai/policy-qa
모든 인증 사용자.

```json
{"question":"오전 반차일의 출근 기준은 언제인가요?"}
```

200 result 예시:

```json
{
  "status":"ANSWERED",
  "answer":"데모 규정상 오전 반차일의 출근 기준은 14:00입니다.",
  "citations":[{"documentId":"DEMO-ATTENDANCE","version":"1.0","sectionId":"HALF_DAY","excerpt":"오전 반차일의 출근 기준은 14:00입니다."}],
  "notice":"가상 회사의 합성 데모 규정이며 실제 회사 규정이나 법률 안내가 아닙니다."
}
```

- result는 정확히 status, answer, citations, notice를 가진다.
- status: ANSWERED | INSUFFICIENT_EVIDENCE.
- ANSWERED: answer 일반 텍스트1~2000자, citations1~3개. 각 인용은 documentId/version/sectionId/excerpt만 가진다.
- excerpt는 공백 아닌1~300자이며 지정한 문서·버전·절 원문에 그대로 존재해야 한다. 정규화·유사 일치로 통과시키지 않는다.
- 존재하지 않는 문서/절/버전·맞지 않는 발췌·인용 없는 답변은 서버가 아래 INSUFFICIENT_EVIDENCE로 바꿔 반환하고 모델의 답변을 노출하지 않는다.
- 구조 자체가 잘못되면 502 AI_INVALID_OUTPUT. 모델이 근거 부족을 반환한 경우에도 아래 형태만 허용한다.
- notice는 서버 고정 문구다. 모델이 만든 notice는 받지 않는다. 모델 출력 스키마는 notice를 제외한 status/answer/citations이며, 서버가 notice를 덧붙인다.
- 인용 검증은 의미적 정확성이나 질문과의 관련성을 보장하지 않는다. 원문 확인 안내를 표시한다.

```json
{
  "status":"INSUFFICIENT_EVIDENCE",
  "answer":null,"citations":[],
  "notice":"가상 회사의 합성 데모 규정이며 실제 회사 규정이나 법률 안내가 아닙니다."
}
```

근거 자료는 backend/src/main/resources/ai/policies/의 버전 있는 고정 합성 문서만 사용한다. 외부 웹·DB·급여·휴가 신청 원문을 검색하지 않는다.

## 5. 전송 필드와 제외 필드

| 기능 | 제공자에게 전송 | 제외 |
|---|---|---|
| AI-01 | 질문, 지원 필터 스키마, 부서·직급 ID/이름 카탈로그 | 사원 목록, 이름/사번/연락처/급여/평가 데이터, 직책 카탈로그 |
| AI-02 | 항목 이름, 자기·관리자 코멘트 | 평가·사원·평가자 ID, 이름, 사번, 연락처, 급여, 점수, 등급 |
| AI-03 | 질문, 합성 규정 ID/버전/절/본문 | 실제 직원·회사 규정·HR 업무 원문 |

사용자가 입력한 질문·코멘트 자체에 개인정보가 있을 수 있으므로 전송 전 화면에서 안내한다. 구조적 필드 제외가 자유 텍스트의 개인정보를 자동 제거한다는 뜻은 아니다. 질문·코멘트·규정은 비신뢰 데이터로 구분하고 상위 지시 변경·비밀 공개 요구를 따르지 않도록 템플릿에 명시한다. 도구 호출·SQL 실행·외부 URL 접근 기능은 제공하지 않는다.

## 6. 상한과 호출 제한

| 항목 | 값 |
|---|---|
| 질문 | 공백 제거 후1~500자 |
| 평가 항목/코멘트 | 최대20항목/합계12000자 |
| 질문·메시지·요약 길이 | Java String.length 기준 UTF-16 단위 |
| 요청 JSON 본문 | 최대16KiB, 초과400 AI_INPUT_TOO_LARGE |
| 모델 출력 JSON | UTF-8 최대65536바이트(64KiB) |
| 제공자 HTTP 응답 봉투 | 최대131072바이트(128KiB), 스트림 읽기 중 제한 |
| 전체 제공자 HTTP 호출 제한 | 기본30000ms, 연결 제한 최대5000ms |
| maxTokens | 기본1024 |
| 동시 요청 | 사원 ID별 AI POST 합계1건, 처리 완료/실패 시 해제 |
| 분당 제한 | 사원 ID별 AI POST 합계10회, 60초 고정창 |
| 서버 자동 재시도 | 0 |

인증·권한·입력/평가 사전 검사 후 호출 슬롯을 획득한다. 슬롯 충돌은429 AI_BUSY. 슬롯 획득 후 분당10회 초과는429 AI_RATE_LIMITED이며 슬롯을 해제한다. 슬롯 충돌·사전검사 실패는 분당 횟수에 포함하지 않고 실제 호출 시도(제공자 오류 포함)는 포함한다. GET /ai/config는 이 제한에 포함하지 않는다. 제한은 단일 서버 프로세스 메모리 기준이며 재시작 시 초기화한다. 다중 인스턴스 전역 제한은 범위 밖이다.
JSON 요청의 미정의 키·잘못된 타입은400. 제공자 JSON의 중복 키·미정의 키·잘못된 타입·후행 토큰·코드펜스 출력은502로 거절한다. 텍스트는 HTML로 렌더링하지 않는다.

## 7. 오류와 재시도

기존 오류 body(code,message,fieldErrors)를 유지하고 AI 경로에서 발생한 AI 오류에는 retryable(boolean)을 추가한다. 기존 일반 오류/인증·인가 오류는 이 필드가 없을 수 있다. 오류 message/fieldErrors에 질문·응답·키·제공자 오류 원문을 넣지 않는다. retryable은 서버의 자동 재시도를 뜻하지 않고 사용자가 나중에 다시 시도할 수 있는지다.

```json
{"code":"AI_TIMEOUT","message":"AI 응답 시간이 초과되었습니다.","fieldErrors":[],"retryable":true}
```

| HTTP | 코드 | retryable | 의미 |
|---|---|---|---|
|400|VALIDATION_ERROR|false|형식·타입·필수·길이 오류|
|400|AI_INPUT_TOO_LARGE|false|요청 본문/평가 자료 상한 초과|
|400|AI_NO_COMMENTS|false|요약할 코멘트 없음|
|401|UNAUTHORIZED|없음|로그인 필요/계정 비활성|
|403|FORBIDDEN|없음|검색 ADMIN 권한 없음|
|404|NOT_FOUND|없음|평가 없음/다른 사용자|
|409|AI_EVALUATION_NOT_FINALIZED|false|미확정 평가|
|429|AI_BUSY|true|해당 사용자 다른 AI 요청 처리 중|
|429|AI_RATE_LIMITED|true|분당10회 초과|
|503|AI_NOT_CONFIGURED|false|키/모델/base URL/제공자 설정 미구성|
|503|AI_DISABLED|false|기능 설정 비활성|
|504|AI_TIMEOUT|true|제공자 호출 시간 초과|
|502|AI_PROVIDER_ERROR|true|통신 실패/제공자429·5xx|
|502|AI_PROVIDER_REJECTED|false|제공자 그 외4xx/인증 거절|
|502|AI_INVALID_OUTPUT|true|JSON/스키마/출력·봉투 상한 위반|

AMBIGUOUS/UNSUPPORTED/INSUFFICIENT_EVIDENCE는 정상200 결과 상태이며 자동 재시도하지 않는다. 제공자429는 사용자 제한429와 구분해502 AI_PROVIDER_ERROR로 매핑한다.

## 8. 제공자와 설정

- EMS_AI_PROVIDER=mock 기본. 알 수 없는 값은 제공자 미구성 오류로 처리한다.
- EMS_AI_MODEL: 선택 재정의. 기본 mock=deterministic-v1, anthropic=claude-sonnet-5-5, ollama=빈 값(설치된 모델을 명시).
- EMS_AI_TIMEOUT_MS=30000, EMS_AI_MAX_TOKENS=1024.
- ANTHROPIC_API_KEY: anthropic에서만 환경변수로 사용, 누락503. 기본 base URL https://api.anthropic.com, ANTHROPIC_BASE_URL로 서버 설정.
- OLLAMA_BASE_URL: 기본 http://host.docker.internal:11434. 호스트 직접 실행 시 http://localhost:11434로 설정. 모델 자동 다운로드 없음.
- EMS_AI_EMPLOYEE_SEARCH_ENABLED / EMS_AI_EVALUATION_SUMMARY_ENABLED / EMS_AI_POLICY_QA_ENABLED: 기본true.
- base URL은 서버 운영 설정이며 요청에서 받지 않고 config 응답에도 포함하지 않는다. HTTP(S)만 허용하고 요청당 URL 변경·리다이렉트는 허용하지 않는다.
- Anthropic POST /v1/messages: system·messages·model·max_tokens·stream=false, x-api-key 및 anthropic-version 헤더. 텍스트 content만 처리하고 tool 호출 결과는 거절한다.
- Ollama POST /api/generate: system·prompt·model·format=json·stream=false·options.num_predict. response 문자열을 검증한다.
- Mock은 기능별 고정/카탈로그 기반 결과로 계약 시연만 하며 실제 자연어 이해 품질을 검증한 것이 아니다.

## 9. 감사·데이터 보존

AI_INVOKE action 추가. actor는 기존 인증 사원 스냅샷, targetType/targetId/targetLabel/before/after는 null.
metadata 허용 키는 feature(AI-01|AI-02|AI-03), provider, model, promptVersion, durationMs(0이상 정수), errorCode(null 또는 안전한 오류 코드)뿐이다. success는 감사 공통 필드다.
권한·입력 사전검사 이후 슬롯을 얻어 수행한 호출 시도를 성공/실패 각각1건 기록한다. 권한·입력 실패와 슬롯/분당 거절은 AI_INVOKE를 남기지 않는다. 정상200 결과 상태는 감사 success=true이다. provider 실패는 success=false이고 원문 없이 코드만 기록한다. 별도 짧은 트랜잭션으로 감사한다. 감사 저장 실패 시 응답은 원문 없는500 INTERNAL_ERROR이며 호출을 재시도하지 않는다.
AI 결과는 DB에 저장하지 않고 기존 사원/평가/규정 데이터를 변경하지 않는다. V1~V4는 불변이며 새 업무 테이블은 필요 없다. 감사 컬럼의 기존 문자열 타입으로 action을 확장하므로 스키마 변경이 없으면 불필요한 Flyway 버전을 만들지 않는다.
개발 AI(Codex/Claude 디자인)와 제품 제공자(Mock/Anthropic/Ollama)는 기록을 분리한다.

## 10. 검증·변경 이력
- Mock 단위/MySQL, 로컬 HTTP 스텁 어댑터 계약, 실제 제공자, Compose HTTP, Chromium, Claude 이미지 검수는 별개 증거다.
- 실제 제공자는 명시적으로 제공된 환경 키 또는 기존 Ollama 서비스·모델이 있을 때만 호출한다. 없으면 미실행 사유를 남긴다.
- v1.0: AI 정책 검토 및 상한/기존 필터 호환 검토 반영. 계약 확정 전 구현하지 않는다.
