// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { annualGrant, anniversary, seoulClock, workdays } from './mock-phase3a';

describe('3A 서울 날짜 및 연차 발생 계약', () => {
  it('UTC 날짜와 무관하게 서울 자정으로 업무일을 구분한다', () => {
    expect(seoulClock(new Date('2026-10-15T14:59:59Z'))).toMatchObject({ date: '2026-10-15', time: '23:59:59' });
    expect(seoulClock(new Date('2026-10-15T15:00:00Z'))).toEqual({ date: '2026-10-16', time: '00:00:00', instant: '2026-10-16T00:00:00+09:00' });
  });
  it('입사 전과 한 달 미만에는 연차가 발생하지 않는다', () => {
    expect(annualGrant('2026-01-31', '2026-01-01').granted).toBe(0);
    expect(annualGrant('2026-01-31', '2026-02-27').granted).toBe(0);
  });
  it('월말 입사자의 월별 기념일과 최대 11일을 적용한다', () => {
    expect(annualGrant('2026-01-31', '2026-02-28').granted).toBe(1);
    expect(annualGrant('2026-01-31', '2026-03-30').granted).toBe(1);
    expect(annualGrant('2026-01-31', '2026-03-31').granted).toBe(2);
    expect(annualGrant('2026-01-31', '2027-01-30')).toEqual({ periodStart: '2026-01-31', periodEnd: '2027-01-30', granted: 11 });
  });
  it('첫 주년에 이전 잔여를 이월하지 않고 15일을 부여한다', () => {
    expect(annualGrant('2026-01-31', '2027-01-31')).toEqual({ periodStart: '2027-01-31', periodEnd: '2028-01-30', granted: 15 });
  });
  it('근속 가산은 3주년에 16일이고 최대 25일이다', () => {
    expect(annualGrant('2020-06-01', '2022-06-01').granted).toBe(15);
    expect(annualGrant('2020-06-01', '2023-06-01').granted).toBe(16);
    expect(annualGrant('2000-06-01', '2026-06-01').granted).toBe(25);
  });
  it('2월29일 입사자는 평년 2월28일, 윤년 2월29일 기념일이다', () => {
    expect(anniversary('2024-02-29', 1)).toBe('2025-02-28');
    expect(anniversary('2024-02-29', 4)).toBe('2028-02-29');
    expect(annualGrant('2024-02-29', '2025-02-28')).toEqual({ periodStart: '2025-02-28', periodEnd: '2026-02-27', granted: 15 });
  });
  it('휴가와 월별 근태의 근무일은 월요일부터 금요일까지다', () => {
    expect(workdays('2026-10-16', '2026-10-20')).toEqual(['2026-10-16', '2026-10-19', '2026-10-20']);
    expect(workdays('2026-10-17', '2026-10-18')).toEqual([]);
  });
});

import { createPhase3a } from './mock-phase3a';
import type { Phase3Audit } from './mock-phase3a';
import type { Employee } from './types';

function fixture(start = '2026-10-16T10:00:00+09:00') {
  let instant = new Date(start);
  const employees: Employee[] = [1, 2, 3].map(id => ({ id, employeeNo: `DEMO${id}`, name: `합성 ${id}`, role: id === 1 ? 'EMPLOYEE' : 'ADMIN', email: `demo${id}@example.test`, phone: '', hireDate: '2024-01-01', status: 'ACTIVE', retireDate: null, department: { id: 1, name: '개발' }, position: { id: 1, name: '사원', level: 1 } }));
  const audits: Parameters<Phase3Audit>[] = [];
  const phase = createPhase3a({ employees, clock: () => new Date(instant), audit: (...args) => audits.push(JSON.parse(JSON.stringify(args))) });
  const call = async (path: string, method = 'GET', body: Record<string, unknown> = {}, user = 1) => (await phase.handle(new URL('http://localhost/api/v1' + path), method, body, employees[user - 1]))!;
  const get = async (path: string, user = 1) => (await call(path, 'GET', {}, user)).json();
  const requestLeave = async (overrides: Record<string, unknown> = {}, user = 1) => call('/leaves', 'POST', { type: 'ANNUAL', startDate: '2026-10-19', endDate: '2026-10-19', reason: '비공개 신청 사유', ...overrides }, user);
  const approve = (id: number, user = 2) => call(`/leaves/${id}/approve`, 'POST', {}, user);
  return { employees, audits, phase, call, get, requestLeave, approve, setTime: (value: string) => { instant = new Date(value); } };
}

async function expectCode(response: Response, code: string, status = 409) {
  expect(response.status).toBe(status); expect((await response.json()).code).toBe(code);
}

describe('3A 근태 계약', () => {
  it('서버 시각만 사용하고 초 단위 경계와 출퇴근 중복을 처리한다', async () => {
    const f = fixture('2026-10-16T09:00:00.999+09:00');
    await expectCode(await f.call('/attendance/me/check-out', 'POST'), 'NOT_CHECKED_IN');
    await expectCode(await f.call('/attendance/me/check-in', 'POST', { checkIn: '2026-10-16T08:00:00+09:00' }), 'VALIDATION_ERROR', 400);
    const first = await f.call('/attendance/me/check-in', 'POST');
    expect(await first.json()).toMatchObject({ checkIn: '2026-10-16T09:00:00+09:00', late: false, earlyLeave: false, status: 'INCOMPLETE', leaves: [] });
    await expectCode(await f.call('/attendance/me/check-in', 'POST'), 'ALREADY_CHECKED_IN');
    f.setTime('2026-10-16T17:59:59+09:00');
    expect(await (await f.call('/attendance/me/check-out', 'POST')).json()).toMatchObject({ earlyLeave: true, status: 'COMPLETE' });
    await expectCode(await f.call('/attendance/me/check-out', 'POST'), 'ALREADY_CHECKED_OUT');
    expect(f.audits).toHaveLength(0);
  });
  it('09:00:01은 지각이고 18:00:00은 정상 퇴근이다', async () => {
    const f = fixture('2026-10-16T09:00:01+09:00');
    expect(await (await f.call('/attendance/me/check-in', 'POST')).json()).toMatchObject({ late: true });
    f.setTime('2026-10-16T18:00:00+09:00');
    expect(await (await f.call('/attendance/me/check-out', 'POST')).json()).toMatchObject({ earlyLeave: false });
  });
  it('월 조회는 미래 날짜도 포함한 모든 평일을 반환하고 주말 조회는 허용한다', async () => {
    const f = fixture('2026-10-17T10:00:00+09:00');
    expect(await f.get('/attendance/me/today')).toMatchObject({ date: '2026-10-17', status: 'NO_RECORD', late: false, earlyLeave: false });
    await expectCode(await f.call('/attendance/me/check-in', 'POST'), 'NOT_A_WORKDAY');
    const month = await f.get('/attendance/me?month=2026-10');
    expect(month.days.map((d: { date: string }) => d.date)).toEqual(workdays('2026-10-01', '2026-10-31'));
    expect(month.days).toHaveLength(22);
    await expectCode(await f.call('/attendance?employeeId=1&month=2026-10'), 'FORBIDDEN', 403);
    expect((await f.call('/attendance?employeeId=1&month=2026-10', 'GET', {}, 2)).status).toBe(200);
    for (const query of ['', '?month=2026-13', '?month=not-date']) await expectCode(await f.call('/attendance/me' + query), 'VALIDATION_ERROR', 400);
  });
  it('휴직과 미래 입사는 출퇴근과 휴가신청을 막는다', async () => {
    const f = fixture();
    for (const state of [{ status: 'ON_LEAVE' as const, hireDate: '2024-01-01' }, { status: 'ACTIVE' as const, hireDate: '2026-10-19' }]) {
      Object.assign(f.employees[0], state);
      for (const route of ['check-in', 'check-out']) await expectCode(await f.call('/attendance/me/' + route, 'POST'), 'EMPLOYEE_NOT_ACTIVE');
      await expectCode(await f.requestLeave(), 'EMPLOYEE_NOT_ACTIVE');
    }
  });
  it.each([['HALF_AM', '14:00:00', '18:00:00'], ['HALF_PM', '09:00:00', '14:00:00']])('%s 기준과 승인/취소 후 재판정을 적용한다', async (type, expectedStart, expectedEnd) => {
    const f = fixture();
    const leave = await (await f.requestLeave({ type })).json(); await f.approve(leave.id);
    const before = await f.get('/attendance/me?month=2026-10');
    expect(before.days.find((d: { date: string }) => d.date === '2026-10-19')).toMatchObject({ expectedStart, expectedEnd, leaves: [{ id: leave.id, type }] });
    await f.call(`/leaves/${leave.id}/cancel`, 'POST');
    const after = await f.get('/attendance/me?month=2026-10');
    expect(after.days.find((d: { date: string }) => d.date === '2026-10-19')).toMatchObject({ expectedStart: '09:00:00', expectedEnd: '18:00:00', leaves: [] });
  });
  it('같은 날 서로 다른 반차는 예약 가능하고 양쪽 승인 시 종일휴가이다', async () => {
    const f = fixture();
    for (const type of ['HALF_AM', 'HALF_PM']) { const leave = await (await f.requestLeave({ type })).json(); await f.approve(leave.id); }
    f.setTime('2026-10-19T14:00:00+09:00');
    const day = await f.get('/attendance/me/today');
    expect(day).toMatchObject({ status: 'LEAVE', late: false, earlyLeave: false, expectedStart: '14:00:00', expectedEnd: '14:00:00' });
    expect(day.leaves).toHaveLength(2);
    await expectCode(await f.call('/attendance/me/check-in', 'POST'), 'ON_LEAVE_DAY');
  });
  it('정정은 관리자 전용이고 날짜/시각/순서/사유를 검사한다', async () => {
    const f = fixture('2026-10-16T19:00:00+09:00');
    const body = { checkIn: '2026-10-16T09:00:00+09:00', checkOut: '2026-10-16T18:00:00+09:00', reason: '비공개 정정 사유' };
    await expectCode(await f.call('/attendance/1/2026-10-16', 'PUT', body), 'FORBIDDEN', 403);
    for (const change of [{ checkIn: null }, { checkIn: '09:00:00' }, { checkIn: '2026-10-16T20:00:00+09:00' }, { checkIn: '2026-10-15T09:00:00+09:00' }, { checkOut: body.checkIn }, { reason: ' ' }, { reason: 'x'.repeat(201) }]) await expectCode(await f.call('/attendance/1/2026-10-16', 'PUT', { ...body, ...change }, 2), 'VALIDATION_ERROR', 400);
    await expectCode(await f.call('/attendance/1/2026-10-11', 'PUT', body, 2), 'NOT_A_WORKDAY');
    const result = await f.call('/attendance/1/2026-10-16', 'PUT', { ...body, checkOut: null }, 2);
    expect(await result.json()).toMatchObject({ status: 'INCOMPLETE', corrected: true, checkOut: null });
    expect(f.audits[0][1]).toBe('ATTENDANCE_CORRECT'); expect(f.audits[0][2]).toBe('EMPLOYEE'); expect(f.audits[0][3]).toBeNull(); expect(f.audits[0][4]).toMatchObject({ corrected: true }); expect(f.audits[0][5]).toEqual({ date: '2026-10-16', reason: body.reason }); expect(f.audits[0][6]).toMatchObject({ id: 1 });
    const notification = (await f.get('/notifications/me')).content[0];
    expect(notification).toMatchObject({ type: 'ATTENDANCE_CORRECTED', targetType: 'ATTENDANCE', targetId: null, targetDate: '2026-10-16' });
    expect(notification.message).not.toContain('비공개');
  });
  it('종일휴가 정정은 허용하고 실제 시각과 무관하게 지각/조퇴는 false다', async () => {
    const f = fixture();
    const leave = await (await f.requestLeave({ startDate: '2026-10-16', endDate: '2026-10-16', type: 'SICK' })).json();
    await f.approve(leave.id); f.setTime('2026-10-16T19:00:00+09:00');
    const result = await f.call('/attendance/1/2026-10-16', 'PUT', { checkIn: '2026-10-16T11:00:00+09:00', checkOut: '2026-10-16T12:00:00+09:00', reason: '합성 정정' }, 2);
    expect(await result.json()).toMatchObject({ status: 'LEAVE', late: false, earlyLeave: false, corrected: true });
    expect(f.phase.hireDateError(1, '2026-10-17')?.status).toBe(409);
  });
});

describe('3A 휴가 상태/잔액 계약', () => {
  it('신청 예약, 승인 사용, 미래 승인 취소 복원과 결정 이력 보존', async () => {
    const f = fixture();
    const original = await f.get('/leaves/me/balance');
    const result = await f.requestLeave();
    expect(result.status).toBe(201);
    const leave = await result.json();
    expect(leave).toMatchObject({ status: 'PENDING', days: 1, allowedActions: ['CANCEL'] });
    expect(await f.get('/leaves/me/balance')).toMatchObject({ reserved: 1, used: 0, available: original.granted - 1 });
    const approved = await (await f.approve(leave.id)).json();
    expect(approved).toMatchObject({ status: 'APPROVED', decidedBy: { id: 2 }, allowedActions: [] });
    expect(await f.get('/leaves/me/balance')).toMatchObject({ reserved: 0, used: 1, available: original.granted - 1 });
    const cancelled = await (await f.call('/leaves/' + leave.id + '/cancel', 'POST')).json();
    expect(cancelled).toMatchObject({ status: 'CANCELLED', cancelledBy: 'SELF', decidedBy: approved.decidedBy, decidedAt: approved.decidedAt, allowedActions: [] });
    expect(await f.get('/leaves/me/balance')).toMatchObject({ used: 0, reserved: 0, available: original.granted });
    expect(f.audits.map(a => a[1])).toEqual(['LEAVE_REQUEST', 'LEAVE_APPROVE', 'LEAVE_CANCEL']);
    expect(f.audits[0][3]).toBeNull();
    expect(f.audits[0][4]).not.toHaveProperty('allowedActions');
  });
  it('PENDING 취소/반려는 예약을 복원하고 반려 사유는 필수다', async () => {
    const f = fixture();
    const first = await (await f.requestLeave()).json();
    await expectCode(await f.call('/leaves/' + first.id + '/reject', 'POST', {}, 2), 'VALIDATION_ERROR', 400);
    const rejected = await f.call('/leaves/' + first.id + '/reject', 'POST', { reason: '비공개 반려 사유' }, 2);
    expect(await rejected.json()).toMatchObject({ status: 'REJECTED', rejectReason: '비공개 반려 사유', decidedBy: { id: 2 } });
    expect(await f.get('/leaves/me/balance')).toMatchObject({ reserved: 0, used: 0 });
    const next = await (await f.requestLeave()).json();
    expect((await f.call('/leaves/' + next.id + '/cancel', 'POST')).status).toBe(200);
    expect(await f.get('/leaves/me/balance')).toMatchObject({ reserved: 0, used: 0 });
    for (const id of [first.id, next.id]) await expectCode(await f.approve(id), 'LEAVE_ALREADY_PROCESSED');
  });
  it('미발생 연차는 선사용할 수 없고 병가는 잔액을 차감하지 않는다', async () => {
    const f = fixture();
    f.employees[0].hireDate = '2026-10-16';
    expect(await f.get('/leaves/me/balance')).toMatchObject({ granted: 0, available: 0 });
    await expectCode(await f.requestLeave(), 'INSUFFICIENT_LEAVE_BALANCE');
    const sick = await f.requestLeave({ type: 'SICK', endDate: '2026-10-23' });
    expect(sick.status).toBe(201);
    const leave = await sick.json(); expect(leave.days).toBe(5);
    await f.approve(leave.id);
    expect(await f.get('/leaves/me/balance')).toMatchObject({ granted: 0, reserved: 0, used: 0, available: 0 });
  });
  it('현재기간 경계, 과거, 주말, 반차 다일, 필수 사유를 검사한다', async () => {
    const f = fixture();
    await expectCode(await f.requestLeave({ endDate: '2027-01-01' }), 'LEAVE_PERIOD_BOUNDARY', 400);
    for (const override of [{ startDate: '2026-10-15' }, { startDate: '2026-10-17', endDate: '2026-10-18' }, { type: 'HALF_AM', endDate: '2026-10-20' }, { reason: '' }, { reason: 'x'.repeat(201) }, { type: 'UNKNOWN' }]) await expectCode(await f.requestLeave(override), 'VALIDATION_ERROR', 400);
  });
  it('평일 AM/PM 중복은 PENDING/APPROVED 모두 막고 주말은 차감하지 않는다', async () => {
    const f = fixture();
    const first = await (await f.requestLeave({ type: 'HALF_AM' })).json();
    await expectCode(await f.requestLeave({ type: 'HALF_AM' }), 'LEAVE_OVERLAP');
    await expectCode(await f.requestLeave({ type: 'ANNUAL' }), 'LEAVE_OVERLAP');
    const otherHalf = await f.requestLeave({ type: 'HALF_PM' }); expect(otherHalf.status).toBe(201);
    await f.approve(first.id);
    await expectCode(await f.requestLeave({ type: 'SICK' }), 'LEAVE_OVERLAP');
    const spanning = await (await f.requestLeave({ startDate: '2026-10-23', endDate: '2026-10-26' })).json();
    expect(spanning.days).toBe(2);
  });
  it('자기 승인/반려는 관리자도 금지하고 타인 상세와 취소 권한을 분리한다', async () => {
    const f = fixture();
    const mine = await (await f.requestLeave({}, 2)).json();
    for (const action of ['approve', 'reject']) await expectCode(await f.call('/leaves/' + mine.id + '/' + action, 'POST', { reason: '합성 사유' }, 2), 'FORBIDDEN', 403);
    await expectCode(await f.call('/leaves/' + mine.id), 'FORBIDDEN', 403);
    await expectCode(await f.call('/leaves/' + mine.id + '/cancel', 'POST', {}, 3), 'FORBIDDEN', 403);
    expect((await f.approve(mine.id, 3)).status).toBe(200);
    await expectCode(await f.call('/leaves/999999'), 'NOT_FOUND', 404);
  });
  it('지난 대기는 본인 취소·타 관리자 반려가 가능하고 시작한 승인 휴가는 취소불가다', async () => {
    const f = fixture();
    const pending = await (await f.requestLeave({ type: 'HALF_AM' })).json();
    const approved = await (await f.requestLeave({ type: 'HALF_PM' })).json();
    const rejected = await (await f.requestLeave({ type: 'SICK', startDate: '2026-10-16', endDate: '2026-10-16' })).json();
    await f.approve(approved.id);
    f.setTime('2026-10-19T00:00:00+09:00');
    await expectCode(await f.call('/leaves/' + approved.id + '/cancel', 'POST'), 'LEAVE_START_PASSED');
    f.setTime('2026-10-20T00:00:00+09:00');
    expect((await f.get('/leaves/' + pending.id)).allowedActions).toEqual(['CANCEL']);
    expect((await f.get('/leaves/' + pending.id, 2)).allowedActions).toEqual(['REJECT']);
    await expectCode(await f.approve(pending.id), 'LEAVE_START_PASSED');
    expect((await f.call('/leaves/' + pending.id + '/cancel', 'POST')).status).toBe(200);
    expect(await f.get('/leaves/' + pending.id)).toMatchObject({ status: 'CANCELLED', allowedActions: [] });
    expect((await f.call('/leaves/' + rejected.id + '/reject', 'POST', { reason: '지난 신청 정리' }, 2)).status).toBe(200);
  });
  it('다른 활성 관리자가 없어도 신청 가능하며 approverAvailable=false다', async () => {
    const f = fixture();
    f.employees[1].status = 'ON_LEAVE'; f.employees[2].status = 'RETIRED';
    expect(await f.get('/leaves/me/balance')).toMatchObject({ approverAvailable: false });
    expect((await f.requestLeave()).status).toBe(201);
    expect((await f.get('/notifications/me', 2)).totalElements).toBe(0);
  });
  it('목록은 본인/관리자 권한, 상태 필터, 고정 정렬, 페이지를 적용한다', async () => {
    const f = fixture();
    const first = await (await f.requestLeave({ type: 'HALF_AM' })).json();
    const second = await (await f.requestLeave({ type: 'HALF_PM' })).json();
    expect((await f.get('/leaves/me?status=PENDING&size=1')).content[0].id).toBe(second.id);
    expect((await f.get('/leaves/me?status=PENDING&size=1&page=1')).content[0].id).toBe(first.id);
    await expectCode(await f.call('/leaves'), 'FORBIDDEN', 403);
    expect((await f.get('/leaves?employeeId=1&status=PENDING', 2)).totalElements).toBe(2);
    expect((await f.get('/leaves?employeeId=2', 2)).totalElements).toBe(0);
    for (const query of ['status=UNKNOWN', 'size=101', 'page=-1']) await expectCode(await f.call('/leaves/me?' + query), 'VALIDATION_ERROR', 400);
  });
  it('기념일이 지나면 이전 기간 사용/예약과 잔여를 새 기간에 이월하지 않는다', async () => {
    const f = fixture();
    f.employees[0].hireDate = '2025-10-20';
    const leave = await (await f.requestLeave()).json(); await f.approve(leave.id);
    expect(await f.get('/leaves/me/balance')).toMatchObject({ granted: 11, used: 1 });
    f.setTime('2026-10-20T10:00:00+09:00');
    expect(await f.get('/leaves/me/balance')).toMatchObject({ periodStart: '2026-10-20', granted: 15, used: 0, reserved: 0, available: 15 });
  });
  it('퇴사 시 모든 대기/미래 승인은 SYSTEM취소하고 진행중 승인은 보존한다', async () => {
    const f = fixture();
    const pending = await (await f.requestLeave({ startDate: '2026-10-16', endDate: '2026-10-16', type: 'HALF_AM' })).json();
    const today = await (await f.requestLeave({ startDate: '2026-10-16', endDate: '2026-10-16', type: 'HALF_PM' })).json(); await f.approve(today.id);
    const future = await (await f.requestLeave()).json(); await f.approve(future.id);
    f.setTime('2026-10-17T10:00:00+09:00');
    f.employees[0].status = 'RETIRED'; f.phase.retire(f.employees[0], f.employees[1]);
    for (const id of [pending.id, future.id]) expect(await f.get('/leaves/' + id, 2)).toMatchObject({ status: 'CANCELLED', cancelledBy: 'SYSTEM' });
    expect(await f.get('/leaves/' + today.id, 2)).toMatchObject({ status: 'APPROVED' });
    const system = f.audits.filter(a => a[1] === 'LEAVE_CANCEL');
    expect(system).toHaveLength(2); expect(system.every(a => a[5]?.system === true)).toBe(true);
  });
  it('취소/반려 기록도 입사일 변경을 막고 근태 첫 기록 이후 변경은400이다', async () => {
    const f = fixture();
    await f.call('/attendance/me/check-in', 'POST');
    expect(f.phase.hireDateError(1, '2026-10-17')?.status).toBe(400);
    const leave = await (await f.requestLeave()).json(); await f.call('/leaves/' + leave.id + '/cancel', 'POST');
    expect(f.phase.hireDateError(1, '2024-02-01')?.status).toBe(409);
    expect(f.phase.hireDateError(1, '2024-01-01')).toBeUndefined();
  });
});

describe('3A 알림 계약', () => {
  it('신청은 본인 제외 활성관리자, 결정은 신청자에게 전달하며 사유를 노출하지 않는다', async () => {
    const f = fixture();
    const leave = await (await f.requestLeave({}, 2)).json();
    expect((await f.get('/notifications/me', 2)).totalElements).toBe(0);
    expect((await f.get('/notifications/me', 3)).content[0]).toMatchObject({ type: 'LEAVE_REQUESTED', targetId: leave.id, read: false });
    await f.approve(leave.id, 3);
    const notice = (await f.get('/notifications/me', 2)).content[0];
    expect(notice).toMatchObject({ type: 'LEAVE_APPROVED', targetId: leave.id, targetDate: null });
    expect(JSON.stringify(notice)).not.toContain('비공개');
    expect(notice).not.toHaveProperty('recipientId');
  });
  it('개별읽음은 멱등이고 타인/없는 알림은404다', async () => {
    const f = fixture(); await f.requestLeave();
    const notice = (await f.get('/notifications/me', 2)).content[0];
    await expectCode(await f.call('/notifications/' + notice.id + '/read', 'POST'), 'NOT_FOUND', 404);
    await expectCode(await f.call('/notifications/99999/read', 'POST', {}, 2), 'NOT_FOUND', 404);
    for (let i = 0; i < 2; i++) { const result = await f.call('/notifications/' + notice.id + '/read', 'POST', {}, 2); expect(result.status).toBe(204); expect(await result.text()).toBe(''); }
    expect(await f.get('/notifications/me/unread-count', 2)).toEqual({ count: 0 });
    expect((await f.get('/notifications/me?unreadOnly=true', 2)).totalElements).toBe(0);
  });
  it('일괄읽음은 화면의 upToId까지만 갱신하고 이후 알림은 보존한다', async () => {
    const f = fixture();
    const first = await (await f.requestLeave()).json();
    const max = (await f.get('/notifications/me', 2)).content[0].id;
    await f.call('/leaves/' + first.id + '/cancel', 'POST');
    expect(await (await f.call('/notifications/me/read-all', 'POST', { upToId: max }, 2)).json()).toEqual({ updatedCount: 1 });
    expect(await f.get('/notifications/me/unread-count', 2)).toEqual({ count: 1 });
    expect(await f.get('/notifications/me/unread-count', 3)).toEqual({ count: 2 });
    expect(await (await f.call('/notifications/me/read-all', 'POST', { upToId: max }, 2)).json()).toEqual({ updatedCount: 0 });
    await expectCode(await f.call('/notifications/me/read-all', 'POST', {}, 2), 'VALIDATION_ERROR', 400);
    await expectCode(await f.call('/notifications/me?unreadOnly=yes', 'GET', {}, 2), 'VALIDATION_ERROR', 400);
    expect(f.audits.map(a => a[1])).toEqual(['LEAVE_REQUEST', 'LEAVE_CANCEL']);
  });
  it('같은 신청 중복승인은409이며 중복 감사와 알림이 생기지 않는다', async () => {
    const f = fixture(); const leave = await (await f.requestLeave()).json();
    const results = await Promise.all([f.approve(leave.id, 2), f.approve(leave.id, 3)]);
    expect(results.map(r => r.status).sort()).toEqual([200, 409]);
    expect(f.audits.filter(a => a[1] === 'LEAVE_APPROVE')).toHaveLength(1);
    expect((await f.get('/notifications/me')).totalElements).toBe(1);
  });
});



import { vi } from 'vitest';

describe('기존 목업과 3A 연결 계약', () => {
  it('실제 라우팅에서 휴가 기록 입사일 잠금/퇴사자동취소/감사필터를 연결한다', async () => {
    vi.resetModules(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-16T19:00:00+09:00'));
    try {
      const { mockFetch } = await import('./mock');
      async function login(loginId: string) {
        const response = await mockFetch('http://localhost/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ loginId, password: 'demo1234!' }) });
        const token = (await response.json()).accessToken;
        return (path: string, method = 'GET', body?: unknown) => mockFetch('http://localhost/api/v1' + path, { method, headers: { Authorization: 'Bearer ' + token }, body: body === undefined ? undefined : JSON.stringify(body) });
      }
      const user = await login('EMP001'), admin = await login('admin');
      expect((await mockFetch('http://localhost/api/v1/leaves/me/balance')).status).toBe(401);
      const leave = await (await user('/leaves', 'POST', { type: 'ANNUAL', startDate: '2026-10-19', endDate: '2026-10-19', reason: '합성 신청' })).json();
      const e = await (await admin('/employees/2')).json();
      await expectCode(await admin('/employees/2', 'PUT', { ...e, hireDate: '2026-01-02' }), 'LEAVE_RECORDS_EXIST');
      expect((await admin('/leaves/' + leave.id + '/approve', 'POST')).status).toBe(200);
      const logs = await (await admin('/audit-logs?targetType=LEAVE&action=LEAVE_APPROVE')).json();
      expect(logs.content[0]).toMatchObject({ targetType: 'LEAVE', targetId: leave.id, before: { status: 'PENDING' }, after: { status: 'APPROVED' }, metadata: {} });
      expect(logs.content[0].after).not.toHaveProperty('allowedActions');
      expect((await admin('/employees/2/retire', 'POST', { retireDate: '2026-10-16' })).status).toBe(200);
      expect(await (await admin('/leaves/' + leave.id)).json()).toMatchObject({ status: 'CANCELLED', cancelledBy: 'SYSTEM' });
      const cancelled = await (await admin('/audit-logs?action=LEAVE_CANCEL&targetType=LEAVE')).json();
      expect(cancelled.content[0].metadata).toEqual({ system: true });
      expect((await user('/leaves/me')).status).toBe(401);
    } finally { vi.useRealTimers(); }
  });
  it('정정 감사는 EMPLOYEE 대상과 허용 필드만 기록하고 기존 인원 수를 보존한다', async () => {
    vi.resetModules(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-16T19:00:00+09:00'));
    try {
      const { mockFetch } = await import('./mock');
      const login = await mockFetch('http://localhost/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ loginId: 'EMP030', password: 'demo1234!' }) });
      const session = await login.json(); expect(session.user.role).toBe('ADMIN');
      const request = (path: string, method = 'GET', body?: unknown) => mockFetch('http://localhost/api/v1' + path, { method, headers: { Authorization: 'Bearer ' + session.accessToken }, body: body === undefined ? undefined : JSON.stringify(body) });
      expect((await (await request('/dashboard')).json()).headcount.employed).toBe(31);
      expect((await request('/attendance/2/2026-10-16', 'PUT', { checkIn: '2026-10-16T09:00:00+09:00', reason: '합성 정정' })).status).toBe(200);
      const logs = await (await request('/audit-logs?action=ATTENDANCE_CORRECT&targetType=EMPLOYEE&targetId=2')).json();
      expect(logs.content).toHaveLength(1);
      expect(logs.content[0]).toMatchObject({ targetId: 2, before: null, after: { checkIn: '2026-10-16T09:00:00+09:00', checkOut: null, corrected: true }, metadata: { date: '2026-10-16', reason: '합성 정정' } });
      expect(Object.keys(logs.content[0].after).sort()).toEqual(['checkIn', 'checkOut', 'corrected']);
      const e = await (await request('/employees/2')).json();
      await expectCode(await request('/employees/2', 'PUT', { ...e, hireDate: '2026-10-17' }), 'VALIDATION_ERROR', 400);
    } finally { vi.useRealTimers(); }
  });
});
