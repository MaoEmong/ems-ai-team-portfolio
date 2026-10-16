import type { Employee } from './types';

// Approved phase4-ai-api.md v1.0 SHA256:
// E117946FE967747697A8AD6A3D0AF9A729991DB1A547BB6A468D7B09601A5617.
export type AiFeature = 'AI-01' | 'AI-02' | 'AI-03';
export type AiActor = Pick<Employee, 'id' | 'employeeNo' | 'name' | 'role'> & { status?: Employee['status'] };
type Awaitable<T> = T | Promise<T>;
export interface AiCatalogs { departments: readonly { id: number; name: string }[]; positions: readonly { id: number; name: string }[] }
export interface AiEvaluation {
  employee: { id: number }; reviewer: { id: number }; state: string;
  items: readonly { id: number; name: string }[];
  selfAnswers: readonly { itemId: number; comment?: string | null }[];
  managerAnswers?: readonly { itemId: number; comment?: string | null }[];
}
export interface AiInvokeAudit {
  actor: Pick<AiActor, 'id' | 'employeeNo' | 'name'>; action: 'AI_INVOKE';
  targetType: null; targetId: null; targetLabel: null; before: null; after: null; success: boolean;
  metadata: { feature: AiFeature; provider: 'mock'; model: 'deterministic-v1'; promptVersion: 'ems-ai-v1'; durationMs: number; errorCode: string | null };
}
export interface Phase4Options {
  catalogs: () => AiCatalogs;
  // Return null for absent/hidden records. The factory independently rechecks
  // the subject/reviewer IDs on each request, then projects comment-only data.
  getEvaluation: (evaluationId: number, actor: AiActor) => Awaitable<AiEvaluation | null | undefined>;
  audit: (event: AiInvokeAudit) => Awaitable<void>;
  clock?: () => Date; requestId?: () => string;
  enabled?: Partial<{ employeeSearch: boolean; evaluationSummary: boolean; policyQa: boolean }>;
  configured?: boolean;
  // Local test seams only; no request field can choose an output or callback.
  beforeInvocation?: (feature: AiFeature) => Awaitable<void>;
  mockOutput?: (feature: AiFeature) => Awaitable<unknown>;
}
export const policyNotice = '가상 회사의 합성 데모 규정이며 실제 회사 규정이나 법률 안내가 아닙니다.';
export const fixedPolicies = Object.freeze([
  Object.freeze({ documentId: 'DEMO-ATTENDANCE', version: '1.0', sectionId: 'HOURS', text: '가상 회사의 근무일은 월요일부터 금요일까지입니다. 기본 출근 기준은 09:00, 퇴근 기준은 18:00입니다.' }),
  Object.freeze({ documentId: 'DEMO-ATTENDANCE', version: '1.0', sectionId: 'HALF_DAY', text: '오전 반차일의 출근 기준은 14:00입니다. 오후 반차일의 퇴근 기준은 14:00입니다.' }),
  Object.freeze({ documentId: 'DEMO-LEAVE', version: '1.0', sectionId: 'APPROVAL', text: '가상 회사의 휴가 신청은 다른 관리자가 승인합니다. 본인 신청의 자기 승인은 허용하지 않습니다.' }),
]);
const configBase = Object.freeze({ provider: 'mock' as const, model: 'deterministic-v1' as const, mock: true as const, externalTransfer: false as const, promptVersion: 'ems-ai-v1' as const });
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const exact = (v: Record<string, unknown>, keys: readonly string[]) => Object.keys(v).length === keys.length && keys.every(key => Object.hasOwn(v, key));
const positive = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const bytes = (v: string) => new TextEncoder().encode(v).byteLength;
export class AiMockFailure extends Error {
  constructor(readonly code: 'AI_TIMEOUT' | 'AI_PROVIDER_ERROR' | 'AI_PROVIDER_REJECTED' | 'AI_INVALID_OUTPUT') { super(code); }
}
const errors: Record<string, { status: number; retryable?: boolean }> = {
  VALIDATION_ERROR: { status: 400, retryable: false }, AI_INPUT_TOO_LARGE: { status: 400, retryable: false }, AI_NO_COMMENTS: { status: 400, retryable: false },
  UNAUTHORIZED: { status: 401 }, FORBIDDEN: { status: 403 }, NOT_FOUND: { status: 404 },
  AI_EVALUATION_NOT_FINALIZED: { status: 409, retryable: false }, AI_BUSY: { status: 429, retryable: true }, AI_RATE_LIMITED: { status: 429, retryable: true },
  AI_NOT_CONFIGURED: { status: 503, retryable: false }, AI_DISABLED: { status: 503, retryable: false }, AI_TIMEOUT: { status: 504, retryable: true },
  AI_PROVIDER_ERROR: { status: 502, retryable: true }, AI_PROVIDER_REJECTED: { status: 502, retryable: false }, AI_INVALID_OUTPUT: { status: 502, retryable: true }, INTERNAL_ERROR: { status: 500 },
};
function failure(code: string) {
  const spec = errors[code] ?? errors.INTERNAL_ERROR;
  return response({ code: Object.hasOwn(errors, code) ? code : 'INTERNAL_ERROR', message: 'AI 요청을 처리할 수 없습니다.', fieldErrors: [], ...(spec.retryable === undefined ? {} : { retryable: spec.retryable }) }, spec.status);
}
function invalid(): never { throw new AiMockFailure('AI_INVALID_OUTPUT'); }

// JSON.parse alone loses duplicate keys. This bounded parser checks decoded
// object keys at every level and rejects trailing text and fenced responses.
export function parseStrictAiJson(source: string): unknown {
  if (bytes(source) > 65536) return invalid();
  let index = 0;
  const whitespace = () => { while (/[\x20\t\r\n]/.test(source[index] ?? '') && index < source.length) index++; };
  function string(): string {
    const start = index++;
    while (index < source.length) {
      if (source[index] === '\\') { index += 2; continue; }
      if (source[index++] === '"') { try { return JSON.parse(source.slice(start, index)); } catch { return invalid(); } }
    }
    return invalid();
  }
  function value(depth: number): unknown {
    if (depth > 32) return invalid(); whitespace();
    const token = source[index];
    if (token === '"') return string();
    if (token === '{') {
      index++; whitespace(); const result: Record<string, unknown> = Object.create(null), seen = new Set<string>();
      if (source[index] === '}') { index++; return result; }
      while (index < source.length) {
        whitespace(); if (source[index] !== '"') return invalid(); const key = string();
        if (seen.has(key)) return invalid(); seen.add(key); whitespace(); if (source[index++] !== ':') return invalid();
        result[key] = value(depth + 1); whitespace();
        if (source[index] === '}') { index++; return result; }
        if (source[index++] !== ',') return invalid();
      }
      return invalid();
    }
    if (token === '[') {
      index++; whitespace(); const result: unknown[] = [];
      if (source[index] === ']') { index++; return result; }
      while (index < source.length) { result.push(value(depth + 1)); whitespace(); if (source[index] === ']') { index++; return result; } if (source[index++] !== ',') return invalid(); }
      return invalid();
    }
    for (const [literal, decoded] of [['true', true], ['false', false], ['null', null]] as const) if (source.startsWith(literal, index)) { index += literal.length; return decoded; }
    const number = source.slice(index).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    // The only numeric values in the AI input/output schemas are integral IDs.
    if (number) { if (/[.eE]/.test(number[0])) return invalid(); index += number[0].length; const decoded = Number(number[0]); return Number.isSafeInteger(decoded) ? decoded : invalid(); }
    return invalid();
  }
  const result = value(0); whitespace(); if (index !== source.length) return invalid(); return result;
}
function outputObject(raw: unknown): Record<string, unknown> {
  let value: unknown;
  try { value = typeof raw === 'string' ? parseStrictAiJson(raw) : parseStrictAiJson(JSON.stringify(raw)); } catch { return invalid(); }
  return object(value) ? value : invalid();
}
export function validateEmployeeSearchOutput(raw: unknown, catalogs: AiCatalogs) {
  const value = outputObject(raw);
  if (!exact(value, ['status', 'filters', 'message']) || !['OK', 'AMBIGUOUS', 'UNSUPPORTED'].includes(String(value.status)) || !object(value.filters) || !text(value.message, 300)) return invalid();
  const filters = value.filters;
  for (const [key, entry] of Object.entries(filters)) {
    if (key === 'keyword') { if (!text(entry, 100) || entry !== entry.trim()) return invalid(); }
    else if (key === 'departmentId' || key === 'positionId') { const catalog = key === 'departmentId' ? catalogs.departments : catalogs.positions; if (!positive(entry) || !catalog.some(item => item.id === entry)) return invalid(); }
    else if (key === 'status') { if (typeof entry !== 'string' || !['ACTIVE', 'ON_LEAVE', 'RETIRED'].includes(entry)) return invalid(); }
    else if (key === 'sort') { if (typeof entry !== 'string' || !/^(employeeNo|name|hireDate),(asc|desc)$/.test(entry)) return invalid(); }
    else return invalid();
  }
  if (value.status === 'OK' ? Object.keys(filters).length === 0 : Object.keys(filters).length !== 0) return invalid();
  return { status: value.status as 'OK' | 'AMBIGUOUS' | 'UNSUPPORTED', filters, message: value.message };
}
const insufficient = () => ({ status: 'INSUFFICIENT_EVIDENCE' as const, answer: null, citations: [], notice: policyNotice });
export function validatePolicyOutput(raw: unknown) {
  const value = outputObject(raw);
  if (!exact(value, ['status', 'answer', 'citations']) || !['ANSWERED', 'INSUFFICIENT_EVIDENCE'].includes(String(value.status)) || !Array.isArray(value.citations) || value.citations.length > 3) return invalid();
  if (value.status === 'INSUFFICIENT_EVIDENCE') {
    if (value.answer !== null || value.citations.length !== 0) return invalid();
    return insufficient();
  }
  if (!text(value.answer, 2000)) return invalid();
  for (const c of value.citations) if (!object(c) || !exact(c, ['documentId', 'version', 'sectionId', 'excerpt']) || !text(c.documentId, 300) || !text(c.version, 300) || !text(c.sectionId, 300) || !text(c.excerpt, 300)) return invalid();
  if (!value.citations.length || value.citations.some(c => !fixedPolicies.some(p => p.documentId === c.documentId && p.version === c.version && p.sectionId === c.sectionId && p.text.includes(c.excerpt)))) return insufficient();
  return { status: 'ANSWERED' as const, answer: value.answer, citations: value.citations.map(c => ({ documentId: c.documentId as string, version: c.version as string, sectionId: c.sectionId as string, excerpt: c.excerpt as string })), notice: policyNotice };
}
export function projectEvaluationComments(evaluation: AiEvaluation): { name: string; selfComment: string | null; managerComment: string | null }[] | Response {
  if (!Array.isArray(evaluation.items) || !Array.isArray(evaluation.selfAnswers) || !Array.isArray(evaluation.managerAnswers)) return failure('INTERNAL_ERROR');
  if (evaluation.items.length > 20) return failure('AI_INPUT_TOO_LARGE');
  const ids = new Set(evaluation.items.map(item => item.id));
  if (ids.size !== evaluation.items.length || evaluation.items.some(item => !positive(item.id) || typeof item.name !== 'string')) return failure('INTERNAL_ERROR');
  let size = 0;
  for (const answers of [evaluation.selfAnswers, evaluation.managerAnswers]) {
    const seen = new Set<number>();
    for (const a of answers) {
      if (!ids.has(a.itemId) || seen.has(a.itemId) || (a.comment != null && typeof a.comment !== 'string')) return failure('INTERNAL_ERROR');
      seen.add(a.itemId); size += a.comment?.length ?? 0;
    }
  }
  if (size > 12000) return failure('AI_INPUT_TOO_LARGE');
  const items = evaluation.items.map(item => ({ name: item.name, selfComment: evaluation.selfAnswers.find(a => a.itemId === item.id)?.comment ?? null, managerComment: evaluation.managerAnswers!.find(a => a.itemId === item.id)?.comment ?? null }));
  if (!items.some(item => item.selfComment?.trim() || item.managerComment?.trim())) return failure('AI_NO_COMMENTS');
  return items;
}

function searchDemo(question: string, catalogs: AiCatalogs) {
  const empty = (status: 'AMBIGUOUS' | 'UNSUPPORTED', message: string) => ({ status, filters: {}, message });
  const sortByHireDate = /입사일.{0,12}(순|정렬)|입사일순/.test(question);
  if (/직책|팀장|파트장|급여|SQL|SELECT|\bOR\b|또는|혹은|jobTitleId|hireDateFrom|hireDateTo|page|size|[<>]=?|프롬프트|무시|ignore|system/i.test(question) || (/입사/.test(question) && !sortByHireDate) || /\d{4}[-/.년]/.test(question)) return empty('UNSUPPORTED', '직책·입사일 범위 및 지원하지 않는 조건은 제안할 수 없습니다.');
  const filters: Record<string, string | number> = {};
  const states = [/재직|활성/.test(question) ? 'ACTIVE' : null, /휴직/.test(question) ? 'ON_LEAVE' : null, /퇴사/.test(question) ? 'RETIRED' : null].filter(Boolean);
  if (states.length > 1) return empty('AMBIGUOUS', '하나의 사원 상태를 구체적으로 입력해 주세요.');
  if (states[0]) filters.status = states[0];
  const departments = catalogs.departments.filter(item => question.includes(item.name) || (() => { const stem = item.name.replace(/부서$|팀$|부$/, ''); return stem.length >= 2 && question.includes(stem); })());
  const positions = catalogs.positions.filter(item => question.includes(item.name) && (item.name !== '사원' || /사원\s*직급/.test(question)));
  if (departments.length > 1 || positions.length > 1) return empty('AMBIGUOUS', '부서와 직급을 각각 하나로 구체적으로 입력해 주세요.');
  if ((question.includes('부서') && !departments.length) || (question.includes('직급') && !positions.length)) return empty('AMBIGUOUS', '카탈로그에 있는 부서·직급 이름을 구체적으로 입력해 주세요.');
  if (departments[0]) filters.departmentId = departments[0].id;
  if (positions[0]) filters.positionId = positions[0].id;
  const sortFields = [question.includes('이름') ? 'name' : null, question.includes('사번순') || /사번.{0,8}(순|정렬)/.test(question) ? 'employeeNo' : null, sortByHireDate ? 'hireDate' : null].filter(Boolean);
  if (sortFields.length > 1) return empty('AMBIGUOUS', '정렬 기준을 하나만 선택해 주세요.');
  if (sortFields[0]) filters.sort = `${sortFields[0]},${/내림차순|역순|최신순/.test(question) ? 'desc' : 'asc'}`;
  const keyword = question.match(/(?:키워드|검색어|사번|이메일)\s*[:=]\s*(?:"([^"]+)"|'([^']+)'|([^\s]+))/);
  if (keyword) { const value = (keyword[1] ?? keyword[2] ?? keyword[3]).trim(); if (!text(value, 100)) return empty('UNSUPPORTED', '검색어는 1~100자로 입력해 주세요.'); filters.keyword = value; }
  return Object.keys(filters).length ? { status: 'OK', filters, message: '제안된 조건을 확인한 뒤 적용하세요.' } : empty('AMBIGUOUS', '지원하는 부서·직급·상태 또는 검색어를 구체적으로 입력해 주세요.');
}
function policyDemo(question: string) {
  if (/프롬프트|무시|ignore|system|비밀|API.?키|비밀번호/i.test(question)) return { status: 'INSUFFICIENT_EVIDENCE', answer: null, citations: [] };
  let section: typeof fixedPolicies[number] | undefined;
  let excerpt: string | undefined;
  if (question.includes('반차')) { section = fixedPolicies[1]; excerpt = question.includes('오후') ? '오후 반차일의 퇴근 기준은 14:00입니다.' : '오전 반차일의 출근 기준은 14:00입니다.'; }
  else if (/휴가|승인|결재/.test(question)) { section = fixedPolicies[2]; excerpt = '가상 회사의 휴가 신청은 다른 관리자가 승인합니다.'; }
  else if (/근무일|출근|퇴근|근무.?시간/.test(question)) { section = fixedPolicies[0]; excerpt = '기본 출근 기준은 09:00, 퇴근 기준은 18:00입니다.'; }
  return section && excerpt ? { status: 'ANSWERED', answer: `데모 규정상 ${excerpt}`, citations: [{ documentId: section.documentId, version: section.version, sectionId: section.sectionId, excerpt }] } : { status: 'INSUFFICIENT_EVIDENCE', answer: null, citations: [] };
}

export function createPhase4(options: Phase4Options) {
  const clock = options.clock ?? (() => new Date());
  const requestId = options.requestId ?? (() => crypto.randomUUID());
  const enabled = { employeeSearch: options.enabled?.employeeSearch ?? true, evaluationSummary: options.enabled?.evaluationSummary ?? true, policyQa: options.enabled?.policyQa ?? true };
  const busy = new Set<number>();
  const windows = new Map<number, { start: number; count: number }>();
  const featurePaths: Record<string, { feature: AiFeature; key: keyof typeof enabled }> = {
    '/ai/employee-search': { feature: 'AI-01', key: 'employeeSearch' },
    '/ai/evaluation-summary': { feature: 'AI-02', key: 'evaluationSummary' },
    '/ai/policy-qa': { feature: 'AI-03', key: 'policyQa' },
  };
  async function handle(url: URL, method: string, body: unknown, actor: AiActor | null | undefined, rawBody?: string): Promise<Response | undefined> {
    const path = url.pathname.replace(/^\/api\/v1(?=\/|$)/, '');
    if (!/^\/ai(?:\/|$)/.test(path)) return;
    if (!actor || !positive(actor.id) || !['ADMIN', 'EMPLOYEE'].includes(actor.role) || actor.status === 'RETIRED') return failure('UNAUTHORIZED');
    actor = { id: actor.id, employeeNo: actor.employeeNo, name: actor.name, role: actor.role };
    if (path === '/ai/config' && method.toUpperCase() === 'GET') return response({ ...configBase, enabled: { ...enabled } });
    const entry = featurePaths[path]; if (!entry || method.toUpperCase() !== 'POST') return failure('NOT_FOUND');
    const { feature } = entry;
    if (feature === 'AI-01' && actor.role !== 'ADMIN') return failure('FORBIDDEN');
    let input: unknown;
    try {
      const raw = rawBody ?? JSON.stringify(body);
      if (typeof raw !== 'string') return failure('VALIDATION_ERROR');
      if (bytes(raw) > 16384) return failure('AI_INPUT_TOO_LARGE');
      input = parseStrictAiJson(raw);
    } catch { return failure('VALIDATION_ERROR'); }
    const inputKey = feature === 'AI-02' ? 'evaluationId' : 'question';
    if (!object(input) || !exact(input, [inputKey])) return failure('VALIDATION_ERROR');
    if (feature === 'AI-02' ? !positive(input.evaluationId) : typeof input.question !== 'string' || !text(input.question.trim(), 500)) return failure('VALIDATION_ERROR');
    let question = '', catalogs: AiCatalogs = { departments: [], positions: [] };
    // Data stays request-local. Neither raw text nor generated results enter a
    // cache, audit callback, limiter key, error message or persistent store.
    try {
      if (feature === 'AI-02') {
        const e = await options.getEvaluation(input.evaluationId as number, actor);
        if (!e || (e.employee.id !== actor.id && e.reviewer.id !== actor.id)) return failure('NOT_FOUND');
        if (e.state !== 'FINALIZED') return failure('AI_EVALUATION_NOT_FINALIZED');
        const comments = projectEvaluationComments(e); if (comments instanceof Response) return comments;
      } else question = (input.question as string).trim();
      if (feature === 'AI-01') {
        const current = options.catalogs();
        catalogs = { departments: current.departments.map(({ id, name }) => ({ id, name })), positions: current.positions.map(({ id, name }) => ({ id, name })) };
      }
    } catch { return failure('INTERNAL_ERROR'); }
    if (!enabled[entry.key]) return failure('AI_DISABLED');
    if (options.configured === false) return failure('AI_NOT_CONFIGURED');
    if (busy.has(actor.id)) return failure('AI_BUSY');
    busy.add(actor.id);
    const start = clock().getTime();
    const prior = windows.get(actor.id);
    const window = !prior || start - prior.start >= 60000 ? { start, count: 0 } : prior;
    windows.set(actor.id, window);
    if (window.count >= 10) { busy.delete(actor.id); return failure('AI_RATE_LIMITED'); }
    window.count++;
    try {
      let result: unknown, errorCode: string | null = null;
      try {
        await options.beforeInvocation?.(feature);
        const rawOutput = options.mockOutput ? await options.mockOutput(feature) : feature === 'AI-01' ? searchDemo(question, catalogs) : feature === 'AI-02' ? { summary: '합성 평가 코멘트를 확인하는 데 도움을 주는 고정 시연 요약입니다. 실제 추론 결과가 아니므로 원문을 확인하세요.' } : policyDemo(question);
        if (feature === 'AI-01') result = validateEmployeeSearchOutput(rawOutput, catalogs);
        else if (feature === 'AI-03') result = validatePolicyOutput(rawOutput);
        else { const summary = outputObject(rawOutput); if (!exact(summary, ['summary']) || !text(summary.summary, 2000)) invalid(); result = { summary: summary.summary }; }
      } catch (error) { errorCode = error instanceof AiMockFailure && ['AI_TIMEOUT', 'AI_PROVIDER_ERROR', 'AI_PROVIDER_REJECTED', 'AI_INVALID_OUTPUT'].includes(error.code) ? error.code : 'AI_PROVIDER_ERROR'; }
      const durationMs = Math.max(0, Math.floor(clock().getTime() - start));
      try {
        await options.audit({ actor: { id: actor.id, employeeNo: actor.employeeNo, name: actor.name }, action: 'AI_INVOKE', targetType: null, targetId: null, targetLabel: null, before: null, after: null, success: errorCode === null, metadata: { feature, provider: 'mock', model: 'deterministic-v1', promptVersion: 'ems-ai-v1', durationMs, errorCode } });
      } catch { return failure('INTERNAL_ERROR'); }
      if (errorCode) return failure(errorCode);
      const local = new Date(clock().getTime() + 9 * 3600000).toISOString();
      return response({ meta: { requestId: requestId(), ...configBase, generatedAt: local.slice(0, 19) + '+09:00' }, result });
    } finally { busy.delete(actor.id); }
  }
  return { handle };
}
