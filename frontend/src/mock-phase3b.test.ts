// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createPhase3b, demoNotice, evaluationResult, payrollAmounts, type Audit3B, type MockDepartment, type MockEmployee, type MockJobTitle } from './mock-phase3b';
import { createPhase2 } from './mock-phase2';

type PhaseOptions = Parameters<typeof createPhase3b>[0];
function fixture(options: Partial<Pick<PhaseOptions, 'beforePayrollCommit' | 'seed'>> = {}) {
  let time = new Date('2026-10-16T10:00:00+09:00');
  const departments: MockDepartment[] = [{ id: 1, name: '가상개발부', description: '합성', parentId: null }, { id: 2, name: '가상플랫폼부', parentId: 1 }, { id: 3, name: '빈 부서', parentId: null }];
  const positions = [{ id: 1, name: '가상사원', level: 1 }];
  const employees: MockEmployee[] = [1, 2, 3, 4].map(id => ({ id, employeeNo: `DEMO${id}`, name: `가상사원${id}`, role: id === 2 || id === 3 ? 'ADMIN' : 'EMPLOYEE', email: `demo${id}@example.test`, phone: '', hireDate: '2025-01-01', status: 'ACTIVE', retireDate: null, department: departments[1], position: positions[0], jobTitle: null }));
  const jobTitles: MockJobTitle[] = [{ id: 1, name: '가상팀장', description: '합성 직책' }];
  const captured: Parameters<Audit3B>[] = [];
  const phase2 = createPhase2({ employees, departments: () => departments, positions: () => positions, jobTitles: () => jobTitles, passwords: new Map(), clock: () => time });
  const phase3b = createPhase3b({ employees, departments: () => departments, jobTitles, clock: () => time, departmentInUse: id => employees.some(e => e.department.id === id) || phase2.referenced('departments', id), jobTitleInUse: id => phase2.referenced('job-titles', id), audit: (actor, action, type, before, after, metadata, target) => { captured.push(JSON.parse(JSON.stringify([actor, action, type, before, after, metadata, target]))); phase2.audit(actor, action, type, before, after, metadata, true, target); }, ...options });
  const call = async (path: string, method = 'GET', body: Record<string, unknown> = {}, user = 2) => {
    const url = new URL('http://localhost/api/v1' + path), me = employees.find(e => e.id === user)!;
    const response = await phase3b.handle(url, method, body, me) ?? await phase2.handle(url, method, body, undefined, me);
    if (!response) throw new Error('Unexpected unhandled test route: ' + path);
    return response;
  };
  const get = async (path: string, user = 2) => (await call(path, 'GET', {}, user)).json();
  const setSalary = (id: number, baseSalary = 100, allowance = 1) => call(`/employees/${id}/salary-setting`, 'PUT', { baseSalary, allowance });
  const allSalaries = () => Promise.all(employees.map(e => setSalary(e.id)));
  const newCycle = (overrides: Record<string, unknown> = {}) => call('/evaluation-cycles', 'POST', { name: '합성 평가', startDate: '2026-01-01', endDate: '2026-09-01', items: [{ name: '수행', sortOrder: 2 }, { name: '협업', sortOrder: 1 }], assignments: [{ employeeId: 1, reviewerId: 2 }], ...overrides });
  const opened = async () => {
    const c = await (await newCycle()).json(); await call(`/evaluation-cycles/${c.id}/open`, 'POST');
    const e = (await get('/evaluations/me?cycleId=' + c.id, 1)).content[0];
    const detail = await get('/evaluations/' + e.id, 1); return { cycle: c, evaluation: detail };
  };
  const answers = (detail: { items: { id: number }[] }, scores = [4, 4]) => detail.items.map((item, i) => ({ itemId: item.id, score: scores[i], comment: '비공개 합성 평가' }));
  return { departments, positions, employees, jobTitles, captured, phase2, phase3b, call, get, setSalary, allSalaries, newCycle, opened, answers, setTime: (value: string) => { time = new Date(value); } };
}
async function code(response: Response, expected: string, status = 409) { expect(response.status).toBe(status); expect((await response.json()).code).toBe(expected); }

describe('3B 조직/직책/발령 계약 v1', () => {
  it('조직은 평탄 배열이며 빈 부서/휴직을 포함하고 퇴사와 민감 필드는 제외한다', async () => {
    const f = fixture(); f.employees[0].status = 'ON_LEAVE'; f.employees[3].status = 'RETIRED';
    f.employees[0].jobTitle = { id: 1, name: '가상팀장' };
    const data = await f.get('/organization', 1);
    expect(data.departments).toHaveLength(3); expect(data.employees).toHaveLength(3);
    expect(Object.keys(data.departments[0]).sort()).toEqual(['id', 'name', 'parentId']);
    expect(Object.keys(data.employees[0]).sort()).toEqual(['department', 'employeeNo', 'id', 'jobTitle', 'name', 'onLeave', 'position']);
    expect(data.employees[0]).toMatchObject({ id: 1, onLeave: true, jobTitle: { id: 1 } });
    expect(data.employees[1].jobTitle).toBeNull();
    expect(data.employees.map((e: { employeeNo: string }) => e.employeeNo)).toEqual(['DEMO1', 'DEMO2', 'DEMO3']);
  });
  it('부서 계층은 자기/하위 순환과 하위 삭제를 막고 생략 부모는 루트다', async () => {
    const f = fixture();
    for (const parentId of [1, 2]) await code(await f.call('/departments/1', 'PUT', { name: '가상개발부', parentId }), 'DEPARTMENT_CYCLE');
    await code(await f.call('/departments/1', 'DELETE'), 'DEPARTMENT_HAS_CHILDREN');
    await code(await f.call('/departments/2', 'DELETE'), 'DEPARTMENT_IN_USE');
    await code(await f.call('/departments/3', 'PUT', { name: '빈 부서', parentId: 999 }), 'NOT_FOUND', 404);
    for (const parentId of [-1, '1', 0]) await code(await f.call('/departments/3', 'PUT', { name: '빈 부서', parentId }), 'VALIDATION_ERROR', 400);
    expect((await f.call('/departments/3', 'PUT', { name: '독립 부서' })).status).toBe(200);
    expect((await f.get('/departments')).find((d: { id: number }) => d.id === 3).parentId).toBeNull();
    expect(f.employees.every(e => e.department.id === 2)).toBe(true);
    const log = (await f.get('/audit-logs?targetType=DEPARTMENT')).content[0]; expect(log.after.parentId).toBeNull();
    expect((await f.call('/departments/3', 'DELETE')).status).toBe(204);
  });
  it('일반 사용자는 카탈로그 조회만 가능하고 직책 이름은 중복될 수 없다', async () => {
    const f = fixture();
    for (const path of ['/departments', '/job-titles']) {
      expect((await f.call(path, 'GET', {}, 1)).status).toBe(200);
      for (const method of ['POST', 'PUT', 'DELETE']) await code(await f.call(path + (method === 'POST' ? '' : '/1'), method, { name: '금지' }, 1), 'FORBIDDEN', 403);
    }
    await code(await f.call('/job-titles', 'POST', { name: '가상팀장' }), 'DUPLICATE_NAME');
    const title = await (await f.call('/job-titles', 'POST', { name: '가상파트장', description: '합성' })).json();
    expect((await f.call('/job-titles/' + title.id, 'PUT', { name: '가상파트리더' })).status).toBe(200);
    expect((await f.call('/job-titles/' + title.id, 'DELETE')).status).toBe(204);
    await code(await f.call('/job-titles/999', 'DELETE'), 'NOT_FOUND', 404);
  });
  it('직책만 발령하고 이름 스냅샷과 과거 참조 삭제 제한을 보존한다', async () => {
    const f = fixture(); const payload = { departmentId: 2, positionId: 1, effectiveDate: '2026-10-16', reason: '합성 지정', changeJobTitle: true, jobTitleId: 1 };
    expect((await f.call('/employees/1/appointments', 'POST', payload)).status).toBe(201);
    expect(f.employees[0].jobTitle).toEqual({ id: 1, name: '가상팀장' });
    await code(await f.call('/job-titles/1', 'DELETE'), 'JOB_TITLE_IN_USE');
    await f.call('/job-titles/1', 'PUT', { name: '변경 직책' }); expect(f.employees[0].jobTitle?.name).toBe('변경 직책');
    expect((await f.call('/employees/1/appointments', 'POST', { ...payload, jobTitleId: null })).status).toBe(201);
    const rows = (await f.get('/employees/1/appointments', 1)).content;
    expect(rows[0]).toMatchObject({ fromJobTitle: { name: '변경 직책' }, toJobTitle: null });
    expect(rows[1]).toMatchObject({ fromJobTitle: null, toJobTitle: { name: '가상팀장' } });
    await code(await f.call('/job-titles/1', 'DELETE'), 'JOB_TITLE_IN_USE');
    await code(await f.call('/employees/1/appointments', 'POST', { ...payload, jobTitleId: null }), 'VALIDATION_ERROR', 400);
  });
  it('changeJobTitle false/생략은 ID를 무시하고 true는 없는직책/형식을 검사한다', async () => {
    const f = fixture(), base = { departmentId: 1, positionId: 1, effectiveDate: '2026-10-16', reason: '합성 발령' };
    expect((await f.call('/employees/1/appointments', 'POST', { ...base, jobTitleId: 999 })).status).toBe(201);
    expect(f.employees[0].jobTitle).toBeNull();
    await code(await f.call('/employees/1/appointments', 'POST', { ...base, changeJobTitle: true, jobTitleId: 999 }), 'NOT_FOUND', 404);
    await code(await f.call('/employees/1/appointments', 'POST', { ...base, changeJobTitle: 'true', jobTitleId: 1 }), 'VALIDATION_ERROR', 400);
    await code(await f.call('/employees/1/appointments', 'POST', { ...base, changeJobTitle: true, jobTitleId: '1' }), 'VALIDATION_ERROR', 400);
    expect((await f.call('/employees/1/appointments', 'POST', { ...base, changeJobTitle: true, jobTitleId: 1 })).status).toBe(201);
    expect((await f.call('/employees/1/appointments', 'POST', { ...base, departmentId: 2, changeJobTitle: false, jobTitleId: null })).status).toBe(201);
    expect(f.employees[0].jobTitle?.id).toBe(1);
    expect((await f.call('/employees/1/appointments', 'POST', { ...base, departmentId: 2, changeJobTitle: true })).status).toBe(201);
    expect(f.employees[0].jobTitle).toBeNull();
  });
});


describe('3B 급여 계약 v1', () => {
  it.each([
    [100, 1, [5, 4, 3], 89],
    [3000000, 0, [135000, 105000, 90000], 2670000],
    [1000000000, 1000000000, [90000000, 70000000, 60000000], 1780000000],
    [0, 0, [0, 0, 0], 0],
  ])('원정수 항목별 HALF_UP: 기본급 %s, 수당 %s', (baseSalary, allowance, amounts, netPay) => {
    const value = payrollAmounts(baseSalary as number, allowance as number);
    expect(value.deductions.map(d => d.amount)).toEqual(amounts);
    expect(value.netPay).toBe(netPay);
  });
  it('설정은 관리자만 조회/신규/수정하고 각 금액 상한과 정수를 검사한다', async () => {
    const f = fixture();
    await code(await f.call('/employees/1/salary-setting'), 'NOT_FOUND', 404);
    for (const method of ['GET', 'PUT']) await code(await f.call('/employees/1/salary-setting', method, { baseSalary: 1, allowance: 0 }, 1), 'FORBIDDEN', 403);
    for (const value of [-1, 1000000001, 0.5, '1', null]) await code(await f.call('/employees/1/salary-setting', 'PUT', { baseSalary: value, allowance: 0 }), 'VALIDATION_ERROR', 400);
    expect((await f.setSalary(1, 1000000000, 1000000000)).status).toBe(200);
    expect(await f.get('/employees/1/salary-setting')).toMatchObject({ formulaVersion: 'DEMO_V1', deductionRates: [450, 350, 300] });
    await code(await f.setSalary(999), 'NOT_FOUND', 404);
    const log = (await f.get('/audit-logs?targetType=SALARY_SETTING')).content[0];
    expect(log).toMatchObject({ targetId: 1, before: null, after: null, metadata: { employeeId: 1 } });
  });
  it('설정 하나라도 누락되면 월 전체를 저장하지 않는다', async () => {
    const f = fixture(); await f.setSalary(1);
    await code(await f.call('/payrolls', 'POST', { month: '2026-09' }), 'SALARY_SETTING_MISSING');
    await code(await f.call('/payrolls/2026-09'), 'NOT_FOUND', 404);
    expect((await f.get('/payrolls')).totalElements).toBe(0);
    expect(f.captured.filter(a => a[1] === 'PAYROLL_GENERATE')).toHaveLength(0);
    await f.allSalaries();
    const result = await f.call('/payrolls', 'POST', { month: '2026-09' });
    expect(result.status).toBe(201);
    expect(await result.json()).toMatchObject({ count: 4, status: 'DRAFT', allowedActions: ['RECALCULATE', 'CONFIRM'] });
    expect((await f.get('/payrolls/2026-09')).payslips[0].id).toBe(1);
  });
  it('월중 입퇴사/휴직도 설정액 전액이고 대상자는 입퇴사 날짜로 선택한다', async () => {
    const f = fixture();
    f.employees[0].status = 'ON_LEAVE';
    f.employees[1].hireDate = '2026-09-30';
    f.employees[2].status = 'RETIRED'; f.employees[2].retireDate = '2026-09-01';
    f.employees[3].hireDate = '2026-10-01';
    await f.allSalaries(); await f.call('/payrolls', 'POST', { month: '2026-09' });
    const details = await f.get('/payrolls/2026-09');
    expect(details.payroll.count).toBe(3);
    expect(details.payslips.map((s: { employee: { id: number } }) => s.employee.id)).toEqual([1, 2, 3]);
    expect(details.payslips.every((s: { grossPay: number; demoNotice: string }) => s.grossPay === 101 && s.demoNotice === demoNotice)).toBe(true);
  });
  it('DRAFT는 설정/소속 변경을 자동 반영하지 않고 명시적 재계산에서 전체 교체한다', async () => {
    const f = fixture(); await f.allSalaries(); await f.call('/payrolls', 'POST', { month: '2026-09' });
    const original = await f.get('/payrolls/2026-09'); const oldId = original.payslips[0].id;
    await f.setSalary(1, 3000000, 0); f.employees[0].name = '변경 이름'; f.employees[0].department = f.departments[2]; f.employees[0].jobTitle = { id: 1, name: '가상팀장' };
    f.employees[3].retireDate = '2026-08-31'; f.employees[3].status = 'RETIRED';
    expect(await f.get('/payrolls/2026-09')).toEqual(original);
    expect((await f.call('/payrolls/2026-09/recalculate', 'POST')).status).toBe(200);
    const updated = await f.get('/payrolls/2026-09');
    expect(updated.payroll.count).toBe(3);
    expect(updated.payslips[0]).toMatchObject({ employee: { name: '변경 이름' }, department: { id: 3 }, jobTitle: { id: 1 }, netPay: 2670000 });
    await code(await f.call('/payslips/' + oldId), 'NOT_FOUND', 404);
  });
  it('재계산 설정누락도 기존 초안 전체와 감사 건수를 보존한다', async () => {
    const f = fixture(); await f.allSalaries(); await f.call('/payrolls', 'POST', { month: '2026-09' });
    const before = await f.get('/payrolls/2026-09');
    f.employees.push({ ...f.employees[0], id: 5, employeeNo: 'NEW5', name: '새 대상' });
    await code(await f.call('/payrolls/2026-09/recalculate', 'POST'), 'SALARY_SETTING_MISSING');
    expect(await f.get('/payrolls/2026-09')).toEqual(before);
    expect(f.captured.filter(a => a[1] === 'PAYROLL_RECALCULATE')).toHaveLength(0);
  });
  it('확정 후 명세 스냅샷은 불변이고 재계산/중복확정/중복생성을 거절한다', async () => {
    const f = fixture(); await f.allSalaries(); await f.call('/payrolls', 'POST', { month: '2026-09' });
    expect((await f.call('/payrolls/2026-09/confirm', 'POST')).status).toBe(200);
    const confirmed = await f.get('/payrolls/2026-09');
    expect(confirmed.payroll).toMatchObject({ status: 'CONFIRMED', allowedActions: [], confirmedBy: { id: 2 } });
    await f.setSalary(1, 0, 0); f.employees[0].name = '이후 이름'; f.departments[1].name = '이후 부서';
    expect(await f.get('/payrolls/2026-09')).toEqual(confirmed);
    for (const action of ['confirm', 'recalculate']) await code(await f.call('/payrolls/2026-09/' + action, 'POST'), 'PAYROLL_CONFIRMED');
    await code(await f.call('/payrolls', 'POST', { month: '2026-09' }), 'PAYROLL_ALREADY_EXISTS');
    for (const method of ['PUT', 'DELETE']) expect((await f.call('/payrolls/2026-09', method)).status).toBe(404);
  });
  it('본인은 CONFIRMED 명세만 보며 타인/미확정/없는 명세는404다', async () => {
    const f = fixture(); await f.allSalaries(); await f.call('/payrolls', 'POST', { month: '2026-09' });
    const details = await f.get('/payrolls/2026-09'), mine = details.payslips[0].id, other = details.payslips[1].id;
    await code(await f.call('/payslips/' + mine, 'GET', {}, 1), 'NOT_FOUND', 404);
    expect((await f.get('/payslips/me', 1)).totalElements).toBe(0);
    await f.call('/payrolls/2026-09/confirm', 'POST');
    expect((await f.call('/payslips/' + mine, 'GET', {}, 1)).status).toBe(200);
    for (const id of [other, 999]) await code(await f.call('/payslips/' + id, 'GET', {}, 1), 'NOT_FOUND', 404);
    expect((await f.get('/payslips/me?month=2026-09', 1)).content).toHaveLength(1);
    await code(await f.call('/payrolls', 'GET', {}, 1), 'FORBIDDEN', 403);
  });
  it('월 경계/빈 대상/필터/페이지 오류와 월 내림차순을 적용한다', async () => {
    const f = fixture(); await f.allSalaries();
    for (const month of ['1899-12', '2026-11', '2026-13', '2026-9']) await code(await f.call('/payrolls', 'POST', { month }), 'VALIDATION_ERROR', 400);
    await code(await f.call('/payrolls', 'POST', { month: '1900-01' }), 'VALIDATION_ERROR', 400);
    await f.call('/payrolls', 'POST', { month: '2026-08' }); await f.call('/payrolls', 'POST', { month: '2026-09' });
    expect((await f.get('/payrolls?size=1')).content[0].month).toBe('2026-09');
    for (const query of ['status=BAD', 'size=101', 'month=2026-13']) await code(await f.call('/payrolls?' + query), 'VALIDATION_ERROR', 400);
  });
  it('같은 월 경합은 PAYROLL_BUSY이며 실패 후 잠금이 해제된다', async () => {
    let release!: () => void;
    const f = fixture({ beforePayrollCommit: () => new Promise<void>(resolve => { release = resolve; }) });
    await f.allSalaries(); const first = f.call('/payrolls', 'POST', { month: '2026-09' });
    await code(await f.call('/payrolls', 'POST', { month: '2026-09' }), 'PAYROLL_BUSY');
    release(); expect((await first).status).toBe(201);
    await code(await f.call('/payrolls', 'POST', { month: '2026-09' }), 'PAYROLL_ALREADY_EXISTS');
  });
  it('급여 감사에는 상태/월/ID/건수만 있고 금액·민감 내용은 없다', async () => {
    const f = fixture(); await f.allSalaries(); await f.call('/payrolls', 'POST', { month: '2026-09' }); await f.call('/payrolls/2026-09/confirm', 'POST');
    const logs = (await f.get('/audit-logs?targetType=PAYROLL')).content;
    expect(logs[0]).toMatchObject({ targetId: 1, targetLabel: '2026-09', before: { status: 'DRAFT' }, after: { status: 'CONFIRMED' }, metadata: { month: '2026-09', count: 4 } });
    for (const log of logs) { expect(Object.keys(log.after)).toEqual(['status']); expect(Object.keys(log.metadata).sort()).toEqual(['count', 'month']); }
    expect(JSON.stringify(logs)).not.toContain('baseSalary');
  });
});


describe('3B 평가 계약 v1', () => {
  it('주기 전체 입력 검증과 DRAFT 항목/배정 교체, OPEN 스냅샷을 적용한다', async () => {
    const f = fixture();
    await code(await f.call('/evaluation-cycles', 'GET', {}, 1), 'FORBIDDEN', 403);
    const c = await (await f.newCycle()).json();
    expect(c).toMatchObject({ status: 'DRAFT', allowedActions: ['EDIT', 'OPEN'] });
    expect(c.items.map((i: { sortOrder: number }) => i.sortOrder)).toEqual([1, 2]);
    expect((await f.get('/evaluations/me', 1)).totalElements).toBe(0);
    const updated = await f.call('/evaluation-cycles/' + c.id, 'PUT', { name: '교체된 주기', startDate: '2026-10-01', endDate: '2026-10-02', items: [{ name: '교체 항목', sortOrder: 0 }], assignments: [{ employeeId: 4, reviewerId: 3 }, { employeeId: 1, reviewerId: 2 }] });
    expect(updated.status).toBe(200);
    const changed = await updated.json(); expect(changed.assignments.map((a: { employeeId: number }) => a.employeeId)).toEqual([1, 4]);
    expect((await f.call('/evaluation-cycles/' + c.id + '/open', 'POST')).status).toBe(200);
    const detail = await f.get('/evaluations/' + (await f.get('/evaluations/me', 1)).content[0].id, 1);
    expect(detail.items).toEqual(changed.items);
    await code(await f.call('/evaluation-cycles/' + c.id, 'PUT', {}), 'EVALUATION_STATE_CONFLICT');
    await code(await f.call('/evaluation-cycles/' + c.id + '/open', 'POST'), 'EVALUATION_STATE_CONFLICT');
  });
  it('배정은 자기결재/중복대상/유효하지않은 평가자와 잘못된 항목을 거절한다', async () => {
    const f = fixture();
    await code(await f.newCycle({ assignments: [{ employeeId: 1, reviewerId: 1 }] }), 'FORBIDDEN', 403);
    await code(await f.newCycle({ assignments: [{ employeeId: 1, reviewerId: 4 }] }), 'EVALUATION_REVIEWER_INVALID');
    await code(await f.newCycle({ assignments: [{ employeeId: 1, reviewerId: 999 }] }), 'EVALUATION_REVIEWER_INVALID');
    for (const fields of [
      { items: [] }, { items: Array.from({ length: 21 }, (_, i) => ({ name: '합성', sortOrder: i })) },
      { items: [{ name: 'A', sortOrder: 1 }, { name: 'B', sortOrder: 1 }] },
      { items: [{ name: '', sortOrder: 0 }] }, { items: [{ name: 'A', sortOrder: -1 }] },
      { assignments: [{ employeeId: 1, reviewerId: 2 }, { employeeId: 1, reviewerId: 3 }] },
      { assignments: [] }, { startDate: '2026-02-30' }, { startDate: '2027-01-01' },
    ]) await code(await f.newCycle(fields), 'VALIDATION_ERROR', 400);
    expect((await f.get('/evaluation-cycles')).totalElements).toBe(0);
    expect(f.captured).toHaveLength(0);
  });
  it('개방 직전에 평가자 활성/입사조건을 다시 검사하며 대상 휴직은 허용한다', async () => {
    const f = fixture(); f.employees[0].status = 'ON_LEAVE';
    const c = await (await f.newCycle()).json(); f.employees[1].status = 'ON_LEAVE';
    await code(await f.call('/evaluation-cycles/' + c.id + '/open', 'POST'), 'EVALUATION_REVIEWER_INVALID');
    expect((await f.get('/evaluation-cycles/' + c.id)).status).toBe('DRAFT');
    expect((await f.get('/evaluations/me', 1)).content).toEqual([]);
    f.employees[1].status = 'ACTIVE'; f.employees[1].hireDate = '2026-10-17';
    await code(await f.call('/evaluation-cycles/' + c.id + '/open', 'POST'), 'EVALUATION_REVIEWER_INVALID');
    f.employees[1].hireDate = '2025-01-01'; expect((await f.call('/evaluation-cycles/' + c.id + '/open', 'POST')).status).toBe(200);
  });
  it('요약은 답변/점수/등급이 없고 관계없는 관리자 상세/쓰기는404다', async () => {
    const f = fixture(); const { evaluation: e } = await f.opened();
    const summary = (await f.get('/evaluations/assigned', 2)).content[0];
    expect(Object.keys(summary).sort()).toEqual(['allowedActions', 'cycle', 'employee', 'id', 'incomplete', 'reviewer', 'state']);
    expect((await f.get('/evaluations/assigned', 3)).content).toEqual([]);
    expect((await f.get('/evaluations/me?cycleId=999', 1)).content).toEqual([]);
    for (const query of ['cycleId=0', 'cycleId=bad', 'page=-1']) await code(await f.call('/evaluations/me?' + query, 'GET', {}, 1), 'VALIDATION_ERROR', 400);
    await code(await f.call('/evaluations/' + e.id, 'GET', {}, 3), 'NOT_FOUND', 404);
    for (const route of ['self', 'manager']) await code(await f.call('/evaluations/' + e.id + '/' + route, 'PUT', { answers: [] }, 3), 'NOT_FOUND', 404);
    expect(e).not.toHaveProperty('managerAnswers'); expect(e).not.toHaveProperty('finalScore'); expect(e).not.toHaveProperty('grade');
  });
  it('자기 임시저장은 부분/null점수, 제출은 전항목 유효값만 원자적으로 적용한다', async () => {
    const f = fixture(); const { evaluation: e } = await f.opened(); const path = '/evaluations/' + e.id;
    const draft = [{ itemId: e.items[0].id, score: null, comment: null }];
    expect((await f.call(path + '/self', 'PUT', { answers: draft }, 1)).status).toBe(200);
    await code(await f.call(path + '/self/submit', 'POST', { answers: f.answers(e).slice(0, 1) }, 1), 'VALIDATION_ERROR', 400);
    expect((await f.get(path, 1)).selfAnswers).toEqual(draft);
    await code(await f.call(path + '/manager', 'PUT', { answers: [] }, 2), 'EVALUATION_STATE_CONFLICT');
    const response = await f.call(path + '/self/submit', 'POST', { answers: f.answers(e) }, 1);
    expect(await response.json()).toMatchObject({ state: 'SELF_SUBMITTED', allowedActions: [] });
    await code(await f.call(path + '/self', 'PUT', { answers: [] }, 1), 'EVALUATION_STATE_CONFLICT');
    expect((await f.get(path, 2)).allowedActions).toEqual(['SAVE_MANAGER', 'SUBMIT_MANAGER']);
  });
  it('알려지지않은/중복항목, 문자열/범위점수, 긴 코멘트는 부분저장하지 않는다', async () => {
    const f = fixture(); const { evaluation: e } = await f.opened(); const path = '/evaluations/' + e.id;
    for (const answers of [
      [{ itemId: 999, score: 4 }], [{ itemId: e.items[0].id, score: 4 }, { itemId: e.items[0].id, score: 5 }],
      [{ itemId: e.items[0].id, score: '4' }], [{ itemId: e.items[0].id, score: 0 }], [{ itemId: e.items[0].id, score: 6 }],
      [{ itemId: e.items[0].id, score: 1.5 }], [{ itemId: e.items[0].id, score: 4, comment: 'x'.repeat(1001) }],
    ]) await code(await f.call(path + '/self', 'PUT', { answers }, 1), 'VALIDATION_ERROR', 400);
    expect((await f.get(path, 1)).selfAnswers).toEqual([]);
  });
  it('관리자 초안은 본인에서 키 자체를 숨기고 제출 직후 계산 결과를 공개한다', async () => {
    const f = fixture(); const { evaluation: e } = await f.opened(); const path = '/evaluations/' + e.id;
    await f.call(path + '/self/submit', 'POST', { answers: f.answers(e, [1, 1]) }, 1);
    await f.call(path + '/manager', 'PUT', { answers: f.answers(e, [5, 4]) }, 2);
    const hidden = await f.get(path, 1);
    for (const key of ['managerAnswers', 'finalScore', 'grade']) expect(hidden).not.toHaveProperty(key);
    expect(hidden.state).toBe('MANAGER_DRAFT');
    await code(await f.call(path + '/manager/submit', 'POST', { answers: f.answers(e).slice(0, 1) }, 2), 'VALIDATION_ERROR', 400);
    expect((await f.get(path, 2)).managerAnswers).toEqual(f.answers(e, [5, 4]));
    const finalized = await f.call(path + '/manager/submit', 'POST', { answers: f.answers(e, [5, 4]), finalScore: 1, grade: 'D' }, 2);
    expect(await finalized.json()).toMatchObject({ state: 'FINALIZED', finalScore: 4.5, grade: 'S', allowedActions: [] });
    expect(await f.get(path, 1)).toMatchObject({ managerAnswers: f.answers(e, [5, 4]), finalScore: 4.5, grade: 'S' });
    await code(await f.call(path + '/manager/submit', 'POST', { answers: f.answers(e) }, 2), 'EVALUATION_STATE_CONFLICT');
    await code(await f.call(path + '/reviewer', 'PUT', { reviewerId: 3 }), 'EVALUATION_STATE_CONFLICT');
  });
  it.each([
    [[5, 4], 4.5, 'S'], [[4, 3, 3], 3.33, 'B'], [[1, 2], 1.5, 'C'], [[1, 1], 1, 'D'], [[4, 3], 3.5, 'A'], [[3, 2], 2.5, 'B'],
  ])('최종 관리자 평균 HALF_UP과 등급 %s', (scores, finalScore, grade) => {
    expect(evaluationResult(scores as number[])).toEqual({ finalScore, grade });
  });
  it('종료일이 지나도 OPEN 작성 가능하고 CLOSED는 미완료 상태를 보존한다', async () => {
    const f = fixture(); const { cycle, evaluation: e } = await f.opened();
    expect((await f.call('/evaluations/' + e.id + '/self', 'PUT', { answers: [] }, 1)).status).toBe(200);
    expect((await f.call('/evaluation-cycles/' + cycle.id + '/close', 'POST')).status).toBe(200);
    expect(await f.get('/evaluations/' + e.id, 1)).toMatchObject({ state: 'SELF_DRAFT', incomplete: true, allowedActions: [] });
    await code(await f.call('/evaluations/' + e.id + '/self', 'PUT', { answers: [] }, 1), 'EVALUATION_CYCLE_CLOSED');
    await code(await f.call('/evaluations/' + e.id + '/reviewer', 'PUT', { reviewerId: 3 }), 'EVALUATION_CYCLE_CLOSED');
    await code(await f.call('/evaluation-cycles/' + cycle.id + '/open', 'POST'), 'EVALUATION_CYCLE_CLOSED');
  });
  it('재배정은 관리자 초안을 지우고 이전 평가자 권한을 즉시 제거한다', async () => {
    const f = fixture(); const { evaluation: e } = await f.opened(); const path = '/evaluations/' + e.id;
    await f.call(path + '/self/submit', 'POST', { answers: f.answers(e) }, 1);
    await f.call(path + '/manager', 'PUT', { answers: f.answers(e, [5, 5]) }, 2);
    const response = await f.call(path + '/reviewer', 'PUT', { reviewerId: 3 });
    const summary = await response.json(); expect(summary).toMatchObject({ state: 'SELF_SUBMITTED', reviewer: { id: 3 }, allowedActions: ['REASSIGN_REVIEWER'] });
    expect(summary).not.toHaveProperty('managerAnswers');
    await code(await f.call(path, 'GET', {}, 2), 'NOT_FOUND', 404);
    await code(await f.call(path + '/manager', 'PUT', { answers: [] }, 2), 'NOT_FOUND', 404);
    expect(await f.get(path, 3)).toMatchObject({ managerAnswers: [], selfAnswers: f.answers(e) });
    expect((await f.get('/evaluations/assigned', 2)).content).toEqual([]);
    expect((await f.get('/evaluations/assigned', 3)).content).toHaveLength(1);
    const log = (await f.get('/audit-logs?action=EVALUATION_REASSIGN')).content[0];
    expect(log.metadata).toEqual({ cycleId: e.cycle.id, employeeId: 1, oldReviewerId: 2, newReviewerId: 3 });
  });
  it('자기결재/일반사원 재배정은 거부하고 SELF_DRAFT 재배정은 상태를 유지한다', async () => {
    const f = fixture(); const { evaluation: e } = await f.opened(); const path = '/evaluations/' + e.id + '/reviewer';
    await code(await f.call(path, 'PUT', { reviewerId: 3 }, 1), 'FORBIDDEN', 403);
    await code(await f.call(path, 'PUT', { reviewerId: 1 }), 'FORBIDDEN', 403);
    await code(await f.call(path, 'PUT', { reviewerId: 4 }), 'EVALUATION_REVIEWER_INVALID');
    expect(await (await f.call(path, 'PUT', { reviewerId: 3 })).json()).toMatchObject({ state: 'SELF_DRAFT' });
  });
  it('평가자 자격은 업무마다 재검사하며 개방후 대상퇴사는 완료를 막지 않는다', async () => {
    const f = fixture(); const { evaluation: e } = await f.opened(); const path = '/evaluations/' + e.id;
    await f.call(path + '/self/submit', 'POST', { answers: f.answers(e) }, 1);
    f.employees[1].status = 'ON_LEAVE';
    await code(await f.call(path + '/manager', 'PUT', { answers: f.answers(e) }, 2), 'EVALUATION_REVIEWER_INVALID');
    f.employees[1].status = 'ACTIVE'; f.employees[0].status = 'RETIRED';
    expect((await f.call(path + '/manager/submit', 'POST', { answers: f.answers(e) }, 2)).status).toBe(200);
  });
  it('평가 감사에는 ID/상태만 기록하고 점수/코멘트/등급 원문을 제외한다', async () => {
    const f = fixture(); const { evaluation: e } = await f.opened(); const path = '/evaluations/' + e.id;
    await f.call(path + '/self/submit', 'POST', { answers: f.answers(e) }, 1);
    await f.call(path + '/manager/submit', 'POST', { answers: f.answers(e) }, 2);
    const rows = (await f.get('/audit-logs?targetType=EVALUATION')).content;
    expect(rows).toHaveLength(2);
    for (const row of rows) { expect(Object.keys(row.before)).toEqual(['state']); expect(Object.keys(row.after)).toEqual(['state']); expect(Object.keys(row.metadata).sort()).toEqual(['cycleId', 'employeeId', 'reviewerId']); }
    const text = JSON.stringify(rows); for (const secret of ['비공개', 'score', 'grade', 'comment']) expect(text).not.toContain(secret);
  });
});

describe('3B mockFetch 연결과 데모 시드', () => {
  async function clients() {
    vi.resetModules();
    const { mockFetch } = await import('./mock');
    async function login(loginId: string) {
      const response = await mockFetch('http://localhost/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ loginId, password: 'demo1234!' }) });
      const { accessToken } = await response.json();
      return (path: string, method = 'GET', body?: unknown) => mockFetch('http://localhost/api/v1' + path, { method, headers: { Authorization: 'Bearer ' + accessToken }, body: body === undefined ? undefined : JSON.stringify(body) });
    }
    return { mockFetch, login, admin: await login('admin'), user: await login('EMP001') };
  }
  it('직책 PUT 우회 차단과 퇴사 해제는 발령 이력/감사에 연결된다', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-16T10:00:00+09:00'));
    try {
      const { admin } = await clients();
      const data = { employeeNo: 'NEW3B', name: '합성 신규', email: 'new3b@example.test', phone: '', hireDate: '2026-01-01', departmentId: 1, positionId: 1, role: 'EMPLOYEE', initialPassword: 'demo1234!', jobTitleId: 1 };
      const created = await (await admin('/employees', 'POST', data)).json(); expect(created.jobTitle).toBeNull();
      const path = '/employees/' + created.id;
      await code(await admin(path, 'PUT', { ...data, status: 'ACTIVE' }), 'APPOINTMENT_REQUIRED');
      const appointment = { departmentId: 1, positionId: 1, effectiveDate: '2026-10-16', reason: '합성 직책 지정', changeJobTitle: true, jobTitleId: 1 };
      expect((await admin(path + '/appointments', 'POST', appointment)).status).toBe(201);
      for (const jobTitleId of [undefined, null, 1]) {
        const response = await admin(path, 'PUT', { ...data, jobTitleId, status: 'ACTIVE' });
        expect(response.status).toBe(200); expect((await response.json()).jobTitle.id).toBe(1);
      }
      expect((await admin(path + '/retire', 'POST', { retireDate: '2026-10-16' })).status).toBe(200);
      expect((await (await admin(path)).json()).jobTitle).toBeNull();
      expect((await (await admin(path + '/appointments')).json()).totalElements).toBe(1);
      const log = (await (await admin('/audit-logs?action=EMPLOYEE_RETIRE&targetId=' + created.id)).json()).content[0];
      expect(log).toMatchObject({ before: { jobTitle: { id: 1 } }, after: { jobTitle: null } });
      await code(await admin('/job-titles/1', 'DELETE'), 'JOB_TITLE_IN_USE');
    } finally { vi.useRealTimers(); }
  });
  it('기존 31명 시드 수와 로그인 권한을 유지하며 급여/평가 합성 시드를 제공한다', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-16T10:00:00+09:00'));
    try {
      const { admin, user, mockFetch } = await clients();
      expect((await mockFetch('http://localhost/api/v1/organization')).status).toBe(401);
      const org = await (await user('/organization')).json();
      expect(org.employees).toHaveLength(31); expect(org.departments.find((d: { id: number }) => d.id === 2).parentId).toBe(1);
      expect((await (await admin('/dashboard')).json()).headcount.employed).toBe(31);
      const payroll = await (await admin('/payrolls/2026-09')).json();
      expect(payroll.payroll).toMatchObject({ status: 'CONFIRMED', count: 31 });
      expect(payroll.payslips.every((s: { demoNotice: string }) => s.demoNotice === demoNotice)).toBe(true);
      expect((await (await user('/payslips/me?month=2026-09')).json()).totalElements).toBe(1);
      const assigned = await (await admin('/evaluations/assigned')).json();
      expect(assigned.content.map((e: { state: string }) => e.state).sort()).toEqual(['FINALIZED', 'MANAGER_DRAFT', 'SELF_DRAFT', 'SELF_SUBMITTED'].sort());
      expect((await (await admin('/audit-logs?targetType=PAYROLL')).json()).totalElements).toBe(0);
      expect((await (await user('/notifications/me')).json()).totalElements).toBe(0);
    } finally { vi.useRealTimers(); }
  });
});

describe('3B v1.1 주기 상세 배정 요약', () => {
  it('DRAFT 상세만 사람 참조/null 평가 상태를 반환하고 기존 입력/목록 응답은 유지한다', async () => {
    const f = fixture();
    const created = await (await f.newCycle({ assignments: [{ employeeId: 4, reviewerId: 3 }, { employeeId: 1, reviewerId: 2 }] })).json();
    expect(created.assignments).toEqual([{ employeeId: 1, reviewerId: 2 }, { employeeId: 4, reviewerId: 3 }]);
    f.employees[0].employeeNo = 'ZZZ1'; f.employees[3].employeeNo = 'AAA4';
    const detail = await f.get('/evaluation-cycles/' + created.id);
    expect(detail.assignments.map((a: { employee: { id: number } }) => a.employee.id)).toEqual([4, 1]);
    for (const a of detail.assignments) {
      expect(a).toMatchObject({ evaluationId: null, state: null, incomplete: false, allowedActions: [] });
      expect(Object.keys(a).sort()).toEqual(['allowedActions', 'employee', 'evaluationId', 'incomplete', 'reviewer', 'state']);
      expect(Object.keys(a.employee).sort()).toEqual(['employeeNo', 'id', 'name']);
      expect(Object.keys(a.reviewer).sort()).toEqual(['employeeNo', 'id', 'name']);
    }
    expect((await f.get('/evaluation-cycles')).content[0].assignments).toEqual(created.assignments);
    await code(await f.call('/evaluation-cycles/' + created.id, 'GET', {}, 1), 'FORBIDDEN', 403);
  });
  it('OPEN 상세는 미확정 평가서 변경 액션만 제공하고 평가 상세 권한은 확대하지 않는다', async () => {
    const f = fixture(); const { cycle, evaluation: e } = await f.opened();
    const detail = await f.get('/evaluation-cycles/' + cycle.id, 3);
    expect(detail.assignments[0]).toMatchObject({ evaluationId: e.id, employee: { id: 1 }, reviewer: { id: 2 }, state: 'SELF_DRAFT', incomplete: false, allowedActions: ['REASSIGN_REVIEWER'] });
    for (const key of ['items', 'selfAnswers', 'managerAnswers', 'finalScore', 'grade']) expect(detail.assignments[0]).not.toHaveProperty(key);
    await code(await f.call('/evaluations/' + e.id, 'GET', {}, 3), 'NOT_FOUND', 404);
    await f.call('/evaluations/' + e.id + '/reviewer', 'PUT', { reviewerId: 3 }, 3);
    expect((await f.get('/evaluation-cycles/' + cycle.id)).assignments[0]).toMatchObject({ reviewer: { id: 3 }, evaluationId: e.id, allowedActions: ['REASSIGN_REVIEWER'] });
    await code(await f.call('/evaluations/' + e.id, 'GET', {}, 2), 'NOT_FOUND', 404);
  });
  it('확정 또는 CLOSED이면 변경 액션을 제거하고 마감 미완료를 표시한다', async () => {
    const f = fixture();
    const c = await (await f.newCycle({ assignments: [{ employeeId: 1, reviewerId: 2 }, { employeeId: 4, reviewerId: 3 }] })).json();
    await f.call('/evaluation-cycles/' + c.id + '/open', 'POST');
    const e = await f.get('/evaluations/' + (await f.get('/evaluations/me', 1)).content[0].id, 1);
    await f.call('/evaluations/' + e.id + '/self/submit', 'POST', { answers: f.answers(e) }, 1);
    await f.call('/evaluations/' + e.id + '/manager/submit', 'POST', { answers: f.answers(e) }, 2);
    const open = (await f.get('/evaluation-cycles/' + c.id)).assignments;
    expect(open.find((a: { employee: { id: number } }) => a.employee.id === 1)).toMatchObject({ state: 'FINALIZED', allowedActions: [], incomplete: false });
    expect(open.find((a: { employee: { id: number } }) => a.employee.id === 4)).toMatchObject({ state: 'SELF_DRAFT', allowedActions: ['REASSIGN_REVIEWER'] });
    await f.call('/evaluation-cycles/' + c.id + '/close', 'POST');
    const closed = (await f.get('/evaluation-cycles/' + c.id)).assignments;
    expect(closed.every((a: { allowedActions: string[] }) => a.allowedActions.length === 0)).toBe(true);
    expect(closed.find((a: { employee: { id: number } }) => a.employee.id === 1).incomplete).toBe(false);
    expect(closed.find((a: { employee: { id: number } }) => a.employee.id === 4).incomplete).toBe(true);
  });
});
