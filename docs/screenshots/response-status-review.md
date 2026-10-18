# 촬영 스크립트 변경 요청의 성공 상태 대조

작성: Codex 화면 구현, 2026-10-19. 전달된 검토 담당자 승인 승인 기록에 따른 정적 읽기 대조다. 제품 HEAD 89db901 기준이며 아래 상태는 실제 재호출 결과가 아니라 컨트롤러의 성공 응답 선언이다. 경로의 공통 접두사는 `/api/v1`이다. 스크립트에 PATCH 호출은 없고, UI에서 입력/확인 모달만 여는 작업은 제출하지 않는다.

| 메서드·경로 | 백엔드 성공 상태 | 기존 스크립트 기대 | 수정 후 기대 | 소스 근거 |
|---|---:|---:|---:|---|
| POST /auth/login (API·UI) | 200 | 200 | 200 | ApiController.login 일반 반환 |
| POST /departments (부모·자식) | 201 | 201 | 201 | ApiController.department ResponseEntity.created |
| POST /job-titles | 201 | 201 | 201 | OrganizationController.create status(201) |
| POST /employees | 201 | 201 | 201 | ApiController.create ResponseEntity.created |
| POST /employees/{id}/appointments | 201 | **200** | **201** | Phase2Controller.create status(201) |
| PUT /attendance/{employeeId}/{date} | 200 | 200 | 200 | Phase3Controller.correct 일반 반환 |
| POST /leaves (승인용·대기용) | 201 | 201 | 201 | Phase3Controller.create status(201) |
| POST /leaves/{id}/approve | 200 | 200 | 200 | Phase3Controller.approve 일반 반환 |
| POST /evaluation-cycles (4종 상태 준비) | 201 | 201 | 201 | EvaluationController.create status(201) |
| POST /evaluation-cycles/{id}/open | 200 | 200 | 200 | EvaluationController.open 일반 반환 |
| POST /evaluations/{id}/self/submit | 200 | 200 | 200 | EvaluationController.submitSelf 일반 반환 |
| POST /evaluations/{id}/manager/submit | 200 | 200 | 200 | EvaluationController.submitManager 일반 반환 |
| PUT /employees/{id}/salary-setting | 200 | 200 | 200 | PayrollController.setting 일반 반환 |
| POST /payrolls (초안·확정용 월) | 201 | 201 | 201 | PayrollController.generate status(201) |
| POST /payrolls/{month}/confirm | 200 | 200 | 200 | PayrollController.confirm 일반 반환 |
| POST /employees/import (UI multipart) | 201 | 201 | 201 | Phase2Controller.upload status(201) |
| POST /ai/employee-search (UI) | 200 | 200 | 200 | AiController.search 일반 반환 |
| POST /ai/evaluation-summary (UI) | 200 | 200 | 200 | AiController.summary 일반 반환 |
| POST /ai/policy-qa (UI·두 질문) | 200 | 200 | 200 | AiController.policy 일반 반환 |

위 메서드에 별도 @ResponseStatus 선언은 없다. ResponseEntity 지정 외 일반 본문 반환은 Spring MVC 기본 200이다. 평가 self/manager PUT 저장, 주기 CLOSE, 급여 재계산, 휴가 반려/취소, 알림 읽음 POST는 이 촬영 스크립트가 실행하지 않는다. 평가 입력과 급여 확정·휴가 승인 모달은 캡처만 한다.

원인: 공통 json()은 creates 정적 목록의 POST만 201을 기대하며 동적 appointments 경로가 목록에 없었다. 사원 생성은 통과했고 발령 생성의 정상 201을 실패로 판정했다. 변경은 해당 호출의 accepted 인자 `[201]` 추가 한 곳뿐이다. 다른 수락 상태를 넓히거나 제품·DB·계약·계산·상태 준비 로직을 변경하지 않는다. 실패한 0장 manifest와 execution-initial.json은 보존한다. 후속 실행 결과는 별도 manifest와 execution 파일로 기록한다.
