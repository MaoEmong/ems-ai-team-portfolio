# 2026-10-16 프론트엔드 3A 개발일지

## 받은 지시

설계 검토 검증 작업: 근태·휴가 결재·앱 내 알림을 구현한다. Claude 디자인 선행 → Codex 구현·테스트 → Claude 이미지 검수 → 반영 순서를 따른다. 기존 45개 테스트와 Chromium 회귀를 유지한다. 실제 백엔드 E2E는 문서QA 검수 대상이며 자체 미실행을 구분한다. frontend/, docs/design/, 프론트 ADR 및 본 일지만 편집하며 backend/Compose/공통 문서/커밋은 금지다.

## 결정 주체

사용자는 작업 시작을 지시했다. ADMIN 승인·단순화 연차·고정 근무시간 및 세부 정책은 설계 검토의 회의 결정이다. 사용자 개별 선택으로 기록하지 않는다. 정책은 법적 검증 없는 포트폴리오 데모 규칙이다.

## 착수와 의존성

- Codex 담당: 현재 API·타입·목업 구조를 확인했다. 3A 상세 API 문서는 착수 확인 시 아직 없었다.
- Claude UIUX디자이너에게 검증 작업로 3A 디자인 규칙·시안을 작업 분담했다. 디자인은 기존 시스템을 확장하고 도메인 응답을 임의로 정의하지 않는다.
- 검토 기록에 근태 응답/휴가 상세 조회·allowedActions/다른 승인자 부재/알림 DTO 및 읽음 응답 계약을 질문했다(). 특히 상세 링크의 서버 권한 확인 경로가 회의 API 목록에 없어 명확화가 필요하다. 계약이 필요한 구현은 답변·상세 문서를 기다린다.
- 알림은 계정 단위 생명주기와 요청 세대 식별로 늦은 응답을 폐기하도록 설계할 예정이다. 폴링뿐 아니라 이전 세션의 401이 새 세션 토큰을 삭제하지 않는지도 확인할 필요가 있다.

## 검증 상태

3A 구현·테스트·빌드·브라우저 검증은 아직 미실행이다. 2단계의 기존 통과 결과를 3A 완료 증거로 사용하지 않는다. 디자인 검수도 구현 후 별도 진행한다.

## 계약 보충 후 진행

설계 검토 답변 로 오늘 근태·월 DTO, 휴가 상세 GET/항목/allowedActions, 승인자 부재 안내, 알림 DTO/읽음 응답이 확정됐다. 문서 전에도 이 기준 구현을 허용했다. Claude 디자이너에게 보충을 전달했고 Codex 목업담당 검증 작업에 전용 목업·계약 테스트를 작업 분담했다. 파일 소유권을 분리하고 모든 실행 검증은 담당만 맡는다.

Codex 담당은 types-phase3a.ts와 use-notifications.ts를 작성했다. 폴링30초/visible·복귀·업무 이벤트, abort+effect 생존 여부+요청 순번으로 늦은 응답을 폐기한다. api.ts의 401은 현재 토큰과 요청 토큰이 같을 때만 세션을 지우도록 보완했다. ADR0204에 판단을 기록했다.

실행: npm run typecheck PASS; npm test -- src/notifications.test.tsx 4/4 PASS. 근태·휴가 화면, 전체 회귀, 빌드 및 Chromium3A는 아직 미실행이다. 디자인 선행 검증 작업과 목업 검증 작업 보고를 기다리며 확정된 계약 독립 로직부터 진행했다.

## 추가 계약 반영

설계 검토 공지와 새로 생성된 docs/api/phase3a-api.md를 확인했다. 근태 leave 단일 필드는 leaves 배열로 수정했다. 양쪽 반차 종일 취급, checkIn 필수/checkOut 선택, 정정 시 날짜 내·미래 금지/주말 거부/휴가일 허용, 자기 승인·반려403, 지난 신청 승인 LEAVE_START_PASSED, 내 목록 status 필터를 디자인·목업 담당에게 전달했다. 시각·휴가 판정은 프론트에서 계산하지 않고 status/late/earlyLeave/expectedStart/End/leaves를 그대로 사용한다.

## 화면 초안 통합

Claude phase3a-screens.md를 읽고 근태 카드/월별 목록/정정 모달, 휴가 잔액·신청·목록·상세 결재, 알림 패널과 내 업무/관리 메뉴를 구현했다. 최신 상세 API를 우선하여 leaves 배열과 휴가 상세 권한 재확인을 적용했다. 관리자 정정은 서울 시각 입력을 오프셋 ISO로 전송하고 도메인 판정은 서버에 둔다. 휴가 상세 버튼은 allowedActions만 사용한다. 감사 action/LEAVE 필터도 추가했다.

화면 코드는 아직 목업 취합 전 초안이며 전체 회귀·3A 브라우저·빌드·Claude 이미지 검수는 미실행이다. 편집 스크립트가 기존 감사 라벨 문자열 형식 차이로 일부 단계에서 멈췄으나, 해당 파일을 읽은 뒤 정확한 문자열로 수정하고 나머지 스타일을 이어 반영했다.

## 화면 검증 진행

최신 Claude 시안 확인 후 EMPLOYEE 첫 화면 /me 유지 결정을 전달했다. 휴가 시작일 min은 서버 today.date에 연결했다. 알림 오류 상태 JSX 타입 오류를 boolean 조건으로 수정한 후 타입 검사 PASS. 현재 취합 테스트83개(기존45+알림4+목업34) PASS, 추가 phase3a 화면 테스트10개 별도 PASS. 화면 테스트의 Testing Library 옵션에 Playwright의 exact를 혼용해 타입 검사가 실패하여 제거했고 재검사 PASS.

Chromium3A 첫 실행: 데스크톱 출퇴근·신청·관리자 승인/정정·알림 읽음·본인 취소 PASS. 모바일은 로그인 완료 전 메뉴 표시 검사로 닫힌 메뉴 링크를 기다려 timeout; 로그인 완료(로그아웃 버튼 표시) 대기를 추가하고 재실행 중이다. 아직 모바일 통과로 판정하지 않는다. 전체 회귀 브라우저/최종 빌드/디자인 이미지 검수는 후속 수행한다.

## 검증 작업 마무리 재개

검증 작업은 셸 sandbox-secrets ACL 초기화 거부 및 승인 셸 응답 없음으로 blocked 보고했다. 검증 작업에서 Get-Location은 성공했고 이후 소스 읽기도 반환됐다. Git status는 소유자 불일치(dubious ownership)로 거부됐으며 전역 설정·ACL을 바꾸지 않았다. 승인/대기 명령은 중복 재전송하지 않고 결과를 확인했다.

최신 phase3a-api.md에서 PENDING은 날짜와 무관하게 본인 CANCEL, 지난 PENDING 타 관리자 REJECT/승인409, APPROVED 시작 전까지만 CANCEL을 확인했다. Codex가 목업의 옛 날짜 제한과 경계 테스트를 수정했다. 취소된 항목의 반려를 기대하지 않도록 본인 취소와 관리자 반려는 독립 신청으로 검증한다. 화면은 날짜로 allowedActions를 재계산하지 않는다. 지난 PENDING CANCEL 버튼과 LEAVE_START_PASSED 안내·재조회 테스트를 추가했다.

휴가 상세403/409 후 재조회, 제한 안내와 기존 사원 수정 LEAVE_RECORDS_EXIST 메시지, 알림 updatedCount 결과 문구를 보완했다. 실제 Compose와 목업 서버 포트 충돌을 피하도록 Playwright를5174로 분리했다. 기본 타입 검사1회 통과 후 전체 테스트·빌드·Chromium을 요청했으며 최종 결과는 아래 후속 기록으로 확정한다. 이전83개와 별도10개 기록은 최종 전체 통과로 합산하지 않는다.

### 최종 소스 검사 결과와 브라우저 진단

2026-10-16 13:42 KST `npm test`: 7파일 95/95 PASS(기존45개 포함 한 번에 실행). `npm run build`: TypeScript 빌드/Vite 모두 PASS, ExcelJS 지연 청크929.39kB 경고가 있다. `npm run typecheck`도 PASS했다. 이전 별도 실행 결과를 합산한 수치가 아니다.

`npx playwright test`는 WebServer node 경고 이후 테스트 목록을 출력하지 않고 응답이 멈췄다. 5174 리스너와 node 프로세스를 확인하지 못했다. 설계 검토 답변에 따라 Ctrl-C로 종료(exit1)하고 승인 셸에서 DEBUG=pw:webserver와 --reporter=list를 사용하는 진단 재실행을 한 번 요청했다. 실제 Compose는 사용하지 않았다. 브라우저 결과·최종 캡처·Claude 검수는 미확정이므로 done 보고하지 않는다.

### 검증 작업 정식 배정 후 검수

2026-10-16 15:12:04~15:12:26 KST 승인 셸에서 `$env:DEBUG='pw:webserver'` 및 `npx playwright test --reporter=list`를 실행했다. Vite5174 HTTP200, 기존2/2·2단계desktop/mobile2/2·3Adesktop/mobile2/2, 합계6/6 PASS를 확인했다. 로그에 WebServer Terminated가 있다. 기본 셸 무응답의 근본 원인은 확정하지 못했으므로 승인 셸 재실행으로 정상 동작했다는 관찰만 기록한다.

초기 Claude 작업 분담과 서버 정리 읽기 재확인은 검토 중 실행 보류에 거부됐다. 실행 환경 장애와 구분했고 인계 확인로 우회하지 않았다. 2단계1·2차 의견 제출과 설계 검토 이후 검증 작업로 정식 재개했다. 기존 Claude UIUX디자이너에게 검증 작업가 assigned로 접수됐다. 검수 대상은 재촬영한3A 이미지22장이다. Codex는 코드·실행 검증, Claude는 시안·실제 이미지 검수를 맡는다. 최종 디자인 판정과 지적 반영 결과는 검수 보고 뒤 추가한다. 실제 Compose/백엔드E2E는 자체 미실행으로 유지한다.

## 검증 작업 최종 결과 (2026-10-16 KST)

Claude 검증 작업가 실제22장 검수에서 D3A-01~18(높음1/중간7/낮음10)을 기록했다. Codex가 서버today.date에 따른 오늘·미래·과거 표기, 미래 정정 버튼 숨김, 상태색, KST 시각, 반려 요약·위험 버튼·사유 안내, 기존 API 사원 식별, 사용 가능 잔액 강조, 모바일 압축 목록 및 낮음 항목을 반영했다. 서버 판정·API 계약은 변경하지 않았다. 수정 후 검증은 이전95개·6개와 별도로 아래 명령을 새로 실행했다.

| 명령 | 실행 시각 | 결과 |
|---|---|---|
| npm run typecheck | 15:36 | PASS |
| npm test | 15:36:37 | 7파일97/97 PASS, 기존45개 포함 단일 실행 |
| npm run build | 15:36 | PASS, ExcelJS 지연 청크929.39kB 경고 |
| npx playwright test --reporter=list (승인 셸) | 15:37 | 기존2·2단계 양 화면2·3A 양 화면2, 총6/6 PASS |
| Get-NetTCPConnection -LocalPort 5174 -State Listen -ErrorAction SilentlyContinue | 15:37 | Listen 항목 없음 |

이전 대기 명령은 늦게 반환된15:30:27 테스트97/97 및 빌드 결과로 확인했으며 위 최종 실행 결과와 섞지 않았다. 최종 캡처는15:37:26~32의24장(desktop/mobile각12, 취소 확인 모달 포함)이다. 같은 Claude 디자이너 검증 작업가24장을 실제 열어 D3A-01~18을 같은ID로 반영/수용·재확인에 연결했고 높음·중간 잔여0을 판정했다. 검수자가 실행 검증을 재현한 것으로 기록하지 않았다.

재확인 후 코드는 변경하지 않았고 문서만 최종화했다. 따라서 위97/97·6/6이 최종 코드에 유효하다. 새 낮음 N-01~07은 Codex 담당이 근거·수용 주체·잔여 위험을 검수 문서§8에 명시하고 수용했다. 알려진 사항은 표 격자, 카드 초 단위, PENDING 용어·휴가 배지색, 정정 모달 중복ID/여백, 취소 안내 보강, /me 그룹 누락이다. 미확인 범위는 실측 대비·스크린리더·실제 API 화면, 일부 상태 장면과 모바일 정정 모달 내부 스크롤 도달성 등 검수 문서§7.5와 같다. 통과했다고 바꾸어 기록하지 않는다.

사원 이름·사번·부서·직급은 frontend/src/attendance.tsx의 EmployeeIdentity가 기존 GET /employees/{id}로 조회하며 월별 근태·정정 모달·frontend/src/leaves.tsx 결재 필터에서 재사용한다. 새 엔드포인트는 없다. 미래 정정 계약 근거는 docs/api/phase3a-api.md의 '날짜는 입사일~오늘', '해당 서울 날짜 안·미래불가'다. 실제 서버가 미래 PUT을 거절하고 근태·감사·알림이 불변인지는 QA 실제 확인 사항이다.

목업 Chromium은5174로 실제 Compose5173과 분리했다(README 반영). 초기 webServer 무응답의 근본 원인은 확정하지 못했으며, Ctrl-C 종료 후 승인 셸 DEBUG=pw:webserver 진단에서 HTTP200·6/6·정상 종료된 관찰만 기록한다. Codex가 구현·수정·테스트·재촬영, Claude가 시안·실제 이미지 검수·재확인을 맡았다. 엔진 간 우열을 주장하지 않는다.

실제 백엔드 E2E는 미실행(문서QA 담당)이며 실제 Compose 사용·backend/Compose/공통 문서 수정·API 계약 변경·git 커밋은 하지 않았다. 최종 담당 문서는 design-review-phase3a.md, ADR0204, 본 개발일지와 frontend/README.md다. 실행 단계와 회의 단계 차단을 구분했고 진행 상태 표시가 완료 증거가 되지 않도록 실제 새 결과와 검수 원본으로 인계한다.

추가 읽기 검증 `git -c safe.directory=E:/portfolio/ems diff --check -- frontend docs/design docs/adr/0204-notification-polling-and-account-isolation.md docs/devlog/20261016-frontend-phase3a.md`는 exit1이었다. 코드 실행 결함이 아니라 api.ts/mock-phase2.ts/mock.ts의 EOF 빈 줄3건과 LF→CRLF 경고를 보고했다. 전역 Git 설정은 바꾸지 않았고 검증 후 코드는 수정하지 않았다. 이 비기능 스타일 잔여도 QA 인계에 명시한다. 필수 타입·테스트·빌드·Chromium의 통과와 별개로 diff-check를 통과했다고 쓰지 않는다.
