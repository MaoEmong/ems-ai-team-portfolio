import type { Department, Employee } from './types';
import { clone, fail, json, page, positiveId, validDate } from './mock-phase2';

// Contract v1.1 SHA256: 9A56EAD34B8E4B8134FBD3A8E92B4D0F3FCFAFAF22495EC0D5ACB20AA6F0B3B2.
export interface MockJobTitle { id: number; name: string; description?: string | null }
export type MockDepartment = Department & { parentId?: number | null };
export type MockEmployee = Employee & { jobTitle?: Pick<MockJobTitle, 'id' | 'name'> | null };
export type AuditTarget3B = 'JOB_TITLE' | 'SALARY_SETTING' | 'PAYROLL' | 'EVALUATION_CYCLE' | 'EVALUATION';
export type Audit3B = (actor: Employee, action: string, targetType: AuditTarget3B | 'DEPARTMENT', before: object | null, after: object | null, metadata: Record<string, unknown>, target: { id: number; label: string }) => void;
interface State {
  employees: MockEmployee[]; departments: () => MockDepartment[]; jobTitles: MockJobTitle[];
  departmentInUse: (id: number) => boolean; jobTitleInUse: (id: number) => boolean;
  audit: Audit3B; clock?: () => Date; seed?: boolean;
  // Test-only commit boundary; no HTTP backdoor or claim of a DB lock.
  beforePayrollCommit?: (month: string) => Promise<void>;
}
type Identity = Pick<Employee, 'id' | 'employeeNo' | 'name'>;
interface Salary { employeeId: number; baseSalary: number; allowance: number; formulaVersion: 'DEMO_V1'; deductionRates: number[] }
type PayrollStatus = 'DRAFT' | 'CONFIRMED';
interface Payslip {
  id: number; month: string; status: PayrollStatus; employee: Identity;
  department: { id: number; name: string }; position: Employee['position']; jobTitle: MockEmployee['jobTitle'];
  baseSalary: number; allowance: number; grossPay: number; deductions: { name: string; rateBps: number; amount: number }[];
  totalDeductions: number; netPay: number; formulaVersion: 'DEMO_V1'; generatedAt: string; generatedBy: { id: number; name: string };
  confirmedAt: string | null; confirmedBy: { id: number; name: string } | null; demoNotice: string;
}
interface Payroll { id: number; month: string; status: PayrollStatus; slips: Payslip[]; generatedAt: string; generatedBy: { id: number; name: string }; confirmedAt: string | null; confirmedBy: { id: number; name: string } | null }
interface Item { id: number; name: string; sortOrder: number }
interface Assignment { employeeId: number; reviewerId: number }
interface Cycle { id: number; name: string; startDate: string; endDate: string; status: 'DRAFT' | 'OPEN' | 'CLOSED'; items: Item[]; assignments: Assignment[] }
interface Answer { itemId: number; score: number | null; comment: string | null }
interface Evaluation { id: number; cycleId: number; employee: Identity; reviewer: Identity; items: Item[]; state: 'SELF_DRAFT' | 'SELF_SUBMITTED' | 'MANAGER_DRAFT' | 'FINALIZED'; selfAnswers: Answer[]; managerAnswers: Answer[]; finalScore: number | null; grade: string | null }
export const demoNotice = '포트폴리오용 데모 급여 — 실제 세법·4대보험 산정 아님';
const rates = [450, 350, 300];
const identity = (e: Employee): Identity => ({ id: e.id, employeeNo: e.employeeNo, name: e.name });
const operator = (e: Employee) => ({ id: e.id, name: e.name });
const nameValid = (v: unknown, max = 100): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const descriptionValid = (v: unknown) => v == null || (typeof v === 'string' && v.length <= 500);
const inputObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export function payrollAmounts(baseSalary: number, allowance: number) {
  const grossPay = baseSalary + allowance;
  // Integer arithmetic stays below 9e15; each deduction rounds independently.
  const deductions = rates.map((rateBps, i) => ({ name: `데모 공제 ${i + 1}`, rateBps, amount: Math.floor((grossPay * rateBps + 5000) / 10000) }));
  const totalDeductions = deductions.reduce((n, item) => n + item.amount, 0);
  return { grossPay, deductions, totalDeductions, netPay: grossPay - totalDeductions };
}
export function evaluationResult(scores: number[]) {
  const sum = scores.reduce((a, b) => a + b, 0);
  const hundredths = Math.floor((sum * 200 + scores.length) / (scores.length * 2));
  const finalScore = hundredths / 100;
  const grade = finalScore >= 4.5 ? 'S' : finalScore >= 3.5 ? 'A' : finalScore >= 2.5 ? 'B' : finalScore >= 1.5 ? 'C' : 'D';
  return { finalScore, grade };
}

export function createPhase3b(state: State) {
  const clock = state.clock ?? (() => new Date());
  const local = () => new Date(clock().getTime() + 9 * 3600000).toISOString();
  const today = () => local().slice(0, 10);
  const instant = () => local().slice(0, 19) + '+09:00';
  const salaries = new Map<number, Salary>(), payrolls = new Map<string, Payroll>();
  const cycles: Cycle[] = [], evaluations: Evaluation[] = [], payrollBusy = new Set<string>();
  let payrollId = 0, slipId = 0, cycleId = 0, itemId = 0, evaluationId = 0;
  const employee = (id: number) => state.employees.find(e => e.id === id);
  const activeReviewer = (id: number) => { const e = employee(id); return !!e && e.role === 'ADMIN' && e.status === 'ACTIVE' && e.hireDate <= today(); };
  const error = (code: string, status = 409, field?: string) => fail(code, status, field);
  const audit = (me: Employee, action: string, targetType: AuditTarget3B | 'DEPARTMENT', before: object | null, after: object | null, metadata: Record<string, unknown>, id: number, label = '') => state.audit(me, action, targetType, before, after, metadata, { id, label });
  const monthValid = (value: unknown): value is string => typeof value === 'string' && /^(19\d\d|[2-9]\d{3})-(0[1-9]|1[0-2])$/.test(value) && value <= today().slice(0, 7);
  const ordered = <T extends { id: number; name: string }>(rows: T[]) => [...rows].sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);
  const titleView = (e: MockEmployee) => e.jobTitle ? { id: e.jobTitle.id, name: e.jobTitle.name } : null;
  const deptView = (d: MockDepartment) => ({ id: d.id, name: d.name, description: d.description ?? null, parentId: d.parentId ?? null });
  function payrollDto(p: Payroll) { return { month: p.month, status: p.status, count: p.slips.length, generatedAt: p.generatedAt, generatedBy: clone(p.generatedBy), confirmedAt: p.confirmedAt, confirmedBy: clone(p.confirmedBy), allowedActions: p.status === 'DRAFT' ? ['RECALCULATE', 'CONFIRM'] : [] }; }
  function cycleDto(c: Cycle) { return { ...clone(c), allowedActions: c.status === 'DRAFT' ? ['EDIT', 'OPEN'] : c.status === 'OPEN' ? ['CLOSE'] : [] }; }
  function cycleDetail(c: Cycle) {
    const assignments = c.assignments.map((assignment, assignmentOrder) => {
      const evaluation = evaluations.find(e => e.cycleId === c.id && e.employee.id === assignment.employeeId);
      return {
        evaluationId: evaluation?.id ?? null,
        employee: identity(employee(assignment.employeeId)!),
        reviewer: identity(employee(assignment.reviewerId)!),
        state: evaluation?.state ?? null,
        incomplete: c.status === 'CLOSED' && !!evaluation && evaluation.state !== 'FINALIZED',
        allowedActions: c.status === 'OPEN' && evaluation && evaluation.state !== 'FINALIZED' ? ['REASSIGN_REVIEWER'] : [],
        assignmentOrder,
      };
    }).sort((a, b) => a.employee.employeeNo.localeCompare(b.employee.employeeNo) || a.assignmentOrder - b.assignmentOrder)
      .map(({ assignmentOrder: _order, ...summary }) => summary);
    return { ...cycleDto(c), assignments };
  }
  function cycleBrief(c: Cycle) { return { id: c.id, name: c.name, status: c.status, startDate: c.startDate, endDate: c.endDate }; }
  function evaluationActions(e: Evaluation, me: Employee, management = false) {
    const c = cycles.find(c => c.id === e.cycleId)!;
    if (c.status !== 'OPEN' || e.state === 'FINALIZED') return [];
    if (management && me.role === 'ADMIN') return ['REASSIGN_REVIEWER'];
    if (e.employee.id === me.id && e.state === 'SELF_DRAFT') return ['SAVE_SELF', 'SUBMIT_SELF'];
    if (e.reviewer.id === me.id && activeReviewer(me.id) && ['SELF_SUBMITTED', 'MANAGER_DRAFT'].includes(e.state)) return ['SAVE_MANAGER', 'SUBMIT_MANAGER'];
    return [];
  }
  function evaluationSummary(e: Evaluation, me: Employee, management = false) {
    const c = cycles.find(c => c.id === e.cycleId)!;
    return { id: e.id, cycle: cycleBrief(c), employee: clone(e.employee), reviewer: clone(e.reviewer), state: e.state, incomplete: c.status === 'CLOSED' && e.state !== 'FINALIZED', allowedActions: evaluationActions(e, me, management) };
  }
  function evaluationDetail(e: Evaluation, me: Employee) {
    const result = { ...evaluationSummary(e, me), items: clone(e.items), selfAnswers: clone(e.selfAnswers) };
    return e.employee.id === me.id && e.state !== 'FINALIZED' ? result : { ...result, managerAnswers: clone(e.managerAnswers), finalScore: e.finalScore, grade: e.grade };
  }
  function cycleInput(body: Record<string, unknown>): { name: string; startDate: string; endDate: string; items: Omit<Item, 'id'>[]; assignments: Assignment[] } | Response {
    if (!nameValid(body.name) || !validDate(body.startDate) || !validDate(body.endDate) || body.startDate > body.endDate) return error('VALIDATION_ERROR', 400);
    if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 20 || !Array.isArray(body.assignments) || !body.assignments.length) return error('VALIDATION_ERROR', 400);
    const items: Omit<Item, 'id'>[] = [], assignments: Assignment[] = [];
    const orders = new Set<number>(), assigned = new Set<number>();
    for (const item of body.items) {
      if (!inputObject(item) || !nameValid(item.name) || typeof item.sortOrder !== 'number' || !Number.isInteger(item.sortOrder) || item.sortOrder < 0 || item.sortOrder > 10000 || orders.has(item.sortOrder)) return error('VALIDATION_ERROR', 400);
      orders.add(item.sortOrder); items.push({ name: item.name, sortOrder: item.sortOrder });
    }
    for (const assignment of body.assignments) {
      if (!inputObject(assignment) || !positiveId(assignment.employeeId) || !positiveId(assignment.reviewerId)) return error('VALIDATION_ERROR', 400);
      const targetId = assignment.employeeId as number, reviewerId = assignment.reviewerId as number, target = employee(targetId);
      if (assigned.has(targetId)) return error('VALIDATION_ERROR', 400);
      if (targetId === reviewerId) return error('FORBIDDEN', 403);
      if (!target) return error('NOT_FOUND', 404);
      if (!['ACTIVE', 'ON_LEAVE'].includes(target.status) || target.hireDate > today()) return error('VALIDATION_ERROR', 400);
      if (!activeReviewer(reviewerId)) return error('EVALUATION_REVIEWER_INVALID');
      assigned.add(targetId); assignments.push({ employeeId: targetId, reviewerId });
    }
    return { name: body.name, startDate: body.startDate, endDate: body.endDate, items: items.sort((a, b) => a.sortOrder - b.sortOrder), assignments: assignments.sort((a, b) => a.employeeId - b.employeeId) };
  }
  function openCycle(c: Cycle) {
    for (const a of c.assignments) evaluations.push({ id: ++evaluationId, cycleId: c.id, employee: identity(employee(a.employeeId)!), reviewer: identity(employee(a.reviewerId)!), items: clone(c.items), state: 'SELF_DRAFT', selfAnswers: [], managerAnswers: [], finalScore: null, grade: null });
    c.status = 'OPEN';
  }
  function answersInput(value: unknown, e: Evaluation, submit: boolean): Answer[] | Response {
    if (!Array.isArray(value)) return error('VALIDATION_ERROR', 400, 'answers');
    const found = new Set<number>(), answers: Answer[] = [];
    for (const a of value) {
      if (!inputObject(a) || typeof a.itemId !== 'number' || !e.items.some(i => i.id === a.itemId) || found.has(a.itemId)) return error('VALIDATION_ERROR', 400, 'answers');
      if (a.score != null && (typeof a.score !== 'number' || !Number.isInteger(a.score) || a.score < 1 || a.score > 5)) return error('VALIDATION_ERROR', 400, 'answers');
      if (submit && a.score == null) return error('VALIDATION_ERROR', 400, 'answers');
      if (a.comment != null && (typeof a.comment !== 'string' || a.comment.length > 1000)) return error('VALIDATION_ERROR', 400, 'answers');
      found.add(a.itemId); answers.push({ itemId: a.itemId, score: a.score == null ? null : a.score as number, comment: a.comment == null ? null : a.comment as string });
    }
    if (submit && found.size !== e.items.length) return error('VALIDATION_ERROR', 400, 'answers');
    return answers.sort((a, b) => e.items.findIndex(i => i.id === a.itemId) - e.items.findIndex(i => i.id === b.itemId));
  }
  function makeSlips(month: string, me: Employee): Payslip[] | Response {
    const first = month + '-01', end = new Date(first + 'T00:00:00Z'); end.setUTCMonth(end.getUTCMonth() + 1); end.setUTCDate(0);
    const last = end.toISOString().slice(0, 10);
    const targets = state.employees.filter(e => e.hireDate <= last && (e.retireDate === null || e.retireDate >= first)).sort((a, b) => a.employeeNo.localeCompare(b.employeeNo) || a.id - b.id);
    if (!targets.length) return error('VALIDATION_ERROR', 400);
    if (targets.some(e => !salaries.has(e.id))) return error('SALARY_SETTING_MISSING');
    return targets.map<Payslip>((e, i) => {
      const setting = salaries.get(e.id)!;
      return { id: slipId + i + 1, month, status: 'DRAFT', employee: identity(e), department: { id: e.department.id, name: e.department.name }, position: clone(e.position), jobTitle: clone(titleView(e)), baseSalary: setting.baseSalary, allowance: setting.allowance, ...payrollAmounts(setting.baseSalary, setting.allowance), formulaVersion: 'DEMO_V1', generatedAt: instant(), generatedBy: operator(me), confirmedAt: null, confirmedBy: null, demoNotice };
    });
  }
  async function payrollMutation(month: string, action: 'GENERATE' | 'RECALCULATE' | 'CONFIRM', me: Employee): Promise<Response> {
    if (payrollBusy.has(month)) return error('PAYROLL_BUSY');
    payrollBusy.add(month);
    try {
      const prior = payrolls.get(month);
      if (action === 'GENERATE' && prior) return error('PAYROLL_ALREADY_EXISTS');
      if (action !== 'GENERATE' && !prior) return error('NOT_FOUND', 404);
      if (prior?.status === 'CONFIRMED') return error('PAYROLL_CONFIRMED');
      const slips = action === 'CONFIRM' ? undefined : makeSlips(month, me);
      if (slips instanceof Response) return slips;
      await (state.beforePayrollCommit?.(month) ?? Promise.resolve());
      const timestamp = instant();
      const next: Payroll = action === 'CONFIRM' ? clone(prior!) : { id: prior?.id ?? payrollId + 1, month, status: 'DRAFT', slips: slips!, generatedAt: timestamp, generatedBy: operator(me), confirmedAt: null, confirmedBy: null };
      if (action === 'CONFIRM') { next.status = 'CONFIRMED'; next.confirmedAt = timestamp; next.confirmedBy = operator(me); next.slips.forEach(s => { s.status = 'CONFIRMED'; s.confirmedAt = timestamp; s.confirmedBy = operator(me); }); }
      audit(me, `PAYROLL_${action}`, 'PAYROLL', prior ? { status: prior.status } : null, { status: next.status }, { month, count: next.slips.length }, next.id, month);
      payrolls.set(month, next);
      if (!prior) payrollId++;
      if (slips) slipId += slips.length;
      return json(payrollDto(next), action === 'GENERATE' ? 201 : 200);
    } finally { payrollBusy.delete(month); }
  }
  async function handle(url: URL, method: string, body: Record<string, unknown>, me: Employee): Promise<Response | undefined> {
    const path = url.pathname.replace('/api/v1', ''), q = url.searchParams;
    const settingMatch = path.match(/^\/employees\/(\d+)\/salary-setting$/);
    if (!/^\/(organization|departments|job-titles|payrolls|payslips|evaluation-cycles|evaluations)(\/|$)/.test(path) && !settingMatch) return;
    if (path === '/organization' && method === 'GET') return json({ departments: ordered(state.departments()).map(d => ({ id: d.id, name: d.name, parentId: d.parentId ?? null })), employees: state.employees.filter(e => e.status === 'ACTIVE' || e.status === 'ON_LEAVE').sort((a, b) => a.employeeNo.localeCompare(b.employeeNo) || a.id - b.id).map(e => ({ ...identity(e), department: { id: e.department.id, name: e.department.name }, position: clone(e.position), jobTitle: titleView(e), onLeave: e.status === 'ON_LEAVE' })) });
    const catalogMatch = path.match(/^\/(departments|job-titles)(?:\/(\d+))?$/);
    if (catalogMatch) {
      const resource = catalogMatch[1], isDepartment = resource === 'departments', id = Number(catalogMatch[2]);
      const list: (MockDepartment | MockJobTitle)[] = isDepartment ? state.departments() : state.jobTitles;
      if (method === 'GET' && !catalogMatch[2]) return json(ordered(list).map(item => isDepartment ? deptView(item as MockDepartment) : { id: item.id, name: item.name, description: item.description ?? null }));
      if (me.role !== 'ADMIN') return error('FORBIDDEN', 403);
      const existing = list.find(item => item.id === id);
      if (catalogMatch[2] && !existing) return error('NOT_FOUND', 404);
      const type = isDepartment ? 'DEPARTMENT' : 'JOB_TITLE';
      if (method === 'DELETE' && existing) {
        if (isDepartment && state.departments().some(d => d.parentId === id)) return error('DEPARTMENT_HAS_CHILDREN');
        if (isDepartment ? state.departmentInUse(id) : state.employees.some(e => e.jobTitle?.id === id) || state.jobTitleInUse(id)) return error(isDepartment ? 'DEPARTMENT_IN_USE' : 'JOB_TITLE_IN_USE');
        audit(me, `${type}_DELETE`, type, isDepartment ? deptView(existing as MockDepartment) : existing, null, {}, existing.id, existing.name);
        list.splice(list.indexOf(existing), 1); return new Response(null, { status: 204 });
      }
      if ((method === 'POST' && !catalogMatch[2]) || (method === 'PUT' && existing)) {
        if (!nameValid(body.name) || !descriptionValid(body.description)) return error('VALIDATION_ERROR', 400);
        if (list.some(item => item.id !== id && item.name === body.name)) return error('DUPLICATE_NAME');
        const parentId = body.parentId ?? null;
        if (isDepartment) {
          if (parentId !== null && !positiveId(parentId)) return error('VALIDATION_ERROR', 400, 'parentId');
          if (parentId !== null && !state.departments().some(d => d.id === parentId)) return error('NOT_FOUND', 404);
          let ancestor = parentId as number | null;
          const visited = new Set<number>();
          while (ancestor !== null) {
            if (ancestor === id || visited.has(ancestor)) return error('DEPARTMENT_CYCLE');
            visited.add(ancestor); ancestor = state.departments().find(d => d.id === ancestor)?.parentId ?? null;
          }
        }
        const next = { id: existing?.id ?? Math.max(0, ...list.map(i => i.id)) + 1, name: body.name, description: body.description as string | null | undefined, ...(isDepartment ? { parentId: parentId as number | null } : {}) };
        audit(me, `${type}_${existing ? 'UPDATE' : 'CREATE'}`, type, existing ? (isDepartment ? deptView(existing as MockDepartment) : existing) : null, next, {}, next.id, next.name);
        if (existing) Object.assign(existing, next);
        else if (isDepartment) state.departments().push(next as MockDepartment); else state.jobTitles.push(next);
        if (!isDepartment) for (const e of state.employees) if (e.jobTitle?.id === next.id) e.jobTitle = { id: next.id, name: next.name };
        return json(isDepartment ? deptView(next as MockDepartment) : { ...next, description: next.description ?? null }, existing ? 200 : 201);
      }
      return error('NOT_FOUND', 404);
    }
    if (settingMatch) {
      if (me.role !== 'ADMIN') return error('FORBIDDEN', 403);
      const id = Number(settingMatch[1]); if (!employee(id)) return error('NOT_FOUND', 404);
      if (method === 'GET') return salaries.has(id) ? json(salaries.get(id)) : error('NOT_FOUND', 404);
      if (method === 'PUT') {
        if (['baseSalary', 'allowance'].some(key => typeof body[key] !== 'number' || !Number.isInteger(body[key]) || (body[key] as number) < 0 || (body[key] as number) > 1000000000)) return error('VALIDATION_ERROR', 400);
        const next: Salary = { employeeId: id, baseSalary: body.baseSalary as number, allowance: body.allowance as number, formulaVersion: 'DEMO_V1', deductionRates: [...rates] };
        audit(me, 'SALARY_SETTING_UPDATE', 'SALARY_SETTING', null, null, { employeeId: id }, id);
        salaries.set(id, next); return json(next);
      }
      return error('NOT_FOUND', 404);
    }
    if (path === '/payrolls') {
      if (me.role !== 'ADMIN') return error('FORBIDDEN', 403);
      if (method === 'GET') {
        if ((q.has('month') && !monthValid(q.get('month'))) || (q.has('status') && !['DRAFT', 'CONFIRMED'].includes(q.get('status')!))) return error('VALIDATION_ERROR', 400);
        return page([...payrolls.values()].filter(p => (!q.has('month') || p.month === q.get('month')) && (!q.has('status') || p.status === q.get('status'))).sort((a, b) => b.month.localeCompare(a.month) || b.id - a.id).map(payrollDto), q);
      }
      if (method === 'POST') return monthValid(body.month) ? payrollMutation(body.month, 'GENERATE', me) : error('VALIDATION_ERROR', 400, 'month');
      return error('NOT_FOUND', 404);
    }
    const payrollMatch = path.match(/^\/payrolls\/([^/]+)(?:\/(recalculate|confirm))?$/);
    if (payrollMatch) {
      if (me.role !== 'ADMIN') return error('FORBIDDEN', 403);
      const month = payrollMatch[1]; if (!monthValid(month)) return error('VALIDATION_ERROR', 400, 'month');
      const prior = payrolls.get(month);
      if (!prior) return error('NOT_FOUND', 404);
      if (method === 'GET' && !payrollMatch[2]) return json({ payroll: payrollDto(prior), payslips: clone(prior.slips) });
      if (method === 'POST' && payrollMatch[2]) return payrollMutation(month, payrollMatch[2] === 'confirm' ? 'CONFIRM' : 'RECALCULATE', me);
      return error('NOT_FOUND', 404);
    }
    if (path === '/payslips/me' && method === 'GET') {
      if (q.has('month') && !monthValid(q.get('month'))) return error('VALIDATION_ERROR', 400, 'month');
      return page([...payrolls.values()].filter(p => p.status === 'CONFIRMED' && (!q.has('month') || p.month === q.get('month'))).flatMap(p => p.slips).filter(s => s.employee.id === me.id).sort((a, b) => b.month.localeCompare(a.month) || b.id - a.id), q);
    }
    const slipMatch = path.match(/^\/payslips\/(\d+)$/);
    if (slipMatch && method === 'GET') {
      const slip = [...payrolls.values()].flatMap(p => p.slips).find(s => s.id === Number(slipMatch[1]));
      return slip && (me.role === 'ADMIN' || (slip.employee.id === me.id && slip.status === 'CONFIRMED')) ? json(slip) : error('NOT_FOUND', 404);
    }
    if (path === '/evaluation-cycles') {
      if (me.role !== 'ADMIN') return error('FORBIDDEN', 403);
      if (method === 'GET') return page([...cycles].sort((a, b) => b.id - a.id).map(cycleDto), q);
      if (method === 'POST') {
        const value = cycleInput(body); if (value instanceof Response) return value;
        const next: Cycle = { id: cycleId + 1, name: value.name, startDate: value.startDate, endDate: value.endDate, status: 'DRAFT', items: value.items.map((item, i) => ({ id: itemId + i + 1, ...item })), assignments: value.assignments };
        audit(me, 'EVALUATION_CYCLE_CREATE', 'EVALUATION_CYCLE', null, { state: 'DRAFT' }, { cycleId: next.id }, next.id);
        cycles.push(next); cycleId++; itemId += next.items.length; return json(cycleDto(next), 201);
      }
      return error('NOT_FOUND', 404);
    }
    const cycleMatch = path.match(/^\/evaluation-cycles\/(\d+)(?:\/(open|close))?$/);
    if (cycleMatch) {
      if (me.role !== 'ADMIN') return error('FORBIDDEN', 403);
      const c = cycles.find(c => c.id === Number(cycleMatch[1])); if (!c) return error('NOT_FOUND', 404);
      if (method === 'GET' && !cycleMatch[2]) return json(cycleDetail(c));
      if (method === 'PUT' && !cycleMatch[2]) {
        if (c.status !== 'DRAFT') return error(c.status === 'CLOSED' ? 'EVALUATION_CYCLE_CLOSED' : 'EVALUATION_STATE_CONFLICT');
        const value = cycleInput(body); if (value instanceof Response) return value;
        audit(me, 'EVALUATION_CYCLE_UPDATE', 'EVALUATION_CYCLE', { state: c.status }, { state: 'DRAFT' }, { cycleId: c.id }, c.id);
        Object.assign(c, value, { items: value.items.map((item, i) => ({ id: itemId + i + 1, ...item })) }); itemId += value.items.length;
        return json(cycleDto(c));
      }
      if (method === 'POST' && cycleMatch[2]) {
        const action = cycleMatch[2];
        if (c.status === 'CLOSED') return error('EVALUATION_CYCLE_CLOSED');
        if ((action === 'open' && c.status !== 'DRAFT') || (action === 'close' && c.status !== 'OPEN')) return error('EVALUATION_STATE_CONFLICT');
        if (action === 'open') {
          const valid = cycleInput(c as unknown as Record<string, unknown>); if (valid instanceof Response) return valid;
        }
        audit(me, action === 'open' ? 'EVALUATION_CYCLE_OPEN' : 'EVALUATION_CYCLE_CLOSE', 'EVALUATION_CYCLE', { state: c.status }, { state: action === 'open' ? 'OPEN' : 'CLOSED' }, { cycleId: c.id }, c.id);
        if (action === 'open') openCycle(c); else c.status = 'CLOSED';
        return json(cycleDto(c));
      }
      return error('NOT_FOUND', 404);
    }
    if (['/evaluations/me', '/evaluations/assigned'].includes(path) && method === 'GET') {
      if (q.has('cycleId') && (!/^[1-9]\d*$/.test(q.get('cycleId')!) || !positiveId(Number(q.get('cycleId'))))) return error('VALIDATION_ERROR', 400, 'cycleId');
      const rows = evaluations.filter(e => (path === '/evaluations/me' ? e.employee.id === me.id : e.reviewer.id === me.id) && (!q.has('cycleId') || e.cycleId === Number(q.get('cycleId')))).sort((a, b) => b.id - a.id);
      return page(rows.map(e => evaluationSummary(e, me)), q);
    }
    const evaluationMatch = path.match(/^\/evaluations\/(\d+)(?:\/(self|manager|reviewer)(?:\/(submit))?)?$/);
    if (evaluationMatch) {
      const e = evaluations.find(e => e.id === Number(evaluationMatch[1])); if (!e) return error('NOT_FOUND', 404);
      const c = cycles.find(c => c.id === e.cycleId)!, action = evaluationMatch[2], submit = !!evaluationMatch[3];
      if (method === 'GET' && !action) return e.employee.id === me.id || e.reviewer.id === me.id ? json(evaluationDetail(e, me)) : error('NOT_FOUND', 404);
      if (method === 'PUT' && action === 'reviewer' && !submit) {
        if (me.role !== 'ADMIN') return error('FORBIDDEN', 403);
        if (c.status === 'CLOSED') return error('EVALUATION_CYCLE_CLOSED');
        if (e.state === 'FINALIZED') return error('EVALUATION_STATE_CONFLICT');
        if (!positiveId(body.reviewerId)) return error('VALIDATION_ERROR', 400, 'reviewerId');
        const reviewerId = body.reviewerId as number;
        if (reviewerId === e.employee.id) return error('FORBIDDEN', 403);
        if (!activeReviewer(reviewerId)) return error('EVALUATION_REVIEWER_INVALID');
        const nextState = e.state === 'MANAGER_DRAFT' ? 'SELF_SUBMITTED' : e.state;
        audit(me, 'EVALUATION_REASSIGN', 'EVALUATION', { state: e.state }, { state: nextState }, { cycleId: c.id, employeeId: e.employee.id, oldReviewerId: e.reviewer.id, newReviewerId: reviewerId }, e.id);
        e.reviewer = identity(employee(reviewerId)!); e.managerAnswers = []; e.state = nextState;
        c.assignments.find(a => a.employeeId === e.employee.id)!.reviewerId = reviewerId;
        return json(evaluationSummary(e, me, true));
      }
      if (['self', 'manager'].includes(action) && ((method === 'PUT' && !submit) || (method === 'POST' && submit))) {
        if (action === 'self' ? e.employee.id !== me.id : e.reviewer.id !== me.id) return error('NOT_FOUND', 404);
        if (action === 'manager' && e.employee.id === me.id) return error('FORBIDDEN', 403);
        if (c.status !== 'OPEN') return error('EVALUATION_CYCLE_CLOSED');
        if (action === 'manager' && !activeReviewer(me.id)) return error('EVALUATION_REVIEWER_INVALID');
        if (action === 'self' ? e.state !== 'SELF_DRAFT' : !['SELF_SUBMITTED', 'MANAGER_DRAFT'].includes(e.state)) return error('EVALUATION_STATE_CONFLICT');
        const answers = answersInput(body.answers, e, submit); if (answers instanceof Response) return answers;
        const nextState = action === 'self' ? (submit ? 'SELF_SUBMITTED' : 'SELF_DRAFT') : (submit ? 'FINALIZED' : 'MANAGER_DRAFT');
        const event = action === 'self' ? (submit ? 'EVALUATION_SELF_SUBMIT' : 'EVALUATION_SELF_SAVE') : (submit ? 'EVALUATION_MANAGER_FINALIZE' : 'EVALUATION_MANAGER_SAVE');
        audit(me, event, 'EVALUATION', { state: e.state }, { state: nextState }, { cycleId: c.id, employeeId: e.employee.id, reviewerId: e.reviewer.id }, e.id);
        if (action === 'self') e.selfAnswers = answers; else e.managerAnswers = answers;
        if (action === 'manager' && submit) Object.assign(e, evaluationResult(answers.map(a => a.score!)));
        e.state = nextState; return json(evaluationDetail(e, me));
      }
      return error('NOT_FOUND', 404);
    }
    // v1.1 exposes ADMIN assignment summaries through cycle detail only.
    return error('NOT_FOUND', 404);
  }
  function seed() {
    const admin = state.employees.find(e => activeReviewer(e.id)); if (!admin) return;
    for (const e of state.employees) salaries.set(e.id, { employeeId: e.id, baseSalary: 3000000, allowance: 100000, formulaVersion: 'DEMO_V1', deductionRates: [...rates] });
    const previous = new Date(today().slice(0, 7) + '-01T00:00:00Z'); previous.setUTCMonth(previous.getUTCMonth() - 1);
    const month = previous.toISOString().slice(0, 7), slips = makeSlips(month, admin);
    if (!(slips instanceof Response)) {
      slips.forEach(s => { s.status = 'CONFIRMED'; s.confirmedAt = instant(); s.confirmedBy = operator(admin); });
      payrolls.set(month, { id: ++payrollId, month, status: 'CONFIRMED', slips, generatedAt: instant(), generatedBy: operator(admin), confirmedAt: instant(), confirmedBy: operator(admin) }); slipId += slips.length;
    }
    const targets = state.employees.filter(e => e.id !== admin.id && ['ACTIVE', 'ON_LEAVE'].includes(e.status) && e.hireDate <= today()).slice(0, 4);
    if (!targets.length) return;
    const c: Cycle = { id: ++cycleId, name: '합성 데모 평가', startDate: today().slice(0, 4) + '-01-01', endDate: today().slice(0, 4) + '-12-31', status: 'DRAFT', items: [{ id: ++itemId, name: '업무 수행', sortOrder: 1 }, { id: ++itemId, name: '협업', sortOrder: 2 }], assignments: targets.map(e => ({ employeeId: e.id, reviewerId: admin.id })) };
    cycles.push(c); openCycle(c);
    for (const [i, e] of evaluations.entries()) {
      if (i > 0) { e.selfAnswers = e.items.map(item => ({ itemId: item.id, score: 4, comment: '합성 자기평가' })); e.state = 'SELF_SUBMITTED'; }
      if (i > 1) { e.managerAnswers = e.items.map(item => ({ itemId: item.id, score: 4, comment: '합성 관리자평가' })); e.state = 'MANAGER_DRAFT'; }
      if (i > 2) { e.state = 'FINALIZED'; Object.assign(e, evaluationResult([4, 4])); }
    }
  }
  if (state.seed) seed();
  return { handle };
}
