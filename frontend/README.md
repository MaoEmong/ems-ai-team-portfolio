# EMS 프론트엔드

## 3A 최종 인계 검증 (2026-10-16, KST)

| 명령 | 실행 시각 | 최종 결과 |
|---|---|---|
| `npm run typecheck` | 15:36 | PASS |
| `npm test` | 15:36:37 | 7파일97/97 PASS, 기존45개 포함 단일 실행 |
| `npm run build` | 15:36 | PASS, ExcelJS 청크929.39kB 경고 |
| `npx playwright test --reporter=list` | 15:37 | 5174 Chromium6/6 PASS: 기존2·2단계 양 화면2·3A 양 화면2 |

Codex가 구현·테스트·재촬영을 맡았고 같은 Claude UIUX디자이너가24장을 직접 열어 재확인했다. 높음·중간 디자인 지적은0이며, 알려진 낮음7건은 근거·수용 주체·위험을 검수 문서§8에 명시했다. 재확인 이후 코드는 바꾸지 않아 위 수치가 현재 코드에 유효하다. 수정 전95개 결과나15:30대 대기 결과를 합산하지 않았다.

목업 E2E는5174를 사용한다. 최초 기본 셸에서 webServer 응답이 멈췄으나 근본 원인은 확정되지 않았다. 승인 셸에서 `DEBUG=pw:webserver` 진단 시 Vite HTTP200·6/6·서버 종료를 확인했고 최종 실행 후5174 리스너도 없었다. 실제 Compose5173은 프론트 자체 검증에 사용하지 않았다.

사원 이름·사번·부서·직급 표시는 `src/attendance.tsx`의 `EmployeeIdentity`가 기존 `GET /employees/{id}`를 사용한다. 정정 모달·월별 근태와 `src/leaves.tsx` 결재 필터에서 재사용하며 새 API는 없다. 미래 정정 제한의 계약 근거는 `../docs/api/phase3a-api.md`의 '입사일~오늘'·'미래불가'다. 화면에서 버튼을 숨겼다는 사실은 서버가 거절했다는 증거가 아니며 실제 거절·불변성은 문서QA가 확인한다.

실제 백엔드 E2E는 **미실행(문서QA 담당)**이다. 실측 대비·스크린리더·실제 API 화면과 일부 상태 장면도 디자인 검수 미확인 범위다. 최종 근거는 `../docs/design/design-review-phase3a.md`, `../docs/adr/0204-notification-polling-and-account-isolation.md`, `../docs/devlog/20261016-frontend-phase3a.md`에 있다.

추가 Git diff-check는 `src/api.ts`, `src/mock-phase2.ts`, `src/mock.ts`의 EOF 빈 줄3건으로 exit1이었다. 필수 실행 검증의 통과와 별개인 스타일 잔여이며, 알려진 낮음 디자인7건·ExcelJS 청크 경고와 함께 인계한다.

3A에는 출퇴근·월별 근태·관리자 정정, 휴가 신청·잔액·결재, 앱 내 알림을 추가했다. 관리자도 '내 업무' 메뉴를 사용할 수 있다. 휴가 처리 버튼은 서버 allowedActions를 따르며 지각·조퇴·휴가와 연차 잔액은 서버 판정 값을 표시한다. PENDING 본인 취소는 시작일과 무관하게 가능하고, 승인된 휴가는 시작일 전에만 취소할 수 있다. 상세 정책·API는 `../docs/api/phase3a-api.md`를 따른다.

알림은 보이는 탭에서30초마다, 화면 복귀·업무 처리 후 즉시 갱신한다. 계정 전환·로그아웃 시 요청과 캐시를 정리하고 이전 응답을 폐기한다. 알림 미리보기에는 신청·반려 사유를 넣지 않는다. 연차·근태는 법적 적합성을 검증하지 않은 포트폴리오 데모 정책이다. 3A 목업에도 실제 DB 잠금·트랜잭션 보증은 없으며 실제 백엔드 E2E는 문서QA가 별도로 수행한다.

React · TypeScript · Vite 기반 1~3A단계 EMS. Node.js 24와 npm을 사용한다. API 계약은 `../docs/api/mvp-api.md`, `../docs/api/phase2-api.md`, `../docs/api/phase3a-api.md`를 따른다.

## 실행

```powershell
cd E:\portfolio\ems\frontend
npm ci
Copy-Item .env.example .env.local
npm run dev -- --port 5173
```

`http://localhost:5173` 접속. `.env.local`의 `VITE_MOCK_API=true`이면 백엔드 없이 합성 데이터 목업으로 실행한다. 관리자 `admin`, 일반 사원 `EMP001`, 두 계정의 데모 전용 비밀번호는 `demo1234!`이다. 실제 백엔드 계정과 별개다. 새로고침 시 목업 데이터 및 목업 서버 세션이 초기화되므로 다시 로그인한다. 실행 중에는 등록·수정·퇴사와 부서·직급 CRUD가 유지된다.

실제 API 전환:

```dotenv
VITE_MOCK_API=false
VITE_API_URL=http://localhost:8080
```

환경변수 변경 후 개발 서버를 재시작한다. API URL은 `/api/v1`을 제외한 origin이며 클라이언트가 접두사를 붙인다. 실제 관리자 계정은 백엔드의 `ADMIN_LOGIN_ID`, `ADMIN_INITIAL_PASSWORD` 설정을 따른다. 비밀값을 VITE 환경변수에 넣지 않는다. 브라우저가 직접 API에 요청하므로 백엔드 CORS에 `http://localhost:5173`이 필요하다.

## 기능과 상태

- 관리자: 사원 검색(이름·사번·이메일), 부서·직급·상태 필터, 정렬, 페이지 크기/이동, 상세, 등록·수정·퇴사 처리, 부서·직급 CRUD.
- 일반 사원: 내 정보 조회. 관리자 메뉴를 숨기고 관리자 라우트를 차단한다. 서버가 최종 권한을 검증한다.
- 사원 삭제는 `퇴사 처리`이며 확인 대화상자와 퇴사일 입력이 있다. 퇴사 사원은 수정할 수 없다.
- sessionStorage의 Access token을 Authorization 헤더에 자동 첨부한다. 401은 토큰 삭제 및 로그인 이동, 403은 권한 안내, 409는 서버 사유 표시, fieldErrors는 필드 아래 표시한다.
- 로딩·빈 목록·API 실패·재시도, 반응형 레이아웃을 제공한다.

목업은 fetch와 같은 요청/응답 인터페이스의 메모리 어댑터(`src/mock.ts`)다. 실제 서버의 JWT 암호 검증·DB 제약·모든 입력 검증을 재현하지 않으므로 목업 통과를 백엔드 통합 성공으로 해석하지 않는다.

## 검증

```powershell
npm run typecheck
npm test
npm run build
npm audit
```

브라우저 목업 E2E(관리자/일반 사원, 모바일 포함)는 다음으로 실행한다. Playwright가 목업 개발 서버를 5174 포트로 자동 시작하므로 해당 포트를 비워 둔다. 실제 Compose 프론트 5173과 분리한 검증 전용 포트이며 일반 개발 서버·Docker 포트는 기존 안내를 따른다.

```powershell
npx playwright install chromium
npm run test:e2e
```

데스크톱/모바일 스크린샷은 실행 후 `test-results/admin-desktop.png`, `test-results/admin-mobile.png`에 생성된다. 테스트 결과 폴더는 Git에서 제외한다. `npm run format`은 프론트 소스를 포맷한다.

테스트는 Testing Library와 계약 목업을 통해 인증, 권한, 필드 검증, 사원 관리 흐름, 부서 CRUD 및 409 응답을 확인한다. 실제 백엔드 E2E 결과와 명령 실행 결과는 `../docs/devlog/20261016-frontend-mvp.md`를 확인한다.

## Docker 및 Compose 전달 사항

Dockerfile은 Node에서 정적 파일을 빌드하고 nginx의 5173 포트로 제공한다. 클라이언트 라우팅에 SPA fallback을 적용했다. Compose 파일은 백엔드팀 소유이며 아래 설정만 전달한다.

```yaml
frontend:
  build:
    context: ./frontend
    args:
      VITE_API_URL: http://localhost:8080
      VITE_MOCK_API: "false"
  ports:
    - "5173:5173"
  depends_on:
    - backend
```

환경변수는 **빌드 인자**다. 실행 컨테이너의 environment만 바꿔서는 정적 번들이 바뀌지 않으므로 변경 시 이미지를 다시 빌드한다. `http://backend:8080`은 브라우저에서 해석할 수 없으므로 브라우저가 접근 가능한 `http://localhost:8080`을 사용한다. 목업 이미지가 필요하면 `VITE_MOCK_API: "true"`로 빌드한다. `docker compose up --build frontend` 실행은 루트에서 수행한다.

## 2단계 기능과 검수

관리자 첫 화면은 대시보드, 일반 사원은 내 정보다. 대시보드는 현재 재직자 분포와 서울 기준 월별 입퇴사 건수를 구분하며 차트와 수치 표를 함께 제공한다. 사원 소속 변경은 발령으로만 처리하고 수정 요청에는 부서·직급을 보내지 않는다. 일반 사원은 본인 발령 이력만 조회한다.

목록의 현재 검색·필터·정렬 전체 결과를 xlsx/CSV로 내보낸다(page/size 제외). 양식을 내려받아 .xlsx를 가져올 수 있으며 5MiB/1,000행 한도와 전부 취소 정책을 안내한다. 행 오류는 서버의 실제 엑셀 행 번호를 표시한다. 감사 로그는 관리자 전용으로 서울 날짜의 종료일을 포함하도록 [from,to)로 변환하며 전후 값은 텍스트로 표시한다.

2단계 목업은 ExcelJS로 실제 xlsx/CSV 파일을 생성·해석한다. 메모리 상태이며 새로고침으로 초기화된다. 실제 ZIP 해제 20MiB/항목별 10MiB 제한과 암호화 파일의 완전 검증, DB collation, 트랜잭션 및 감사 저장 실패 롤백은 재현하지 않는다. 이 항목은 실제 백엔드 검수 대상이다. ExcelJS는 목업 파일 기능에서 지연 로딩되며 빌드 시 큰 청크 경고가 발생한다.

단위·계약·화면 테스트 45개(기존 16개 포함), 타입 검사와 빌드가 통과했다. Chromium 기존 2개 및 2단계 데스크톱·모바일 2개 흐름도 통과했다. 실제 백엔드 연동 E2E는 이 작업에서 미실행이며 문서QA가 별도 검수한다. 2단계 스크린샷은 `design-evidence/`에 저장한다. 디자인 규칙과 Claude 검수 기록은 `../docs/design/`, 상세 명령과 결과는 `../docs/devlog/20261016-frontend-phase2.md`에서 관리한다.

Claude 디자인 검수는 3차까지 완료했으며 높음·중간 잔여 지적 0건으로 판정했다. 캡처 30장과 ID별 수정·수용·미확인 항목은 `../docs/design/design-review-phase2.md`에 연결되어 있다. 정적 이미지 검수는 스크린 리더·실측 대비·실제 백엔드 검증을 대신하지 않는다.

## 3B 기능과 검증

조직도(`/organization`)는 로그인한 사원이 계층 목록 또는 키보드 트리로 탐색한다. 관리자는 부서 상위를 지정하고 직책 카탈로그를 관리한다. 직책은 직급·ADMIN 권한과 별개이며 발령에서만 지정·변경·해제한다. 기존 사원 등록·엑셀 양식과 ADMIN 휴가 승인은 유지한다.

급여는 **포트폴리오용 데모 급여 — 실제 세법·4대보험 산정 아님**이다. 관리자는 사원별 설정, 월 전체 생성·재계산·확정을 하고 사원은 본인의 확정 명세만 본다. 파일 다운로드는 없다. 금액은 서버 응답을 그대로 표시하고, 화면에서 공제·실수령을 다시 계산하지 않는다. 과거 월도 생성 시점의 설정과 소속 스냅샷이며 과거 상태를 복원한 값이 아니다.

평가 주기 초안에서 항목과 대상·평가자를 배정한다. 열린 주기에서 자기평가 제출 후 배정 평가자가 관리자 평가를 확정한다. 버튼은 서버 allowedActions를 따르며 최종 점수·등급도 서버 값만 표시한다. 공개 전 관리자 점수·코멘트·등급 영역은 만들지 않는다.

목업 Chromium은 실제 Compose 5173과 분리한 **5174**를 쓴다. 단위 테스트는 로컬 브라우저용 `.env.local`과 독립되도록 VITE_MOCK_API=false를 지정하며 테스트가 fetch 또는 목업 함수를 직접 제어한다. 구현·테스트는 Codex, 시안·실제 이미지 검수는 Claude가 맡았다. 기존 Codex 목업 담당과 새 Codex 화면 담당이 초안을 나눠 작성했고, 작업 진행 지연 후 디자인 수정과 최종 검증은 Codex 담당이 직접 수행했다. 실제 백엔드 E2E는 프론트팀에서 **미실행**이며 문서QA 담당이다. 실제 Compose는 사용하지 않았다.

계약은 확정 v1.1(저장16:45:06), SHA-256 `9A56EAD34B8E4B8134FBD3A8E92B4D0F3FCFAFAF22495EC0D5ACB20AA6F0B3B2`이다. GET 주기 상세의 참조형 배정을 POST/PUT 입력용 ID 쌍으로 명시적으로 변환한다.

| 최종 실행(2026-10-16 KST) | 결과 |
|---|---|
| 17:52:05 `npm test` | 10파일166/166 PASS, 단일 실행·기존97개 포함 |
| 17:52~17:53 `npm run typecheck` | PASS |
| 17:52~17:53 `npm run build` | PASS, 기존 ExcelJS 큰 청크 경고 |
| 17:52~17:53 `npx playwright test --reporter=list` | 5174 Chromium8/8 PASS,29.3초, 기존·2단계·3A·3B 데스크톱/모바일 |

Claude 3차 최종 이미지 검수는 높음·중간 잔여0으로 통과했다. 63장 중 마지막 재확인에서22장을 직접 열고 나머지41장은 2차 판정을 유지했다. 최종 EOF 정리 후 재검증·재촬영한63장은 검수본과 SHA-256이 모두 동일하다. 지적별 반영·수용·재확인과 미확인 범위는 `../docs/design/design-review-phase3b.md`, 실행 증거는 `design-evidence/phase3b/verification.json`, 상세 과정은 `../docs/devlog/20261016-frontend-phase3b.md`에 있다.

잔여 수용 사항은 월 상세 상태 머리의 배지 일관성, ID를 알아야 하는 필터/사원 선택, 사이드바 스크롤 시 제목 잘림이다. 실측 대비·스크린리더·실제 API 화면·태블릿/확대는 미확인이다. 목업의 DB 잠금·트랜잭션 롤백·영속성·계정 활성 모델·MySQL collation 보장은 실제 서버 검수 대상이다.
