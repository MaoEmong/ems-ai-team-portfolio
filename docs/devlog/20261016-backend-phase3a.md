# 2026-10-16 백엔드 3A 최종 기록
## 받은 지시
검증 작업의 근태·휴가·알림·새 DB 시드 구현을 검증 작업에서 마무리했다. API 상세 우선, V1/V2 보존, 기존49단위/14MySQL 회귀, DOC/ADR/개발일지가 범위다. frontend/공통 docs/Git커밋은 담당하지 않았다.

## 계약과 AI 판단
설계 검토의 / 및 후속 정리로 DTO·날짜·정정·퇴사·감사·시드 정책을 확정했다. 단일 leave는 양쪽 반차를 표현하지 못해 질문했고 leaves 배열이 승인됐다. phase3a-api.md를 먼저 작성했다.
후속 확정 PENDING은 시작일과 무관하게 본인 취소 가능, 지난 PENDING은 관리자 승인409/반려허용, APPROVED는 시작일 전날까지 취소를 서비스·allowedActions·API 상태표·테스트에 일치시켰다. 세부 정책의 결정자는 설계 검토에서며 사용자 직접 선택으로 기록하지 않는다.
Codex 구현 담당은 LeavePolicy/테스트/별도일지 3파일만 담당했다(검증 작업 보고 수신·소유권 반환 완료). 담당은 DB/API/서비스·통합 테스트와 실행을 담당했다. 구현 판단과 검증은 Codex 작업이며 사람 검수로 표현하지 않는다.

## 구현과 판단 근거
- V3 근태/휴가신청/잔액 잠금행/알림/시드마커, API·검증·감사 action 확장.
- 서울 서버시각·조회 시 근태 판정, 정정 감사/알림과 반차 기준14시.
- 사원→잔액 잠금, 0.5일 DECIMAL, 신청 예약/승인 사용/반려·취소 복원, 퇴사 자동취소, 휴가기록 입사일변경409.
- 알림 수신자 격리·멱등 읽음·read-all upToId, 사유 미포함.
- 새 DB31명 분산시드와 추가ADMIN, 선택환경변수, 기존 데이터 보존. 루트 .env.example 취합은 문서QA 담당.
- ADR0106~0108 및 backend/README에 설계·제약·실행 방법 기록.

## 발견 문제와 해결
기본 Windows 실행 경로의1326 오류 때문에 승인된 실행 경로를 사용했다. Clock 빈 이름/슬라이스 공통 감사 mock 누락은 테스트 초기화 구성을 보완했다. 분산시드 이후 대시보드 빈 달 fixture는 격리 트랜잭션으로 만들고 롤백한다. 신규 시드 퇴사제외 기본목록 기대값은26명으로 바꿨다.
MySQL 동시 승인에서 [200,200]을 재현했다. REPEATABLE READ에서 잠금 전 조회가 스냅샷을 고정하는 원인에 따라 LeaveService를 READ_COMMITTED로 변경하고 행 잠금은 유지했다. 응답뿐 아니라 잔액 이동·감사·알림1회까지 검사한다.
검증 작업 중간에 협업 기록 훅이 새 명령을 차단했다. 이미 실행된 Gradle 결과만 회수하고 blocked로 보고했으며 Compose를 통과로 기록하지 않았다. 검증 작업 재개 후 XML 및 현재 정책을 확인하고 미완료 검증만 수행했다. 승인 대기 시간은 실제 테스트 실행 시간과 구분한다.

## 최종 자동 테스트
명령: backend에서 .\\gradlew.bat test integrationTest bootJar
실행 결과: 2026-10-16 13:23:11 KST BUILD SUCCESSFUL, 1m53s, exit0. 검증 작업 재개 시 최종 XML을 다시 집계했으며 이후 운영 코드/테스트를 변경하지 않았다.
- 단위·컨트롤러93개 통과, 실패0/오류0/스킵0: 기존49+LeavePolicy40+Phase3Controller4.
- MySQL28개 통과, 실패0/오류0/스킵0: 기존 MVP1+Phase2 12+MigrationUpgrade1+Phase3 14.
- V1→V2→V3 및 새 DB, 동시 신청[201,409]/승인[200,409], 잔액1회·승인 감사/알림 각1, 신청/승인 강제 실패 전체롤백, 취소상태/권한, 근태 경계·정정·입사일제약, 시드 보존을 확인했다.
- bootJar 성공. Docker 이미지 안에서도 gradle --no-daemon bootJar 성공.
보고서: backend/build/reports/tests/{test,integrationTest}/index.html. 합산은 같은 최종 실행 XML 기준이며 이전의 실패 실행과 합치지 않았다.

## 실제 Compose 검증
실행: 2026-10-16 13:38:36~13:41:58 KST, py -3 backend/build/phase3a-compose-verify.py, exit0.
내부 명령:
1. docker compose --project-name ems-backend-smoke --env-file backend/build/compose-smoke.env up -d mysql
2. 기존 V2 행수/체크섬 저장 후 동일 프로젝트 up --build -d
3. py -3 backend/build/phase3a-http-smoke.py
4. 같은 프로젝트 down (볼륨 유지)
5. 새 프로젝트 ems-backend-3a-fresh-20261016133836에서 이미지 재사용 override와 up --no-build -d
6. 새 DB 집계·기본 목록 HTTP·동일 HTTP 흐름·backend restart 후 보존 확인
7. 새 프로젝트 down (볼륨 유지)

| 검증 | 결과 |
| --- | --- |
| 기존 V2→V3 | 사원43/계정43/발령3/감사49, 적용 직후 네 테이블 행수 및 CHECKSUM TABLE 동일 |
| 실제 근태 | 출근·중복409·관리자 정정 corrected/알림 확인 |
| 휴가 | 예약0.5→타인ADMIN승인→사용0.5→알림→취소→사용0 복원 |
| 반차 | 월근태 응답 expectedStart14:00 및 leaves ID 확인 |
| 중복 승인 | 409 LEAVE_ALREADY_PROCESSED |
| 알림 | 사유 미노출·read-all 범위·미읽음0·단건204 확인 |
| 퇴사 | 미래 휴가 SYSTEM취소·기존 토큰401·감사 조회 확인 |
| 새 DB | 사원31/계정31/퇴사5/기본HTTP목록26/DEMO001 ADMIN, 퇴사계정 enabled=false |
| 재시작 | 실제 흐름 후 사원·계정·발령·감사 행수 및 체크섬 동일, 재시드 없음 |
| 프론트·CORS | localhost5173 HTTP200, 5173 Origin의8080 POST 프리플라이트200 |
| 정리 | 두 프로젝트 모두 down, -v 미사용, 볼륨 유지 |

합성 시연 데이터는 유지 볼륨에 추가되므로 이후 QA는 실행 전 기준값과 증감을 비교한다. 새 시드31명 고정값은 빈 DB의 최초 검사에만 사용했다. 비밀값·토큰·실제 개인정보는 출력/기록하지 않았다. 검증 JSON은 backend/verification/에 보관한다.

## 완료·미실행
백엔드 완료 기준을 모두 검증했으며 현재 확인한 미해결 백엔드 결함은 없다. 실제 브라우저 서버연동 E2E·스크린샷·Claude 디자인 검수는 백엔드 업무에서 미실행이며 프론트/문서QA 담당이다. HTTP 검증을 브라우저 통과로 표현하지 않는다. 기존 V1/V2 변경 없음, frontend/공통문서 수정 없음, 커밋 없음.
