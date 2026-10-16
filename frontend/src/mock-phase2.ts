import type { Appointment, AuditLog, DashboardData, Department, Employee, Position } from './types';

export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
export const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
export const fail = (code: string, status = 400, field?: string) => json({ code, message: '요청을 처리할 수 없습니다.', fieldErrors: field ? [{ field, reason: '입력값을 확인하세요.' }] : [] }, status);
export const seoulToday = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
export const validDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
export const positiveId = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
type Audit = Omit<AuditLog, 'actor' | 'targetType'> & { targetType: AuditLog['targetType'] | 'LEAVE'; actor: Pick<Employee, 'id' | 'employeeNo' | 'name'> | null };
interface State { employees: Employee[]; departments: () => Department[]; positions: () => Position[]; passwords: Map<string, string>; beforeImportCommit?: () => Promise<void> }
export const importHeaders = ['employeeNo', 'name', 'email', 'phone', 'hireDate', 'departmentId', 'positionId', 'role', 'initialPassword'];
const exportHeaders = ['employeeNo', 'name', 'email', 'phone', 'hireDate', 'status', 'retireDate', 'departmentName', 'positionName', 'role'];
const actions = ['LOGIN_SUCCESS', 'LOGIN_FAILURE', 'EMPLOYEE_CREATE', 'EMPLOYEE_UPDATE', 'EMPLOYEE_RETIRE', 'APPOINTMENT_CREATE', 'DEPARTMENT_CREATE', 'DEPARTMENT_UPDATE', 'DEPARTMENT_DELETE', 'POSITION_CREATE', 'POSITION_UPDATE', 'POSITION_DELETE', 'EMPLOYEE_IMPORT', 'EMPLOYEE_EXPORT', 'ATTENDANCE_CORRECT', 'LEAVE_REQUEST', 'LEAVE_APPROVE', 'LEAVE_REJECT', 'LEAVE_CANCEL'];
export function page<T>(items: T[], q: URLSearchParams) {
  const p = Number(q.get('page') ?? 0), size = Number(q.get('size') ?? 20);
  if (!/^\d+$/.test(q.get('page') ?? '0') || !/^\d+$/.test(q.get('size') ?? '20') || !Number.isSafeInteger(p) || !Number.isSafeInteger(size) || size < 1 || size > 100) return fail('VALIDATION_ERROR');
  return json({ content: items.slice(p * size, (p + 1) * size), page: p, size, totalElements: items.length, totalPages: Math.ceil(items.length / size) });
}
export function filteredEmployees(employees: Employee[], q: URLSearchParams): Employee[] | Response {
  const sort = q.get('sort') ?? 'employeeNo,asc';
  if (!/^(employeeNo|name|hireDate),(asc|desc)$/.test(sort) || (q.has('status') && !['ACTIVE', 'ON_LEAVE', 'RETIRED'].includes(q.get('status')!)) || ['departmentId', 'positionId'].some(k => q.has(k) && (!/^[1-9]\d*$/.test(q.get(k)!) || !positiveId(Number(q.get(k)))))) return fail('VALIDATION_ERROR');
  const keyword = (q.get('keyword') ?? '').toLowerCase();
  const [key, direction] = sort.split(',') as ['employeeNo' | 'name' | 'hireDate', string];
  return employees.filter(e => (q.has('status') ? e.status === q.get('status') : e.status !== 'RETIRED') && (!q.has('departmentId') || e.department.id === Number(q.get('departmentId'))) && (!q.has('positionId') || e.position.id === Number(q.get('positionId'))) && [e.employeeNo, e.name, e.email].some(v => v.toLowerCase().includes(keyword))).sort((a, b) => a[key].localeCompare(b[key]) * (direction === 'desc' ? -1 : 1));
}
async function workbook() { const ExcelJS = await import('exceljs'); return new ExcelJS.Workbook(); }
async function xlsxResponse(book: Awaited<ReturnType<typeof workbook>>, name: string) {
  const bytes = await book.xlsx.writeBuffer();
  return fileResponse(new Uint8Array(bytes), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', name);
}
function fileResponse(body: BodyInit, type: string, name: string) { return new Response(body, { headers: { 'Content-Type': type, 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}`, 'Access-Control-Expose-Headers': 'Content-Disposition' } }); }

export function createPhase2(state: State) {
  const appointments: Appointment[] = [], audits: Audit[] = [];
  function audit(actor: Employee | undefined, action: string, targetType: Audit['targetType'] = null, before: object | null = null, after: object | null = null, metadata: Record<string, unknown> = {}, success = true, targetOverride?: { id: number; label: string }) {
    const target = (after ?? before) as { id?: number; name?: string } | null;
    const snapshot = (value: object | null): Record<string, unknown> | null => {
      if (!value) return null;
      const fields = action === 'ATTENDANCE_CORRECT' ? ['checkIn', 'checkOut', 'corrected'] : targetType === 'LEAVE' ? ['id', 'employee', 'type', 'startDate', 'endDate', 'days', 'reason', 'status', 'rejectReason', 'decidedBy', 'decidedAt', 'cancelledBy', 'createdAt'] : targetType === 'EMPLOYEE' ? ['id', 'employeeNo', 'name', 'email', 'phone', 'hireDate', 'status', 'retireDate', 'department', 'position', 'role'] : targetType === 'DEPARTMENT' ? ['id', 'name', 'description'] : ['id', 'name', 'level'];
      const result = Object.fromEntries(Object.entries(value).filter(([key]) => fields.includes(key)));
      if (targetType === 'EMPLOYEE' && action !== 'ATTENDANCE_CORRECT') {
        const e = value as Employee;
        result.department = { id: e.department.id, name: e.department.name };
        result.position = { id: e.position.id, name: e.position.name, level: e.position.level };
      }
      return result;
    };
    audits.push(clone({ id: audits.length + 1, occurredAt: new Date().toISOString(), actor: actor ? { id: actor.id, employeeNo: actor.employeeNo, name: actor.name } : null, action, targetType, targetId: targetOverride?.id ?? target?.id ?? null, targetLabel: targetOverride?.label ?? target?.name ?? null, success, before: snapshot(before), after: snapshot(after), metadata }) as Audit);
  }
  function history(id: number) { return appointments.filter(a => a.employeeId === id).sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate) || b.id - a.id); }
  function referenced(resource: string, id: number) { return appointments.some(a => resource === 'departments' ? a.fromDepartment.id === id || a.toDepartment.id === id : a.fromPosition.id === id || a.toPosition.id === id); }
  async function handle(url: URL, method: string, body: Record<string, unknown>, raw: BodyInit | null | undefined, me: Employee): Promise<Response | undefined> {
    const path = url.pathname.replace('/api/v1', ''), q = url.searchParams;
    const match = path.match(/^\/employees\/(\d+)\/appointments$/);
    const owned = !!match && method === 'GET' && Number(match[1]) === me.id;
    if (!match && !['/dashboard', '/employees/export', '/employees/import-template', '/employees/import', '/audit-logs'].includes(path)) return;
    if (me.role !== 'ADMIN' && !owned) return fail('FORBIDDEN', 403);
    if (match) {
      const e = state.employees.find(e => e.id === Number(match[1]));
      if (!e) return fail('NOT_FOUND', 404);
      const prior = history(e.id);
      if (method === 'GET') return page(prior, q);
      if (method !== 'POST') return fail('NOT_FOUND', 404);
      if (e.status === 'RETIRED') return fail('EMPLOYEE_RETIRED', 409);
      if (!validDate(body.effectiveDate) || body.effectiveDate < e.hireDate || body.effectiveDate > seoulToday() || (prior[0] && body.effectiveDate < prior[0].effectiveDate)) return fail('VALIDATION_ERROR', 400, 'effectiveDate');
      if (typeof body.reason !== 'string' || !body.reason.trim() || body.reason.length > 200) return fail('VALIDATION_ERROR', 400, 'reason');
      if (![body.departmentId, body.positionId].every(positiveId)) return fail('VALIDATION_ERROR');
      const department = state.departments().find(d => d.id === body.departmentId), position = state.positions().find(p => p.id === body.positionId);
      if (!department || !position) return fail('NOT_FOUND', 404);
      if (department.id === e.department.id && position.id === e.position.id) return fail('VALIDATION_ERROR');
      const before = clone(e), actor = clone(me);
      const a: Appointment = clone({ id: appointments.length + 1, employeeId: e.id, effectiveDate: body.effectiveDate, fromDepartment: { id: e.department.id, name: e.department.name }, toDepartment: { id: department.id, name: department.name }, fromPosition: e.position, toPosition: position, reason: body.reason, createdBy: { id: me.id, name: me.name }, createdAt: new Date().toISOString() });
      e.department = department; e.position = position; appointments.push(a);
      audit(actor, 'APPOINTMENT_CREATE', 'EMPLOYEE', before, e, { appointmentId: a.id });
      return json(a, 201);
    }
    if (path === '/dashboard' && method === 'GET') {
      const today = seoulToday(), employed = state.employees.filter(e => e.status !== 'RETIRED');
      const monthly = Array.from({ length: 12 }, (_, i) => {
        const month = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 12 + i, 1)).toISOString().slice(0, 7);
        return { month, hires: state.employees.filter(e => e.hireDate.startsWith(month) && e.hireDate <= today).length, retirements: state.employees.filter(e => e.retireDate?.startsWith(month) && e.retireDate <= today).length };
      });
      const data: DashboardData = { asOfDate: today, headcount: { active: employed.filter(e => e.status === 'ACTIVE').length, onLeave: employed.filter(e => e.status === 'ON_LEAVE').length, employed: employed.length, retired: state.employees.length - employed.length }, byDepartment: state.departments().map(d => ({ departmentId: d.id, name: d.name, count: employed.filter(e => e.department.id === d.id).length })), byPosition: state.positions().map(p => ({ positionId: p.id, name: p.name, level: p.level, count: employed.filter(e => e.position.id === p.id).length })), thisMonth: { hires: monthly[11].hires, retirements: monthly[11].retirements }, monthly };
      return json(data);
    }
    if (path === '/audit-logs' && method === 'GET') {
      const from = q.get('from'), to = q.get('to');
      const instant = (v: string) => /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(v) && validDate(v.slice(0, 10)) && Number.isFinite(Date.parse(v));
      if (['actorId', 'targetId'].some(k => q.has(k) && (!/^[1-9]\d*$/.test(q.get(k)!) || !positiveId(Number(q.get(k))))) || (q.has('targetType') && !['EMPLOYEE', 'DEPARTMENT', 'POSITION', 'LEAVE'].includes(q.get('targetType')!)) || (q.has('action') && !actions.includes(q.get('action')!)) || (q.has('success') && !['true', 'false'].includes(q.get('success')!)) || (from !== null && !instant(from)) || (to !== null && !instant(to)) || (from && to && Date.parse(from) > Date.parse(to))) return fail('VALIDATION_ERROR');
      return page(audits.filter(a => (!q.has('actorId') || a.actor?.id === Number(q.get('actorId'))) && (!q.has('targetId') || a.targetId === Number(q.get('targetId'))) && (!q.has('targetType') || a.targetType === q.get('targetType')) && (!q.has('action') || a.action === q.get('action')) && (!q.has('success') || a.success === (q.get('success') === 'true')) && (!from || Date.parse(a.occurredAt) >= Date.parse(from)) && (!to || Date.parse(a.occurredAt) < Date.parse(to))).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.id - a.id), q);
    }
    if (path === '/employees/export' && method === 'GET') {
      const format = q.get('format');
      if (format !== 'xlsx' && format !== 'csv') return fail('VALIDATION_ERROR');
      const rows = filteredEmployees(state.employees, q);
      if (rows instanceof Response) return rows;
      if (rows.length > 10000) return fail('EXPORT_LIMIT_EXCEEDED');
      const values = rows.map(e => [e.employeeNo, e.name, e.email, e.phone ?? '', e.hireDate, e.status, e.retireDate ?? '', e.department.name, e.position.name, e.role]);
      const filename = `ems-employees-${seoulToday().replaceAll('-', '')}.${format}`;
      let response: Response;
      if (format === 'csv') {
        const escape = (v: string) => { const safe = /^[=+\-@\t\r]/.test(v) ? "'" + v : v; return /[",\r\n]/.test(safe) ? '"' + safe.replaceAll('"', '""') + '"' : safe; };
        response = fileResponse('\uFEFF' + [exportHeaders, ...values].map(row => row.map(escape).join(',')).join('\r\n'), 'text/csv;charset=UTF-8', filename);
      } else { const book = await workbook(); book.addWorksheet('employees').addRows([exportHeaders, ...values]); response = await xlsxResponse(book, filename); }
      const filters = Object.fromEntries(['keyword', 'departmentId', 'positionId', 'status', 'sort'].map(k => [k, k === 'keyword' ? q.get(k)?.slice(0, 100) ?? null : q.get(k)]));
      audit(me, 'EMPLOYEE_EXPORT', 'EMPLOYEE', null, null, { format, rowCount: rows.length, filters }); return response;
    }
    if (path === '/employees/import-template' && method === 'GET') {
      const book = await workbook(), sheet = book.addWorksheet('employees'); sheet.addRow(importHeaders);
      for (const index of [1, 5, 9]) sheet.getColumn(index).numFmt = '@';
      book.addWorksheet('departments').addRows([['id', 'name'], ...state.departments().map(d => [d.id, d.name])]);
      book.addWorksheet('positions').addRows([['id', 'name', 'level'], ...state.positions().map(p => [p.id, p.name, p.level])]);
      return xlsxResponse(book, 'ems-employees-import-template.xlsx');
    }
    if (path === '/employees/import' && method === 'POST') return importFile(raw, me);
    return fail('NOT_FOUND', 404);
  }
  async function importFile(raw: BodyInit | null | undefined, me: Employee) {
    const errors: { row: number; field: string; reason: string }[] = [];
    const failure = (code: string, status = 400) => {
      audit(me, 'EMPLOYEE_IMPORT', 'EMPLOYEE', null, null, { code, errorCount: errors.length || 1 }, false);
      return json({ code, message: '전체 등록이 취소되었습니다.', fieldErrors: [], ...(errors.length ? { rowErrors: errors } : {}) }, status);
    };
    const file = raw instanceof FormData ? raw.get('file') : null;
    if (!(file instanceof Blob) || !('name' in file) || !/\.xlsx$/i.test(String(file.name))) return failure('IMPORT_INVALID_FILE');
    if (file.size > 5242880) return failure('FILE_TOO_LARGE', 413);
    const book = await workbook();
    try {
      const bytes = typeof file.arrayBuffer === 'function' ? await file.arrayBuffer() : await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(reader.result as ArrayBuffer); reader.onerror = () => reject(reader.error); reader.readAsArrayBuffer(file);
      });
      // ExcelJS parsing is a UI mock, not a ZIP-bomb/security boundary. The backend
      // must verify actual decompressed totals, encrypted entries and DB collation.
      await book.xlsx.load(bytes);
    } catch { return failure('IMPORT_INVALID_FILE'); }
    const sheet = book.getWorksheet('employees');
    if (!sheet || importHeaders.some((h, i) => sheet.getRow(1).getCell(i + 1).value !== h) || sheet.getRow(1).cellCount !== 9) return failure('IMPORT_INVALID_FILE');
    const rows: { number: number; values: unknown[] }[] = [];
    sheet.eachRow((row, number) => {
      if (number > 1 && row.actualCellCount) rows.push({ number, values: importHeaders.map((_, i) => row.getCell(i + 1).value) });
    });
    if (!rows.length || rows.length > 1000) return failure('IMPORT_INVALID_FILE');
    const pending: { employee: Employee; password: string }[] = [];
    // Exact string equality is deliberately a mock approximation, not MySQL collation.
    const numbers = new Set(state.employees.map(e => e.employeeNo)), emails = new Set(state.employees.map(e => e.email));
    for (const row of rows) {
      const add = (field: string, reason: string) => errors.push({ row: row.number, field, reason });
      const data = Object.fromEntries(importHeaders.map((h, i) => [h, row.values[i]]));
      for (const field of importHeaders) {
        const value = data[field];
        if (field === 'departmentId' || field === 'positionId') {
          if (!(positiveId(value) || (typeof value === 'string' && /^[1-9]\d*$/.test(value) && positiveId(Number(value))))) add(field, '양의 정수 ID가 필요합니다.');
        } else if (field === 'phone' && value === null) data[field] = '';
        else if (typeof value !== 'string') add(field, value && typeof value === 'object' && ('formula' in value || 'sharedFormula' in value) ? '수식 셀은 허용하지 않습니다.' : '문자열 서식 필요');
      }
      for (const [field, max] of [['employeeNo', 50], ['name', 100], ['email', 254], ['phone', 30]] as const) {
        const value = data[field];
        if (typeof value === 'string' && ((field !== 'phone' && !value.trim()) || value.length > max)) add(field, '길이 또는 필수값을 확인하세요.');
      }
      if (typeof data.email === 'string' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) add('email', '이메일 형식을 확인하세요.');
      if (!validDate(data.hireDate)) add('hireDate', '날짜 형식을 확인하세요.');
      if (!['ADMIN', 'EMPLOYEE'].includes(String(data.role))) add('role', '역할을 확인하세요.');
      if (typeof data.initialPassword === 'string' && (!data.initialPassword.length || new TextEncoder().encode(data.initialPassword).length > 72)) add('initialPassword', '필수값 또는 길이를 확인하세요.');
      const department = state.departments().find(d => d.id === Number(data.departmentId)), position = state.positions().find(p => p.id === Number(data.positionId));
      if (!department) add('departmentId', '부서를 찾을 수 없습니다.');
      if (!position) add('positionId', '직급을 찾을 수 없습니다.');
      for (const [field, set] of [['employeeNo', numbers], ['email', emails]] as const) {
        const value = data[field];
        if (typeof value === 'string') { if (set.has(value)) add(field, '이미 사용 중인 값입니다.'); set.add(value); }
      }
      if (!errors.some(e => e.row === row.number)) pending.push({ employee: { id: 0, employeeNo: data.employeeNo as string, name: data.name as string, email: data.email as string, phone: data.phone as string, hireDate: data.hireDate as string, role: data.role as Employee['role'], status: 'ACTIVE', retireDate: null, department: department!, position: position! }, password: data.initialPassword as string });
    }
    if (errors.length) return failure('IMPORT_VALIDATION_ERROR');
    // Browser task boundary permits another request to commit between validation
    // and commit, exercising IMPORT_CONFLICT without special HTTP parameters.
    await (state.beforeImportCommit?.() ?? new Promise<void>(resolve => setTimeout(resolve, 0)));
    if (pending.some(({ employee: e }) => state.employees.some(old => old.employeeNo === e.employeeNo || old.email === e.email) || !state.departments().includes(e.department) || !state.positions().includes(e.position))) return failure('IMPORT_CONFLICT', 409);
    for (const { employee, password } of pending) {
      employee.id = Math.max(0, ...state.employees.map(e => e.id)) + 1;
      state.employees.push(employee); state.passwords.set(employee.employeeNo, password);
      audit(me, 'EMPLOYEE_CREATE', 'EMPLOYEE', null, employee, { source: 'IMPORT' });
    }
    audit(me, 'EMPLOYEE_IMPORT', 'EMPLOYEE', null, null, { importedCount: pending.length });
    return json({ importedCount: pending.length }, 201);
  }
  return { handle, audit, history, referenced };
}


