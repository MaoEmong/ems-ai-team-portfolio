# 프론트엔드 정적·의존성 보안 검토

작성 주체는 Codex(목업담당), 담당 작업은 검증 작업(검증 작업 하위)이다. 검토 시작은 2026-10-18 23:09:45+09:00이며 완료 시각과 기계 판독 근거는 [frontend-security-evidence.json](frontend-security-evidence.json)에 기록한다.

이번 lockfile 기준 npm audit는 승인 셸 재실행에서 종료 코드 0, 보고된 취약점 0건이었다. **알려진 advisory 검출 0건은 취약점 부재, 침투테스트 완료, 운영 보안 인증을 뜻하지 않는다.** 정적 검토에서 관찰한 조건부 잔여 위험과 HTTP·브라우저 미확인 사항은 아래에 따로 남긴다. 소스·lockfile·실행 설정을 수정하지 않았다.

## 대상과 근거 구분

- 기준 HEAD: `89db9017fe3bbd025a26d4bb852c609fc7824607`.
- 대상: 현재 프론트 worktree 소스·설정·lockfile. HEAD 표기만으로 worktree가 해당 커밋과 동일하다고 주장하지 않는다. 핵심 파일별 SHA-256은 JSON에 묶었다.
- `frontend/package-lock.json`: lockfileVersion 3, SHA-256 `0E0A9101CE3C1F2EEFEE8B1D8B35643E0C693536804C7A3C492AF14DE2A66BC5`. 검토 중 전후 일치했다.
- 엔진·런타임: Codex, Node v24.14.1, npm 11.11.0, PowerShell.
- 정적 수동 검토와 자동 문자열 검사는 수행했다. 애플리케이션 단위/통합 테스트, 타입 검사, 빌드, 브라우저, Docker, 실제 애플리케이션 HTTP는 담당 소유로 **이번 담당자가 실행하지 않았다**.
- npm registry 감사 통신은 수행했지만 이를 EMS HTTP 보안 검증으로 세지 않는다. 과거 10/16 테스트·캡처 수치는 이번 결과로 재사용하지 않는다.
- 전체 Git 이력, .gitignore, 추적/staged 파일 공개 검사, 공개할 이미지·JSON, LICENSE·루트 문서는 QA 범위다. backend 보안 문서는 타 팀 소유이며 편집하지 않았다.

## 실행 기록

| 방법 | 실행·시각(+09:00) | 결과 |
|---|---|---|
| 정적 기준 확인 | `git -c safe.directory=<workspace> rev-parse HEAD`, 23:09:45 | 위 HEAD 확인. 일회성 safe.directory만 사용 |
| 자동 의존성 감사 1차 | frontend에서 `npm audit --json --package-lock-only --ignore-scripts`, 23:10:13.389~23:10:15.991 | npm exit 1, 사용 가능한 감사 결과 없음. 민감 가능 진단 원문은 출력·보존하지 않아 정확한 실패 원인은 미확정 |
| 자동 의존성 감사 재시도 | 동일 명령, 23:10:43.007~23:10:44.670 | 정식 require_escalated 승인 셸, npm exit 0, 전체 취약점 0 |
| lock 의존 경로 확인 | frontend에서 `npm ls --all --json --package-lock-only --ignore-scripts`, 23:12:48.588~23:12:51.397 | exit 0, problems 0. 최초 저장소 루트 시도는 유효 트리가 없어 제외하고 올바른 cwd에서 재실행 |
| 자동 정적 검사 | PowerShell·rg, 23:12경 | 소스/설정/lock 53파일, frontend dotenv 키 검사. 매치 값 대신 경로·행·유형만 수집 |
| 보충 확인 | 23:15:21.782 | JWT 형태·인증정보 URL 검사, 선택 설치 버전 11개와 lock 일치 확인 |
| 공식 문서 확인 | 2026-10-18 | npm/Vite/React/OWASP/nginx 1차 출처. 공격 재현이 아닌 해석 근거 |

`npm install/update/audit fix/--force`는 실행하지 않았다. npm 감사는 의존성 기술 정보를 registry에 제출해 알려진 취약점을 조회하는 기능이며, 검사 범위와 결과 해석은 [npm 공식 문서](https://docs.npmjs.com/cli/v11/commands/npm-audit/)를 따른다.

## 정확한 버전과 사용 경로

감사 응답은 info/low/moderate/high/critical 모두 0, advisory 목록은 비어 있었다. 따라서 개별 advisory의 CVE/CVSS·취약 범위·재현 성공을 만들어 기록하지 않는다. 아래는 발견 취약점 목록이 아니라 **버전이 고정된 구성요소의 사용·노출 경계 지도**다. JSON에는 선택 18개 버전과 실제 lock 경로를 보존했다.

| 정확한 lock 버전 | 소스 사용 경로·노출 조건 | 도달성 판단 |
|---|---|---|
| react/react-dom 19.3.1 | main.tsx의 createRoot, JSX 렌더링 | 브라우저 UI 경로. 본 검토에서 RSC/서버 렌더링 경로를 확인한 것은 아님 |
| react-router-dom/react-router 7.18.4 | BrowserRouter와 상대 경로 Link | SPA 이동 경로. 프론트 Guard를 서버 권한 통제로 간주하지 않음 |
| exceljs 4.4.0 → jszip 3.10.2 | mock-phase2.ts의 동적 import, XLSX writeBuffer/load | Mock 파일 기능에서 브라우저 입력/압축 처리가 조건부 도달. 실제 API 모드의 UI 업로드는 FormData |
| exceljs → tmp 0.2.7 / unzipper 0.10.14 / archiver 5.3.2 | lock의 Node 측 전이 의존 경로 | lock에 존재한다는 사실로 브라우저의 Node 파일시스템 경로 실행을 증명할 수 없음. 설치 ExcelJS browser entry는 dist/exceljs.min.js |
| exceljs → uuid 11.1.1 | package.json override와 lock 해결 버전 | 숫자만 보고 취약·안전 단정하지 않음. 이번 registry advisory 없음 |
| vite 8.3.4, @vitejs/plugin-react 6.1.2 | 개발/빌드 도구 | dev script는 모든 인터페이스 바인딩. 실제 개발 서버 노출 미검증. Docker 최종 정적 서빙은 nginx |
| vitest 5.0.5, @playwright/test/playwright 1.64.1 | 테스트 도구 | 이번 작업에서는 실행하지 않음 |
| jsdom 26.1.0, typescript 5.7.3, prettier 3.9.10 | 개발/테스트 도구 | 최종 nginx 실행 코드와 구분. 공급망·악성 패키지·서명 검증은 별도 미실행 |

선택된 설치 버전 11개는 lock와 일치했지만 전체 node_modules 무결성 검증이나 새 설치 재현을 의미하지 않는다. audit의 의존성 통계는 prod 202, dev 123, optional 27, peer 13, total 324였으며 분류가 겹칠 수 있어 단순 합산하지 않는다.

## 관찰한 통제

| 영역 | 근거 | 정적 관찰과 한계 |
|---|---|---|
| VITE 공개 설정 | api.ts:4,23 / Dockerfile:6~9 | 참조 키는 VITE_API_URL·VITE_MOCK_API뿐. frontend .env.example/.env.local도 키·유형만 확인했고 값은 복사하지 않음. 검토 패턴에서 API 키/토큰/개인키 등 검출 0. 일반 고엔트로피 비밀 전체를 판별한 검사는 아님 |
| 번들·sourcemap | vite.config.ts / index.html | envPrefix 확장·환경 전체 define 주입·sourcemap 활성화 설정을 찾지 못함. Vite의 production sourcemap 기본값 false를 [공식 문서](https://vite.dev/config/build-options#build-sourcemap)로 확인 |
| HTML·URL | ai.tsx:98,373 / audit.tsx:78 / files.tsx:295 / ui.tsx:135 | AI 본문·인용·오류·감사 값은 JSX 텍스트. 검토한 비테스트 소스에서 명시적 innerHTML/dangerouslySetInnerHTML/eval/console sink 패턴 검출 0. 링크는 앱의 고정 상대 경로·프래그먼트·생성 blob URL이며 모델 URL을 인용 링크로 실행하지 않음 |
| 원문·스토리지 | ai.tsx:149~204 / auth.tsx:67 | 질문·결과는 컴포넌트 state/ref에 유지하며 적용 전 비교·취소·세션 단위 처리가 존재. 질문/응답/비밀번호를 localStorage·console에 적는 코드는 관찰하지 못함. state가 디스크 비저장이라는 것이 브라우저 메모리·확장프로그램·실제 서버 로그까지 안전함을 보장하지 않음 |
| 다운로드 | files.tsx:6~31 | 인증 요청 응답을 blob URL로 내려받고 URL을 해제. 파일명에서 슬래시·제어문자 제거. 실제 서버 파일 내용·MIME/권한은 HTTP 검증 대상 |
| CSV·XLSX | files.tsx:132~152 / mock-phase2.ts:104~146 | UI는 확장자·5MiB를 미리 검사하고 FormData를 전송. Mock CSV는 BOM·따옴표 이스케이프·위험 접두 수식 방어, XLSX는 문자열 기록. 실제 API 다운로드 바이트의 수식 방어·서버 압축/수식 검증은 본 검토로 입증하지 않음 |
| Guard와 권한 | auth.tsx:88 / App.tsx 라우팅 / api.ts:21 | 미로그인·일반 사원용 UI 분기와 bearer 전달. DevTools/직접 HTTP를 통한 우회 방지는 서버가 다시 검사해야 하며 이번 HTTP 미실행 |
| AI 실행·노출 | ai.tsx:178,230 | 스키마 검증, 지연 응답 무시, 명시적 실행, 외부 전송 항목 고지. 취소가 제공자 처리·비용 취소를 보장하지 않음. 실제 LLM 품질·서버 권한과 다른 근거 |

VITE_ 접두 값은 브라우저에 공개될 수 있으므로 비밀을 두면 안 된다. 이번에 관찰한 두 키도 비밀 저장 공간이 아니다. [Vite 환경 문서](https://vite.dev/guide/env-and-mode). 신뢰하지 않는 내용을 HTML로 삽입하지 않는 원칙은 [React 공식 문서](https://react.dev/reference/react-dom/components/common#dangerously-setting-the-inner-html)를 참고했다. CSV 위험 해석은 [OWASP CSV Injection](https://community.owasp.org/attacks/CSV_Injection)을 참고했으며 스프레드시트 앱에서 직접 재현하지 않았다.

## 잔여 위험과 개선 제안

다음 심각도는 현재 검토자가 조건부 영향과 노출을 평가한 것이며 CVSS나 공격 성공 등급이 아니다. 소스는 수정하지 않았고 로 담당에게 통지했다.

| ID·심각도 | 위치·도달 조건 | 제안·잔여 상태 |
|---|---|---|
| FE-R01 · 중간 | auth.tsx:67, api.ts:17. sessionStorage bearer 토큰은 같은 origin의 JS가 읽을 수 있음. XSS 등 스크립트 실행 경로가 먼저 필요하며 본 검토에서 XSS·탈취는 재현하지 않음 | 텍스트 렌더링·스크립트 출처 통제 유지, 위험 명시. HttpOnly 쿠키 전환은 서버/CSRF 설계 변경이므로 별도 결정. 알려진 잔여로 기록 |
| FE-R02 · 낮음 | 최초 검토에는 헤더 미명시. 검증 작업 이후 nginx.conf:6~8에 nosniff·DENY·strict-origin-when-cross-origin을 서버 범위 add_header always로 정적 확인. 유일 location에 별도 add_header 없음 | 3종 최소수정 정적 반영 완료. 실제 HTTP·오류응답·앞단 프록시는 미확인. Docker 복구 후 검증 필요. 전체 CSP는 잔여 |
| FE-R03 · 낮음 | api.ts:23, Dockerfile:6, package.json:dev. build API origin으로 토큰 전송, 로컬 HTTP 기본값과 개발 서버 all-interface 바인딩 | 원격 환경은 신뢰하는 HTTPS API·접근 제한 필요. 실제 외부 노출·TLS 배포는 미검증. 로컬 기본값만으로 원격 취약점을 주장하지 않음 |
| FE-R04 · 낮음 | mock-phase2.ts:138~154, files.tsx:148. Mock 관리자 경로에서 작은 압축 XLSX를 행수 검사 전에 ExcelJS로 해제 | 브라우저 Mock은 ZIP 보안 경계가 아님. 합성 데이터 한정 사용. 임의 파일 지원이 필요하면 해제 한도·worker를 별도 검토. 실 API는 FormData 전달이며 실제 서버 검수와 구분. 압축폭탄 미재현 |
| FE-I05 · 정보 | api.ts:2, 과거 dist JS/chunk | 10/16 기존 번들에서 Mock/model/ExcelJS 표식 관찰. 해당 artifact의 빌드 mode·소스 커밋 미확인. 실제 비밀 유출이나 서버 권한 우회 근거가 아님. 배포 패키징에서 Mock 분리 선택 검토 |
| FE-R06 · 낮음 | mock-phase2.ts:114. 현 계약의 =,+,-,@,TAB,CR 접두는 방어하지만 LF·전각 기호는 제외. CSV를 여는 앱·locale·재저장 동작에 따라 해석이 달라질 수 있음 | 계약 위반이나 수식 실행으로 판정하지 않음. 실제 API 서버의 CSV 처리와 별도 대조하고, 필요 시 소유팀이 계약과 함께 보완. 실제 스프레드시트 실행·재저장 재현은 미실행 |

sessionStorage는 탭 수명 제한이 있어도 JS 접근 가능성을 없애지 않는다. [OWASP Storage 지침](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html). 방어 헤더는 실제 서빙 환경과의 대조가 필요하다. [OWASP CSP](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html), [nginx headers 모듈](https://nginx.org/en/docs/http/ngx_http_headers_module.html).

## 기존 artifact 관찰

frontend/dist의 기존 파일은 4개, .map은 0개였고 기록 시각은 2026-10-16 20:51:09+09:00이었다. index JS에 Mock·deterministic model·토큰 저장 키 표식이, ExcelJS chunk에 라이브러리 표식이 있었다. 원문 비밀번호·토큰·키는 보고서에 복사하지 않는다. 이 artifact는 이번에 빌드하거나 실행하지 않았으므로 현재 배포 안전성 근거로 쓰지 않는다. 번들 크기 경고는 취약점으로 분류하지 않는다.

## 미실행·인계

- 담당: 이번 source/hash를 기준으로 전체 검사·빌드·브라우저·촬영 수행. 필요 시 실제 HTTP에서 헤더·401/403/404·파일 내용·업로드 경계를 확인한다. 이 보고서의 정적 관찰을 실행 PASS로 바꾸지 않는다.
- 백엔드: 서버 인증/인가·AI 원문 로깅·ZIP 해제/수식/DB 원자성의 실제 검증은 별도 근거다.
- QA: .gitignore/추적·staged·이력/이미지·JSON/라이선스 공개 점검, 최종 커밋 및 README 재현을 담당한다. 실제 비밀이 발견되면 위치·유형만 올리고 이력을 임의 재작성하지 않는다.
- 담당자는 보안 소스 수정·의존성 강제 업데이트·install/fix·전체 테스트·빌드·브라우저·Docker를 실행하지 않았다.
- 작성한 파일은 이 보고서와 JSON 근거 두 개뿐이다. 담당 산출물 소유권을 프론트 담당에게 반환하며, 새 변경이 생기면 영향 파일과 근거 시점을 다시 대조해야 한다.



## 담당 확인과 최종 인계

담당이 /의 두 관찰을 확인했다. 당시 소스 수정 지시는 없었으며 두 질문은 해소됐다. 이후 헤더 관련 결정은 검증 작업 최소수정으로 변경됐다. npm audit의 0건은 명시한 조회 시각·lock·조회 범위의 결과이고, 무취약점 판정이 아니다. sessionStorage XSS 잔여, 검증 작업로 3종 정적 반영 후 실제 HTTP 미확인 및 전체 CSP 잔여, Mock XLSX 해제 한도는 각각 잔여·개선안으로 유지한다.

CSV는 현 계약의 여섯 접두 방어 준수와 LF·전각·재저장 한계를 구분한다. [OWASP CSV Injection 공식 자료](https://community.owasp.org/attacks/CSV_Injection)를 2026-10-18T23:27:39.0236022+09:00~2026-10-18T23:27:48.7359544+09:00에 재확인했다. 이 관찰은 공격 성공이나 계약 위반 판정이 아니다. 실제 API CSV 및 서버 응답 헤더는 담당이 검토 기록에 전달하여 서버/QA가 별도로 확인한다.

설계 검토의 복구 통지 전 Docker 기동·재시도는 금지 상태다. 이번 정리에서도 실행하지 않았다. 지정 문서 두 파일의 최종 인계를 마치고 소유권을 프론트 담당에게 반환한다.

## 검증 작업 정합 갱신 — 검증 작업·92 근거 분리

2026-10-18T23:34:47.5456276+09:00에 담당자가 nginx.conf를 읽어 검증 작업의 서버 범위 X-Content-Type-Options nosniff, X-Frame-Options DENY, Referrer-Policy strict-origin-when-cross-origin과 각각의 always를 확인했다. 유일 location에는 별도 add_header가 없다. 파일 SHA-256은 EF27F2BAC4A1E717B470BFCB965F427DDE2B393D0CA323A6FD4430702BCE5C60이다. 최초 7행 파일의 해시는 당시 근거로 JSON에 보존하고, 새 관찰은 headerFollowUp에 분리했다. 이는 실행 중인 nginx 설정 적용이나 실제 응답 헤더 확인이 아니다. 전체 CSP는 잔여로 유지한다.

검증 작업의 테스트 미실행 표기는 해당 정적 검토 당시 범위다. 이후 별도 승인 검증 작업에서 npm test를 23:31:15.8563348~23:31:37.7977459+09:00에 한 번 실행했고 14개 파일·276개 테스트 모두 통과했다. 실행 전후 HEAD는 89db9017fe3bbd025a26d4bb852c609fc7824607이었다. 이는 검증 작업 수정 전 단위/계약 테스트 근거이며 헤더 검증이 아니다. 상세 dirty 경로와 종료 코드는 JSON validation에 있다. 검증 작업에서는 테스트·빌드·audit·Docker를 실행하지 않았다. Docker 기동·재시도 금지는 복구 통지 전까지 유지한다.

## 검증 작업 실HTTP 확인 시도 — 응답 미확인

담당 HTTP 시작 통지 후 프로젝트 ems-photo-20261019-943cdb77d3의 http://localhost:5173 대상으로 기존 스크립트를 한 번 실행했다. 2026-10-19T04:00:02.735+09:00~04:00:02.807+09:00(근거 JSON은 UTC), 기본 샌드박스에서 첫 GET / 단계가 EACCES로 중단됐다. 응답을 받지 못했으므로 정상/오류 상태와 3종 헤더는 모두 실제 HTTP 미확인이다. 연결 실패만으로 서버 헤더 결함을 판정하지 않는다.

없는 SPA 경로 GET과 정적 POST는 수행하지 않았고 자동 재시도도 하지 않았다. 본문·쿠키·인증값·원문 오류는 저장하지 않았다. 실행 HEAD는 89db9017fe3bbd025a26d4bb852c609fc7824607, nginx 해시는 EF27F2BAC4A1E717B470BFCB965F427DDE2B393D0CA323A6FD4430702BCE5C60이다. 3종 헤더의 기존 정적 관찰과 이번 실패한 HTTP 시도, 과거 audit/Vitest 근거는 구분한다. Docker 제어 없이 부분 근거를 담당에게 인계하고, 재시도는 하지 않는다.

## 검증 작업 승인 후속 실행 — 로컬 HTTP 3종 헤더 확인
초기 검증 작업의 응답 0건 EACCES는 제품 HTTP 실패가 아니라 샌드박스 접근 차단으로 분류한다. 초기 JSON·실행 시각은 수정 없이 보존했다. 기존 스크립트의 guard를 유지하고 제한된 run-id 및 덮어쓰기 금지 별도 결과 파일만 최소 지원했다. require_escalated와 구체 사유의 정식 승인 절차를 거쳐 검증 작업 후속 실행을 수행했다.

프로젝트 ems-photo-20261019-943cdb77d3, 실행 시각은 2026-10-19T04:48:41.315~04:48:41.383+09:00이며 JSON은 UTC다. 기존 스크립트 역사 taskId111, 실행 검증 작업, 후속 검증 작업/run-id 검증 작업-20261019-01을 구분한다.

| 요청 | 실제 상태·분류 | 지정 헤더 |
|---|---|---|
| GET http://localhost:5173/ | 200 정상 | 3종 일치 |
| GET http://localhost:5173/__frontend_header_check_missing__ | 200 SPA fallback; 오류응답으로 세지 않음 | 3종 일치 |
| POST http://localhost:5173/ 빈 본문 | 405 정적 서버 오류응답 | 3종 일치 |

세 응답 모두 X-Content-Type-Options=nosniff, X-Frame-Options=DENY, Referrer-Policy=strict-origin-when-cross-origin이었다. 각 요청은 한 번이며 자동 재시도는 없었다. 상태·시각·허용 헤더만 기록하고 본문·쿠키·인증·계정은 기록하지 않았다. 상세 근거는 [후속 HTTP JSON](frontend-header-check-approved-run.json), 통합 연결은 증거 JSON의 httpHeaderFollowUp이다.

HEAD는 89db9017fe3bbd025a26d4bb852c609fc7824607, nginx SHA-256은 EF27F2BAC4A1E717B470BFCB965F427DDE2B393D0CA323A6FD4430702BCE5C60이다. 앞 절의 HTTP 미확인 표기는 당시 이력이며, 이번 표본의 정상/405 응답에 한해서 3종 헤더를 실제 확인했다. 전체 CSP와 다른 잔여는 유지한다. nginx 구문 검사·다른 상태/프록시/배포환경·API 권한은 이 검사 범위가 아니다. 과거 audit/Vitest를 재실행하지 않았으며 Docker 제어·down·커밋도 하지 않았다. 결과와 문서 소유권을 담당에게 반환한다.
