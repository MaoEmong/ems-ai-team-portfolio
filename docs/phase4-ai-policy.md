# 4단계 AI 정책표 — 승인 계약 기준

Claude Code(설계 검토)의 [AI 계약 승인]과 [phase4-ai-api.md v1.0](api/phase4-ai-api.md)을 기준으로 한다. 실제 파일 SHA-256은 `E117946FE967747697A8AD6A3D0AF9A729991DB1A547BB6A468D7B09601A5617`로 공유값과 일치한다. 세부 정책은 사용자 개별 결정이 아니라 설계 검토 결정이다. 정책표는 기대값이며 실제 실행 범위·미실행은 [QA 보고서](qa/2026-10-16-phase4-ai-integration.md)에 연결한다. 검증 작업의 통합 검수 시작 뒤 실제 검수했다.

## 범위와 검색 정책

| 항목 | 확정 정책 | 인수 시 확인할 사항 |
| --- | --- | --- |
| 제공자 | Mock 기본, Anthropic/Ollama 서버 설정 교체 | 실제 provider/model/mock/externalTransfer/promptVersion을 표시하고 키·base URL은 숨김 |
| 검색 권한 | ADMIN만, 사원403 | 권한 거절 때 제공자 호출0회 |
| 검색 처리 | 제안만 반환, 사용자 확인 후 기존 목록 적용 | 생성 직후 검색하지 않고 기존 GET /employees의 권한·필터 검사 재사용 |
| keyword | trim 후1~100자, 이름/사번/이메일 부분검색 | 다른 의미의 필드 검색으로 바꾸지 않음 |
| departmentId/positionId | 존재하는 양의 JSON 정수 | position은 직급이고 직책이 아님 |
| status | ACTIVE/ON_LEAVE/RETIRED | 생략하면 기존 RETIRED 제외 기본값 |
| sort | employeeNo/name/hireDate와 asc/desc의 정확한 조합 | hireDate 정렬 허용과 입사일 범위 미지원을 구분 |
| 지원 불가 | 직책·입사일 범위 요구는 UNSUPPORTED | filters={}이며 일부 조건만 조용히 적용하지 않음 |
| 금지 출력 | SQL·OR·임의 연산자·page/size·jobTitleId·hireDateFrom/To·null | 제공자 잘못된 키/ID/타입은502 AI_INVALID_OUTPUT, 임의 삭제/보정 없음 |
| 결과 상태 | OK/AMBIGUOUS/UNSUPPORTED | OK 최소1필터, 나머지는 빈필터. message1~300자 |

제공자에게는 질문·5필드 스키마·부서/직급 ID·이름 카탈로그만 보낸다. 사원 목록·직책 카탈로그·직원 개인정보·급여·평가 자료는 보내지 않는다. 사용자가 질문에 직접 넣은 개인정보까지 자동 제거한다는 의미는 아니다.

## 평가 요약과 규정 Q&A

| 기능 | 정책 | 인수 시 확인할 사항 |
| --- | --- | --- |
| 평가 요약 | FINALIZED, 본인 또는 배정 평가자 | 타인/관계없는ADMIN/없는ID404, 권한 있는 미확정409, 제공자 호출0회 |
| 요약 입력 | 양의 정수 evaluationId만 클라이언트 입력 | 서버가 매번 권한 확인 후 항목 이름·자기/관리자 코멘트만 읽음 |
| 요약 제외 | 평가/사원/평가자ID·이름·사번·연락처·급여·점수·등급 | 권한 밖 데이터 미전송을 캡처 가능한 어댑터 테스트로 확인하되 원문을 커밋하지 않음 |
| 요약 상한 | 항목20개, 코멘트합계12000자, 결과1~2000자 | 초과는400 AI_INPUT_TOO_LARGE, 모든 코멘트 빈값은400 AI_NO_COMMENTS, 자르지 않음 |
| 요약 결과 | 읽기 전용, AI 생성 보조·원문 확인 안내 | 원문/점수/등급 저장·변경, 초안 작성/제출/자동 적용 없음 |
| 규정 근거 | 고정 합성 문서의 ID/버전/절/본문 | 실제 직원/회사규정·외부웹·DB·급여/휴가 원문 검색 없음 |
| ANSWERED | 답변1~2000자, 인용1~3개, 발췌1~300자 | 문서/버전/절과 발췌가 원문에 그대로 존재해야 함 |
| 근거 불일치 | INSUFFICIENT_EVIDENCE로 정규화 | answer=null,citations=[], 모델 답변 미노출 |
| 구조 오류 | AI_INVALID_OUTPUT502 | 근거 불일치 정상200과 구분 |
| 규정 고지 | 서버 고정 notice 추가 | 모델 출력은 notice 제외 status/answer/citations만, 실제 회사/법률 안내 아님 |

인용 원문 일치 검증은 의미적 정확성·질문 관련성·환각 방지 품질을 보장하지 않는다. 생성 문구 자체의 완전 일치 대신 권한·스키마·출처·거절/근거 부족 동작을 검증한다. 실제 모델 미실행을 Mock 품질 판정으로 대신하지 않는다.

## 전송·한도·오류

| 항목 | 계약 |
| --- | --- |
| 방식 | 비스트리밍, 자동 재시도0, 공유 결과 캐시 없음, 실패 시 Mock 대체 없음 |
| 고지 | Anthropic/Ollama externalTransfer=true, Mock=false. 기능별 전송 필드 설명 후 명시 실행 버튼. 별도 승인API/동의플래그 없음 |
| 질문 길이 | trim 후1~500, Java String.length UTF-16 단위 |
| 크기 | 요청본문16KiB, 모델JSON64KiB, HTTP응답봉투128KiB·읽는 중 제한 |
| 호출 제한 | 기본30000ms, 연결 최대5000ms, maxTokens1024 |
| 사용자 한도 | 사원ID별 AI POST 합계 동시1건·60초고정창10회, 단일 서버 메모리·재시작 초기화 |
| 횟수 기준 | 권한/입력/평가 사전검사 후 슬롯 획득. 사전실패·슬롯충돌은 횟수 제외, 실제시도/제공자오류는 포함 |
| 슬롯 해제 | 완료/실패/횟수초과 시 해제. GET /ai/config는 횟수 제외 |
| JSON | 요청 미정의키/잘못된타입400. 제공자 중복키/미정의키/타입/후행토큰/코드펜스502 |
| 출력 | 일반 텍스트 렌더링, HTML 삽입 없음. 브라우저 중단은 제공자 처리·비용 취소 보장 아님 |

오류는 기존 code/message/fieldErrors에 AI 오류의 retryable을 추가한다. retryable은 자동 재시도가 아니다. 인증/권한 등 기존 오류는 없을 수 있다.

| HTTP | 코드 | retryable |
| --- | --- | --- |
| 400 | VALIDATION_ERROR / AI_INPUT_TOO_LARGE / AI_NO_COMMENTS | false |
| 409 | AI_EVALUATION_NOT_FINALIZED | false |
| 429 | AI_BUSY / AI_RATE_LIMITED | true |
| 503 | AI_NOT_CONFIGURED / AI_DISABLED | false |
| 504 | AI_TIMEOUT | true |
| 502 | AI_PROVIDER_ERROR / AI_INVALID_OUTPUT | true |
| 502 | AI_PROVIDER_REJECTED | false |

제공자429/5xx는 AI_PROVIDER_ERROR502로, 제공자 기타4xx는 AI_PROVIDER_REJECTED502로 구분한다. 응답·로그·감사에는 질문/키/제공자 오류 원문을 넣지 않는다. 모델 출력·외부 URL·SQL·도구 호출은 신뢰/실행하지 않는다. base URL은 서버 설정만 허용하고 HTTP(S)·리다이렉트 금지를 적용한다.

## 감사·실행 증거와 제외 범위

AI_INVOKE는 기존 감사 스키마를 사용한다. actor는 기존 인증 사원 스냅샷이고 targetType/targetId/targetLabel/before/after는 null이다. metadata 허용 키는 feature/provider/model/promptVersion/durationMs/errorCode뿐이다. 권한·입력·슬롯/분당 거절은 AI감사0건, 호출 시도는 성공/실패 각각1건이다. 감사 저장 실패는 원문 없는500 INTERNAL_ERROR이며 호출을 재시도하지 않는다. 결과 DB저장·기존 업무자료 변경은 없다. 스키마 변경이 없으면 불필요한 Flyway 버전을 추가하지 않고 V1~V4를 유지한다.

- 기본 제공자 Mock은 계약 시연이며 실제 추론이 아니다. Anthropic 기본 모델명 claude-sonnet-5-5는 설계 검토 설정 결정으로, 모델 존재/접근/성공은 별도 확인 대상이다.
- 실제 Claude API는 명시 제공 키가 있을 때만, Ollama는 기존 서비스/설치 모델이 있을 때만 실호출한다. 키 자동 탐색·모델 자동 다운로드 없음. 미구성은 미실행 사유를 기록한다.
- 개발 AI(Codex/Claude 디자인)와 제품 제공자(Mock/Anthropic/Ollama), 단위/MySQL·HTTP스텁·실추론·Compose/Chromium·Claude 이미지 판정은 각각 구분한다.
- 범용 HR질의·평가 초안 작성/저장·검색 API 확장·공유캐시·스트리밍·다중 인스턴스 전역 제한은 제외한다.
- 최종 인계·설계 검토 통합 검수 시작 뒤 실제 기존62회귀+AI검수, down/볼륨유지·비밀값/산출물검사·작업주체본문3커밋을 수행한다. 현재 실제 Mock 검수/보존 결과는 QA 보고서에 기록하며 실Claude/Ollama추론은 미실행이다.
