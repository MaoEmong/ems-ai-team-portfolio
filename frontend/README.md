# EMS 프론트엔드

React · TypeScript · Vite 기반 1·2단계 EMS. Node.js 24와 npm을 사용한다. API 계약은 `../docs/api/mvp-api.md`와 `../docs/api/phase2-api.md`를 따른다.

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

브라우저 목업 E2E(관리자/일반 사원, 모바일 포함)는 다음으로 실행한다. Playwright가 목업 개발 서버를 5173 포트로 자동 시작하므로 해당 포트를 비워 둔다.

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
