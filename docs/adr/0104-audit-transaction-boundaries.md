# ADR 0104: 감사 로그 트랜잭션 경계
- 상태: 채택, 2026-10-16
- 결정: 설계 검토 2단계 회의와 추가 승인. 구현은 백엔드 Codex.
## 결정
성공 업무 변경과 감사는 하나의 DB 트랜잭션에 참여한다. AuditService.record/loginSuccess는 MANDATORY로 상위 트랜잭션이 없는 호출을 거절한다. 사원·계정 JPA와 발령·감사 JdbcTemplate은 같은 datasource 및 JpaTransactionManager를 사용한다. 감사 저장 실패는 업무 변경도 롤백한다.
로그인 실패는 REQUIRES_NEW로 남긴 후 동일한401 응답을 낸다. 계정이 없으면 actor=null이며 입력 loginId를 저장하지 않는다. 실패 이유는 BAD_CREDENTIALS/DISABLED만 허용한다.
가져오기는 TransactionTemplate 내부에서 사전 DB 검증·전체 생성·각 EMPLOYEE_CREATE(source=IMPORT)·성공 EMPLOYEE_IMPORT를 처리한다. 롤백 완료 후 바깥에서 REQUIRES_NEW로 EMPLOYEE_IMPORT 실패1건을 남긴다. 행 오류 개수 또는 파일 오류1을 기록한다.
내보내기 성공은 파일 바이트 생성 성공이며 사용자 저장 완료를 보장하지 않는다. 파일 조회 및 성공 감사는 같은 트랜잭션이다.
## 정보 최소화
감사는 응답용 DTO와 명시된 metadata만 저장한다. 엔티티나 파일·비밀번호·JWT를 직렬화하지 않는다. actor와 targetLabel은 당시 값이며 외래키 없이 과거 표시를 유지한다. 검색 keyword는 설계 검토 승인 예외로 최대100자 저장한다. 감사 조회는 ADMIN만 가능하며 수정·삭제 API는 없다.
## 한계와 검증
DB 자체가 불능이면 실패 감사의 영속화도 보장할 수 없다. 이를 성공으로 숨기지 않는다. MySQL 테스트에서 성공 기록, 실패 가져오기1건만 잔존, 비밀값 미포함, 감사 실패 시 업무 롤백, [from,to) 조회와 권한을 확인한다.
