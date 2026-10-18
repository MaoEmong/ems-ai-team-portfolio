# Claude Code 실제 이미지 검수 (이미지 검수)

- 검수 주체: Claude Code 디자인 검토. 촬영·manifest 작성은 Codex가 했다.
- 검수 시각: 2026-10-19 04:20~04:46 (KST)
- 기준 manifest: `docs/screenshots/capture-set.json`(통합본, 37화면 / 53 PNG)
  - 원본 3차: `2026-10-18T18-54-38-906Z-f170b270/manifest.json`(49장, 실패 4건은 역사 기록으로 보존)
  - AI 재촬영: `2026-10-18T19-39-27-026Z-430432da/manifest.json`(4장, 실패 0건)
- 수정하지 않은 것: 다른 manifest, PNG, 제품 코드, 보안 문서. Docker·HTTP 호출·재촬영·down·커밋도 하지 않았다.

## 1. 자동 대조와 사람 확인의 구분

| 구분 | 수행 주체·방법 | 결과 |
|---|---|---|
| 해시 대조(자동) | Claude Code가 node 스크립트로 통합 manifest의 `captures[].file`을 읽어 SHA-256을 다시 계산하고 `sha256` 값과 비교했다. PNG 헤더에서 크기도 읽었다. | 53/53 일치. 누락된 파일 없음. |
| 자동 마스크(자동) | manifest의 `credentialAndIdentityMasking: true`는 Codex 촬영 스크립트가 남긴 값이다. | Claude Code는 마스크 스크립트를 재현하지 않았다. 마스크가 이미지에 실제로 그려졌는지는 아래 사람 확인으로만 판단했다. |
| 사람 확인 | Claude Code가 Read 도구로 PNG를 직접 열었다. 세로로 긴 이미지는 headless Chrome으로 390×1700~1750 구간을 잘라 열었다. | §2~§4 |

이 문서에 적은 테스트·빌드·브라우저 흐름 통과 여부는 Claude Code가 재현하지 않았다. 이번 검수 범위도 아니다.

## 2. 실제로 열어 본 범위

53장 모두 열었다. 열지 않은 PNG는 없다.

### 원본 3차 `2026-10-18T18-54-38-906Z-f170b270/` 49장

- 데스크톱 35장: 전체를 열었다.
  - 1440 폭에서 높이 2000px 이하인 이미지는 원본 크기로 봤다.
  - `desktop-audit.png`(2177)와 `desktop-payroll-draft.png`(2561)는 축소된 전체 화면으로 열었다.
  - 축소본으로 부족한 곳은 잘라서 확대했다. `desktop-audit.png` 하단 y1880~2177 구간(1.4배), `desktop-employee-appointment.png` 모달 상단 x440~1000·y20~380 구간(1.6배)이다.
- 모바일 14장: 전체를 열었다.
  - 높이 2000px 이하 10장은 원본 크기로 봤다: login, dashboard, employee-detail, organization, leave-approvals, notifications, payslip-detail, evaluation-self, evaluation-result, policy-qa.
  - 긴 이미지는 구간을 나눠 처음부터 끝까지 이어서 봤다.

| 파일 | 높이 | 열어 본 구간(y) |
|---|---|---|
| `mobile-employee-list.png` | 5740 | 0, 1700, 3400, 4400 시작 각 1750 |
| `mobile-payroll-draft.png` | 10248 | 0, 1700, 3400, 5100, 6800, 8500 시작 각 1750 |
| `mobile-attendance-self.png` | 3338 | 0, 1650 시작 각 1700 |
| `mobile-leave-request.png` | 2364 | 0~1200, 1150~2364 |

### AI 재촬영 `2026-10-18T19-39-27-026Z-430432da/` 4장

| 파일 | 크기 | 열어 본 방식 |
|---|---|---|
| `desktop-ai-search-proposal.png` | 1440×3037 | 전체 축소본. 제안 비교표 x300~1380·y960~1680 구간은 원본 크기로 봤다. |
| `desktop-ai-summary.png` | 1440×2397 | 전체 축소본 |
| `mobile-ai-search-proposal.png` | 390×7894 | y 0, 1700, 3400, 5100, 6400 시작 각 1750 |
| `mobile-ai-summary.png` | 390×2823 | 0~1700, 1155~2855 |

### 미확인

- 축소본으로만 본 데스크톱 긴 화면 4장(audit, payroll-draft, ai-search-proposal, ai-summary)은 글자 단위 판독을 하지 않았다. 대상은 위에서 확대한 구간 밖의 작은 글씨다. 축소본에서 레이아웃, 마스크 위치, 고지 문구가 있는지는 확인했다.
- 마스크 아래 원래 값은 볼 수 없으므로 확인하지 않았다. 사원 등록의 초기 비밀번호 칸이 실제로 비어 있었는지가 여기에 해당한다(L-08).
- 원본 3차의 실패 4건(AI 검색 제안·AI 요약의 데스크톱·모바일)은 PNG가 없다. manifest 기록만 읽었다. 대체 이미지는 AI 재촬영 4장이다.

## 3. 항목별 판정

| 항목 | 판정 | 근거(실제 이미지) |
|---|---|---|
| 가독성 | 통과, 지적 있음 | 대부분의 본문은 1440·390 폭에서 원본 크기로 읽힌다. 마스크 겹침과 잘림 지적이 중간 2건, 낮음 10건 있다(§4). |
| 민감정보·계정·토큰·로컬 경로 노출 | 노출 발견 없음 | 아래 항목을 53장에서 찾지 못했다: 실명으로 보이는 이름, 실제 이메일, 전화번호, 비밀번호 값, JWT·Bearer·API 키, `C:\`·`E:\`·`file://`·`localhost` 같은 로컬 경로. 상단 사용자명, 로그인 계정 행·사번, 감사 행위자·처리자, 신청자 칸은 모두 짙은 막대로 가려져 있다. 보이는 값은 합성 표기뿐이다(`portfolio.employee@example.invalid`, `000-0000-0000`, `가상사원NNN (DEMONNN)`, `f170b270` 접미). 내부 일련번호(사원 ID 32, 평가자 ID 1)와 AI `요청 ID`(UUID)는 보이지만 비밀값이 아니다. 요청 ID 표시는 C-03에서 확정한 시안이다. |
| 로그인 비밀번호 빈칸 | 통과 | `desktop-login.png`와 `mobile-login.png` 모두 아이디·비밀번호 입력란이 비어 있다. 사원 등록의 초기 비밀번호 칸은 마스크로 가려져 있어 빈칸인지 이미지로 확인할 수 없다(L-08). |
| AI Mock·실추론 아님 고지 | 통과 | 아래 화면의 실행 안내와 결과 카드 양쪽에 고지가 보인다: `desktop/mobile-policy-qa`, `desktop-policy-no-evidence`, AI 재촬영 4장. 확인한 문구는 "제공자 Mock · 모델 deterministic-v1 · 프롬프트 버전 ems-ai-v1", 배지 "Mock · 실제 추론 아님", "결정적인 시연 결과입니다. 실제 자연어 이해 결과가 아닙니다.", "외부로 전송하지 않습니다."다. 결과 하단 캡션에도 Mock이 표기된다. 규정 Q&A에는 "가상 회사의 합성 데모 규정이며 실제 회사 규정이나 법률 안내가 아닙니다."가 함께 있다. |
| 데모 급여 고지 | 통과 | 급여 관련 9장 모두 상단에 "포트폴리오용 데모 급여 — 실제 세법·4대보험 산정 아님"이 있다: `desktop-payroll-list/-generate/-draft/-confirm`, `desktop-salary-setting`, `desktop-payslip-list/-detail`, `mobile-payroll-draft`, `mobile-payslip-detail`. 명세서에는 "산식 버전 DEMO_V1", 공제 항목에는 "데모 공제 1~3"이 표기된다. 휴가 화면에도 "포트폴리오용으로 단순화한 데모 규칙" 고지가 있다. |

## 4. 지적

높음은 0건이다. 노출이나 고지 누락은 찾지 못했다. 아래는 가독성과 표시 품질에 관한 지적이다. 수정이나 재촬영 여부는 Codex가 판단한다.

| ID | 심각도 | 파일 | 영역(원본 px) | 내용 |
|---|---|---|---|---|
| M-01 | 중간 | `2026-10-18T18-54-38-906Z-f170b270/desktop-employee-appointment.png` | 모달 x440~1000. 띠 y88~110, y161~182, y298~320 | 모달 뒤 상세 화면의 마스크(이름·사번 위치)가 모달 위에 그대로 그려졌다. "현재 소속" 줄과 변경 요약 문장을 가로지르고, 요약 문장은 반쯤 가려져 읽을 수 없다. 모달 하단 버튼도 y≈870에서 잘렸다(fullPage false). 노출은 없다. README와 공개용 대표에서 제외할 것을 권장한다. |
| M-02 | 중간 | `2026-10-18T18-54-38-906Z-f170b270/desktop-audit.png` | x≈720~1370. y≈1470~1500(13번째 행), y≈1910~2177(하단 2행과 페이지 이동) | 행위자 막대보다 큰 직사각형 마스크가 행 상태 배지, "상세 보기", 하단 페이지 이동 버튼을 덮었다. 덮인 칸에 무엇이 있었는지 이미지로는 알 수 없다. 흰 가는 선 조각(y≈2030)만 남고 글자 노출은 없다. 공개용 대표에서 제외할 것을 권장한다. |
| L-01 | 낮음 | 관리자 메뉴가 있는 데스크톱 이미지 전체(예: `desktop-dashboard.png`) | 사이드바 x20~212·y≈820~835 | 사이드바 마지막 메뉴 "직책 관리"가 아래쪽 절반만 보이도록 잘려 있다. `desktop-job-titles.png`에서는 활성 배경만 보인다. |
| L-02 | 낮음 | 데스크톱 다수(예: `desktop-departments.png`, `desktop-positions.png`) | 본문 영역 테두리 x232~1440 | 본문 `main` 둘레에 파란 2px 포커스 윤곽이 남아 있다. 이미지마다 있거나 없다(예: `desktop-xlsx-import-result.png`에는 없다). |
| L-03 | 낮음 | `2026-10-18T18-54-38-906Z-f170b270/mobile-notifications.png` | x16~160·y128~172 | 상단 사용자명 마스크가 알림 모달 제목 "내 알림" 위치를 덮었다. 모달 제목이 보이지 않는다. |
| L-04 | 낮음 | `desktop-payroll-draft.png`, `desktop-payroll-confirm.png` | 표 오른쪽 끝 x≈1350~1440 | "명세" 열이 카드 밖으로 넘쳐 버튼 글자가 "가ㅅ"처럼 잘렸다. 마스크 막대도 카드 테두리 밖까지 나간다. |
| L-05 | 낮음 | `desktop-employee-detail.png`, `desktop-employee-appointment.png` | 발령 이력 표 x1040~1411·y740~850 | 사유 열이 4줄로 줄바꿈된다. 등록자 마스크가 카드 오른쪽 테두리 밖(x≈1411)까지 나간다. |
| L-06 | 낮음 | `desktop-organization.png`, `mobile-organization.png` | 부서·사원 검색 입력란 | 다른 입력란과 달리 높이·안쪽 여백·테두리 모양이 기본 브라우저 모양에 가깝다. |
| L-07 | 낮음 | `desktop-dashboard.png` ↔ `mobile-dashboard.png` | 재직 인원 카드 | 데스크톱은 27명(재직 24), 모바일은 28명(재직 25)이다. 촬영 사이에 xlsx 가져오기로 1명이 추가된 순서 때문이다(manifest capturedAt 18:54:42 → 18:54:47 → 18:55:56). 사원 목록도 27명과 28명으로 다르다. README에서 두 장을 나란히 쓰면 숫자가 달라 보인다. |
| L-08 | 낮음 | `desktop-employee-create.png` | 초기 비밀번호 칸 x848~1383·y736~776 | 칸 전체가 마스크로 덮여 있어 빈칸인지 이미지로 확인할 수 없다. 근거는 manifest 시나리오 문장("비밀번호는 빈칸")뿐이다. 노출 위험은 없다. |
| L-09 | 낮음 | `2026-10-18T19-39-27-026Z-430432da/desktop-ai-search-proposal.png` | 비교표 아래 버튼 행(원본 y≈1490~1520) | "제안 적용 / 결과 닫기" 버튼이 표 마지막 행에 여백 없이 붙어 있다. 모바일에는 간격이 있다. |
| L-10 | 낮음 | `desktop-attendance-admin.png`, `desktop-salary-setting.png`, `desktop-evaluation-draft.png` | 사원 ID·평가자 ID 입력값 | 내부 일련번호 32와 1이 보인다. 합성 DB 순번이라 민감정보로 보지 않지만, 공개 이미지에 남는다는 점을 기록한다. |

## 5. README 대표 이미지

경로는 저장소 루트 기준이다. `docs/screenshots/` 안에서 참조할 때는 앞의 `docs/screenshots/`를 뺀다.

1. `docs/screenshots/2026-10-18T18-54-38-906Z-f170b270/desktop-dashboard.png` (1440×1399)
   - 사이드바 전체 메뉴, 지표 카드 4개, 월별 막대 차트, 부서·직급 분포가 한 장에 들어 있다.
   - 마스크는 상단 사용자명 1곳뿐이라 깨끗하다.
   - 주의: 화면 L-01(사이드바 끝 잘림)이 있고, 숫자는 27명 기준이다(L-07).
2. `docs/screenshots/2026-10-18T18-54-38-906Z-f170b270/desktop-policy-qa.png` (1440×1550)
   - AI 기능의 고지 블록과 결과 카드를 보여 준다. "Mock · 실제 추론 아님", "외부로 전송하지 않습니다", 합성 데모 규정 고지, 인용 근거(문서·버전·절·발췌), 요청 ID가 원본 크기로 모두 읽힌다.
   - Mock 시연임을 이미지 안에서 스스로 밝히므로 README 설명과 어긋날 위험이 가장 적다.
3. `docs/screenshots/2026-10-18T18-54-38-906Z-f170b270/desktop-payslip-detail.png` (1440×900)
   - 한 화면에 데모 급여 고지, 실수령 강조, 지급·공제 표, 스냅샷 안내가 모두 들어간다.
   - 공제 항목 이름도 "데모 공제"로 표기되어 실제 급여로 오해할 여지가 없다.

대체 후보는 `docs/screenshots/2026-10-18T19-39-27-026Z-430432da/desktop-ai-search-proposal.png`다. AI 필터 제안의 "현재 → 적용 후" 5행 비교표가 보인다. 다만 세로 3037px로 길어 README에는 잘라 쓰는 편이 낫다.

README와 공개용 대표에서 제외를 권장하는 이미지: `desktop-employee-appointment.png`(M-01), `desktop-audit.png`(M-02), `mobile-notifications.png`(L-03).

## 6. 결론

- 높음 0, 중간 2(M-01, M-02), 낮음 10(L-01~L-10)이다.
- 53장 모두에서 민감정보·계정·토큰·로컬 경로 노출을 찾지 못했다. 로그인 빈칸, AI Mock 고지, 데모 급여 고지는 이미지에서 확인했다.
- 공개 가능 여부의 최종 판단은 QA와 프론트 통합 검증 담당자이 한다. Claude Code는 위 판정과 대표 이미지 경로를 제안할 뿐이다.
- 이 문서의 변경 범위은 보고와 함께 프론트 통합 검증 담당자에게 반환한다.
