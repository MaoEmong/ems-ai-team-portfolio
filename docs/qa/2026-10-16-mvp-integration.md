# 1단계 MVP 실제 통합 검수 — 2026-10-16

수행: 문서QA 담당 Codex, 설계 검토 검증 작업. **최종 20개 시나리오 PASS, 기능 결함 미발견, 경미한 기존 문서 결함 1건**. 이는 아래 범위의 검증 결과이며 사용자 인수 또는 무결함 보증을 의미하지 않습니다.

## 환경과 명령

Windows PowerShell, Node 24.14.1, frontend에 설치된 Playwright Chromium(headless), Docker Compose의 MySQL 8.0·Spring Boot·nginx 실제 번들. API 목업과 네트워크 가로채기는 사용하지 않았습니다. 기존 검증 프로젝트·이미지와 자격증명 파일을 재사용했고 이번에는 이미지 재빌드를 반복하지 않았습니다.

```powershell
docker compose --project-name ems-backend-smoke --env-file backend/build/compose-smoke.env up -d
node docs/qa/run-mvp.cjs
docker compose --project-name ems-backend-smoke --env-file backend/build/compose-smoke.env ps
docker compose --project-name ems-backend-smoke --env-file backend/build/compose-smoke.env down
docker compose --project-name ems-backend-smoke --env-file backend/build/compose-smoke.env ps --all
docker volume ls --filter name=ems-backend-smoke_mysql_data
```

초기 Docker 접근은 named pipe 권한 거부, Node는 결과 파일 EPERM이 발생했습니다. 승인 실행 후 통과했습니다. 최초 18개 통과 뒤 퇴사자만 참조하는 삭제·오류 경계 검사를 추가하여 최종 20개를 재실행했습니다. [기계 판독 결과](mvp-results.json), [재현 스크립트](run-mvp.cjs).

새 환경에서는 README대로 `.env` 설정·Compose 기동 후 frontend에서 `npm ci`, 루트에서 `node docs/qa/run-mvp.cjs .env`를 실행합니다. Chromium이 없으면 frontend에서 `npx playwright install chromium`으로 준비합니다. 스크립트는 로컬 5173/8080과 관리자 환경변수를 사용하며 합성 사원을 생성·퇴사시킵니다. 자격증명·JWT는 출력하지 않습니다. 검수용 합성 사원과 퇴사자 전용 부서·직급은 볼륨에 남으며 재실행 시 고유 이름을 사용합니다.

## 시나리오 결과

모두 `node docs/qa/run-mvp.cjs`의 동일 이름 검사에서 실제 실행했습니다. UI 403은 SPA 접근 거부 화면이며 HTTP 문서 응답 403이라는 뜻이 아닙니다. 서버 API 403은 별도로 확인했습니다.

| # | 기능 ID | 시나리오와 관찰 | 결과 |
| --- | --- | --- | --- |
| 1 | AUTH-01/04, EMP-05 | 관리자 UI 로그인, 실제 /employees 200, 목록 표시 | PASS |
| 2 | EMP-06 | UI 10개 페이지 크기, 다음 페이지, 정렬 변경 후 첫 페이지 복귀 | PASS |
| 3 | EMP-06 | API employeeNo/name/hireDate asc/desc 6종, page=1·size=10·페이지 메타와 반환 순서 | PASS |
| 4 | EMP-05, UX-01 | UI 부서·직급·ACTIVE 필터 조합, 불일치 검색 빈 결과 | PASS |
| 5 | EMP-01 | UI 합성 사원 등록, 실제 POST 201, 상세 표시 | PASS |
| 6 | EMP-01 | 동일 사번 API 등록 409 DUPLICATE_EMPLOYEE_NO | PASS |
| 7 | EMP-03 | UI 사원 이름 수정, PUT 200, 상세 변경 | PASS |
| 8 | EMP-05 | 이름·사번·이메일 검색 및 부서·직급·상태 AND 필터 | PASS |
| 9 | AUTH-01/02, EMP-02 | 일반 사원 UI 로그인 및 내 정보 표시 | PASS |
| 10 | AUTH-02 | 일반 사원 관리 URL 3종 접근 거부, 타인 상세 API 403·UI 안내 | PASS |
| 11 | AUTH-02 | 일반 사원 본인 GET 200, 타인/목록/본인 PUT 403, 부서·직급 GET 200/POST 403 | PASS |
| 12 | DEPT-01 | UI 부서 등록 201·수정 200·삭제 204, 사용 중 삭제 409와 오류 표시 | PASS |
| 13 | POS-01 | UI 직급 등록 201·수정 200·삭제 204, 사용 중 삭제 409와 오류 표시 | PASS |
| 14 | EMP-04 | UI 퇴사 처리 200 및 수정 버튼 제거 | PASS |
| 15 | EMP-04/05 | 퇴사자 기본 목록 제외, RETIRED 필터로 조회 | PASS |
| 16 | EMP-03/04, AUTH-03 | 퇴사자 수정·중복 퇴사 409 EMPLOYEE_RETIRED, 퇴사 전 JWT /auth/me 401 | PASS |
| 17 | AUTH-03 | 퇴사된 기존 브라우저 세션 재접속 시 로그인 이동·토큰 삭제 | PASS |
| 18 | DEPT-01/POS-01 | 전용 부서·직급에 사원 1명 생성 후 퇴사, 퇴사자만 참조해도 삭제 409 | PASS |
| 19 | EMP-01/02/06 | 입력 누락 400 fieldErrors, 없는 사원 404, 이메일·조직명 중복 409, size=101 400, 잘못된 토큰 401 | PASS |
| 20 | AUTH-03 | 관리자 로그아웃 시 로그인 이동·sessionStorage 삭제 | PASS |

## 스크린샷

- [관리자 목록](screenshots/admin-list.png): 실제 API 모드와 합성 데이터, 검색·필터·페이징 UI.
- [일반 사원 내 정보](screenshots/employee-profile.png): 일반 사원 메뉴 제한과 본인 프로필.

두 이미지를 직접 열어 확인했습니다. 비밀번호·JWT·실존 개인정보는 없으며 겹침이나 잘린 핵심 컨트롤은 발견하지 못했습니다. 스크린샷은 데스크톱 기준입니다.

## 기존 테스트 증거와 미실행 범위

백엔드 build/test-results XML에서 단위/슬라이스 총 16개 및 MySQL 통합 1개, 실패·오류·스킵 0을 확인했습니다. 프론트의 16개 테스트와 목업 Chromium 2개 통과는 프론트 개발일지 근거입니다. 이번 작업에서 해당 빌드·단위 테스트를 재실행하지 않았으며 이번 실제 Compose 검수와 구분합니다.

1시간 실제 대기 만료, 부하·경합, 전체 브라우저/모바일 조합, 서버 장애 강제 주입, 2~4단계 기능은 이번 통합 실행에서 **미실행**입니다. JWT 만료 자동 테스트는 백엔드 기존 증거를 참조합니다. 로딩·일반 서버 실패 UI는 프론트 기존 테스트 증거이며 이번에 인위적 500을 만들지 않았습니다.

## 결함 목록

| ID | 심각도 | 담당 | 재현·기대·실제 | 상태 |
| --- | --- | --- | --- | --- |
| DOC-01 | 낮음(문서) | 백엔드팀 | backend/README.md 실행 절 읽기 → 현재 Compose 3서비스와 일치해야 하나 'frontend 서비스는 ... 확정 후 통합' 및 모든 서비스 loopback 바인딩 설명 잔존. 실제 frontend는 0.0.0.0:5173, MySQL/backend만 loopback. | 설계 검토 보고 대상, 다른 팀 파일 수정하지 않음 |

기능 결함은 발견하지 못했습니다. 위 문서 결함의 배정과 수정은 설계 검토에서 결정합니다.

## 종료와 데이터

검수 후 Compose down 성공. ps --all은 빈 목록이며 `ems-backend-smoke_mysql_data` 볼륨은 유지되었습니다. `-v`는 사용하지 않았습니다. 검수는 기존 볼륨의 합성 데이터를 대상으로 했으며 사원 물리 삭제를 수행하지 않았습니다.
