# EMS 전체 목표 대조표

기준: 요구사항의 그룹1~3을 MVP·확장1·확장2(3A/3B)로 구현하고 승인된 AI3기능을 추가한 범위다. 아래는 Codex 문서QA의 실제 증거 인계이며 최종 완료 판정은 Claude Code(설계 검토)의 완료 검토다. 배포는 제외했다.

| 목표 | 구현·현재 실제 결과 | 근거 |
| --- | --- | --- |
| 그룹1/MVP | 인증/ADMIN·EMPLOYEE 본인권한,사원·부서·직급CRUD,검색/필터/정렬/페이징,퇴사논리삭제·기존JWT차단. 최종이미지20회귀PASS | [현재 QA](qa/2026-10-16-phase4-ai-integration.md), phase4-regression20-results.json |
| 그룹2/확장1 | 대시보드,발령전용소속변경/이력,실제xlsx/CSV파싱·일괄가져오기전체취소,감사. 최종이미지14회귀PASS | 현재QA, phase4-regression14-results.json |
| 그룹3/3A | 출퇴근/정정·미기록,휴가예약/결재/취소복원,수신자별알림/읽음·사유미노출. 최종이미지13회귀PASS | 현재QA, phase4-regression13-results.json |
| 그룹3/3B | 부서계층/직책발령,데모급여 원자생성·확정/스냅샷/권한,자기·관리자평가/확정공개·재배정. 최종이미지15회귀PASS | 현재QA, phase4-regression15-results.json |
| AI-CFG-01 | LlmClient·Mock/Anthropic/Ollama 설정,Mock고지·전송구분·오류/제한/안전감사. 기본Mock 실제환경PASS, HTTP스텁계약PASS | [API](api/phase4-ai-api.md), [제공자표](qa/2026-10-16-phase4-ai-integration.md) |
| AI-01 | ADMIN필터제안,EMPLOYEE403,C01전체교체/기존GET대조,모호/지원불가. 기존5필드에 한정 | 현재QA, phase4-ai-results.json |
| AI-02 | FINALIZED본인/배정자만 읽기전용요약,다른ADMIN404·미확정409,원문/점수불변 | 현재QA, phase4-ai-results.json |
| AI-03 | 합성규정인용ID/버전/절/발췌,근거없음/문서밖·주입고정사례의답변불가 | 현재QA, phase4-ai-results.json |
| AI활용 포트폴리오 | 개발Codex·Claude역할,계약질의·시안/구현/검수·실패/수정·증거주체/시각·회의/ADR/일지 | [AI협업](ai-workflow.md), [일지](devlog/README.md), [ADR](adr/README.md) |
| 실행·데이터·문서 | 로컬Compose/MySQL/실제Chromium,유지DB보존·새DB시드,README·API/ERD·회의/회고·3논리커밋 | 현재QA·README·최종보고의해시/Git상태 |

## 제외 — 완료 기능으로 세지 않음

- 범용 HR 데이터 자유질의,평가 초안 작성·자동 저장/제출/적용·AI 점수/등급 결정.
- AI 직책·입사일 범위 검색,기존 검색 API 확장. hireDate 정렬만 허용하며 날짜 범위는UNSUPPORTED다.
- 스트리밍·공유결과캐시·자동제공자대체·다중인스턴스전역제한·자율도구/SQL실행.
- 팀장 휴가 승인,급여파일다운로드·평가알림,실제세법/4대보험·법정연차 계산. 초기예시의생일/계약만료알림은 현재휴가/근태알림범위에 포함하지 않았다.
- 배포,공휴일/출근율/유연·야간근무 등 명시된 데모정책 생략항목.

## 미실행 — 증거 범위를 넓혀 쓰지 않음

- 실제 Claude/Ollama 추론: 명시된키부재·기존호스트서비스/모델확인불가. 모델 설정이나 HTTP스텁 성공을 실추론으로 세지 않는다.
- 정상Mock Compose에서의 제공자잘못된출력/ID·지연·AI_BUSY·호출0회·전송캡처: QA직접미실행, 백엔드명명테스트근거에 연결.
- 실모델 자연어이해·요약품질·환각방지/의미정확성,실측대비·스크린리더·태블릿/확대,시계변경/윤년경계등. 해당자동테스트·목업/디자인범위와 구분.

## 잔여 — 담당·근거와 함께 유지

프론트 디자인 수용 낮음6건: L05/L07/L12(Claude),L11/N-01/N-02(Codex 담당). 최종[디자인검수](design/design-review-phase4.md)8절의 근거/위험·미확인 범위를 유지한다. 기존ExcelJS 큰청크경고는 프론트 담당 잔여다. 3B시안523행 공백은 프론트가 정리했으며 신규파일포함staged검사로 재확인한다. 과거 디자인 잔여를 이번에 전부 재검수한 것으로 쓰지 않는다.
