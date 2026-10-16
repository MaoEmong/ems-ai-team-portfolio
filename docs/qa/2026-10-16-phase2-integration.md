
# 2단계 실제 통합 검수 — 2026-10-16

수행: 문서QA Codex, 설계 검토 검증 작업. **기존 회귀20 + 신규14 시나리오 PASS**, 별도 신규 DB 검증 PASS, V1→V2 보존 마이그레이션 테스트 PASS. 검수 범위에서 신규 기능 결함은 발견하지 못했습니다. DOC-01은 재확인 후 종료했습니다. 사용자 최종 인수와 동일한 의미는 아닙니다.

## 준비·명령·환경

양 팀 완료 일지와 Claude 최종 디자인 판정(검증 작업)을 확인 후 시작했습니다. Windows/Node24.14.1, Playwright Chromium, Docker Compose29.4.0, 실제 MySQL8.0 및 최신 빌드 정적 프론트입니다. 네트워크 목업을 사용하지 않았습니다.

```powershell
docker compose --project-name ems-backend-smoke --env-file backend/build/compose-smoke.env up --build -d
docker compose --project-name ems-backend-smoke --env-file backend/build/compose-smoke.env ps
node docs/qa/run-phase2-regression.cjs
node docs/qa/run-phase2.cjs
# backend/에서 별도 격리 MySQL 이행 검증
.\gradlew.bat integrationTest --tests '*MigrationUpgradeTest' --rerun-tasks --console=plain
```

환경파일은 기존 Git 제외 파일을 사용했고 실제 값을 출력하지 않았습니다. 다른 로컬 환경에서는 README대로 .env를 설정한 뒤 두 Node 명령에 .env를 인자로 줍니다. frontend에서 npm ci 및 필요한 Chromium 설치가 선행되어야 합니다. 스크립트는 고유 합성 사원·조직을 생성하고 일부를 퇴사 처리하므로 유지 볼륨에 데이터가 남습니다.

명령 반환 지연은 설계 검토 확인 결과 실제 빌드 진행이었으며 재기동하지 않고 기존 결과를 회수했습니다. apply_patch/view_image 래퍼 오류는 별개였습니다. 승인 셸 Set-Content로 문서를 작성하고 스크린샷은 승인 셸의 읽기로 확인했습니다. 최초 신규 QA는 xlsx 버튼 이름을 잘못 지정해 하네스 timeout이 발생했고, 실제 버튼명으로 수정한 뒤 14개를 모두 재실행했습니다. 앱 코드는 수정하지 않았습니다.

## 기존 20개 회귀

[결과 JSON](phase2-regression-results.json), [재현 스크립트](run-phase2-regression.cjs). 관리자 첫 화면을 대시보드로 맞춘 뒤 목록으로 이동하도록 조정했습니다. 기존 결과를 복사하지 않고 실제 재실행했습니다.

1. 관리자 로그인·실제 사원목록
2. UI 페이지·정렬
3. API 허용6종 정렬·페이지 메타
4. 부서·직급·상태 필터·빈 검색
5. UI 사원등록201
6. 중복사번409
7. UI 수정200(현 프론트가 조직 필드 생략)
8. 이름·사번·이메일 AND 검색
9. 일반사원 로그인·본인정보
10. 관리화면 거부·타인403
11. 본인GET/타인·목록·본인PUT거부 및 조직GET예외
12. 부서CRUD·사용중409
13. 직급CRUD·사용중409
14. 퇴사200·수정버튼제거
15. 기본목록 퇴사제외·RETIRED필터
16. 퇴사수정/재퇴사409·이전JWT401
17. 퇴사세션 로그인복귀·토큰삭제
18. 퇴사자만 참조하는 조직삭제409
19. 입력400·404·이메일/이름중복409·페이지상한·잘못된토큰401
20. 로그아웃·세션삭제

## 신규 14개 결과

[결과 및 기준값 JSON](phase2-results.json), [재현 스크립트](run-phase2.cjs). 모든 행 PASS.

| # | 기능 | 실제 관찰 |
| --- | --- | --- |
| 1 | DASH | 모든 상태별 사원 목록을 집계해 현재 인원·분포와 대조. 12개월 날짜 집계·마지막 월·이번달 요약 검증. |
| 2 | DASH | 사원 생성 후 employed 및 이번달 hires +1. |
| 3 | HIST | 실제 UI 발령201, 현재 소속·이력ID·APPOINTMENT_CREATE 감사1건 및 전후 조직 일치. |
| 4 | EMP/HIST | PUT 생략/null/동일 조직 유지, 다른 조직409 APPOINTMENT_REQUIRED. |
| 5 | HIST | 미래·입사전·변경없음·사유없음400, 최초발령 이후 입사일·마지막발령 이전 퇴사일400. |
| 6 | AUTH/HIST | 본인 이력200, 타인403, 대시보드/감사/내보내기/양식 및 발령 등록 EMPLOYEE403. |
| 7 | IO | UI CSV/xlsx 실제 다운로드 버퍼 파싱. 검색·정렬 결과 사번 순서 일치, CSV BOM 및 =/+ 접두 수식 방지, xlsx 문자열 셀, 비밀번호/해시 열 제외. |
| 8 | IO | UI 양식 다운로드 파싱, employees 헤더와 부서/직급 참조시트 확인. |
| 9 | IO/AUDIT | 오류 xlsx 행3 이메일 중복400, rowErrors 실제 번호, 사원조회0·인원증감0·실패IMPORT 정확히+1. 오류에 비밀번호 없음. |
| 10 | IO/AUDIT | 정상 xlsx2행201, 앞자리00 보존·인원+2, 성공IMPORT+1·각 CREATE(source=IMPORT)1건. |
| 11 | AUDIT | actor/target/action/success AND, 동일 사건 시각 from포함/to제외, 민감키·현재 토큰/업로드 비밀번호 부재. 실제 감사UI 상세 표시. |
| 12 | AUDIT | 존재하지 않는 login 실패401, actor null·BAD_CREDENTIALS·원문 loginId 없음. |
| 13 | HIST/DASH | 퇴사 시 employed-1·이번달 retirements+1, 퇴사자발령409. |
| 14 | UI | 실제 API 모바일 대시보드390px 문서 가로넘침 없음. |

기간 경계는 감사 사건의 반환 시각으로 [from,to) 포함/제외를 대조했습니다. 서버 오류 강제주입이나 동시충돌을 이 브라우저 실행에서 수행한 것은 아닙니다.

## DB 경로와 직접 확인

- **유지 볼륨:** 기존 ems-backend-smoke_mysql_data를 삭제하지 않고 최신 이미지로 기동했습니다. SQL에서 Flyway1/2 success=1, 고아계정0, 실패 업로드 BAD 접두 사원0을 확인했습니다. user_account FK와 고아계정0/실패사원0을 함께 확인했습니다. 기존 볼륨은 백엔드 단계에서 이미 V2로 업그레이드되어 있었으므로 이번에 같은 볼륨의 V1→V2 전환을 다시 수행했다고 쓰지 않습니다.
- **보존 업그레이드 재현:** 기존 MigrationUpgradeTest를 --rerun-tasks로 직접 실행, BUILD SUCCESSFUL,1개 실패/오류/스킵0. 격리 MySQL에 V1과 합성 사원/계정을 만든 후 V2 이행, 기존 데이터 유지와 신규 테이블을 확인했습니다.
- **새 빈 DB:** 사전 볼륨 부재 확인 후 ems-docqa-fresh-20261016 프로젝트/새 볼륨을 생성했습니다. 기존 이미지를 [override](fresh.compose.yml)로 사용했습니다. SQL Flyway1/2성공, employee31/user_account31. Chromium 관리자 로그인·대시보드·사원목록31 PASS. [스크립트](check-phase2-fresh.cjs), [JSON](phase2-fresh-results.json).

```powershell
# 기존 프로젝트를 down하여 포트만 반환, 볼륨 유지
docker compose --project-name ems-backend-smoke --env-file backend/build/compose-smoke.env down
# 아래 프로젝트/볼륨이 없을 때만 새 DB 검증으로 분류
docker compose --project-name ems-docqa-fresh-20261016 --env-file backend/build/compose-smoke.env -f docker-compose.yml -f docs/qa/fresh.compose.yml up -d --no-build
node docs/qa/check-phase2-fresh.cjs
docker compose --project-name ems-docqa-fresh-20261016 --env-file backend/build/compose-smoke.env -f docker-compose.yml -f docs/qa/fresh.compose.yml down
```

재실행 시 같은 볼륨은 더 이상 빈 DB가 아닙니다. 다른 새 프로젝트명을 선택하고 fresh 스크립트의 기록용 project명을 맞춥니다. 기존 볼륨 삭제 금지. 최종 두 프로젝트 컨테이너 종료, 두 mysql_data 볼륨 유지 확인. -v 사용하지 않았습니다.

## 스크린샷과 디자인 증거 구분

- [새 DB 대시보드 데스크톱](phase2-screenshots/dashboard-fresh.png)
- [새 DB 대시보드 모바일](phase2-screenshots/dashboard-mobile-fresh.png)
- [실제 발령 이력](phase2-screenshots/appointment-history.png)
- [실제 오류 업로드](phase2-screenshots/import-errors.png)
- [실제 감사 상세](phase2-screenshots/audit.png)
- 기존 회귀 admin-list/employee-profile 및 실행 중 dashboard/dashboard-mobile도 같은 폴더에 보존.

최초 모바일 캡처는 화면 전체 데이터 렌더 완료 전의 화면일 수 있어 새 DB에서 networkidle 후 desktop/mobile을 재촬영했습니다. [Claude 디자인 검수](../design/design-review-phase2.md)7절은 목업 이미지30장/최종변경8장 대상이며, 이 실제 API 캡처를 Claude가 재검수했다고 주장하지 않습니다.

## 독립된 기존 테스트 증거·미실행

백엔드 완료 일지의49개 단위/컨트롤러·14개 MySQL 테스트, 프론트45개·Chromium4개 및 Claude 디자인 검수를 별도 근거로 참조합니다. QA 시작 시 기존 MySQL XML의12+1+1 실패0을 확인했고, 이번 직접 재실행은 MigrationUpgradeTest1개입니다. 해당 Gradle 재실행이 integrationTest 보고서를 교체하므로 이전14개 결과는 백엔드 일지를 참조합니다.

이번 브라우저 실행에서 동시발령/동시DB충돌·감사저장실패 주입·ZIP폭탄/1,000행/10,000행/5MiB 경계·DB collation 전체 조합·장시간 토큰만료·서버500·전체 브라우저·실측대비/스크린리더는 **미실행**입니다. 백엔드의 트랜잭션 실패·파일경계 테스트 근거와 혼동하지 않습니다.

## 결함 목록·DOC-01

| ID | 담당 | 재확인 | 상태 |
| --- | --- | --- | --- |
| DOC-01 | 백엔드 | README가 3서비스 기동, frontend0.0.0.0:5173와 mysql/backend127.0.0.1, 프론트 빌드 인자를 명시. 실제 compose ps와 일치. | 종료 |
| QA-H01 | 문서QA | xlsx 버튼명 불일치로 하네스 timeout. 선택자/대기 Promise 처리 수정 후14개 PASS. 앱 수정 없음. | 해결 |

검수 범위에서 신규 제품 결함은 발견하지 못했습니다. 검수 미실행 범위를 통과로 확대하지 않습니다.
