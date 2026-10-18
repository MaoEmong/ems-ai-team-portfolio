# 2026-10-16 평가 모듈 구현

- 작업: 평가 구현. 담당: Codex(백엔드).
- 기준: `docs/api/phase3b-api.md` 5/6/7과 확정 테이블 계약. 기존 서비스, 보안, 감사 및 MySQL 테스트 패턴을 읽고 적용했다.
- 소유 파일: EvaluationService.java, EvaluationController.java, EvaluationDto.java, EvaluationDemoSeeder.java, EvaluationControllerTest.java, EvaluationMySqlTest.java, 이 일지. 다른 파일과 Git 커밋은 변경하지 않았다.

## 구현

- 주기는 DRAFT 전체 교체, OPEN 항목 스냅샷·평가서 일괄 생성, CLOSED 마감으로 처리한다. 종료일은 표시만 하고 날짜에 따라 자동 마감하지 않는다. 항목은 순서/id, 배정은 사원 id, 주기·평가서 목록은 id 역순이다.
- 주기 관리는 ADMIN, 평가 상세는 본인 또는 현재 배정 평가자만 허용한다. 관계없는 ADMIN도 상세 404다. 재배정은 별도의 ADMIN 관리 동작이며 민감 답변을 반환하지 않는 요약을 돌려준다.
- 상세 응답을 명시적으로 조립해 확정 전 본인의 managerAnswers/finalScore/grade 키를 제외한다. 목록은 요약 필드만 반환한다. allowedActions는 주기·평가서 상태, 사용자 관계 및 평가자 유효성을 반영한다. REASSIGN_REVIEWER는 OPEN·미확정 ADMIN 요약에만 넣는다.
- 입력은 Bean Validation과 서비스 검증을 함께 적용한다. 점수/정렬순서의 소수 및 문자열 입력은 Jackson 자동 정수 변환을 차단한다. 초안은 부분 답변과 null 점수를 허용한다. 제출은 모든 스냅샷 항목의 1~5 점수를 요구한다. 중복·미등록 항목은 거절하고 검증 완료 후에만 저장한다.
- 평가자 자격은 enabled+ADMIN+ACTIVE+입사일 도래이며 자기 결재를 차단한다. 배정과 OPEN 및 답변 처리에서 검증한다. OPEN 이후 대상자 퇴사가 기존 배정 평가자의 완료를 막지는 않는다.
- 답변은 각 호출에서 해당 단계 전체를 대체한다. 자기 제출 뒤 회수는 없고 관리자 제출 즉시 FINALIZED다. 재배정은 관리자 답변·최종값을 지우고 MANAGER_DRAFT를 SELF_SUBMITTED로 되돌리며 배정 테이블과 평가서를 함께 갱신한다.
- 관리자 점수만 BigDecimal 평균·소수 둘째 자리 HALF_UP으로 계산하고 반올림된 값으로 S/A/B/C/D를 판정해 저장한다. 입력한 최종점수·등급은 사용하지 않는다.
- 서비스는 READ_COMMITTED 트랜잭션을 사용한다. cycle_id는 불변이며 쓰기는 주기 행 → 평가서 행의 FOR UPDATE 순서로 읽고 상태를 검사한다. OPEN/CLOSE도 같은 주기 행으로 직렬화한다. 동일 단계의 중복 제출은 첫 성공 뒤 409 상태 충돌이 된다.
- AuditService.record는 같은 업무 트랜잭션에서 호출한다. 신규 action은 계약의 EVALUATION_FINALIZE를 포함한다. 전후에는 state만, metadata에는 해당 action에 허용된 ID만 넣고 targetLabel은 null이다. 점수·등급·코멘트는 남기지 않는다. 알림은 생성하지 않는다.

## 빈 DB 합성 시드

- EvaluationDemoSeeder.seed는 MANDATORY이므로 외부 트랜잭션 없이 호출하면 거절한다. ApplicationRunner나 독립 실행 경로는 없다. DemoSeeder가 빈 DB 최초 생성 트랜잭션 끝에서만 호출한다.
- 활성·입사일 도래 ADMIN 1명과 그와 다른 활성·입사일 도래 사원 4명을 선택한다. OPEN 주기 1개와 SELF_DRAFT/SELF_SUBMITTED/MANAGER_DRAFT/FINALIZED 각 1개를 만든다. 항목과 모든 코멘트는 합성 문자열이다. 기존 평가 주기가 있으면 추가 생성하지 않는다.
- HTTP로 사용하거나 실제 사람·사용 실적을 표현하지 않는다. 시드에서 업무 감사·알림·과거 이력을 만들지 않는다.

## 검증 코드 및 인계

- EvaluationControllerTest: 인증/ADMIN 권한, 중첩 입력 검증, 정수가 아닌 점수·범위·긴 코멘트 거절, 생성201, 초안/제출 라우팅, 상세 공개 키 제외 직렬화, 목록 파라미터.
- EvaluationMySqlTest: Testcontainers mysql:8.0, mysql 태그, 테스트 전용 빈 DB 설정. 실제 서비스의 권한, 공개 전 관리자 초안 키 제외와 확정 공개, 목록의 민감 필드 부재, 주기 수정/항목 스냅샷, 초안 전체 대체/제출 검증, 재배정 초기화·이전 평가자 접근 취소, 마감 미완료 표시, 평가자 자격 재검사·대상 퇴사 후 완료, READ_COMMITTED 동시 자기/관리자 제출, 마감/재배정과 대기 제출의 경쟁을 검증하는 코드를 작성했다.
- 감사 강제 실패 시 주기 생성·OPEN 스냅샷·자기 제출·관리자 확정·재배정의 롤백과 감사 내용 제한을 검증한다. 점수/등급 경계와 HALF_UP 중간값(1.125→1.13), 시드 트랜잭션·혼합 상태·재호출도 포함한다.
- 이 구현 작업에서는 빌드·테스트·Compose를 실행하지 않았다. 컴파일 또는 테스트 통과를 주장하지 않는다. 백엔드 전체 빌드와 MySQL/HTTP 통합 검증 및 피드백이 필요하다.
- 통합 전제: 백엔드 통합 작업에서 V4 테이블, 감사 action/metadata 허용 목록 및 DemoSeeder 호출을 연결한다. 평가 구현만으로 전체 3B 검증 완료를 뜻하지 않는다. 작성한 파일은 백엔드 통합 검토에 전달했다.
