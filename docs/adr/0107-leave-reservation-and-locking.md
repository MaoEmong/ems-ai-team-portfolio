# ADR 0107: 휴가 예약과 잠금
상태: 채택, 최종 테스트 및 Compose 검증 완료.
설계 검토 정책: 신청 PENDING은 reserved, APPROVED는 used, 반려/취소는 복원한다. DECIMAL로 0.5 단위를 정확하게 표현한다. SICK은 charged=0이며 days는 표시용 평일수다. 현재 기간 원장 합계로 잔액을 갱신하고 이전 기간 원장은 보존하되 잔여는 이월하지 않는다.
모든 변경은 employee→leave_balance 순서로 잠근다. 사원 잠금은 최초 잔액행 생성과 퇴사 API 경쟁을 직렬화하고 잔액행 FOR UPDATE는 서로 다른 신청의 초과 예약을 막는다. 업무·감사·알림은 동일 데이터소스의 단일 트랜잭션이다.
실제 MySQL 동시 승인에서 REPEATABLE READ의 잠금 전 소유자 조회가 이전 상태 스냅샷을 고정해 [200,200]이 재현됐다. LeaveService는 READ COMMITTED로 잠금 후 최신 커밋 상태를 읽도록 수정했다. 기존 퇴사 트랜잭션은 최초 사원 잠금 이후 조회하며 같은 잠금 순서를 따른다.
최종 정책: 본인 PENDING은 시작일과 무관하게 CANCEL 가능. 지난 PENDING에 다른 ADMIN의 APPROVE는409 LEAVE_START_PASSED, REJECT는 허용. APPROVED는 시작일 전날까지만 본인 CANCEL 가능. 자기 승인·반려는403이며 allowedActions와 API표/테스트를 일치시켰다.
검증: 최종 MySQL28개 전체 통과. 동시 신청[201,409], 동시 승인[200,409], 잔액이동1회, 승인 감사1건·알림1건을 검증했다. 신청/승인 알림 저장 후 강제 실패에서 업무·잔액·감사·알림 전체 롤백을 확인했다. Compose 두 환경에서 예약→승인→알림→취소·복원과 퇴사 SYSTEM취소를 통과했다.
단순화한 데모 정책이며 법률 적합성을 검증했다고 표현하지 않는다.
