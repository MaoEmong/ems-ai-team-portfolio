import { createPhase3b, type MockDepartment, type MockEmployee, type MockJobTitle } from './mock-phase3b';
import { createPhase3a } from './mock-phase3a';
import { createPhase4 } from './mock-phase4';
import { readAiEvaluation } from './ai-evaluation-bridge';
import type { Department, Employee, Position } from './types';
import { clone, createPhase2, fail, filteredEmployees, json, page, positiveId, validDate } from './mock-phase2';

let departments: MockDepartment[] = [
  { id: 1, name: '개발팀', description: '서비스 개발', parentId: null },
  { id: 2, name: '운영팀', description: '서비스 운영', parentId: 1 },
];
let positions: Position[] = [{ id: 1, name: '사원', level: 1 }, { id: 2, name: '매니저', level: 2 }];
const employees: MockEmployee[] = Array.from({ length: 31 }, (_, i) => ({
  id: i + 1, employeeNo: i === 0 ? 'admin' : `EMP${String(i).padStart(3, '0')}`,
  name: i === 0 ? '데모 관리자' : `테스트 사원 ${i}`, role: i === 0 || i === 30 ? 'ADMIN' : 'EMPLOYEE',
  email: `demo${i}@example.test`, phone: '010-0000-0000', hireDate: '2026-01-01', status: 'ACTIVE',
  retireDate: null, jobTitle: null, department: departments[i % 2], position: positions[i % 2],
}));
const jobTitles: MockJobTitle[] = [{ id: 1, name: '팀장', description: '합성 직책' }, { id: 2, name: '파트장', description: '합성 직책' }];
employees[0].jobTitle = { id: 1, name: jobTitles[0].name };
const passwords = new Map(employees.map(e => [e.employeeNo, 'demo1234!']));
const sessions = new Map<string, { id: number; expires: number }>();
const phase2 = createPhase2({ employees, departments: () => departments, positions: () => positions, passwords, jobTitles: () => jobTitles });
const phase3a = createPhase3a({ employees, audit: (actor, action, targetType, before, after, metadata, target) => phase2.audit(actor, action, targetType, before, after, metadata, true, target) });
const phase3b = createPhase3b({ employees, departments: () => departments, jobTitles, departmentInUse: id => employees.some(e => e.department.id === id) || phase2.referenced('departments', id), jobTitleInUse: id => phase2.referenced('job-titles', id), audit: (actor, action, targetType, before, after, metadata, target) => phase2.audit(actor, action, targetType, before, after, metadata, true, target), seed: true });
const created = (data: { id: number }, resource: string) => {
  const response = json(data, 201); response.headers.set('Location', `/api/v1/${resource}/${data.id}`); return response;
};
const phase4 = createPhase4({
  catalogs: () => ({ departments, positions }),
  getEvaluation: async (id, actor) => {
    const employee = employees.find(e => e.id === actor.id);
    if (!employee) return null;
    const response = await phase3b.handle(new URL(`http://mock/api/v1/evaluations/${id}`), 'GET', {}, employee);
    return readAiEvaluation(response);
  },
  audit: event => {
    const actor = employees.find(e => e.id === event.actor.id);
    phase2.audit(actor, 'AI_INVOKE', null, null, null, event.metadata, event.success);
  },
});

export async function mockFetch(input: string | URL | Request, init: RequestInit = {}): Promise<Response> {
  const req = input instanceof Request ? input : undefined;
  const url = new URL(req ? req.url : String(input), 'http://localhost');
  const path = url.pathname.replace('/api/v1', '');
  const method = (init.method ?? req?.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers ?? req?.headers);
  let raw = init.body;
  if (raw === undefined && req && !['GET', 'HEAD'].includes(method)) raw = headers.get('Content-Type')?.startsWith('multipart/form-data') ? await req.clone().formData() : await req.clone().text();
  let body: Record<string, any> = {};
  if (raw && !(raw instanceof FormData)) {
    try { body = JSON.parse(String(raw)); if (!body || Array.isArray(body) || typeof body !== 'object') return fail('VALIDATION_ERROR'); }
    catch { return fail('VALIDATION_ERROR'); }
  }
  if (path === '/auth/login' && method === 'POST') {
    if (typeof body.loginId !== 'string' || typeof body.password !== 'string' || !body.loginId || !body.password) return fail('VALIDATION_ERROR');
    const e = employees.find(e => e.employeeNo === body.loginId);
    if (!e || e.status === 'RETIRED' || passwords.get(e.employeeNo) !== body.password) {
      phase2.audit(e, 'LOGIN_FAILURE', null, null, null, { reason: e?.status === 'RETIRED' ? 'DISABLED' : 'BAD_CREDENTIALS' }, false);
      return json({ code: 'UNAUTHORIZED', message: '아이디 또는 비밀번호를 확인하세요.', fieldErrors: [] }, 401);
    }
    const token = `mock-${crypto.randomUUID()}`;
    sessions.set(token, { id: e.id, expires: Date.now() + 3600000 });
    phase2.audit(e, 'LOGIN_SUCCESS');
    return json({ accessToken: token, tokenType: 'Bearer', expiresIn: 3600, user: { id: e.id, employeeNo: e.employeeNo, name: e.name, role: e.role } });
  }
  const auth = headers.get('Authorization');
  const session = auth?.startsWith('Bearer ') ? sessions.get(auth.slice(7)) : undefined;
  const me = employees.find(e => e.id === session?.id);
  if (!session || session.expires <= Date.now() || !me || me.status === 'RETIRED') return json({ code: 'UNAUTHORIZED', message: '아이디 또는 비밀번호를 확인하세요.', fieldErrors: [] }, 401);
  if (path === '/auth/me' && method === 'GET') return json({ id: me.id, employeeNo: me.employeeNo, name: me.name, role: me.role });
  const phase4Response = await phase4.handle(url, method, body, me, typeof raw === 'string' ? raw : undefined);
  if (phase4Response) return phase4Response;
  const phase3bResponse = await phase3b.handle(url, method, body, me);
  if (phase3bResponse) return phase3bResponse;
  const phase3Response = await phase3a.handle(url, method, body, me);
  if (phase3Response) return phase3Response;
  const phaseResponse = await phase2.handle(url, method, body, raw, me);
  if (phaseResponse) return phaseResponse;
  const parts = path.split('/').filter(Boolean), [resource, idText, action] = parts;
  const id = Number(idText);
  if (resource === 'employees') {
    if (me.role !== 'ADMIN' && !(method === 'GET' && id === me.id && !action)) return fail('FORBIDDEN', 403);
    if (parts.length > 3 || (action && action !== 'retire')) return fail('NOT_FOUND', 404);
    const employee = employees.find(e => e.id === id);
    if (idText && !employee) return fail('NOT_FOUND', 404);
    if (method === 'GET' && idText && !action) return json(employee);
    if (method === 'GET' && !idText) {
      const list = filteredEmployees(employees, url.searchParams);
      return list instanceof Response ? list : page(list, url.searchParams);
    }
    if (employee?.status === 'RETIRED') return fail('EMPLOYEE_RETIRED', 409);
    if (action === 'retire' && method === 'POST' && employee) {
      const last = phase2.history(id)[0];
      if (!validDate(body.retireDate) || body.retireDate < employee.hireDate || (last && body.retireDate < last.effectiveDate)) return fail('VALIDATION_ERROR', 400, 'retireDate');
      const before = clone(employee), actor = clone(me);
      employee.status = 'RETIRED'; employee.retireDate = body.retireDate; employee.jobTitle = null;
      phase3a.retire(employee, actor);
      phase2.audit(actor, 'EMPLOYEE_RETIRE', 'EMPLOYEE', before, employee);
      return json(employee);
    }
    if ((method === 'POST' && !idText) || (method === 'PUT' && employee && !action)) {
      const required = ['name', 'email', 'hireDate', 'role', ...(method === 'POST' ? ['employeeNo', 'initialPassword', 'departmentId', 'positionId'] : ['status'])];
      const errors = required.filter(k => !body[k]).map(field => ({ field, reason: '필수 입력입니다.' }));
      if (errors.length) return json({ code: 'VALIDATION_ERROR', message: '입력값을 확인하세요.', fieldErrors: errors }, 400);
      for (const [field, max] of [['name', 100], ['email', 254], ['phone', 30], ...(method === 'POST' ? [['employeeNo', 50]] : [])] as [string, number][]) {
        if (field === 'phone' && body[field] == null) continue;
        if (typeof body[field] !== 'string' || body[field].length > max || (field !== 'phone' && !body[field].trim())) return fail('VALIDATION_ERROR', 400, field);
      }
      if (!validDate(body.hireDate)) return fail('VALIDATION_ERROR', 400, 'hireDate');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) return fail('VALIDATION_ERROR', 400, 'email');
      if (!['ADMIN', 'EMPLOYEE'].includes(body.role)) return fail('VALIDATION_ERROR', 400, 'role');
      if (method === 'PUT' && !['ACTIVE', 'ON_LEAVE'].includes(body.status)) return fail('VALIDATION_ERROR', 400, 'status');
      if (method === 'POST' && (typeof body.initialPassword !== 'string' || new TextEncoder().encode(body.initialPassword).length > 72)) return fail('VALIDATION_ERROR', 400, 'initialPassword');
      for (const field of ['departmentId', 'positionId']) if (body[field] != null && !positiveId(body[field])) return fail('VALIDATION_ERROR', 400, field);
      if (employee) {
        if (body.jobTitleId != null && (!positiveId(body.jobTitleId) || body.jobTitleId !== (employee.jobTitle?.id ?? null))) return fail('APPOINTMENT_REQUIRED', 409);
        const leaveHireDateError = phase3a.hireDateError(employee.id, body.hireDate);
        if (leaveHireDateError) return leaveHireDateError;
        if ((body.departmentId != null && body.departmentId !== employee.department.id) || (body.positionId != null && body.positionId !== employee.position.id)) return fail('APPOINTMENT_REQUIRED', 409);
        const first = phase2.history(id).at(-1);
        if (first && body.hireDate > first.effectiveDate) return fail('VALIDATION_ERROR', 400, 'hireDate');
      }
      if (employees.some(e => e.id !== id && e.email === body.email)) return fail('DUPLICATE_EMAIL', 409);
      if (method === 'POST' && employees.some(e => e.employeeNo === body.employeeNo)) return fail('DUPLICATE_EMPLOYEE_NO', 409);
      const department = employee?.department ?? departments.find(d => d.id === body.departmentId);
      const position = employee?.position ?? positions.find(p => p.id === body.positionId);
      if (!department || !position) return fail('NOT_FOUND', 404);
      const data = { name: body.name, email: body.email, phone: body.phone ?? '', hireDate: body.hireDate, role: body.role, department, position };
      if (employee) {
        const before = clone(employee), actor = clone(me);
        Object.assign(employee, data, { status: body.status });
        phase2.audit(actor, 'EMPLOYEE_UPDATE', 'EMPLOYEE', before, employee);
        return json(employee);
      }
      const e: MockEmployee = { ...data, id: Math.max(0, ...employees.map(e => e.id)) + 1, employeeNo: body.employeeNo, status: 'ACTIVE', retireDate: null, jobTitle: null };
      employees.push(e); passwords.set(e.employeeNo, body.initialPassword);
      phase2.audit(me, 'EMPLOYEE_CREATE', 'EMPLOYEE', null, e);
      return created(e, resource);
    }
  }
  if (resource === 'departments' || resource === 'positions') {
    if (parts.length > 2) return fail('NOT_FOUND', 404);
    const list = resource === 'departments' ? departments : positions;
    if (method === 'GET' && !idText) return json([...list].sort((a, b) => resource === 'departments' ? a.name.localeCompare(b.name) : (a as Position).level - (b as Position).level || a.id - b.id));
    if (me.role !== 'ADMIN') return fail('FORBIDDEN', 403);
    const existing = list.find(e => e.id === id), type = resource === 'departments' ? 'DEPARTMENT' : 'POSITION';
    if (idText && !existing) return fail('NOT_FOUND', 404);
    if (method === 'DELETE' && existing) {
      if (employees.some(e => (resource === 'departments' ? e.department.id : e.position.id) === id) || phase2.referenced(resource, id)) return fail(`${type}_IN_USE`, 409);
      phase2.audit(me, `${type}_DELETE`, type, existing);
      if (resource === 'departments') departments = departments.filter(d => d.id !== id);
      else positions = positions.filter(p => p.id !== id);
      return new Response(null, { status: 204 });
    }
    if ((method === 'POST' && !idText) || (method === 'PUT' && existing)) {
      if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 100) return fail('VALIDATION_ERROR', 400, 'name');
      if (resource === 'departments' && body.description != null && (typeof body.description !== 'string' || body.description.length > 500)) return fail('VALIDATION_ERROR', 400, 'description');
      if (resource === 'positions' && !Number.isInteger(body.level)) return fail('VALIDATION_ERROR', 400, 'level');
      if (list.some(e => e.id !== id && e.name === body.name)) return fail('DUPLICATE_NAME', 409);
      const data = resource === 'departments' ? { name: body.name, description: body.description } : { name: body.name, level: body.level };
      if (existing) {
        const before = clone(existing); Object.assign(existing, data);
        phase2.audit(me, `${type}_UPDATE`, type, before, existing); return json(existing);
      }
      const item = { id: Math.max(0, ...list.map(e => e.id)) + 1, ...data };
      if (resource === 'departments') departments.push(item as Department); else positions.push(item as Position);
      phase2.audit(me, `${type}_CREATE`, type, null, item); return created(item, resource);
    }
  }
  return fail('NOT_FOUND', 404);
}
