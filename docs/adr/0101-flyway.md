# ADR 0101: Flyway로 MySQL 스키마 관리

- 상태: 채택
- 날짜: 2026-10-16
- 결정 근거: 초기 설계 검토. 구현 설계는 Codex(백엔드).

## 결정
MySQL 8과 Flyway를 사용한다. V1 SQL은 department/job_position/employee/user_account 테이블, 유일 제약, 외래키, 상태·퇴사일 CHECK 및 합성 부서·직급을 생성한다. JPA ddl-auto=validate로 스키마를 검증하고 자동 변경하지 않는다. 직급 SQL 테이블은 예약어 혼동을 피하기 위해 job_position으로 명명한다.

계정은 user_account에 분리한다. 로그인 ID는 employee.employee_no를 조회해 사용하며 중복 저장하지 않는다. 비밀번호 해시와 enabled 및 role만 계정에 저장한다. DTO로 응답하므로 계정 해시가 JSON으로 노출되지 않는다.

관리자 자격증명은 SQL에 넣지 않는다. Flyway 완료 후 트랜잭션 ApplicationRunner가 빈 employee 테이블에만 환경변수 기반 관리자와 합성 사원 30명을 넣는다. 관리자와 데모 사원 생성은 하나의 트랜잭션이다. 재기동 시 기존 비밀번호·데이터를 덮어쓰지 않는다. 데모 사원의 비밀번호는 저장하거나 출력하지 않는 임의 문자열의 BCrypt 해시이며, 일반 사원 로그인 시연은 관리자가 initialPassword로 만든 계정으로 한다.

## 판단과 대안
ddl-auto=update는 변경 이력과 새 환경 재현 근거가 약해 기각했다. SQL 파일에 관리자 비밀번호/해시를 고정하는 방식도 기각했다. 환경변수 자격증명은 시드 실행 시만 사용하고 로그에 출력하지 않는다. 실행된 V1은 수정하지 않고 다음 버전 마이그레이션을 추가한다.

## 검증
MySQL Testcontainers에서 Flyway 마이그레이션, Hibernate 검증, 31명 시드, 유일 제약과 실제 API 흐름을 확인한다. H2 테스트로 MySQL 통과를 대신하지 않는다. Docker가 없으면 통합 테스트는 실패하며 단위 테스트와 명시적으로 구분한다.
