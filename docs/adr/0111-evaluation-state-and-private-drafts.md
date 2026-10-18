# ADR 0111: 평가 상태·공개 범위와 재배정
주기 DRAFT/OPEN/CLOSED, 평가서 SELF_DRAFT/SELF_SUBMITTED/MANAGER_DRAFT/FINALIZED를 분리한다. OPEN에서만 작성하고 종료일은 표시용이다. 주기→평가서 잠금과 READ_COMMITTED로 제출/마감/재배정 경쟁을 직렬화한다.
OPEN 시 항목 이름/순서를 평가서 JSON으로 스냅샷한다. 최종점수는 관리자 정수점수 평균을 HALF_UP 소수2자리로 반올림하고 S/A/B/C/D를 확정시점에 저장한다. 자기평가는 참고용이며 AI 계산/요약은 이번 범위가 아니다.
본인과 배정평가자만 상세를 조회하고 다른ADMIN도404다. 공개 전 본인응답에서 managerAnswers/finalScore/grade 키를 제거한다. 관리권한은 민감답변 조회권한을 자동 부여하지 않는다.
재배정은 미확정·OPEN만, 관리자 초안을 초기화하고 MANAGER_DRAFT는 SELF_SUBMITTED로 돌린다. 이전평가자 접근을 차단한다. DRAFT의 배정은 주기 전체수정으로 한다. 감사에 상태/ID만 남기고 점수·등급·코멘트는 제외한다.
시드는 최초 빈DB 트랜잭션에서만 혼합상태 합성평가를 생성한다. 기존볼륨 자동생성 없음.
Codex의 평가 구현과 백엔드 통합 실행은 구분해 기록한다. 최종 테스트/Compose 결과는 개발일지에 기록한다.


## 최종 검증 (2026-10-16)
최종 test/integrationTest/bootJar는 17:00:03 KST 성공했고 단위·컨트롤러107개와 MySQL66개가 실패·오류·스킵 없이 통과했다. 실제 최종 이미지 HTTP는 19:02:51~19:06:33 KST 재확인했다. 결과와 실행 구분은 [3B 개발일지](../devlog/20261016-backend-phase3b.md), 비밀값 없는 증거는 backend/verification/20261016-phase3b-*.json에 있다. 기존 V3→V4 컬럼/ID 보존과 새 DB 시드·재시작 보존을 구분했고 down으로 볼륨을 유지했다.
