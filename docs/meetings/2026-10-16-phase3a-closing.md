# 3A 마무리 설계 검토 기록 — 2026-10-16

이 문서는 마무리 작업 재개 당시 결정 기록이다. **당시 3A 완료·사용자 인수 선언이 아니다.** Claude Code와 Codex가 설계·구현·검증 관점에서 교차 검토했다. 이후 상태와 최종 착수는 [2단계](2026-10-16-phase3a-stage2.md),[3단계](2026-10-16-phase3a-stage3.md),[4단계](2026-10-16-phase3a-stage4.md),[실제 검수](../qa/2026-10-16-phase3a-integration.md)를 따른다.

## 검증 상태와 인계

진행 정보와 실제 산출물이 일치하지 않아 일지와 검수 근거를 직접 대조했다. 백엔드93/28 PASS·Compose/down 완료와 프론트95/95·빌드 PASS를 확인했으나 Chromium 진단과 Claude Code 이미지 검수는 미완료였다. QA는 독립 문서·스크립트만 준비하고 실제 Compose·스크린샷·커밋은 최종 인계까지 보류했다.

## 후속 설계 검토 결정

| 상태 | 신청자 | 다른 ADMIN |
| --- | --- | --- |
| PENDING, 시작일>=오늘 | CANCEL | APPROVE/REJECT |
| PENDING, 시작일<오늘 | CANCEL | REJECT, APPROVE409 LEAVE_START_PASSED |
| APPROVED, 시작일>오늘 | CANCEL | 없음 |
| APPROVED, 시작일<=오늘 | 취소409 LEAVE_START_PASSED | 없음 |
| REJECTED/CANCELLED | 없음 | 없음 |

자기 승인/반려403, 처리된 상태 재처리409 LEAVE_ALREADY_PROCESSED. 프론트는 allowedActions로 버튼을 표시한다. 새 DB31/31/퇴사5/기본26, 유지DB는 기준값·증감 사용. DEMO_ADMIN_INITIAL_PASSWORD 예시는 빈 값으로 기록한다.

## 재발 방지·진행

완료 기록은 모든 완료 기준 충족 후 한 번만, 검증 결과와 결함은 실제 근거와 함께 기록하고 완료 여부는 산출물로 확인한다.

백엔드/프론트 병행 후 실제 완료와 Claude 기록을 설계 검토에서 확인해 QA에 인계한다. 공유 Compose는 담당 팀 사용 후 down·볼륨 유지한다. QA 검수·커밋 이후 완료 근거를 확인하고 3B 회의로 이어간다. 최신 최종 결과는 실제 인계 후 추가한다.
