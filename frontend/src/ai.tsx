import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ApiError, request } from './api';
import { useAuth } from './auth';
import { Field } from './ui';
import { formatSeoul } from './phase2-utils';

export type AiFeature = 'employeeSearch' | 'evaluationSummary' | 'policyQa';
export type AiProvider = 'mock' | 'anthropic' | 'ollama';
export interface AiConfig {
  provider: AiProvider;
  model: string;
  mock: boolean;
  externalTransfer: boolean;
  enabled: Record<AiFeature, boolean>;
  promptVersion: string;
}
export interface AiMeta extends Omit<AiConfig, 'enabled'> {
  requestId: string;
  generatedAt: string;
}
export interface AiResponse<T> { meta: AiMeta; result: T }
export interface EmployeeAiFilters {
  keyword?: string;
  departmentId?: number;
  positionId?: number;
  status?: 'ACTIVE' | 'ON_LEAVE' | 'RETIRED';
  sort?: 'employeeNo,asc' | 'employeeNo,desc' | 'name,asc' | 'name,desc' | 'hireDate,asc' | 'hireDate,desc';
}
export type EmployeeAiCurrentFilters = Omit<EmployeeAiFilters, 'departmentId' | 'positionId' | 'status' | 'sort'> & {
  departmentId?: number | string;
  positionId?: number | string;
  status?: string;
  sort?: string;
};
export interface AiCatalogItem { id: number; name: string }
export interface EmployeeSearchAiProps {
  onApply: (filters: EmployeeAiFilters) => void;
  currentFilters?: EmployeeAiCurrentFilters;
  departments?: readonly AiCatalogItem[];
  positions?: readonly AiCatalogItem[];
}
export interface EmployeeSearchResult {
  status: 'OK' | 'AMBIGUOUS' | 'UNSUPPORTED';
  filters: EmployeeAiFilters;
  message: string;
}
export interface EvaluationSummaryResult { summary: string }
export interface PolicyCitation { documentId: string; version: string; sectionId: string; excerpt: string }
export type PolicyQaResult = {
  status: 'ANSWERED'; answer: string; citations: PolicyCitation[]; notice: string;
} | {
  status: 'INSUFFICIENT_EVIDENCE'; answer: null; citations: []; notice: string;
};
export const AI_POLICY_NOTICE = '가상 회사의 합성 데모 규정이며 실제 회사 규정이나 법률 안내가 아닙니다.';

type JsonObject = Record<string, unknown>;
const filterKeys = ['keyword', 'departmentId', 'positionId', 'status', 'sort'] as const;
const featureKeys: AiFeature[] = ['employeeSearch', 'evaluationSummary', 'policyQa'];
const statuses = ['ACTIVE', 'ON_LEAVE', 'RETIRED'];
const sorts = ['employeeNo,asc', 'employeeNo,desc', 'name,asc', 'name,desc', 'hireDate,asc', 'hireDate,desc'];
const object = (value: unknown): value is JsonObject => !!value && typeof value === 'object' && !Array.isArray(value);
const exact = (value: JsonObject, keys: readonly string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const text = (value: unknown, max = Infinity): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const positiveId = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
function validProvider(value: JsonObject) {
  return typeof value.provider === 'string' && ['mock', 'anthropic', 'ollama'].includes(value.provider) && typeof value.model === 'string' &&
    typeof value.mock === 'boolean' && typeof value.externalTransfer === 'boolean' && text(value.promptVersion) &&
    value.mock === (value.provider === 'mock') && value.externalTransfer === (value.provider !== 'mock');
}
// Reject the entire result on a schema mismatch; never silently strip unknown output.
export function isAiConfig(value: unknown): value is AiConfig {
  return object(value) && exact(value, ['provider', 'model', 'mock', 'externalTransfer', 'enabled', 'promptVersion']) &&
    validProvider(value) && object(value.enabled) && exact(value.enabled, featureKeys) &&
    featureKeys.every(key => typeof (value.enabled as JsonObject)[key] === 'boolean');
}
export function isAiMeta(value: unknown): value is AiMeta {
  return object(value) && exact(value, ['requestId', 'provider', 'model', 'mock', 'externalTransfer', 'promptVersion', 'generatedAt']) &&
    validProvider(value) && typeof value.requestId === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value.requestId) &&
    typeof value.generatedAt === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?\+09:00$/.test(value.generatedAt) && Number.isFinite(Date.parse(value.generatedAt));
}
function isFilters(value: unknown): value is EmployeeAiFilters {
  if (!object(value) || Object.keys(value).some(key => !filterKeys.includes(key as typeof filterKeys[number]))) return false;
  return Object.entries(value).every(([key, item]) => {
    if (key === 'keyword') return text(item, 100);
    if (key === 'departmentId' || key === 'positionId') return positiveId(item);
    if (key === 'status') return typeof item === 'string' && statuses.includes(item);
    return typeof item === 'string' && sorts.includes(item);
  });
}
export function isEmployeeSearchResult(value: unknown): value is EmployeeSearchResult {
  if (!object(value) || !exact(value, ['status', 'filters', 'message']) || !text(value.message, 300) || !isFilters(value.filters)) return false;
  return value.status === 'OK' ? Object.keys(value.filters).length > 0 :
    (value.status === 'AMBIGUOUS' || value.status === 'UNSUPPORTED') && Object.keys(value.filters).length === 0;
}
export function isEvaluationSummaryResult(value: unknown): value is EvaluationSummaryResult {
  return object(value) && exact(value, ['summary']) && text(value.summary, 2000);
}
export function isPolicyQaResult(value: unknown): value is PolicyQaResult {
  if (!object(value) || !exact(value, ['status', 'answer', 'citations', 'notice']) || value.notice !== AI_POLICY_NOTICE || !Array.isArray(value.citations)) return false;
  if (value.status === 'INSUFFICIENT_EVIDENCE') return value.answer === null && value.citations.length === 0;
  return value.status === 'ANSWERED' && text(value.answer, 2000) && value.citations.length >= 1 && value.citations.length <= 3 &&
    value.citations.every(c => object(c) && exact(c, ['documentId', 'version', 'sectionId', 'excerpt']) &&
      text(c.documentId) && text(c.version) && text(c.sectionId) && text(c.excerpt, 300));
}
function isResponse<T>(value: unknown, guard: (value: unknown) => value is T): value is AiResponse<T> {
  return object(value) && exact(value, ['meta', 'result']) && isAiMeta(value.meta) && guard(value.result);
}

interface AiFailure { code: string; message: string; retryable: boolean }
const failureMessages: Record<string, string> = {
  VALIDATION_ERROR: '입력을 확인해 주세요.',
  AI_INPUT_TOO_LARGE: '입력 또는 평가 자료가 허용 분량을 넘었습니다. 일부만 잘라 처리하지 않습니다.',
  AI_NO_COMMENTS: '요약할 코멘트가 없습니다.',
  UNAUTHORIZED: '로그인이 필요합니다.',
  FORBIDDEN: '권한이 없습니다.',
  NOT_FOUND: '평가서를 찾을 수 없습니다. 조회 권한과 최신 상태를 확인해 주세요.',
  AI_EVALUATION_NOT_FINALIZED: '최종 확정된 평가서만 요약할 수 있습니다. 평가서를 다시 조회해 주세요.',
  AI_BUSY: '다른 AI 요청을 처리하고 있습니다. 끝난 뒤 다시 실행해 주세요.',
  AI_RATE_LIMITED: 'AI 기능은 1분에 10회까지 실행할 수 있습니다. 잠시 후 다시 실행해 주세요.',
  AI_NOT_CONFIGURED: 'AI 제공자 설정이 완료되지 않아 실행할 수 없습니다.',
  AI_DISABLED: '이 기능은 현재 꺼져 있습니다.',
  AI_TIMEOUT: 'AI 응답 시간이 초과되었습니다. 제공자 쪽 처리는 계속되었을 수 있습니다.',
  AI_PROVIDER_ERROR: 'AI 제공자와 통신하지 못했습니다.',
  AI_PROVIDER_REJECTED: 'AI 제공자가 요청을 거절했습니다. 관리자에게 제공자 설정 확인을 요청해 주세요.',
  AI_INVALID_OUTPUT: 'AI 응답 형식이 올바르지 않아 결과를 표시하지 않았습니다.',
};
const invalidOutput = (): AiFailure => ({ code: 'AI_INVALID_OUTPUT', message: failureMessages.AI_INVALID_OUTPUT, retryable: true });
function failure(error: unknown): AiFailure {
  if (error instanceof ApiError) {
    const body: unknown = error.body;
    const code = object(body) && typeof body.code === 'string' ? body.code : 'UNKNOWN';
    // Never display a raw error message/fieldErrors: they can contain echoed input.
    const fallback = error.status === 400 ? '입력을 확인해 주세요.' : error.status === 403 ? '권한이 없습니다.' :
      error.status === 404 ? '대상을 찾을 수 없습니다.' : error.status === 429 ? '요청이 많습니다. 잠시 후 다시 시도해 주세요.' :
        '요청을 처리하지 못했습니다. 원래 실행 버튼으로 직접 다시 실행할 수 있습니다.';
    return { code, message: Object.hasOwn(failureMessages, code) ? failureMessages[code] : fallback, retryable: object(body) && body.retryable === true };
  }
  return { code: 'NETWORK_ERROR', message: '서버에 연결하지 못했습니다.', retryable: true };
}
const paths: Record<AiFeature, string> = {
  employeeSearch: '/ai/employee-search', evaluationSummary: '/ai/evaluation-summary', policyQa: '/ai/policy-qa',
};

function useAiInvocation<T>(feature: AiFeature, guard: (value: unknown) => value is T) {
  const [config, setConfig] = useState<AiConfig>();
  const [configError, setConfigError] = useState<AiFailure>();
  const [configLoading, setConfigLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [output, setOutput] = useState<{ response: AiResponse<T>; signature: string }>();
  const [error, setError] = useState<AiFailure>();
  const [busy, setBusy] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const post = useRef<AbortController | undefined>(undefined);
  const serial = useRef(0);
  const mounted = useRef(false);
  const configGeneration = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; serial.current++; post.current?.abort(); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const generation = ++configGeneration.current;
    setConfig(undefined); setConfigError(undefined); setConfigLoading(true);
    request<unknown>('/ai/config', { signal: controller.signal }).then(value => {
      if (controller.signal.aborted || generation !== configGeneration.current) return;
      if (!isAiConfig(value)) { setConfigError(invalidOutput()); return; }
      setConfig(value);
    }).catch(error => {
      if (!controller.signal.aborted && generation === configGeneration.current) setConfigError(failure(error));
    }).finally(() => {
      if (!controller.signal.aborted && generation === configGeneration.current) setConfigLoading(false);
    });
    return () => { configGeneration.current++; controller.abort(); };
  }, [revision]);

  const execute = async (body: unknown, signature: string) => {
    if (post.current || !config?.enabled[feature] || configLoading) return;
    const controller = new AbortController();
    const generation = ++serial.current;
    post.current = controller;
    setBusy(true); setOutput(undefined); setError(undefined); setAnnouncement('AI 요청을 처리하고 있습니다.');
    try {
      const response = await request<unknown>(paths[feature], { method: 'POST', body: JSON.stringify(body), signal: controller.signal });
      if (!mounted.current || controller.signal.aborted || generation !== serial.current) return;
      if (!isResponse(response, guard)) { setError(invalidOutput()); setAnnouncement('응답 형식 오류입니다.'); return; }
      setOutput({ response, signature }); setAnnouncement('결과가 도착했습니다.');
    } catch (error) {
      if (!mounted.current || controller.signal.aborted || generation !== serial.current) return;
      const result = failure(error); setError(result); setAnnouncement('AI 요청을 완료하지 못했습니다.');
      if (result.code === 'AI_DISABLED') setRevision(value => value + 1);
    } finally {
      if (mounted.current && generation === serial.current) { post.current = undefined; setBusy(false); }
    }
  };
  const cancel = () => {
    serial.current++; post.current?.abort(); post.current = undefined;
    setBusy(false); setOutput(undefined); setError(undefined); setAnnouncement('요청을 취소했습니다. 결과는 표시하지 않습니다.');
  };
  return {
    config, configError, configLoading, output, error, busy, announcement, execute, cancel,
    reloadConfig: () => setRevision(value => value + 1),
    clearOutput: () => { setOutput(undefined); setAnnouncement(''); },
  };
}

// Each new useAuth user object is a new scope, even if the same account signs in again.
// A key change removes input, config and results synchronously, then aborts pending work.
function useAiScope() {
  const { user } = useAuth();
  const previous = useRef(user);
  const revision = useRef(0);
  if (previous.current !== user) { previous.current = user; revision.current++; }
  return { user, key: `${user?.id ?? 'anonymous'}:${revision.current}` };
}
function MockBadge({ mock }: { mock: boolean }) {
  return mock ? <span className="badge warning" aria-label="Mock 결과, 실제 추론 아님">Mock · 실제 추론 아님</span> : null;
}
function Disclosure({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false); const id = useId();
  return <section className="ai-disclosure"><button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>{title}</button>{open && <div id={id}>{children}</div>}</section>;
}
const transferFields: Record<AiFeature, [string, string]> = {
  employeeSearch: ['입력한 질문, 지원 필터 형식, 부서·직급 ID와 이름 목록', '사원 목록, 이름·사번·연락처·급여·평가 정보, 직책 목록'],
  evaluationSummary: ['평가 항목 이름, 항목별 자기평가·관리자 코멘트', '평가·사원·평가자 ID, 이름, 사번, 연락처, 급여, 점수, 등급'],
  policyQa: ['입력한 질문, 합성 규정 문서(ID·버전·절·본문)', '실제 직원 정보, 실제 회사 규정, HR 업무 원문'],
};
const providerLabel = (provider: AiProvider) => ({ mock: 'Mock', anthropic: 'Anthropic', ollama: 'Ollama' })[provider];
function ConfigNotice({ config, feature }: { config: AiConfig; feature: AiFeature }) {
  return <aside className="notice info ai-notice"><h3>AI 실행 안내</h3>
    <p>제공자 {providerLabel(config.provider)} · 모델 {config.model || '—'} · 프롬프트 버전 {config.promptVersion} <MockBadge mock={config.mock}/></p>
    {config.mock && <p>결정적인 시연 결과입니다. 실제 자연어 이해 결과가 아닙니다.</p>}
    {config.externalTransfer ? <><p>실행하면 아래 자료가 EMS 서버 밖의 AI 제공자로 전송됩니다.</p><p>전송: {transferFields[feature][0]}</p><p>제외: {transferFields[feature][1]}</p></> : <p>외부로 전송하지 않습니다.</p>}
    <p>입력한 글에 개인정보를 넣지 마세요. 자유 텍스트 속 개인정보는 자동으로 지워지지 않습니다.</p>
    <p className="muted">실행 기록(기능·제공자·모델·소요 시간)은 감사 로그에 남고, 질문·결과 원문은 저장되지 않습니다.</p>
  </aside>;
}
function ConfigState({ loading, error, reload }: { loading: boolean; error?: AiFailure; reload: () => void }) {
  return loading ? <p role="status">설정 확인 중…</p> : error ? <div className="error"><p>AI 설정을 불러오지 못했습니다. 실행할 수 없습니다.</p><p>{error.message}</p><button type="button" onClick={reload}>다시 불러오기</button></div> : null;
}
function FailureNotice({ error, retry }: { error?: AiFailure; retry: () => void }) {
  return error ? <div className="notice ai-error"><p>{error.message}</p>{error.retryable ? <><p>자동 재시도하지 않습니다. 다시 실행하려면 직접 눌러 주세요.</p><button type="button" onClick={retry}>다시 실행</button></> : <p>입력·권한·설정을 확인해 주세요. 자동 재시도하지 않습니다.</p>}</div> : null;
}
function ResultCard({ meta, children, focusTitle = true }: { meta: AiMeta; children: ReactNode; focusTitle?: boolean }) {
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (focusTitle) title.current?.focus(); }, [meta, focusTitle]);
  return <section className="panel ai-result" style={{ borderLeft: '4px solid #1f5bc4', overflowWrap: 'anywhere' }}>
    <h3 ref={title} tabIndex={-1}>AI 생성 결과</h3><MockBadge mock={meta.mock}/>{children}
    <footer className="muted ai-meta"><p>{providerLabel(meta.provider)} · {meta.model || '—'} · {meta.promptVersion} · <time dateTime={meta.generatedAt}>{formatSeoul(meta.generatedAt)} (KST)</time> 생성</p><p>요청 ID <span style={{ fontFamily: 'monospace' }}>{meta.requestId}</span></p><p>AI가 생성한 보조 결과이며 틀릴 수 있습니다. 원문을 확인해 주세요.</p></footer>
  </section>;
}
function RequestActions({ busy, disabled, label, execute, cancel }: { busy: boolean; disabled: boolean; label: string; execute: () => void; cancel: () => void }) {
  const cancelButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (busy) cancelButton.current?.focus(); }, [busy]);
  return <><div className="actions workflow-actions"><button className="primary" type="button" disabled={disabled || busy} onClick={execute}>{busy ? 'AI 요청 처리 중…' : label}</button>{busy && <button ref={cancelButton} type="button" onClick={cancel}>요청 취소</button>}</div>{busy && <p className="muted">요청을 중단해도 제공자 쪽 처리와 비용이 취소된다는 보장은 없습니다.</p>}</>;
}
function questionError(value: string) {
  return !value.trim() || value.trim().length > 500 ? '질문을 앞뒤 공백을 뺀 1~500자로 입력하세요.' : undefined;
}
function currentSignature(filters: EmployeeAiCurrentFilters = {}) {
  return JSON.stringify(filterKeys.map(key => {
    const value = filters[key];
    if (key === 'sort') return value || 'employeeNo,asc';
    return value == null || value === '' ? null : String(value);
  }));
}
const statusLabel: Record<string, string> = { ACTIVE: '재직', ON_LEAVE: '휴직', RETIRED: '퇴사' };
const sortLabel: Record<string, string> = {
  'employeeNo,asc': '사번 오름차순', 'employeeNo,desc': '사번 내림차순', 'name,asc': '이름 오름차순', 'name,desc': '이름 내림차순', 'hireDate,asc': '입사일 오름차순', 'hireDate,desc': '입사일 내림차순',
};

export function EmployeeSearchAi(props: EmployeeSearchAiProps) {
  const scope = useAiScope();
  if (!scope.user || scope.user.role !== 'ADMIN') return null;
  return <Disclosure key={scope.key} title="자연어로 필터 제안 (AI)"><EmployeeSearchPanel {...props}/></Disclosure>;
}
function EmployeeSearchPanel({ onApply, currentFilters = {}, departments = [], positions = [] }: EmployeeSearchAiProps) {
  const ai = useAiInvocation('employeeSearch', isEmployeeSearchResult);
  const [question, setQuestion] = useState(''); const [applied, setApplied] = useState<string>();
  const appliedRequest = useRef<string | undefined>(undefined);
  const input = useRef<HTMLTextAreaElement>(null); const inputId = useId();
  const signature = JSON.stringify([question, currentSignature(currentFilters)]);
  const response = ai.output?.response; const result = response?.result;
  const stale = !!ai.output && ai.output.signature !== signature;
  const knownId = (id: string | number | undefined, catalog: readonly AiCatalogItem[]) => id === undefined || id === '' || catalog.some(value => value.id === Number(id));
  const missingCatalog = !!result && (!knownId(result.filters.departmentId, departments) || !knownId(result.filters.positionId, positions) ||
    !knownId(currentFilters.departmentId, departments) || !knownId(currentFilters.positionId, positions));
  const enabled = !!ai.config?.enabled.employeeSearch;
  const execute = () => { if (!questionError(question) && !ai.busy) { appliedRequest.current = undefined; setApplied(undefined); void ai.execute({ question: question.trim() }, signature); } };
  useEffect(() => { if (result && result.status !== 'OK') input.current?.focus(); }, [result]);
  const label = (key: typeof filterKeys[number], value: string | number | undefined) => {
    if (key === 'departmentId' || key === 'positionId') return value ? (key === 'departmentId' ? departments : positions).find(v => v.id === Number(value))?.name ?? '현재 선택지에 없는 값' : '전체';
    if (key === 'status') return value ? Object.hasOwn(statusLabel, value) ? statusLabel[value] : String(value) : '기본(퇴사 제외)';
    if (key === 'sort') return Object.hasOwn(sortLabel, value || 'employeeNo,asc') ? sortLabel[value || 'employeeNo,asc'] : String(value);
    return value ? `“${value}”` : '—';
  };
  return <section className="panel ai-panel" aria-busy={ai.busy}>
    <ConfigState loading={ai.configLoading} error={ai.configError} reload={ai.reloadConfig}/>
    <p className="sr-only" role="status">{ai.announcement}</p>
    {ai.config && !enabled ? <p className="notice">이 기능은 현재 꺼져 있습니다.</p> : <>
      <Field name={inputId} label="필터 제안 질문" error={question.length > 0 ? questionError(question) : undefined}><textarea ref={input} id={inputId} maxLength={500} readOnly={ai.busy} value={question} placeholder="예: 재직 중인 개발 부서 사원을 이름순으로" onChange={e => setQuestion(e.target.value)} onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); execute(); } }}/></Field><p>{question.length} / 500자 <span className="ai-keyboard-hint">· Ctrl+Enter 또는 Cmd+Enter로 실행</span></p><p>제안할 수 있는 조건: 검색어(이름·사번·이메일) · 부서 · 직급 · 상태 · 정렬</p><p className="muted">직책과 입사일 범위 조건은 지원하지 않습니다.</p>
      {ai.config && <ConfigNotice config={ai.config} feature="employeeSearch"/>}
      <RequestActions busy={ai.busy} disabled={!enabled || ai.configLoading || !!questionError(question)} label="AI로 필터 제안" execute={execute} cancel={ai.cancel}/>
      <FailureNotice error={ai.error} retry={execute}/>
      {ai.announcement.startsWith('요청을 취소') && <p className="muted">서버가 앞 요청을 마무리하는 동안 바로 다시 실행하면 다른 AI 요청 처리 중 안내가 나올 수 있습니다.</p>}
      {response && result && applied !== response.meta.requestId && <ResultCard meta={response.meta} focusTitle={result.status === 'OK'}>
        {stale && <p className="notice warning">입력이 바뀌었습니다. 이 결과는 이전 입력 기준입니다.</p>}
        <h4>{result.status === 'OK' ? '제안한 필터' : result.status === 'AMBIGUOUS' ? '조건을 확인해 주세요' : '필터로 바꿀 수 없는 질문입니다'}</h4><p style={{ whiteSpace: 'pre-wrap' }}>{result.message}</p>
        {result.status === 'OK' && <>
          <p>제안에 없는 조건은 기본값으로 돌아갑니다. 제안 적용 전에는 사원을 조회하지 않습니다.</p>
          <div className="table-wrap"><table className="responsive-table phase3b-table ai-filter-comparison"><caption>현재 → 적용 후</caption><thead><tr><th scope="col">조건</th><th scope="col">현재</th><th scope="col">적용 후</th></tr></thead><tbody>{filterKeys.map(key => {
            const before = label(key, currentFilters[key]); const after = label(key, result.filters[key]);
            return <tr key={key}><th scope="row">{{ keyword: '검색어', departmentId: '부서', positionId: '직급', status: '상태', sort: '정렬' }[key]}</th><td data-label="현재">{before}</td><td data-label="적용 후" className={before !== after ? "ai-changed" : undefined}>{after}{before !== after && <> <span className="badge neutral">변경</span></>}</td></tr>;
          })}</tbody></table></div>
          {missingCatalog && <p className="notice warning">현재 선택지에 없는 값입니다. 목록을 새로 고친 뒤 다시 실행해 주세요.</p>}
          <button className="primary" type="button" disabled={stale || missingCatalog || ai.busy} onClick={() => {
            if (stale || missingCatalog || ai.busy || result.status !== 'OK' || appliedRequest.current === response.meta.requestId) return;
            appliedRequest.current = response.meta.requestId; setApplied(response.meta.requestId); onApply({ ...result.filters });
          }}>제안 적용</button>
        </>}
        {result.status === 'UNSUPPORTED' && <><p>제안할 수 있는 조건: 검색어(이름·사번·이메일) · 부서 · 직급 · 상태 · 정렬</p><p className="muted">직책과 입사일 범위 조건은 지원하지 않습니다.</p></>}
        <button type="button" onClick={() => { ai.clearOutput(); input.current?.focus(); }}>결과 닫기</button>
      </ResultCard>}
    </>}
  </section>;
}

export function EvaluationSummaryAi({ evaluationId }: { evaluationId: number }) {
  const scope = useAiScope();
  if (!scope.user) return null;
  return <Disclosure key={`${scope.key}:${evaluationId}`} title="AI 코멘트 요약 (참고용 · 읽기 전용)"><EvaluationSummaryPanel evaluationId={evaluationId}/></Disclosure>;
}
function EvaluationSummaryPanel({ evaluationId }: { evaluationId: number }) {
  const ai = useAiInvocation('evaluationSummary', isEvaluationSummaryResult);
  const execute = () => { if (positiveId(evaluationId)) void ai.execute({ evaluationId }, String(evaluationId)); };
  const enabled = !!ai.config?.enabled.evaluationSummary;
  return <section className="panel ai-panel" aria-busy={ai.busy}><h2>AI 코멘트 요약</h2>
    <ConfigState loading={ai.configLoading} error={ai.configError} reload={ai.reloadConfig}/><p className="sr-only" role="status">{ai.announcement}</p>
    {ai.config && !enabled ? <p className="notice">이 기능은 현재 꺼져 있습니다.</p> : <>
      {!positiveId(evaluationId) && <p>평가서 ID가 올바르지 않습니다.</p>}
      {ai.config && <ConfigNotice config={ai.config} feature="evaluationSummary"/>}
      <RequestActions busy={ai.busy} disabled={!enabled || ai.configLoading || !positiveId(evaluationId)} label="AI로 요약 만들기" execute={execute} cancel={ai.cancel}/>
      <FailureNotice error={ai.error} retry={execute}/>
      {ai.announcement.startsWith('요청을 취소') && <p className="muted">서버가 앞 요청을 마무리하는 동안 바로 다시 실행하면 다른 AI 요청 처리 중 안내가 나올 수 있습니다.</p>}
      {ai.output && <ResultCard meta={ai.output.response.meta}><h4>자기평가·관리자 코멘트 요약</h4><p className="ai-result-text" style={{ whiteSpace: 'pre-wrap' }}>{ai.output.response.result.summary}</p><p>점수와 등급은 확정 결과가 기준입니다. 요약은 평가 결과를 바꾸지 않으며 저장되지 않습니다. 원문 코멘트를 확인해 주세요.</p></ResultCard>}
    </>}
  </section>;
}

export function PolicyQa() {
  const scope = useAiScope();
  if (!scope.user) return null;
  return <PolicyQaPanel key={scope.key}/>;
}
function PolicyQaPanel() {
  const ai = useAiInvocation('policyQa', isPolicyQaResult);
  const [question, setQuestion] = useState(''); const input = useRef<HTMLTextAreaElement>(null); const inputId = useId();
  const execute = () => { if (!questionError(question)) void ai.execute({ question: question.trim() }, question); };
  const response = ai.output?.response; const result = response?.result; const enabled = !!ai.config?.enabled.policyQa;
  useEffect(() => { if (result?.status === 'INSUFFICIENT_EVIDENCE') input.current?.focus(); }, [result]);
  return <><h1>규정 Q&A</h1><aside className="notice info">{result?.notice ?? AI_POLICY_NOTICE}</aside><section className="panel ai-panel" aria-busy={ai.busy}>
    <ConfigState loading={ai.configLoading} error={ai.configError} reload={ai.reloadConfig}/><p className="sr-only" role="status">{ai.announcement}</p>
    {ai.config && !enabled ? <p className="notice">이 기능은 현재 꺼져 있습니다.</p> : <>
      <Field name={inputId} label="규정 질문" error={question.length > 0 ? questionError(question) : undefined}><textarea ref={input} id={inputId} maxLength={500} readOnly={ai.busy} value={question} placeholder="예: 오전 반차일의 출근 기준은 언제인가요?" onChange={e => setQuestion(e.target.value)} onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); execute(); } }}/></Field><p>{question.length} / 500자 <span className="ai-keyboard-hint">· Ctrl+Enter 또는 Cmd+Enter로 실행</span></p>
      <p className="muted">예시 질문 · 선택하면 입력만 채웁니다.</p><div className="actions workflow-actions">{['오전 반차일의 출근 기준은 언제인가요?', '연차 신청은 어떻게 하나요?'].map(example => <button type="button" key={example} disabled={ai.busy} onClick={() => { setQuestion(example); input.current?.focus(); }}>{example}</button>)}</div>
      {ai.config && <ConfigNotice config={ai.config} feature="policyQa"/>}
      <RequestActions busy={ai.busy} disabled={!enabled || ai.configLoading || !!questionError(question)} label="AI로 답변 찾기" execute={execute} cancel={ai.cancel}/>
      <FailureNotice error={ai.error} retry={execute}/>
      {ai.announcement.startsWith('요청을 취소') && <p className="muted">서버가 앞 요청을 마무리하는 동안 바로 다시 실행하면 다른 AI 요청 처리 중 안내가 나올 수 있습니다.</p>}
      {response && result && <ResultCard meta={response.meta} focusTitle={result.status === 'ANSWERED'}>
        {ai.output?.signature !== question && <p className="notice warning">입력이 바뀌었습니다. 이 결과는 이전 입력 기준입니다.</p>}
        <p className="notice info">{result.notice}</p>
        {result.status === 'ANSWERED' ? <><h4>답변</h4><p className="ai-result-text" style={{ whiteSpace: 'pre-wrap' }}>{result.answer}</p><h4>근거 ({result.citations.length})</h4><ol>{result.citations.map((c, index) => <li key={index} className="panel ai-citation"><h4>문서 <code>{c.documentId}</code> · 버전 <code>{c.version}</code> · 절 <code>{c.sectionId}</code></h4><blockquote style={{ whiteSpace: 'pre-wrap' }}>{c.excerpt}</blockquote></li>)}</ol><p>인용 원문 일치는 서버가 확인했습니다. 답변이 질문에 맞는지와 의미가 정확한지는 보장하지 않으니 근거 원문을 확인해 주세요.</p></> : <><h4>답변할 수 없음</h4><p>합성 규정 문서에서 이 질문에 답할 근거를 찾지 못했습니다. 질문을 바꾸어 다시 실행하거나 인사 담당자에게 문의해 주세요.</p></>}
      </ResultCard>}
    </>}
  </section></>;
}
