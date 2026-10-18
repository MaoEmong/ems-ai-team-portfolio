# 요구사항

## 3B 확정 인수 조건

설계 검토에서 전달한 [회의 결정](meetings/2026-10-16-phase3b-kickoff.md)과 [정책표·인수조건](phase3b-policy.md)을 [API v1.1](api/phase3b-api.md)(16:45:06,SHA-256앞자리9A56EAD34B8E)과 대조했다. true+jobTitleId생략 해제,부서부모생략루트/일반PUT직책null유지,SELF_DRAFT재배정유지,초안부분/null점수·공개전민감키제외를재확인했다. 관리자주기상세assignments의DRAFT null/false/[]·상태별재배정조건·정렬도정책표에반영했다. 실제 판정은 [3B 검수 보고서](qa/2026-10-16-phase3b-integration.md)에 연결하며 AI는 후속 범위다.

| ID | 항목 | 인수 조건 |
| --- | --- | --- |
| ORG-02 | 부서 계층·조직도 | 여러루트/빈부서 표시, 자기·후손이동CYCLE409·자식삭제409. ADMIN변경/인증조회, ACTIVE·ON_LEAVE만·민감정보제외 |
| ORG-03 | 직책 발령 | changeJobTitle 생략/false는 유지, true+null은 해제. 명시적 변경 후 현재값·이력·감사 일치와 생략 유지 회귀 검사 |
| ORG-04 | 발령·퇴사 연동 | 퇴사와같은트랜잭션에서직책해제·RETIRE감사전후값·별도발령없음. 직책참조삭제409, 팀장휴가승인확장제외 |
| PAY-02 | 데모 산정·금액 | JSON정수number·기본급/수당각0~10억원. 총지급450/350/300bps·각항목HALF_UP후합산·DEMO_V1·일할없음. 데모문구와계산예시/경계검증 |
| PAY-03 | 월 생성·확정·본인조회 | 월대상·미래월/0명거부·전체원자성·설정누락/기존월/경합409·DRAFT재계산·확정불변. EMPLOYEE본인확정만/그외404. 감사금액제외 |
| EVAL-02 | 자기평가·관리자평가 | DRAFT/OPEN/CLOSED·OPEN항목스냅샷·자기제출/관리자초안/확정·미완료마감표시·재배정초기화. 본인/배정평가자만상세,다른ADMIN404·자기결재403 |
| EVAL-03 | 최종 점수·등급 | 관리자평균HALF_UP소수둘째자리·S4.50/A3.50/B2.50/C1.50/나머지D·서버확정스냅샷. 자기점수미합산·공개전민감키부재·감사점수/코멘트제외 |

설계 검토와 인계 확인 뒤 실제 Compose/MySQL/Chromium에서 검수했다. [실제 V4 ERD](02-architecture.md)와 [정책 결정표](phase3b-policy.md)를 함께 따른다. **포트폴리오용 데모 급여 — 실제 세법·4대보험 산정 아님**. 팀장 휴가 승인 확장은 제외한다.

기준: [킥오프 결정](meetings/2026-10-16-kickoff.md)과 후속 단계 설계 검토 기록. 아래는 요구사항이며 기능별 실제 결과는 QA 보고서에 기록합니다. 현재 승인 AI3기능까지 실제 Mock 환경에서 구현·검수했으며 실추론 미실행과 제외범위는 별도로 기록합니다.

## 1단계 MVP

| ID | 기능 | 인수 조건 |
| --- | --- | --- |
| AUTH-01 | 로그인 | 사번을 loginId로 사용한다. 올바른 자격증명에 Bearer access token과 사용자 정보를 반환한다. 만료 3600초, refresh 없음. 잘못된 인증은 401이다. |
| AUTH-02 | 역할·본인 권한 | ADMIN은 관리 API 사용 가능. EMPLOYEE는 본인 사원 정보만 조회하고 다른 사원 조회·목록·등록·수정·퇴사 처리는 거부된다. 인증된 부서·직급 목록 조회는 허용한다. 서버가 권한을 강제하며 비인증 401, 권한 부족 403을 확인한다. |
| AUTH-03 | 토큰 생명주기 | sessionStorage에 저장, 로그아웃 시 삭제, 401 시 로그인 화면 이동. 모든 인증 요청에서 계정 활성 여부를 확인하여 퇴사자의 기존 JWT도 401로 거부한다. |
| AUTH-04 | 현재 사용자 | GET /auth/me는 인증된 사용자 정보를 반환한다. 초기 관리자 1개는 환경변수 비밀번호로 생성하며 합성 데모 사원 약 30명을 제공한다. |
| EMP-01 | 사원 등록 | ADMIN이 사번·이름·이메일·전화·입사일·부서·직급·역할·초기 비밀번호로 등록한다. 로그인 ID는 사번. 사번·이메일 중복은 409이며 퇴사자의 사번도 재사용하지 않는다. 입력 오류는 400이다. |
| EMP-02 | 상세 조회 | ADMIN 또는 해당 사원 본인만 상세 조회 가능. 존재하지 않는 대상은 404. 응답은 계약 필드를 따르고 비밀번호·해시를 포함하지 않는다. |
| EMP-03 | 사원 수정 | ADMIN만 계약 필드를 수정한다. 일반 수정 상태는 ACTIVE 또는 ON_LEAVE만 허용하며 RETIRED 전환은 퇴사 API로 수행한다. EMPLOYEE 본인 수정도 거부한다. |
| EMP-04 | 퇴사 처리 | 화면 명칭은 '퇴사 처리'. 물리 삭제 API 없음. RETIRED·퇴사일 기록·계정 비활성화를 적용한다. 이후 기존 토큰 요청도 401이다. |
| EMP-05 | 목록·검색·필터 | ADMIN만 조회. keyword는 이름·사번·이메일 대상, departmentId·positionId·status 필터 제공. 기본 목록은 RETIRED 제외, status로 퇴사자 조회 가능. 빈 결과도 정상 페이지 응답이다. |
| EMP-06 | 정렬·페이징 | page는 0부터, size 기본 20·최대 100. employeeNo/name/hireDate의 asc/desc 정렬 지원. content/page/size/totalElements/totalPages 반환. |
| DEPT-01 | 부서 CRUD | 인증 사용자는 목록 조회, ADMIN은 관리 화면에서 등록·수정·삭제 가능. id/name/description 사용, 이름 중복은 409 DUPLICATE_NAME. 퇴사자 포함 소속 사원이 있으면 409 DEPARTMENT_IN_USE로 삭제 거부. |
| POS-01 | 직급 CRUD | 인증 사용자는 목록 조회, ADMIN은 관리 화면에서 등록·수정·삭제 가능. id/name/level(정수) 사용, 이름 중복은 409 DUPLICATE_NAME. 퇴사자 포함 소속 사원이 있으면 409 POSITION_IN_USE로 삭제 거부. 직책은 3단계. |
| UX-01 | 웹 흐름·오류 | 실제 API로 로그인→목록→등록·수정·퇴사 및 부서·직급 관리를 검증한다. 로딩·빈 결과·입력 오류·서버 오류·401/403 상태를 처리한다. |

설계 검토 후속 답변()에 따라 퇴사자 수정·중복 퇴사는 409 EMPLOYEE_RETIRED로 거부합니다. 생성 201, 수정·퇴사 200, 삭제 204입니다. 재입사·마지막 관리자 보호 등 미확정 확장 정책은 검토 기록에 확인하며 계약을 임의 변경하지 않습니다. [MVP 통합 검수](qa/2026-10-16-mvp-integration.md)에 기능별 증거와 검증 한계를 기록합니다.

## 2단계 확장 1

상세는 아래 2단계 확정 인수 조건과 phase2 API 계약을 따릅니다.

| ID | 기능 |
| --- | --- |
| DASH-01 | 총 인원·부서별 인원·입퇴사 현황 대시보드 |
| HIST-01 | 부서 이동·승진 등 발령 이력 |
| IO-01 | xlsx 기본 가져오기·내보내기 |
| IO-02 | CSV 내보내기 병행 |
| AUDIT-01 | 누가 언제 무엇을 변경했는지 감사 로그 |

## 3단계 확장 2

3A·3B 상세 정책은 본 문서의 확정 인수 조건과 정책표를 따른다. 초기 기능 목록은 아래와 같으며 미구현 예시를 현재 기능으로 해석하지 않는다.

| ID | 기능 |
| --- | --- |
| ATT-01 | 출퇴근·지각·결근 등 근태 관리 |
| LEAVE-01 | 휴가 신청·승인·반려 |
| LEAVE-02 | 잔여 연차 관리 |
| PAY-01 | 기본급·수당·공제·급여명세서 |
| EVAL-01 | 평가 항목·점수 관리 |
| ORG-01 | 조직도 및 직책 관리 |
| NOTI-01 | 휴가 승인·생일·계약 만료 등 알림 |

## 4단계 AI

**계약 확정·실제 Mock 통합 검수 완료.** Claude Code(설계 검토)가 승인한 [AI API v1.0](api/phase4-ai-api.md), SHA-256 `E117946FE967747697A8AD6A3D0AF9A729991DB1A547BB6A468D7B09601A5617`을 따른다. [정책표](phase4-ai-policy.md)·[착수 설계 검토 기록](meetings/2026-10-16-phase4-ai-kickoff.md). 최종 인계 확인 뒤 실제 통합 검수했다. [현재 결과·미실행](qa/2026-10-16-phase4-ai-integration.md), [전체 목표 대조표](completion-matrix.md)를 따른다. Mock/어댑터 구현과 실제 Claude/Ollama 추론 성공은 별개이며 실추론은 미실행이다.

초기 로드맵의 ID를 승인 API와 맞춘다. 기존 AI-01(공통 제공자)은 AI-CFG-01로, 기존 AI-02(검색)는 AI-01로, 기존 AI-03(요약)는 AI-02로, 기존 AI-04(규정)는 AI-03으로 대응한다. 기능을 추가·누락한 것이 아니라 승인 계약의 식별자로 정리한 것이다.

| ID | 기능 | 인수 조건·검증 기대값 |
| --- | --- | --- |
| AI-CFG-01 | 제공자 추상화·설정 | LlmClient의 Mock/Anthropic/Ollama를 서버 설정으로 선택한다. 기본 Mock은 실제 추론 아님을 표시한다. GET /ai/config는 provider/model/mock/externalTransfer/enabled/promptVersion만 공개하고 키·base URL은 제외한다. 실패 시 다른 제공자로 자동 대체하지 않는다. |
| AI-01 | 자연어 사원 검색 필터 제안 | ADMIN만 POST /ai/employee-search, EMPLOYEE403·제공자 호출0회. 기존 목록의 keyword/departmentId/positionId/status/sort **5필드만** 제안한다. 서버는 검색하지 않으며 사용자가 확인·적용하면 기존 GET /employees에서 다시 권한 검사를 한다. |
| AI-01-A | 허용 필터·지원 불가 | 직책·입사일 범위는 UNSUPPORTED이며 filters={}로 반환한다. page/size·SQL·OR·임의 연산자·jobTitleId·hireDateFrom/To는 허용하지 않는다. hireDate 정렬은 허용되지만 날짜 범위는 지원하지 않는다. 잘못된 키/ID/타입/null은 AI_INVALID_OUTPUT502로 거절하며 부분 보정하지 않는다. OK는 최소1필터, AMBIGUOUS/UNSUPPORTED는 빈 필터다. |
| AI-02 | 확정 평가 코멘트 요약 | POST /ai/evaluation-summary는 evaluationId만 받는다. 본인/배정 평가자의 FINALIZED만 허용한다. 다른 ADMIN/타인/없는 ID404, 권한 있는 미확정409 AI_EVALUATION_NOT_FINALIZED이며 모두 제공자 호출0회다. 항목 이름·자기/관리자 코멘트만 전송하고 ID·이름·사번·점수·등급은 제외한다. 결과는 읽기 전용이며 원문·등급을 저장/변경하지 않는다. |
| AI-03 | 합성 규정 Q&A | 모든 인증 사용자가 POST /ai/policy-qa를 사용한다. 버전 있는 고정 합성 문서만 근거로 한다. 인용 ID/버전/절·발췌 원문 일치를 서버가 검증하고, 근거 불일치는 답변을 노출하지 않는 INSUFFICIENT_EVIDENCE로 바꾼다. 실제 회사 규정/법률 안내가 아니라는 고지와 원문 확인 안내를 표시한다. |
| AI-SEC-01 | 전송·출력·감사 경계 | 권한/입력 검사 후에만 호출한다. 제공자 JSON의 중복/미정의 키·잘못된 타입·후행 토큰·코드펜스는502다. 질문·평가·규정은 비신뢰 데이터이며 도구/SQL/외부URL 실행은 없다. 감사는 AI_INVOKE의 허용 메타데이터만 저장하고 원문·키·응답은 남기지 않는다. 결과 저장·공유 캐시·자동 재시도는 없다. |
| AI-OPS-01 | 한도·실행 증거 | 질문1~500 UTF-16단위, 평가20항목/코멘트합계12000, 본문16KiB, 모델JSON64KiB·제공자봉투128KiB, 기본30초·1024토큰. 사원별 동시1/60초10회, AI_BUSY/AI_RATE_LIMITED429를 구분한다. Mock·HTTP스텁·실제Claude/Ollama·Chromium·디자인 검수는 각각 별도 실행/미실행으로 기록한다. |

외부 전송은 Anthropic/Ollama 모두 true이며 클라우드 여부를 뜻하지 않는다. 기능별 전송 필드를 안내하고 명시 실행 버튼으로 요청한다. 자유 텍스트 속 개인정보를 자동 제거한다고 주장하지 않는다. Claude 모델 기본 설정 `claude-sonnet-5-5`는 설계 검토 결정이며 존재·계정 접근·실호출 성공과 구분한다. 키를 자동 탐색하거나 Ollama 모델을 자동 다운로드하지 않는다. 키/서비스가 없으면 실호출은 미실행으로 남긴다. 범용 HR 질의·평가 초안 작성/자동 적용·기존 검색 API 확장은 제외한다.

## 공통 완료 기준

- 기능별 구현·검증 증거를 ID에 연결한다. 주요 로직의 단위/슬라이스 테스트와 MySQL 기반 통합 테스트를 수행한다. Testcontainers 또는 Compose MySQL 사용, H2만으로 통합 완료 판정 금지.
- 프론트 타입 검사·프로덕션 빌드와 실제 웹/API 핵심 흐름을 확인한다. 미실행은 '미실행', 실패는 실패로 기록한다.
- README 실행 절차·아키텍처·ERD·스크린샷, API 명세, AI 협업 일지·ADR·회고를 실제 구현에 맞춰 갱신한다.
- 실제 인물 개인정보·비밀값·토큰을 문서나 저장소에 남기지 않는다. 합성 데이터만 사용한다.

## 2단계 확정 인수 조건 (2026-10-16)

[종료·착수 회의](meetings/2026-10-16-phase1-closing.md)와 [상세 API](api/phase2-api.md)가 기존 2단계 '상세 추후 확정' 표기를 대체합니다.

| ID | 인수 조건 |
| --- | --- |
| EMP-03 변경 | PUT 조직 필드 생략/null/동일값은 유지, 다른 값은409 APPOINTMENT_REQUIRED. 프론트 읽기 전용·필드 생략, 신규 POST 필수. |
| DASH-01 | ADMIN 전용. 현재 ACTIVE/ON_LEAVE/RETIRED 및 employed 합계, 현재 재직 부서·직급 분포가 일치. 서울 asOfDate. |
| DASH-02 | 이번 달 포함12개월 입퇴사·빈 달0·오래된 순, 오늘 이후 날짜 제외. 상태 집계와 날짜 집계 구분. 기준값·증감 검증. |
| HIST-01 | 발령201 후 소속·이력·감사 원자적 일치. 당시 이름/level/작성자 스냅샷, 사유1~200자, 양쪽 조직 필수·최소 하나 변경. |
| HIST-02 | 입사일 이전/미래/직전 발령일 이전/변경 없음/사유 누락400, 퇴사자409. 이력과 모순된 입퇴사일 변경400. 같은 날짜 ID 순서. |
| HIST-03 | ADMIN 또는 본인 이력 GET, 타인/일반사원 등록 거부. effectiveDate DESC/id DESC. 과거 이력 조직 삭제도 IN_USE409. |
| IO-01 | 전체 검색·필터·정렬 결과 xlsx/CSV, page/size 무시. 10,000행 초과 전체 거절. 실제 파일 파싱 대조. |
| IO-02 | xlsx 문자열 셀, CSV BOM·수식 방지. 비밀번호/해시 제외. 파일명/MIME/Content-Disposition 및 CORS 노출. |
| IO-03 | employees 및 참조 시트 양식. 사번 앞자리0·날짜·비밀번호 문자열, ACTIVE 생성, 수식 거부. |
| IO-04 | 정상 다중행 전부 등록, 오류시 사원·계정 부분저장0. 실제 Excel 행번호 rowErrors. 내부/DB 중복은 MySQL collation 기준. 오류·감사에 입력원문/비밀번호 제외. |
| IO-05 | 5MiB/1000행, ZIP총20MiB/엔트리10MiB. 파일초과413, 형식/시트/헤더/해제오류400, 행오류400+rowErrors, 검증후 충돌409 IMPORT_CONFLICT. |
| AUDIT-01 | 사원·조직·발령·퇴사·로그인·파일 사건, 허용필드 before/after/metadata. 성공 업무와 감사 동시 커밋·롤백. |
| AUDIT-02 | 가져오기 성공IMPORT1+사원별CREATE(source=IMPORT), 실패업무0+실패IMPORT1. 로그인 실패 actor 또는null, 없는 계정 loginId 미저장. |
| AUDIT-03 | ADMIN조회, actor/target/action/success/기간 AND, [from,to), occurredAt DESC/id DESC. 비밀값 제외, 수정삭제 API 없음. |

실행 증거와 미실행 범위는 [2단계 QA](qa/2026-10-16-phase2-integration.md)에 기록합니다.

## 3A 확정 인수 조건

근거: [착수](meetings/2026-10-16-phase3a-kickoff.md), [마무리 결정](meetings/2026-10-16-phase3a-closing.md), [상세 API](api/phase3a-api.md). 사용자는 네 확인사항에 답하지 않고 시작을 지시했고, 권장안·세부 정책은 설계 검토에서 결정했다. [실제 QA 결과·미실행](qa/2026-10-16-phase3a-integration.md)을 별도로 확인한다.

| ID | 인수 조건 |
| --- | --- |
| ATT-01 | ACTIVE·입사일<=오늘 본인만 서버 서울 시각 출퇴근. 초 단위, 월~금. 중복 출근/퇴근·출근 전 퇴근·휴직·주말·종일휴가 출근409. 퇴사계정401. |
| ATT-02 | 월~금 전체 월력, 미기록 null·NO_RECORD, 미퇴근 INCOMPLETE. 조회 시 승인휴가와 시각으로 late/earlyLeave 별도 계산. 적용 기준과 leaves 배열 반환. 자동결근·자동퇴근·시간합계 없음. |
| ATT-03 | ADMIN 정정: 사유1~200자, 출근필수·퇴근선택, 입사일~오늘·날짜내·미래불가·출근<퇴근. corrected 및 감사·대상알림 원자적 저장, 타인 일반사원 접근거부. |
| LEAVE-01 | ANNUAL/HALF_AM/HALF_PM/SICK, 오늘 이후(오늘 포함) 신청, 사유필수, 평일계산·반차0.5·병가비차감. 현재기간 경계400, PENDING/APPROVED 겹침409(반대반차 허용). |
| LEAVE-02 | 신청예약→승인사용→반려/취소복원. available=granted-used-reserved. 부족409, 사원/잔액잠금·중복처리409·업무감사알림 동시롤백. |
| LEAVE-03 | 다른 ADMIN 승인/반려, 자기승인/반려403. 지난 PENDING 취소허용·승인409·반려허용. APPROVED 시작전만 취소. 서버 allowedActions와 UI 일치. |
| LEAVE-04 | 휴가기록 후 입사일변경409. 퇴사 시 모든 PENDING·미래 APPROVED SYSTEM취소와 잔액·감사·알림 연동. 본인상세/목록·잔액과 ADMIN관리조회 권한 확인. |
| NOTI-01 | 신청/취소는 본인제외 활성ADMIN, 승인/반려는 신청자, 근태정정은 대상자. 사유/반려사유 미포함, 대상 상세 권한 재확인. |
| NOTI-02 | 본인목록/미읽음, 단건읽음 반복204·타인404, read-all upToId 이하만. 새 알림 보존. |
| NOTI-03 | visible30초·복귀/업무후 갱신, 로그아웃/계정변경 시 중단·캐시제거·늦은응답폐기. |

### 근태 정책 결정표

| 승인 휴가 | 출근 기준 | 퇴근 기준 | 판정 |
| --- | --- | --- | --- |
| 없음 |09:00:00|18:00:00|출근 기준 초과 late, 퇴근 기준 미만 earlyLeave; 정각 정상|
| 오전반차 |14:00:00|18:00:00|같은 비교 규칙|
| 오후반차 |09:00:00|14:00:00|같은 비교 규칙|
| 종일/양쪽반차 |응답 기준 참조|응답 기준 참조|LEAVE, 두 boolean false|
| 기록없음/퇴근없음 |기준 유지|기준 유지|NO_RECORD/INCOMPLETE, 없는 시각 판정 false|

### 휴가 상태 전이표

| 현재 상태 | 본인 | 다른 ADMIN |
| --- | --- | --- |
| PENDING 시작일>=오늘 |CANCEL|APPROVE/REJECT|
| PENDING 시작일<오늘 |CANCEL|REJECT, APPROVE409 LEAVE_START_PASSED|
| APPROVED 시작일>오늘 |CANCEL|없음|
| APPROVED 시작일<=오늘 |취소409 LEAVE_START_PASSED|없음|
| REJECTED/CANCELLED |없음|없음|

자기승인/반려403, 이미 처리된 상태 재처리409 LEAVE_ALREADY_PROCESSED. 병가도 결재·겹침 정책 동일, 차감만0.

### 연차 데모 산정표

**단순화한 포트폴리오 데모 정책이며 법적 산정이 아니다.** 출근율·개근 조건, 공휴일 달력, 유연·야간근무, 이월·재산정을 생략한다. 입사기념일 1년 기간, periodEnd 포함. 첫해 오늘까지 발생분만 사용.

| 조건/예시 | 부여·처리 |
| --- | --- |
| 1년미만 |원입사일 plusMonths 월말보정으로 월1일, 최대11|
| 첫 기념일 |첫해잔여 소멸,15일|
| 만n년>=1 |min(25,15+floor((n-1)/2))|
| 2023-10-16 입사·2026-10-16 기준 |16일|
| 2024-02-29 입사·2025-02-28 기준 |15일, 평년기념일2/28|
| 기간변경 |잔여소멸·이월없음, 현재기간 휴가만 신청|

3B는 목록만 유지한다: 조직도·직책/팀장승인 확장, 급여 데모 고정비율(확정본·반올림 후속결정), 평가(공개범위 후속결정). 구현·완료 판정은 별도 작업 분담 대상이다.
