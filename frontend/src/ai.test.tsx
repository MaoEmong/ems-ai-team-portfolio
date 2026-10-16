import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ApiError, request } from './api';
import {
  AI_POLICY_NOTICE, EmployeeSearchAi, EvaluationSummaryAi, PolicyQa,
  isAiConfig, isAiMeta, isEmployeeSearchResult, isEvaluationSummaryResult, isPolicyQaResult,
  type AiConfig, type AiMeta, type EmployeeAiFilters,
} from './ai';
import type { User } from './types';

const session = vi.hoisted(() => ({ user: null as User | null }));
vi.mock('./auth', () => ({ useAuth: () => ({ user: session.user }) }));
vi.mock('./api', async () => ({ ...await vi.importActual<typeof import('./api')>('./api'), request: vi.fn() }));
const admin: User = { id: 1, employeeNo: 'ADMIN001', name: '합성 관리자', role: 'ADMIN' };
const config: AiConfig = { provider: 'mock', model: 'deterministic-v1', mock: true, externalTransfer: false, enabled: { employeeSearch: true, evaluationSummary: true, policyQa: true }, promptVersion: 'ems-ai-v1' };
const meta: AiMeta = { requestId: '94ee406e-e92a-4f9b-bc35-78617af97820', provider: 'mock', model: 'result-model', mock: true, externalTransfer: false, promptVersion: 'result-v1', generatedAt: '2026-10-16T20:00:00+09:00' };
const envelope = (result: unknown, metadata = meta) => ({ meta: metadata, result });
const search = (filters: EmployeeAiFilters = { status: 'ACTIVE' }) => envelope({ status: 'OK', filters, message: '제안을 확인하세요.' });
const answered = (answer = '데모 답변') => envelope({ status: 'ANSWERED', answer, citations: [{ documentId: 'DEMO-ATTENDANCE', version: '1.0', sectionId: 'HALF_DAY', excerpt: '오전 반차일의 출근 기준은 14:00입니다.' }], notice: AI_POLICY_NOTICE });
const posts = () => vi.mocked(request).mock.calls.filter(([, options]) => options?.method === 'POST');
function routes(post: (path: string, options?: RequestInit) => Promise<unknown>, settings: unknown = config) {
  vi.mocked(request).mockImplementation(((path: string, options?: RequestInit) => options?.method === 'POST' ? post(path, options) : Promise.resolve(settings)) as typeof request);
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
function apiError(code: string, status: number, retryable?: boolean) {
  const body = { code, message: '비공개 질문·응답 원문', fieldErrors: [{ field: 'question', reason: '비공개 질문·응답 원문' }], ...(retryable === undefined ? {} : { retryable }) };
  return new ApiError(status, body);
}
async function openSearch(onApply = vi.fn()) {
  render(<EmployeeSearchAi onApply={onApply} departments={[{ id: 3, name: '개발부' }]} positions={[{ id: 2, name: '대리' }]}/>);
  await userEvent.click(screen.getByRole('button', { name: '자연어로 필터 제안 (AI)' }));
  await screen.findByRole('heading', { name: 'AI 실행 안내' });
  return onApply;
}
async function askPolicy() {
  render(<PolicyQa/>);
  await screen.findByRole('heading', { name: 'AI 실행 안내' });
  await userEvent.type(screen.getByLabelText('규정 질문'), '합성 규정 질문');
  await userEvent.click(screen.getByRole('button', { name: 'AI로 답변 찾기' }));
}
beforeEach(() => {
  session.user = admin;
  vi.mocked(request).mockReset();
  routes(async () => search());
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('검색 패널 펼침·입력은 AI POST나 사원 검색을 호출하지 않는다', async () => {
  const onApply = vi.fn(); render(<EmployeeSearchAi onApply={onApply}/>);
  expect(request).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: '자연어로 필터 제안 (AI)' }));
  await screen.findByText(/외부로 전송하지 않습니다/);
  await userEvent.type(screen.getByLabelText('필터 제안 질문'), '재직 사원');
  expect(posts()).toHaveLength(0); expect(onApply).not.toHaveBeenCalled();
  expect(vi.mocked(request).mock.calls.every(([path]) => path === '/ai/config')).toBe(true);
});

it('OK 제안을 5조건 비교표로 확인한 뒤에만 허용 필터 전체를 onApply에 전달한다', async () => {
  const filters: EmployeeAiFilters = { keyword: '합성', departmentId: 3, positionId: 2, status: 'ACTIVE', sort: 'name,asc' };
  routes(async () => search(filters));
  const onApply = await openSearch();
  await userEvent.type(screen.getByLabelText('필터 제안 질문'), '  개발부 재직 사원  ');
  await userEvent.click(screen.getByRole('button', { name: 'AI로 필터 제안' }));
  await screen.findByRole('table', { name: '현재 → 적용 후' });
  expect(screen.getByText('개발부')).toBeTruthy(); expect(screen.getByText('대리')).toBeTruthy();
  expect(screen.getAllByRole('row')).toHaveLength(6); expect(onApply).not.toHaveBeenCalled();
  expect(JSON.parse(String(posts()[0][1]?.body))).toEqual({ question: '개발부 재직 사원' });
  await userEvent.click(screen.getByRole('button', { name: '제안 적용' }));
  expect(onApply).toHaveBeenCalledTimes(1); expect(onApply).toHaveBeenCalledWith(filters);
  expect(vi.mocked(request).mock.calls.some(([path]) => path.startsWith('/employees'))).toBe(false);
});

for (const status of ['AMBIGUOUS', 'UNSUPPORTED'] as const) it(`${status}는 정상 결과이며 적용·자동 재실행이 없다`, async () => {
  routes(async () => envelope({ status, filters: {}, message: '조건을 구체적으로 입력해 주세요.' }));
  const onApply = await openSearch();
  await userEvent.type(screen.getByLabelText('필터 제안 질문'), '모호한 질문');
  await userEvent.click(screen.getByRole('button', { name: 'AI로 필터 제안' }));
  await screen.findByText('조건을 구체적으로 입력해 주세요.');
  expect(screen.queryByRole('button', { name: '제안 적용' })).toBeNull();
  expect(screen.queryByRole('table')).toBeNull(); expect(onApply).not.toHaveBeenCalled(); expect(posts()).toHaveLength(1);
  expect(document.activeElement).toBe(screen.getByLabelText('필터 제안 질문'));
});

it('화면 카탈로그에 없는 ID는 이름을 추측하거나 적용하지 않는다', async () => {
  routes(async () => search({ departmentId: 999 }));
  const onApply = await openSearch();
  await userEvent.type(screen.getByLabelText('필터 제안 질문'), '사원 질문');
  await userEvent.click(screen.getByRole('button', { name: 'AI로 필터 제안' }));
  const apply = await screen.findByRole('button', { name: '제안 적용' });
  expect((apply as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText(/목록을 새로 고친 뒤/)).toBeTruthy(); expect(onApply).not.toHaveBeenCalled();
});

it('질문 수정 뒤 이전 제안 적용을 차단한다', async () => {
  await openSearch(); await userEvent.type(screen.getByLabelText('필터 제안 질문'), '재직 사원');
  await userEvent.click(screen.getByRole('button', { name: 'AI로 필터 제안' }));
  await screen.findByRole('button', { name: '제안 적용' });
  await userEvent.type(screen.getByLabelText('필터 제안 질문'), ' 수정');
  expect((screen.getByRole('button', { name: '제안 적용' }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText(/이 결과는 이전 입력 기준/)).toBeTruthy();
});

it('카탈로그 로딩·실패로 현재 ID 이름을 모르면 적용을 차단하고 이름 확인 후 허용한다', async () => {
  const props = { onApply: vi.fn(), currentFilters: { departmentId: '3' } };
  const view = render(<EmployeeSearchAi {...props}/>);
  await userEvent.click(screen.getByRole('button', { name: '자연어로 필터 제안 (AI)' })); await screen.findByRole('heading', { name: 'AI 실행 안내' });
  await userEvent.type(screen.getByLabelText('필터 제안 질문'), '재직 사원'); await userEvent.click(screen.getByRole('button', { name: 'AI로 필터 제안' }));
  const apply = await screen.findByRole('button', { name: '제안 적용' }); expect((apply as HTMLButtonElement).disabled).toBe(true);
  view.rerender(<EmployeeSearchAi {...props} departments={[{ id: 3, name: '개발부' }]}/>);
  expect((screen.getByRole('button', { name: '제안 적용' }) as HTMLButtonElement).disabled).toBe(false);
  expect(props.onApply).not.toHaveBeenCalled(); expect(posts()).toHaveLength(1);
});

it('수동 필터 변경도 이전 제안 적용을 차단하고 생략 조건은 기본값으로 비교한다', async () => {
  const props = { onApply: vi.fn(), currentFilters: { departmentId: '3', status: 'ON_LEAVE' as const }, departments: [{ id: 3, name: '개발부' }] };
  const view = render(<EmployeeSearchAi {...props}/>);
  await userEvent.click(screen.getByRole('button', { name: '자연어로 필터 제안 (AI)' }));
  await screen.findByRole('heading', { name: 'AI 실행 안내' });
  await userEvent.type(screen.getByLabelText('필터 제안 질문'), '재직 사원');
  await userEvent.click(screen.getByRole('button', { name: 'AI로 필터 제안' }));
  await screen.findByRole('button', { name: '제안 적용' });
  const departmentRow = screen.getByRole('row', { name: /부서/ });
  expect(within(departmentRow).getByText('개발부')).toBeTruthy(); expect(within(departmentRow).getByText('전체')).toBeTruthy();
  view.rerender(<EmployeeSearchAi {...props} currentFilters={{ departmentId: '3', status: 'RETIRED' }}/>);
  expect((screen.getByRole('button', { name: '제안 적용' }) as HTMLButtonElement).disabled).toBe(true);
});

for (const result of [
  { status: 'OK', filters: { page: 2 }, message: '잘못된 출력' },
  { status: 'OK', filters: { jobTitleId: 1 }, message: '잘못된 출력' },
  { status: 'OK', filters: { departmentId: null }, message: '잘못된 출력' },
  { status: 'AMBIGUOUS', filters: { status: 'ACTIVE' }, message: '부분 적용 금지' },
]) it(`허용 범위 밖 AI 필터 결과를 전부 거절한다: ${JSON.stringify(result.filters)}`, async () => {
  routes(async () => envelope(result)); const onApply = await openSearch();
  await userEvent.type(screen.getByLabelText('필터 제안 질문'), '질문');
  await userEvent.click(screen.getByRole('button', { name: 'AI로 필터 제안' }));
  await screen.findByText('AI 응답 형식이 올바르지 않아 결과를 표시하지 않았습니다.');
  expect(screen.queryByRole('heading', { name: 'AI 생성 결과' })).toBeNull();
  expect(onApply).not.toHaveBeenCalled();
});

it('잘못된 meta는 결과 본문을 노출하지 않는다', async () => {
  routes(async () => ({ meta: { ...meta, requestId: '<script>bad</script>' }, result: { summary: '표시되면 안 되는 원문' } }));
  render(<EvaluationSummaryAi evaluationId={12}/>);
  await userEvent.click(screen.getByRole('button', { name: 'AI 코멘트 요약 (참고용 · 읽기 전용)' }));
  await screen.findByRole('heading', { name: 'AI 실행 안내' });
  await userEvent.click(screen.getByRole('button', { name: 'AI로 요약 만들기' }));
  await screen.findByText('AI 응답 형식이 올바르지 않아 결과를 표시하지 않았습니다.');
  expect(screen.queryByText('표시되면 안 되는 원문')).toBeNull();
});

it('설정 조회 실패 시 실행을 차단하며 사용자가 다시 불러올 수 있다', async () => {
  vi.mocked(request).mockRejectedValue(new Error('비공개 오류 원문'));
  render(<PolicyQa/>); await screen.findByRole('button', { name: '다시 불러오기' });
  await userEvent.type(screen.getByLabelText('규정 질문'), '질문');
  expect((screen.getByRole('button', { name: 'AI로 답변 찾기' }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.queryByText('비공개 오류 원문')).toBeNull();
  routes(async () => answered()); await userEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));
  await screen.findByRole('heading', { name: 'AI 실행 안내' }); expect(posts()).toHaveLength(0);
});

it('꺼진 기능은 질문 입력·실행 버튼을 표시하지 않는다', async () => {
  routes(async () => answered(), { ...config, enabled: { ...config.enabled, policyQa: false } });
  render(<PolicyQa/>); await screen.findByText('이 기능은 현재 꺼져 있습니다.');
  expect(screen.queryByRole('textbox')).toBeNull(); expect(screen.queryByRole('button', { name: 'AI로 답변 찾기' })).toBeNull(); expect(posts()).toHaveLength(0);
});

it('Ollama는 EMS 서버 밖 전송으로 고지하고 결과는 config가 아닌 meta를 표시한다', async () => {
  const settings = { ...config, provider: 'ollama', model: 'local-model', mock: false, externalTransfer: true };
  routes(async () => answered(), settings); await askPolicy();
  await screen.findByText('데모 답변');
  expect(screen.getByText(/EMS 서버 밖/)).toBeTruthy(); expect(screen.getByText(/전송: 입력한 질문, 합성 규정/)).toBeTruthy();
  expect(screen.getByText(/result-model/)).toBeTruthy(); expect(screen.getByText(meta.requestId)).toBeTruthy();
  expect(screen.getByLabelText('Mock 결과, 실제 추론 아님')).toBeTruthy(); expect(screen.queryByText(/클라우드/)).toBeNull();
});

it('진행 중 중복 실행을 막고 취소·새 실행 뒤 예전 응답이 새 결과를 덮지 못한다', async () => {
  const pending = deferred<unknown>(); let calls = 0;
  routes(async () => ++calls === 1 ? pending.promise : answered('새 결과'));
  await askPolicy(); expect(posts()).toHaveLength(1);
  const signal = posts()[0][1]?.signal;
  expect((screen.getByRole('button', { name: 'AI 요청 처리 중…' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.keyDown(screen.getByLabelText('규정 질문'), { key: 'Enter', ctrlKey: true }); expect(posts()).toHaveLength(1);
  await userEvent.click(screen.getByRole('button', { name: '요청 취소' })); expect(signal?.aborted).toBe(true);
  await screen.findByText('요청을 취소했습니다. 결과는 표시하지 않습니다.');
  await userEvent.click(screen.getByRole('button', { name: 'AI로 답변 찾기' })); await screen.findByText('새 결과');
  await act(async () => { pending.resolve(answered('취소한 이전 원문')); await pending.promise; });
  expect(screen.queryByText('취소한 이전 원문')).toBeNull(); expect(screen.getByText('새 결과')).toBeTruthy(); expect(posts()).toHaveLength(2);
});

for (const change of ['logout', 'account', 'same-account-login'] as const) it(`${change}에서 입력·결과를 지우고 늦은 응답을 폐기한다`, async () => {
  const pending = deferred<unknown>(); routes(async () => pending.promise);
  const view = render(<PolicyQa/>); await screen.findByRole('heading', { name: 'AI 실행 안내' });
  await userEvent.type(screen.getByLabelText('규정 질문'), '비공개 질문');
  await userEvent.click(screen.getByRole('button', { name: 'AI로 답변 찾기' })); const signal = posts()[0][1]?.signal;
  session.user = change === 'logout' ? null : change === 'account' ? { ...admin, id: 2 } : { ...admin };
  view.rerender(<PolicyQa/>); expect(signal?.aborted).toBe(true);
  await act(async () => { pending.resolve(answered('이전 계정 응답')); await pending.promise; });
  expect(screen.queryByDisplayValue('비공개 질문')).toBeNull(); expect(screen.queryByText('이전 계정 응답')).toBeNull();
});

it('화면을 떠나면 설정 조회와 진행 중 요청 모두 중단한다', async () => {
  const pending = deferred<unknown>(); routes(async () => pending.promise);
  const view = render(<PolicyQa/>); await screen.findByRole('heading', { name: 'AI 실행 안내' });
  await userEvent.type(screen.getByLabelText('규정 질문'), '질문'); await userEvent.click(screen.getByRole('button', { name: 'AI로 답변 찾기' }));
  const signals = vi.mocked(request).mock.calls.map(([, init]) => init?.signal);
  view.unmount(); expect(signals.every(signal => signal?.aborted)).toBe(true);
  await act(async () => { pending.resolve(answered()); await pending.promise; });
});

it('평가 요약은 ID만 보내고 읽기 전용 텍스트로 표시한다', async () => {
  routes(async () => envelope({ summary: '합성 코멘트 요약' }));
  render(<EvaluationSummaryAi evaluationId={12}/>);
  expect(request).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'AI 코멘트 요약 (참고용 · 읽기 전용)' }));
  await screen.findByRole('heading', { name: 'AI 실행 안내' }); expect(posts()).toHaveLength(0);
  await userEvent.click(screen.getByRole('button', { name: 'AI로 요약 만들기' }));
  await screen.findByText('합성 코멘트 요약'); expect(JSON.parse(String(posts()[0][1]?.body))).toEqual({ evaluationId: 12 });
  expect(screen.queryByRole('button', { name: /저장|제출|적용|복사/ })).toBeNull();
});

it('평가서 대상 변경은 이전 요약 요청을 취소하고 새 ID의 접힌 패널로 돌아간다', async () => {
  const pending = deferred<unknown>(); routes(async () => pending.promise);
  const view = render(<EvaluationSummaryAi evaluationId={12}/>);
  await userEvent.click(screen.getByRole('button', { name: 'AI 코멘트 요약 (참고용 · 읽기 전용)' })); await screen.findByRole('heading', { name: 'AI 실행 안내' });
  await userEvent.click(screen.getByRole('button', { name: 'AI로 요약 만들기' })); const signal = posts()[0][1]?.signal;
  view.rerender(<EvaluationSummaryAi evaluationId={13}/>); expect(signal?.aborted).toBe(true);
  await act(async () => { pending.resolve(envelope({ summary: '이전 평가 요약' })); await pending.promise; });
  expect(screen.queryByText('이전 평가 요약')).toBeNull(); expect(screen.queryByRole('button', { name: 'AI로 요약 만들기' })).toBeNull();
});

for (const [code, status, retryable] of [['AI_BUSY', 429, true], ['AI_TIMEOUT', 504, true], ['AI_PROVIDER_REJECTED', 502, false], ['INTERNAL_ERROR', 500, undefined]] as const) it(`${code} 오류 안내는 retryable 지름길만 제공하고 원문을 노출하지 않는다`, async () => {
  routes(async () => { throw apiError(code, status, retryable); }); await askPolicy();
  await screen.findByText('AI 요청을 완료하지 못했습니다.');
  expect(!!screen.queryByRole('button', { name: '다시 실행' })).toBe(retryable === true);
  expect(screen.queryByText('비공개 질문·응답 원문')).toBeNull(); expect(posts()).toHaveLength(1);
  expect((screen.getByRole('button', { name: 'AI로 답변 찾기' }) as HTMLButtonElement).disabled).toBe(false);
});

it('AI_DISABLED 오류는 config만 재조회하며 자동으로 AI를 다시 호출하지 않는다', async () => {
  let configReads = 0;
  vi.mocked(request).mockImplementation(((path: string, options?: RequestInit) => {
    if (options?.method === 'POST') return Promise.reject(apiError('AI_DISABLED', 503, false));
    configReads++; return Promise.resolve(configReads === 1 ? config : { ...config, enabled: { ...config.enabled, policyQa: false } });
  }) as typeof request);
  await askPolicy(); await screen.findByText('이 기능은 현재 꺼져 있습니다.'); expect(configReads).toBe(2); expect(posts()).toHaveLength(1);
});

it('답변과 인용의 HTML·URL은 텍스트로만 표시하고 원문을 저장하거나 로그에 넣지 않는다', async () => {
  const storage = vi.spyOn(Storage.prototype, 'setItem'); const log = vi.spyOn(console, 'log');
  routes(async () => answered('<img src=x onerror=alert(1)> https://example.test **합성**'));
  const view = render(<PolicyQa/>); await screen.findByRole('heading', { name: 'AI 실행 안내' });
  await userEvent.type(screen.getByLabelText('규정 질문'), '합성 질문'); await userEvent.click(screen.getByRole('button', { name: 'AI로 답변 찾기' }));
  await screen.findByText('<img src=x onerror=alert(1)> https://example.test **합성**');
  expect(view.container.querySelector('img')).toBeNull(); expect(view.container.querySelector('a')).toBeNull();
  expect(view.container.querySelector('blockquote')?.textContent).toContain('오전 반차일'); expect(screen.getByRole('list')).toBeTruthy();
  expect(storage).not.toHaveBeenCalled(); expect(log).not.toHaveBeenCalled();
  expect(screen.getAllByRole('status').every(node => !node.textContent?.includes('합성 질문') && !node.textContent?.includes('<img'))).toBe(true);
});

it('INSUFFICIENT_EVIDENCE는 답변·인용 영역을 만들지 않는다', async () => {
  routes(async () => envelope({ status: 'INSUFFICIENT_EVIDENCE', answer: null, citations: [], notice: AI_POLICY_NOTICE })); await askPolicy();
  await screen.findByRole('heading', { name: '답변할 수 없음' });
  expect(screen.queryByRole('heading', { name: '답변' })).toBeNull(); expect(screen.queryByRole('list')).toBeNull();
  expect(screen.queryByText(/근거 \(0\)/)).toBeNull(); expect(posts()).toHaveLength(1);
});

it('예시 질문 선택은 입력만 채우며 빈 질문과 500자 초과 실행은 차단한다', async () => {
  render(<PolicyQa/>); await screen.findByRole('heading', { name: 'AI 실행 안내' });
  expect((screen.getByRole('button', { name: 'AI로 답변 찾기' }) as HTMLButtonElement).disabled).toBe(true);
  await userEvent.click(screen.getByRole('button', { name: '오전 반차일의 출근 기준은 언제인가요?' })); expect(posts()).toHaveLength(0);
  const input = screen.getByLabelText('규정 질문'); fireEvent.change(input, { target: { value: '가'.repeat(501) } });
  fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true }); expect(posts()).toHaveLength(0);
});

it('비ADMIN은 검색 패널이 없고 로그아웃 상태에서는 모든 기능을 호출하지 않는다', () => {
  session.user = { ...admin, role: 'EMPLOYEE' }; const view = render(<EmployeeSearchAi onApply={vi.fn()}/>);
  expect(view.container.textContent).toBe(''); expect(request).not.toHaveBeenCalled();
  session.user = null; view.rerender(<><EmployeeSearchAi onApply={vi.fn()}/><EvaluationSummaryAi evaluationId={12}/><PolicyQa/></>);
  expect(view.container.textContent).toBe(''); expect(request).not.toHaveBeenCalled();
});

it('응답 검증은 구조·UTF16 상한·상태별 근거 조건·제공자 전송 표기를 확인한다', () => {
  expect(isAiConfig(config)).toBe(true); expect(isAiConfig({ ...config, externalTransfer: true })).toBe(false);
  expect(isAiMeta(meta)).toBe(true); expect(isAiMeta({ ...meta, requestId: 'bad' })).toBe(false);
  expect(isEmployeeSearchResult({ status: 'OK', filters: {}, message: '빈 제안 금지' })).toBe(false);
  expect(isEvaluationSummaryResult({ summary: '😀'.repeat(1000) })).toBe(true); expect(isEvaluationSummaryResult({ summary: '😀'.repeat(1001) })).toBe(false);
  expect(isEvaluationSummaryResult({ summary: '요약', grade: 'S' })).toBe(false);
  expect(isPolicyQaResult({ status: 'ANSWERED', answer: '무근거', citations: [], notice: AI_POLICY_NOTICE })).toBe(false);
  expect(isPolicyQaResult({ status: 'INSUFFICIENT_EVIDENCE', answer: '노출 금지', citations: [], notice: AI_POLICY_NOTICE })).toBe(false);
});
