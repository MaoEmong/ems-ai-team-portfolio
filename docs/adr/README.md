# Architecture Decision Records

## 3A 채택 결정

- [0106 조회시 근태판정](0106-attendance-query-time-evaluation.md)
- [0107 휴가예약·잠금](0107-leave-reservation-and-locking.md)
- [0108 빈DB 데모시드](0108-fresh-database-demo-seed.md)
- [0204 알림폴링·계정격리](0204-notification-polling-and-account-isolation.md)

파일명: `NNNN-<주제>.md`. 문서QA 0001~0099, 백엔드 0100~0199, 프론트 0200~0299. 각 팀은 대역 안에서 중복 없는 번호를 사용하고 추가 대역은 검토 기록에 조율합니다. 색인은 문서QA가 통합합니다.

| 번호 | 상태 | 결정 |
| --- | --- | --- |
| 0001 | 채택 | [문서화 전략](0001-documentation-strategy.md) |
| 0100 | 채택 | [Access token 인증](0100-jwt-access-token-only.md) |
| 0101 | 채택 | [Flyway](0101-flyway.md) |
| 0102 | 채택 | [퇴사와 논리 삭제](0102-employee-retire-as-soft-delete.md) |
| 0200 | 채택 | [프론트 스택·상태](0200-frontend-stack-and-state.md) |
| 0201 | 채택 | [토큰 보관](0201-token-storage-session.md) |

## 작성 템플릿

```markdown
# NNNN. 제목
- 날짜:
- 상태: 제안 / 채택 / 대체
- 결정 주체 및 근거:
## 배경
## 고려한 대안
## 결정과 근거
## 결과와 한계
## 검증 및 관련 문서
```

기존 결정을 바꿀 때 원문을 지우지 않고 후속 ADR과 대체 관계를 남깁니다. 신규 ADR은 각 팀 작성 후 색인에 등록합니다.

## 2단계 추가 결정 (채택)

- [0002 작업 성격별 엔진 배분](0002-task-based-engine-allocation.md)
- [0103 발령 전용 조직 변경](0103-appointment-only-organization-changes.md)
- [0104 감사 트랜잭션](0104-audit-transaction-boundaries.md)
- [0105 전체 취소 가져오기](0105-all-or-nothing-file-import.md)
- [0202 디자인 시스템·차트](0202-design-system-and-charts.md)
- [0203 인증 파일 전송](0203-authenticated-file-transfer.md)

## 3B 추가 결정

- [0109-organization-lock-and-title-appointments](0109-organization-lock-and-title-appointments.md)
- [0110-demo-payroll-month-snapshots](0110-demo-payroll-month-snapshots.md)
- [0111-evaluation-state-and-private-drafts](0111-evaluation-state-and-private-drafts.md)
- [0205-phase3b-server-values-and-snapshots](0205-phase3b-server-values-and-snapshots.md)

## AI 추가 결정

- [0112-ai-provider-abstraction-and-model-setting](0112-ai-provider-abstraction-and-model-setting.md)
- [0113-ai-prompt-output-and-data-boundaries](0113-ai-prompt-output-and-data-boundaries.md)
- [0206-ai-explicit-execution-and-ephemeral-results](0206-ai-explicit-execution-and-ephemeral-results.md)
