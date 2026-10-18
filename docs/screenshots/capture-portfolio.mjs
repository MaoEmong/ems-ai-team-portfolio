// Preparation artifact only. Run by the frontend lead after the shared environment handoff.
// No test runner, Docker commands, response substitution, trace, video or storage-state files.
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, sep } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const repository = resolve(here, '../..');
const requireFrontend = createRequire(join(repository, 'frontend/package.json'));
let step = 'PREFLIGHT';
class CaptureFailure extends Error {
  constructor(code) { super(code); this.code = code; }
}
const fail = code => { throw new CaptureFailure(code); };
const ensure = (condition, code) => { if (!condition) fail(code); };
const required = name => { const value = process.env[name]; ensure(typeof value === 'string' && value.trim(), `MISSING_${name}`); return value; };
const id = value => { ensure(Number.isSafeInteger(value) && value > 0, 'INVALID_API_ID'); return value; };
const day = value => { ensure(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value), 'INVALID_SERVER_DATE'); return value; };
const digest = buffer => createHash('sha256').update(buffer).digest('hex');
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function offsetDay(value, offset) {
  const date = new Date(`${day(value)}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + offset); return date.toISOString().slice(0, 10);
}
function weekday(value, direction) {
  let result = offsetDay(value, direction);
  while ([0, 6].includes(new Date(`${result}T12:00:00Z`).getUTCDay())) result = offsetDay(result, direction);
  return result;
}
function previousMonth(value, distance) {
  const date = new Date(`${day(value).slice(0, 7)}-01T12:00:00Z`); date.setUTCMonth(date.getUTCMonth() - distance); return date.toISOString().slice(0, 7);
}
function localUrl(value, api = false) {
  let url; try { url = new URL(value); } catch { fail('INVALID_LOCAL_URL'); }
  ensure(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && ['http:', 'https:'].includes(url.protocol), 'LOCAL_ENVIRONMENT_REQUIRED');
  ensure(!url.username && !url.password && !url.search && !url.hash, 'URL_MUST_NOT_CONTAIN_CREDENTIALS');
  ensure(api ? url.pathname.replace(/\/$/, '') === '/api/v1' : url.pathname === '/', 'INVALID_BASE_URL_PATH');
  return url.href.replace(/\/$/, '');
}
function sourceEvidence() {
  const git = args => execFileSync('git', ['-c', `safe.directory=${repository}`, '-C', repository, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  try {
    const commit = git(['rev-parse', 'HEAD']); ensure(/^[0-9a-f]{40,64}$/.test(commit), 'INVALID_SOURCE_COMMIT');
    return { sourceCommit: commit, sourceDirtyAtStart: git(['status', '--porcelain', '--untracked-files=all']).length > 0 };
  } catch { fail('SOURCE_COMMIT_UNAVAILABLE'); }
}
async function main() {
  ensure(process.env.PORTFOLIO_CAPTURE_RUN === '1' && process.env.PORTFOLIO_SYNTHETIC_ONLY === '1', 'EXPLICIT_SYNTHETIC_RUN_REQUIRED');
  ensure(process.env.VITE_MOCK_API !== 'true', 'MOCK_FETCH_FORBIDDEN');
  ensure(!process.env.DEBUG && !process.env.PWDEBUG && !process.env.NODE_DEBUG, 'DEBUG_LOGGING_FORBIDDEN');
  const uiBase = localUrl(required('PORTFOLIO_UI_BASE_URL'));
  const apiBase = localUrl(required('PORTFOLIO_API_BASE_URL'), true);
  const project = required('PORTFOLIO_COMPOSE_PROJECT');
  ensure(/^[a-z0-9][a-z0-9_-]{2,80}$/.test(project) && project !== 'ems', 'UNIQUE_COMPOSE_PROJECT_REQUIRED');
  const credentials = {
    ADMIN: { loginId: required('PORTFOLIO_ADMIN_ID'), password: required('PORTFOLIO_ADMIN_PASSWORD') },
    EMPLOYEE: { loginId: required('PORTFOLIO_EMPLOYEE_ID'), password: required('PORTFOLIO_EMPLOYEE_PASSWORD') },
    IMPORT: { loginId: required('PORTFOLIO_IMPORT_ID'), password: required('PORTFOLIO_IMPORT_PASSWORD') },
  };
  ensure(new Set(Object.values(credentials).map(value => value.loginId)).size === 3, 'DISTINCT_CAPTURE_ACCOUNTS_REQUIRED');
  for (const value of Object.values(credentials)) {
    ensure(value.loginId.length <= 50 && Buffer.byteLength(value.password, 'utf8') <= 72, 'INVALID_CREDENTIAL_LENGTH');
  }
  const planBytes = await readFile(join(here, 'screen-list.json'));
  const plan = JSON.parse(planBytes.toString('utf8'));
  ensure(plan.schemaVersion === 1 && plan.mode.frontend === 'real-api' && plan.mode.llm === 'mock', 'INVALID_SCREEN_PLAN');
  const unique = new Set();
  for (const screen of plan.screens) {
    ensure(/^[a-z0-9-]+$/.test(screen.id) && !unique.has(screen.id), 'INVALID_SCREEN_ID'); unique.add(screen.id);
    ensure(['ADMIN', 'EMPLOYEE'].includes(screen.role) && screen.path.startsWith('/'), 'INVALID_SCREEN_ROLE_OR_PATH');
    ensure(screen.viewports.every(value => Object.hasOwn(plan.viewports, value)), 'INVALID_VIEWPORT');
    ensure(screen.filename === `{viewport}-${screen.id}.png`, 'INVALID_SCREEN_FILENAME');
  }
  const source = sourceEvidence();
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
  const output = join(here, runId); await mkdir(output); // Unique directory, no overwrites.
  const manifest = {
    schemaVersion: 1, runId, status: 'in-progress', startedAt: new Date().toISOString(), ...source,
    screenPlanSha256: digest(planBytes), composeProject: project,
    uiOrigin: new URL(uiBase).origin, apiOrigin: new URL(apiBase).origin,
    frontendMode: 'real-api', provider: 'mock', llmMock: true, actualInference: false,
    executionOwner: 'frontend-team-lead', scriptAuthor: 'Codex',
    publicationReview: 'pending-Claude-and-QA',
    privacy: { credentialValuesPersisted: false, identityScreenshotMasks: true, trace: false, video: false, storageState: false, rawErrorsPersisted: false },
    preparation: [], captures: [], aiDiagnostics: [], screenFailures: [],
  };
  const saveManifest = () => writeFile(join(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8' });
  async function aiDiagnostic(stage, values = {}) {
    manifest.aiDiagnosticStage = stage;
    manifest.aiDiagnostics.push({ screenStep: step, stage, ...Object.fromEntries(Object.entries(values).filter(([, value]) => typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)))) });
    await saveManifest();
  }
  async function aiLocatorDiagnostic(stage, locator) {
    const count = await locator.count();
    await aiDiagnostic(stage, { locatorCount: count, visible: count === 1 && await locator.isVisible(), enabled: count === 1 && await locator.isEnabled() });
  }
  const privateValues = new Set(Object.values(credentials).flatMap(value => [value.loginId, value.password]));
  const contexts = []; const apiContexts = []; let browser;
  const { chromium, request, expect } = requireFrontend('@playwright/test');
  const ExcelJS = requireFrontend('exceljs');
  const state = {};
  const journal = (operation, method, path, status) => manifest.preparation.push({ operation, method, pathTemplate: path, status, at: new Date().toISOString() });
  function registerIdentity(user) {
    ensure(user && Number.isSafeInteger(user.id) && typeof user.employeeNo === 'string' && typeof user.name === 'string', 'INVALID_AUTH_IDENTITY');
    privateValues.add(user.employeeNo); privateValues.add(user.name);
  }
  async function json(context, method, path, data, accepted) {
    let response;
    try { response = await context.fetch(`${apiBase}${path}`, { method, ...(data === undefined ? {} : { data }), timeout: 30000 }); }
    catch { fail('API_TRANSPORT_FAILED'); }
    const status = response.status();
    const creates = ['/employees', '/departments', '/job-titles', '/evaluation-cycles', '/leaves', '/payrolls'];
    const expected = accepted ?? (method === 'POST' && creates.includes(path) ? [201] : [200]);
    if (!expected.includes(status)) { await response.dispose(); fail(`API_HTTP_${status}`); }
    let result; try { result = status === 204 ? undefined : await response.json(); } catch { fail('API_JSON_INVALID'); }
    finally { await response.dispose(); }
    return result;
  }
  async function authenticate(role) {
    const auth = await request.newContext(); apiContexts.push(auth);
    const result = await json(auth, 'POST', '/auth/login', credentials[role]);
    ensure(typeof result.accessToken === 'string' && result.accessToken.length > 10 && result.user?.role === role, 'AUTH_ROLE_MISMATCH');
    registerIdentity(result.user);
    const context = await request.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${result.accessToken}` } }); apiContexts.push(context);
    const me = await json(context, 'GET', '/auth/me'); ensure(me.id === result.user.id && me.role === role, 'AUTH_IDENTITY_MISMATCH');
    return { context, user: me };
  }
  async function allEmployees(admin) {
    const values = new Map();
    for (const status of ['ACTIVE', 'ON_LEAVE', 'RETIRED']) {
      for (let page = 0; ; page++) {
        const result = await json(admin, 'GET', `/employees?status=${status}&page=${page}&size=100`);
        ensure(Array.isArray(result.content) && Number.isInteger(result.totalPages), 'INVALID_EMPLOYEE_PAGE');
        for (const employee of result.content) {
          ensure(/^(가상|합성)/.test(employee.name) && /@[^@]+\.(invalid|test)$/.test(employee.email), 'NON_SYNTHETIC_DATA_DETECTED');
          values.set(id(employee.id), employee);
        }
        if (page + 1 >= result.totalPages) break;
        ensure(page < 100, 'EMPLOYEE_PAGE_LIMIT');
      }
    }
    return [...values.values()];
  }
  async function makeCycle(admin, employee, name, phase) {
    const cycle = await json(admin, 'POST', '/evaluation-cycles', {
      name, startDate: `${state.today.slice(0, 7)}-01`, endDate: offsetDay(state.today, 30),
      items: [{ name: '업무 수행', sortOrder: 1 }, { name: '협업', sortOrder: 2 }],
      assignments: [{ employeeId: state.employeeId, reviewerId: state.adminId }],
    });
    id(cycle.id); journal('create-evaluation-cycle', 'POST', '/evaluation-cycles', 201);
    if (phase === 'DRAFT') return { cycleId: cycle.id };
    await json(admin, 'POST', `/evaluation-cycles/${cycle.id}/open`);
    const detail = await json(admin, 'GET', `/evaluation-cycles/${cycle.id}`);
    const assignment = detail.assignments.find(value => value.employee?.id === state.employeeId);
    const evaluationId = id(assignment?.evaluationId);
    if (phase === 'MANAGER' || phase === 'FINALIZED') {
      const form = await json(employee, 'GET', `/evaluations/${evaluationId}`);
      const answers = form.items.map(item => ({ itemId: id(item.id), score: 4, comment: '합성 자기평가 코멘트: 협업과 업무 수행을 점검했습니다.' }));
      await json(employee, 'POST', `/evaluations/${evaluationId}/self/submit`, { answers });
      if (phase === 'FINALIZED') {
        await json(admin, 'POST', `/evaluations/${evaluationId}/manager/submit`, { answers: form.items.map(item => ({ itemId: item.id, score: 5, comment: '합성 관리자 코멘트: 성과를 확인하고 일정 공유를 개선 과제로 제안했습니다.' })) });
        const final = await json(employee, 'GET', `/evaluations/${evaluationId}`);
        ensure(final.state === 'FINALIZED', 'EVALUATION_NOT_FINALIZED');
      }
    }
    return { cycleId: cycle.id, evaluationId };
  }
  let adminApi; let employeeApi;
  async function prepare() {
    step = 'PREPARE_AUTH';
    const admin = await authenticate('ADMIN'); adminApi = admin.context; state.adminId = id(admin.user.id);
    await allEmployees(adminApi); // Reject a non-synthetic existing database before writes.
    const config = await json(adminApi, 'GET', '/ai/config');
    ensure(config.provider === 'mock' && config.mock === true && config.externalTransfer === false &&
      ['employeeSearch', 'evaluationSummary', 'policyQa'].every(feature => config.enabled?.[feature] === true), 'MOCK_LLM_CONFIG_REQUIRED');
    const dashboard = await json(adminApi, 'GET', '/dashboard'); state.today = day(dashboard.asOfDate);
    state.draftMonth = state.today.slice(0, 7); state.confirmedMonth = previousMonth(state.today, 2);
    const positions = await json(adminApi, 'GET', '/positions'); ensure(positions.length > 0, 'POSITION_CATALOG_EMPTY'); state.positionId = id(positions[0].id);
    step = 'PREPARE_CATALOG';
    const suffix = runId.slice(-8);
    const parent = await json(adminApi, 'POST', '/departments', { name: `합성 포트폴리오 본부 ${suffix}`, parentId: null, description: '포트폴리오 촬영용 합성 부서' });
    const child = await json(adminApi, 'POST', '/departments', { name: `합성 포트폴리오 팀 ${suffix}`, parentId: id(parent.id), description: '포트폴리오 촬영용 합성 하위 부서' });
    const title = await json(adminApi, 'POST', '/job-titles', { name: `합성 검수 담당 ${suffix}`, description: '합성 촬영 직책' });
    state.departmentId = id(child.id); state.jobTitleId = id(title.id);
    step = 'PREPARE_EMPLOYEE';
    const created = await json(adminApi, 'POST', '/employees', {
      employeeNo: credentials.EMPLOYEE.loginId, name: '합성 포트폴리오 사원', email: 'portfolio.employee@example.invalid', phone: '000-0000-0000',
      hireDate: offsetDay(state.today, -366), departmentId: id(parent.id), positionId: state.positionId, role: 'EMPLOYEE', initialPassword: credentials.EMPLOYEE.password,
    });
    state.employeeId = id(created.id); registerIdentity(created); journal('create-capture-employee', 'POST', '/employees', 201);
    const employee = await authenticate('EMPLOYEE'); employeeApi = employee.context; ensure(employee.user.id === state.employeeId, 'CAPTURE_EMPLOYEE_MISMATCH');
    await json(adminApi, 'POST', `/employees/${state.employeeId}/appointments`, { departmentId: state.departmentId, positionId: state.positionId, changeJobTitle: true, jobTitleId: state.jobTitleId, effectiveDate: state.today, reason: '합성 포트폴리오 소속·직책 발령' }, [201]);
    journal('create-appointment', 'POST', '/employees/{employeeId}/appointments', 201);
    step = 'PREPARE_ATTENDANCE_LEAVE';
    const today = await json(employeeApi, 'GET', '/attendance/me/today'); ensure(today.date === state.today, 'SERVER_DATE_MISMATCH');
    state.attendanceDate = weekday(state.today, -1);
    await json(adminApi, 'PUT', `/attendance/${state.employeeId}/${state.attendanceDate}`, { checkIn: `${state.attendanceDate}T09:00:00+09:00`, checkOut: `${state.attendanceDate}T18:00:00+09:00`, reason: '합성 포트폴리오 근태 정정' });
    const balance = await json(employeeApi, 'GET', '/leaves/me/balance');
    const approvedDate = weekday(state.today, 1); const pendingDate = weekday(approvedDate, 1);
    ensure(approvedDate >= balance.periodStart && pendingDate <= balance.periodEnd, 'LEAVE_PERIOD_HAS_NO_CAPTURE_DATES');
    const approved = await json(employeeApi, 'POST', '/leaves', { type: 'SICK', startDate: approvedDate, endDate: approvedDate, reason: '합성 포트폴리오 승인 시나리오' });
    await json(adminApi, 'POST', `/leaves/${id(approved.id)}/approve`);
    const pending = await json(employeeApi, 'POST', '/leaves', { type: 'SICK', startDate: pendingDate, endDate: pendingDate, reason: '합성 포트폴리오 결재 대기 시나리오' });
    state.pendingLeaveId = id(pending.id); state.pendingDate = pendingDate;
    journal('prepare-leaves-and-notifications', 'POST', '/leaves/{id}/approve', 200);
    step = 'PREPARE_EVALUATIONS';
    state.draftCycleId = (await makeCycle(adminApi, employeeApi, '합성 포트폴리오 · 준비', 'DRAFT')).cycleId;
    const self = await makeCycle(adminApi, employeeApi, '합성 포트폴리오 · 자기 작성', 'SELF'); state.selfCycleId = self.cycleId; state.selfEvaluationId = self.evaluationId;
    state.managerEvaluationId = (await makeCycle(adminApi, employeeApi, '합성 포트폴리오 · 관리자 작성', 'MANAGER')).evaluationId;
    state.resultEvaluationId = (await makeCycle(adminApi, employeeApi, '합성 포트폴리오 · 확정 결과', 'FINALIZED')).evaluationId;
  }
  async function ensurePayroll() {
    if (state.payslipId) return;
    ensure(state.importDone, 'IMPORT_MUST_PRECEDE_PAYROLL');
    for (const month of [state.draftMonth, state.confirmedMonth]) {
      const list = await json(adminApi, 'GET', `/payrolls?month=${month}&page=0&size=20`);
      ensure(list.content?.length === 0, 'CAPTURE_PAYROLL_MONTH_ALREADY_EXISTS');
    }
    const imported = (await allEmployees(adminApi)).find(value => value.employeeNo === credentials.IMPORT.loginId);
    ensure(imported, 'IMPORTED_EMPLOYEE_NOT_FOUND'); registerIdentity(imported);
    for (const employeeId of [state.employeeId, id(imported.id)]) {
      await json(adminApi, 'PUT', `/employees/${employeeId}/salary-setting`, { baseSalary: 3000000, allowance: 100000 });
    }
    await json(adminApi, 'POST', '/payrolls', { month: state.draftMonth });
    await json(adminApi, 'POST', '/payrolls', { month: state.confirmedMonth });
    await json(adminApi, 'POST', `/payrolls/${state.confirmedMonth}/confirm`);
    const slips = await json(employeeApi, 'GET', `/payslips/me?month=${state.confirmedMonth}&page=0&size=20`);
    ensure(slips.content?.length === 1 && slips.content[0].status === 'CONFIRMED', 'CONFIRMED_PAYSLIP_MISSING'); state.payslipId = id(slips.content[0].id);
    journal('create-draft-and-confirmed-payroll', 'POST', '/payrolls/{month}/confirm', 200);
  }
  const exactButton = (page, name) => page.getByRole('button', { name, exact: true });
  const heading = (page, name) => page.getByRole('heading', { name, exact: true });
  async function uiLogin(page, role) {
    await page.goto(`${uiBase}/login`);
    await page.getByLabel('아이디 (사번)', { exact: true }).fill(credentials[role].loginId);
    await page.getByLabel('비밀번호', { exact: true }).fill(credentials[role].password);
    const actualLogin = page.waitForResponse(response => response.url() === `${apiBase}/auth/login` && response.request().method() === 'POST').catch(() => undefined);
    await exactButton(page, '로그인').click();
    const response = await actualLogin; ensure(response?.status() === 200, 'UI_LOGIN_FAILED');
    await expect(exactButton(page, '로그아웃')).toBeVisible(); await expect(page.locator('.sidebar-bottom')).toHaveText('실제 API 모드');
    ensure(await page.getByText('목업 데모 모드', { exact: true }).count() === 0, 'MOCK_FETCH_FORBIDDEN');
  }
  async function goto(page, path) {
    await page.goto(`${uiBase}${path}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.sidebar-bottom')).toHaveText('실제 API 모드');
  }
  async function aiRun(page, suffix, action) {
    const buttonName = suffix === 'employee-search' ? 'AI로 필터 제안' : suffix === 'evaluation-summary' ? 'AI로 요약 만들기' : 'AI로 답변 찾기';
    await aiLocatorDiagnostic('BUTTON_ENABLED', exactButton(page, buttonName));
    const pending = page.waitForResponse(response => response.url() === `${apiBase}/ai/${suffix}` && response.request().method() === 'POST').catch(() => undefined);
    await action(); const response = await pending;
    await aiDiagnostic('AI_RESPONSE_STATUS', { httpStatus: response?.status() ?? 0 });
    ensure(response?.status() === 200, 'AI_HTTP_FAILED');
    const value = await response.json();
    await aiDiagnostic('RESULT_STATUS', { envelopeObject: !!value && typeof value === 'object', hasMeta: !!value?.meta, hasResult: !!value?.result, resultOk: value?.result?.status === 'OK', resultAnswered: value?.result?.status === 'ANSWERED', resultInsufficientEvidence: value?.result?.status === 'INSUFFICIENT_EVIDENCE', aiErrorVisible: await page.locator('.ai-error:visible').count() > 0, resultHeadingCount: await heading(page, 'AI 생성 결과').count() });
    ensure(value.meta?.provider === 'mock' && value.meta?.mock === true && value.meta?.externalTransfer === false, 'NON_MOCK_LLM_RESPONSE');
    await expect(heading(page, 'AI 생성 결과')).toBeVisible();
  }
  async function handle(page, screen) {
    if (screen.id.startsWith('payroll') || screen.id.startsWith('payslip') || screen.id === 'salary-setting') await ensurePayroll();
    // Resolve again after lazy payroll preparation provides payslipId.
    const resolvedPath = screen.path.replace(/\{([A-Za-z]+)\}/g, (_, key) => { ensure(state[key] !== undefined, 'UNRESOLVED_SCREEN_PATH'); return String(state[key]); });
    await goto(page, resolvedPath);
    switch (screen.id) {
      case 'dashboard': await expect(heading(page, '대시보드')).toBeVisible(); break;
      case 'employee-list': await expect(heading(page, '사원 관리')).toBeVisible(); await expect(page.locator('tbody tr').first()).toBeVisible(); break;
      case 'employee-detail': await expect(heading(page, '기본 정보')).toBeVisible(); break;
      case 'employee-create': await expect(page.getByLabel('초기 비밀번호 *', { exact: true })).toHaveValue(''); break;
      case 'employee-appointment':
        await exactButton(page, '발령 등록').click(); await page.getByLabel('발령 사유 *').fill('합성 포트폴리오 발령 미리보기'); await expect(page.getByRole('dialog')).toBeVisible(); break;
      case 'departments': await expect(heading(page, '부서 목록')).toBeVisible(); break;
      case 'positions': await expect(heading(page, '직급 목록')).toBeVisible(); break;
      case 'job-titles': await expect(heading(page, '직책 목록')).toBeVisible(); break;
      case 'organization': await expect(heading(page, '부서 계층')).toBeVisible(); break;
      case 'xlsx-import': await expect(heading(page, '엑셀 가져오기')).toBeVisible(); break;
      case 'xlsx-import-result': {
        ensure(!state.importDone, 'IMPORT_ALREADY_PERFORMED');
        const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet('employees');
        sheet.addRow(['employeeNo', 'name', 'email', 'phone', 'hireDate', 'departmentId', 'positionId', 'role', 'initialPassword']);
        sheet.addRow([credentials.IMPORT.loginId, '합성 가져오기 사원', 'portfolio.import@example.invalid', '', offsetDay(state.today, -366), state.departmentId, state.positionId, 'EMPLOYEE', credentials.IMPORT.password]);
        const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
        try {
          await page.getByLabel('사원 등록 파일').setInputFiles({ name: 'portfolio-import.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer });
          await exactButton(page, '등록 내용 확인').click();
          const completion = page.waitForResponse(response => response.url() === `${apiBase}/employees/import` && response.request().method() === 'POST').catch(() => undefined);
          await exactButton(page, '전체 등록').click(); const response = await completion; ensure(response?.status() === 201, 'IMPORT_HTTP_FAILED');
          await expect(page.getByText(/명을 등록했습니다/)).toBeVisible(); state.importDone = true; journal('xlsx-ui-import', 'POST', '/employees/import', 201);
        } finally { buffer.fill(0); }
        break;
      }
      case 'audit': await expect(heading(page, '감사 로그')).toBeVisible(); await expect(page.locator('.audit-list .audit-row').first()).toBeVisible(); break;
      case 'attendance-admin':
        await page.getByLabel('사원 ID', { exact: true }).fill(String(state.employeeId)); await exactButton(page, '사원 조회').click(); await expect(page.getByText('합성 포트폴리오 사원', { exact: false }).first()).toBeVisible(); break;
      case 'leave-approvals': await expect(heading(page, '결재 목록')).toBeVisible(); break;
      case 'leave-approval-detail': await exactButton(page, '승인').click(); await expect(page.getByRole('dialog')).toBeVisible(); break;
      case 'payroll-list': await expect(heading(page, '급여 관리')).toBeVisible(); break;
      case 'payroll-generate': await page.getByLabel('생성할 월').fill(state.draftMonth); break;
      case 'salary-setting': await page.getByLabel('사원 ID', { exact: true }).fill(String(state.employeeId)); await exactButton(page, '사원 조회').click(); await expect(page.getByLabel('기본급 (원)')).toBeVisible(); break;
      case 'payroll-draft': await expect(exactButton(page, '재계산')).toBeVisible(); break;
      case 'payroll-confirm': await exactButton(page, '월 전체 확정').click(); await page.getByLabel('내용을 확인했습니다').check(); await expect(exactButton(page, '확정 실행')).toBeEnabled(); break;
      case 'evaluation-cycles': await expect(heading(page, '평가 주기 관리')).toBeVisible(); break;
      case 'evaluation-draft':
        await exactButton(page, '초안 편집').click(); await exactButton(page, '1 대상 사원 ID 확인').click(); await exactButton(page, '1 평가자 ID 확인').click(); await expect(page.getByText(/합성 포트폴리오 사원/).first()).toBeVisible(); break;
      case 'evaluation-open': await expect(exactButton(page, '평가자 변경')).toBeVisible(); break;
      case 'evaluation-manager':
        await page.getByLabel('업무 수행 점수', { exact: true }).selectOption('5'); await page.getByLabel('업무 수행 코멘트', { exact: true }).fill('합성 관리자 평가 입력 예시'); break;
      case 'ai-search-proposal':
        await aiLocatorDiagnostic('OPEN_DISCLOSURE', page.getByText('자연어로 필터 제안 (AI)', { exact: true }));
        await page.getByText('자연어로 필터 제안 (AI)', { exact: true }).click();
        await aiLocatorDiagnostic('FILL_QUESTION', page.getByLabel('필터 제안 질문'));
        await page.getByLabel('필터 제안 질문').fill('재직 중인 사원을 이름순으로');
        await aiRun(page, 'employee-search', () => exactButton(page, 'AI로 필터 제안').click());
        await aiLocatorDiagnostic('APPLY_VISIBLE', exactButton(page, '제안 적용'));
        await expect(exactButton(page, '제안 적용')).toBeVisible(); break;
      case 'attendance-self': await expect(heading(page, '출퇴근·근태')).toBeVisible(); break;
      case 'leave-request':
        await page.getByLabel('시작일 *', { exact: true }).fill(state.pendingDate); await page.getByLabel('종료일 *', { exact: true }).fill(state.pendingDate); await page.getByLabel('신청 사유 *', { exact: true }).fill('합성 휴가 신청 입력 예시 · 제출하지 않음'); break;
      case 'leave-pending': await expect(heading(page, '휴가 신청 상세')).toBeVisible(); break;
      case 'notifications': await page.getByRole('button', { name: /^알림 .*미읽음$/ }).click(); await expect(heading(page, '내 알림')).toBeVisible(); await expect(page.locator('.notification-list li').first()).toBeVisible(); break;
      case 'payslip-list': await expect(heading(page, '내 급여명세서')).toBeVisible(); await expect(page.locator('tbody tr').first()).toBeVisible(); break;
      case 'payslip-detail': await expect(heading(page, '급여명세서')).toBeVisible(); await expect(page.locator('.pay-net')).toBeVisible(); break;
      case 'evaluation-self': await page.getByLabel('업무 수행 점수', { exact: true }).selectOption('4'); await page.getByLabel('업무 수행 코멘트', { exact: true }).fill('합성 자기평가 입력 예시'); break;
      case 'evaluation-result': await expect(heading(page, '최종 등급')).toBeVisible(); break;
      case 'ai-summary':
        await aiLocatorDiagnostic('OPEN_DISCLOSURE', page.getByText('AI 코멘트 요약 (참고용 · 읽기 전용)', { exact: true }));
        await page.getByText('AI 코멘트 요약 (참고용 · 읽기 전용)', { exact: true }).click(); await aiRun(page, 'evaluation-summary', () => exactButton(page, 'AI로 요약 만들기').click()); await expect(heading(page, '자기평가·관리자 코멘트 요약')).toBeVisible(); break;
      case 'policy-qa': case 'policy-no-evidence':
        await page.getByLabel('규정 질문').fill(screen.id === 'policy-qa' ? '오전 반차일의 출근 기준은 언제인가요?' : '외계 행성 출장 규정은?');
        await aiRun(page, 'policy-qa', () => exactButton(page, 'AI로 답변 찾기').click()); await expect(heading(page, screen.id === 'policy-qa' ? '답변' : '답변할 수 없음')).toBeVisible(); break;
      default: fail('SCREEN_HANDLER_MISSING');
    }
  }
  async function capture(page, screen, viewportName) {
    await expect(page.getByText(/불러오는 중…|설정 확인 중…/)).toHaveCount(0);
    await ensureNoUnsafeVisibleText(page);
    await page.evaluate(async () => { window.scrollTo(0, 0); await document.fonts.ready; await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))); });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    ensure(!overflow, 'HORIZONTAL_PAGE_OVERFLOW');
    if (screen.id === 'login') {
      ensure(await page.getByText('목업 데모 모드', { exact: true }).count() === 0, 'MOCK_FETCH_FORBIDDEN');
      await expect(page.getByLabel('아이디 (사번)', { exact: true })).toHaveValue(''); await expect(page.getByLabel('비밀번호', { exact: true })).toHaveValue('');
    } else {
      await expect(page.locator('.sidebar-bottom')).toHaveText('실제 API 모드');
      if (screen.id.startsWith('ai-') || screen.id.startsWith('policy-')) await expect(page.getByLabel('Mock 결과, 실제 추론 아님').first()).toBeVisible();
      if (screen.id.startsWith('payroll') || screen.id.startsWith('payslip') || screen.id === 'salary-setting') await expect(page.getByText('포트폴리오용 데모 급여 — 실제 세법·4대보험 산정 아님', { exact: true }).first()).toBeVisible();
    }
    const masks = [page.locator('.workspace > header > span')];
    if (screen.id !== 'login') masks.push(page.locator('input[type="password"]'));
    for (const value of privateValues) if (value) masks.push(page.getByText(new RegExp(escapeRegex(value))));
    for (const field of await page.locator('input:not([type="file"]), textarea').all()) {
      const value = await field.inputValue(); if (value && [...privateValues].some(secret => secret && value.includes(secret))) masks.push(field);
    }
    const filename = screen.filename.replace('{viewport}', viewportName); const target = resolve(output, filename);
    ensure(target.startsWith(`${output}${sep}`), 'SCREEN_OUTPUT_PATH_INVALID');
    const buffer = await page.screenshot({ path: target, fullPage: screen.fullPage, animations: 'disabled', caret: 'hide', mask: masks, maskColor: '#334155' });
    manifest.captures.push({ screenId: screen.id, role: screen.role, authenticated: screen.authenticated !== false, routeTemplate: screen.path,
      scenario: screen.scenario, viewport: plan.viewports[viewportName], viewportName, fullPage: screen.fullPage,
      file: `${runId}/${filename}`, sha256: digest(buffer), capturedAt: new Date().toISOString(),
      sourceCommit: source.sourceCommit, frontendMode: 'real-api', provider: 'mock', llmMock: true, actualInference: false,
      credentialAndIdentityMasking: true, humanReview: 'pending',
    });
    await saveManifest();
  }
  async function ensureNoUnsafeVisibleText(page) {
    const body = await page.locator('body').innerText();
    ensure(!/eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|sk-ant-[A-Za-z0-9_-]+|Bearer\s+[A-Za-z0-9_.-]+/i.test(body), 'TOKEN_OR_KEY_VISIBLE');
    ensure(!/[A-Z]:\\(?:Users|portfolio|Windows)|\/(?:Users|home)\//i.test(body), 'LOCAL_PATH_VISIBLE');
    ensure(await page.locator('.error:visible, [role="alert"]:visible').count() === 0, 'UNEXPECTED_UI_ERROR_VISIBLE');
  }
  async function recordScreenFailure(screen, viewportName, error) {
    manifest.screenFailures.push({ screenId: screen.id, viewportName, role: screen.role, step, aiStage: manifest.aiDiagnosticStage, code: error instanceof CaptureFailure ? error.code : 'CAPTURE_ACTION_FAILED', at: new Date().toISOString() });
    await saveManifest();
  }
  const singleAi = process.env.PORTFOLIO_SINGLE_AI === '1';
  try {
    await saveManifest();
    if (singleAi) {
      step = 'SINGLE_AI_AUTH'; await authenticate('ADMIN');
      const employee = await authenticate('EMPLOYEE');
      const forms = await json(employee.context, 'GET', '/evaluations/me?page=0&size=100');
      const finalized = forms.content.filter(form => form.state === 'FINALIZED');
      ensure(finalized.length === 1, 'SINGLE_FINALIZED_EVALUATION_REQUIRED'); state.resultEvaluationId = id(finalized[0].id);
      manifest.retryScope = ['ai-search-proposal', 'ai-summary']; manifest.controlledAttempt = 3;
      manifest.captureScriptSha256 = digest(await readFile(fileURLToPath(import.meta.url)));
    }
    else await prepare();
    step = 'BROWSER_LAUNCH';
    browser = await chromium.launch({ headless: true, ...(process.env.PORTFOLIO_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PORTFOLIO_CHROMIUM_EXECUTABLE_PATH } : {}) });
    for (const [viewportName, viewport] of Object.entries(plan.viewports)) {
      const publicContext = await browser.newContext({ viewport, locale: 'ko-KR', timezoneId: 'Asia/Seoul', serviceWorkers: 'block', acceptDownloads: false }); contexts.push(publicContext);
      const publicPage = await publicContext.newPage(); publicPage.setDefaultTimeout(30000);
      const loginScreen = plan.screens.find(screen => screen.id === 'login' && screen.viewports.includes(viewportName));
      if (loginScreen && !singleAi) { step = `SCREEN_login_${viewportName}`; try { await publicPage.goto(`${uiBase}/login`); await expect(heading(publicPage, 'EMS 로그인')).toBeVisible(); await capture(publicPage, loginScreen, viewportName); } catch (error) { await recordScreenFailure(loginScreen, viewportName, error); } }
      await publicContext.close();
      for (const role of ['ADMIN', 'EMPLOYEE']) {
        const context = await browser.newContext({ viewport, locale: 'ko-KR', timezoneId: 'Asia/Seoul', serviceWorkers: 'block', acceptDownloads: false }); contexts.push(context);
        const page = await context.newPage(); page.setDefaultTimeout(30000); page.setDefaultNavigationTimeout(30000);
        step = `UI_AUTH_${role}_${viewportName}`; await uiLogin(page, role);
        for (const screen of plan.screens.filter(screen => screen.id !== 'login' && screen.role === role && screen.viewports.includes(viewportName))) {
          if (singleAi && !['ai-search-proposal', 'ai-summary'].includes(screen.id)) continue;
          step = `SCREEN_${screen.id}_${viewportName}`; delete manifest.aiDiagnosticStage;
          try { await handle(page, screen); await capture(page, screen, viewportName); }
          catch (error) { await recordScreenFailure(screen, viewportName, error); }
        }
        await context.close();
      }
    }
    const expected = plan.screens.reduce((total, screen) => total + screen.viewports.length, 0);
    manifest.plannedScreenCount = plan.screens.length; manifest.actualPngCount = manifest.captures.length;
    manifest.missingCaptures = plan.screens.flatMap(screen => screen.viewports.filter(viewport => !manifest.captures.some(capture => capture.screenId === screen.id && capture.viewportName === viewport)).map(viewport => ({ screenId: screen.id, viewport, code: manifest.screenFailures.find(failure => failure.screenId === screen.id && failure.viewportName === viewport)?.code ?? (singleAi ? 'OUTSIDE_SINGLE_SCREEN_RETRY' : 'NOT_CAPTURED') })));
    manifest.singleScreenRetry = singleAi;
    manifest.status = singleAi ? (manifest.captures.length === 4 ? 'affected-ai-screens-captured-awaiting-review' : 'affected-ai-screens-partial') : manifest.captures.length === expected ? 'captured-awaiting-human-review' : 'partial-awaiting-human-review'; manifest.completedAt = new Date().toISOString(); await saveManifest();
    console.log(JSON.stringify({ status: manifest.status, runId, images: manifest.captures.length }));
  } catch (error) {
    manifest.status = 'failed-incomplete'; manifest.failure = { step, code: error instanceof CaptureFailure ? error.code : 'CAPTURE_ACTION_FAILED', at: new Date().toISOString() };
    try { await saveManifest(); } catch { /* No raw path/error output. */ }
    throw error;
  } finally {
    for (const context of contexts) { try { await context.close(); } catch {} }
    if (browser) { try { await browser.close(); } catch {} }
    for (const context of apiContexts) { try { await context.dispose(); } catch {} }
    privateValues.clear();
  }
}
main().catch(error => {
  console.error(JSON.stringify({ status: 'failed', step, code: error instanceof CaptureFailure ? error.code : 'CAPTURE_ACTION_FAILED' }));
  process.exitCode = 1;
});
