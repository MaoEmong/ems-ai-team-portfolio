# 2026-10-19 실제 API 촬영 실행 기록

주체: Codex 화면 구현. HEAD 89db9017fe3bbd025a26d4bb852c609fc7824607, nginx 3헤더 dirty 포함. 전체 dirty 경로와 스크립트 해시는 각 execution/manifest에 기록했다. 제품·Compose·백엔드·계약 변경, 별도 설치·테스트·빌드·커밋 없음. Compose 빌드만 승인 범위로 실행했다. 실제 API+Mock LLM이며 실추론 검증이 아니다.

초기 촬영은 발령 POST 정상201 기대값 누락으로 0장 중단했다. 이후19개 POST/PUT 경로를 컨트롤러와 읽기 대조(PATCH없음), 해당 호출 accepted[201]만 추가했다. 과거 실행 제한 거절의 정확 시각은 미확인으로 유지한다.

통제 촬영에서 실패 프로젝트만 down(-v없음)하여 볼륨 보존/포트 반환 근거를 docs/screenshots/cleanup-*.json에 기록했다. 1차는12장 후 감사 화면 테이블 선택자 오류로 중단했고 제품의 .audit-row 구조에 맞춰 촬영 선택자만 수정했다. 1차 실패 프로젝트도 같은 방식으로 정리하고 볼륨을 남겼다.

2차는25장 후 AI검색비교표 단계 CAPTURE_ACTION_FAILED로 서울03:43:18.269에 중단했다. 스크립트 버그인지 확정할 자료가 부족해 남은1회는 사용하지 않았다. 프로젝트 ems-photo-20261019-d89f4f0b25 스택을 유지한다. 비밀/계정값 복구나 원문 기록은 하지 않는다. 현재 진행 중 명령 없음. 성공/이미지 검수/37화면 완료로 보고하지 않는다. 중간 변경 사항 인계이나 완료 기록 없이 검증 담당자에게 중단 지점을 인계하고 대기한다.

실제 근거: docs/screenshots/capture-attempts.json, capture-attempt-notes.md, response-status-review.md 및 시도별 manifest/execution JSON. 0/12/25장은 서로 다른 시도의 결과이며 합산해 완성 수량으로 쓰지 않는다.

## 최종 촬영 승인 후 실제 촬영 완료 인계

이전 중단 기록을 보존한 상태로 마지막 전체3차를 실행했다. 3차49PNG에 같은 스택에서 허가된 AI4건 재촬영을 연결해 실제37화면/53PNG/누락0을 확보했다. capture-set.json에 두 원본manifest와 역할/뷰포트/시각/HEADdirty/모드/해시를연결했고53파일해시를대조했다. 과거 실패시도의0/12/25장은 합산하지 않았다.

AI실패원인은 CSS생성문자▸/▾를 포함한 accessible name과촬영exact버튼선택자의불일치였다. 제품은변경하지않고두Disclosure의촬영선택자만기존E2E와같은DOM텍스트exact로수정했다. 한차례재촬영후4건모두실패0으로기록했다. 전체3/3회·해당AI재촬영1회사용완료다.

프로젝트ems-photo-20261019-943cdb77d3/UI http://localhost:5173, 프론트·백엔드Up/MySQLhealthy확인. 실행 프로세스을유지해비밀값은프로세스메모리에만남기고검증 담당자에게인계했다. HTTP/Claude Code확인과명시종료신호전down하지않는다. 실제촬영완료와공개검수통과는구분한다. 당시에는이미지갤러리를추가하지않았다. 별도설치/테스트/빌드/커밋실행없음(승인Compose빌드만수행).

## 갤러리 정리 이미지 검수 반영·갤러리 인계

Claude Code 이미지 검수는53장모두열고파일해시53/53을대조했다. 검수는높음0·중간2·낮음10이며최종공개판정은QA와검증 담당 범위이다. README에실제37화면/53PNG/누락0과같은3차스택49+4장의연결,전체3/3회사용및과거실패보존을설명했다. 대표3장은desktop-dashboard,desktop-policy-qa,desktop-payslip-detail이며실제상대이미지링크를연결했다.

발령모달M-01과감사M-02는마스크가업무문구·상태·동작을가려대표/공개추천갤러리에서제외했다. mobile-notifications도L-03제목가림으로대표/갤러리링크에서제외했다. 원본PNG/통합manifest/Claude Code문서는변경하지않았다. 축소본의작은글씨와마스크아래원래값은미확인이며사원등록초기비밀번호빈칸도이미지로확인불가(L-08)라는한계를유지했다. 로그인빈칸·Mock·데모급여고지확인과노출발견없음판정을전체보안보증으로확대하지않았다.

갤러리상대링크는파일존재만확인했다. HTTP는별도담당진행중이며성공을주장하지않는다. 이번작업은README와이일지만변경했고테스트/제품수정/추가촬영/Docker/커밋을실행하지않았다. 문서변경 사항을검증 담당자에게반환하며실행 프로세스의CONTROL_WAIT와스택은명시종료신호까지유지한다.

## 촬영 환경 종료 최종 종료

위 대기 기록 이후 검증 담당자가 HTTP 헤더 확인 근거와 Claude Code 검수 완료를 회수하고 최종 down을 승인했다. HTTP 근거는 docs/security/frontend-header-check-approved-run.json을 읽기만 했다. 별도 담당이 서울04:48:41에 프론트 GET200·SPA fallback200·POST405 모두에서 nosniff/DENY/strict-origin-when-cross-origin 헤더 일치를 확인했다. API 보안 전반·전체 CSP·nginx 구문 검사 성공으로 확대하지 않는다. Claude Code의 중간2·낮음10 및 미확인 범위는 유지한다.

서울04:51:24.096~04:51:27.809에 자기 프로젝트 ems-photo-20261019-943cdb77d3만 down(-v없음)1회, exit0으로 종료했다. 해당 프로젝트 컨테이너는 없고 명명 볼륨 ems-photo-20261019-943cdb77d3_mysql_data는 보존됐다. 기존 실패 프로젝트 정리 작업은 다시 실행하지 않았다.

포트 연결 거절 확인 후 Windows LISTEN 조회는 CIM 접근 제한으로 최초 exit1이었고, 정식 런타임 승인 후 같은 읽기 조회를 수행해 서울04:51:57.984에 3306/8080/5173 LISTEN0건·exit0을 확인했다. 기존 제어 명령 FINISH_PROCESS으로 실행 프로세스도 exit0 종료해 메모리 인증환경을 해제했다. 원문 인증값/로그는 기록하지 않았다.

정제 종료 근거는 docs/screenshots/cleanup-final.json 및 port-release-evidence.json이다. 시작/종료시각·비밀없는명령·exit·컨테이너부재·볼륨보존·포트반환·세션종료와 초기실패/1차/2차 정리 기록 경로를 연결했다. PNG/manifest/Claude Code/HTTP 원본은 무변경이다. stage·커밋·추가촬영·제품수정 없음. 문서와 종료 근거 변경 사항을 검증 담당자에게 반환하며 진행 중 명령·살아 있는 제어 세션은 없다.
