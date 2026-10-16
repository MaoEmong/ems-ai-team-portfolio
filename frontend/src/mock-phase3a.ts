import type { Employee } from './types';
import { clone, fail, json, page, validDate } from './mock-phase2';

export type LeaveType = 'ANNUAL' | 'HALF_AM' | 'HALF_PM' | 'SICK';
export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
type Identity = Pick<Employee, 'id' | 'employeeNo' | 'name'>;
export interface MockLeave {
  id: number; employee: Identity; type: LeaveType; startDate: string; endDate: string;
  days: number; reason: string; status: LeaveStatus; rejectReason: string | null;
  decidedBy: { id: number; name: string } | null; decidedAt: string | null;
  cancelledBy: 'SELF' | 'SYSTEM' | null; createdAt: string;
}
export interface MockAttendanceDay {
  date: string; checkIn: string | null; checkOut: string | null; late: boolean;
  earlyLeave: boolean; status: 'NO_RECORD' | 'INCOMPLETE' | 'COMPLETE' | 'LEAVE';
  expectedStart: string; expectedEnd: string; leaves: { id: number; type: LeaveType }[]; corrected: boolean;
}
export interface MockNotification {
  id: number; type: string; targetType: 'LEAVE' | 'ATTENDANCE'; targetId: number | null;
  targetDate: string | null; message: string; read: boolean; createdAt: string;
}
export interface Phase3Audit {
  (actor: Employee | undefined, action: string, targetType: 'LEAVE' | 'EMPLOYEE', before: object | null, after: object | null, metadata?: Record<string, unknown>, target?: { id: number; label: string }): void;
}
interface State {
  employees: Employee[];
  audit: Phase3Audit;
  clock?: () => Date;
}
const identity = (e: Employee): Identity => ({ id: e.id, employeeNo: e.employeeNo, name: e.name });
export function seoulClock(date: Date) {
  const local = new Date(date.getTime() + 9 * 3600000).toISOString();
  return { date: local.slice(0, 10), time: local.slice(11, 19), instant: local.slice(0, 19) + '+09:00' };
}
export function shiftDay(date: string, days: number) {
  const value = new Date(date + 'T00:00:00Z'); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10);
}
export function isWorkday(date: string) { const day = new Date(date + 'T00:00:00Z').getUTCDay(); return day !== 0 && day !== 6; }
export function workdays(start: string, end: string) {
  const days: string[] = [];
  for (let date = start; date <= end; date = shiftDay(date, 1)) if (isWorkday(date)) days.push(date);
  return days;
}
// Clamp each anniversary from the original hire date, so leap-day hires return
// to February 29 in a leap year rather than permanently shifting to February 28.
export function anniversary(hireDate: string, years: number) {
  const year = Number(hireDate.slice(0, 4)) + years, month = Number(hireDate.slice(5, 7));
  const day = Math.min(Number(hireDate.slice(8)), new Date(Date.UTC(year, month, 0)).getUTCDate());
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
function monthAnniversary(hireDate: string, months: number) {
  const anchor = new Date(hireDate + 'T00:00:00Z');
  const first = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + months, 1));
  const day = Math.min(anchor.getUTCDate(), new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate());
  first.setUTCDate(day); return first.toISOString().slice(0, 10);
}
export function annualGrant(hireDate: string, today: string) {
  let years = Math.max(0, Number(today.slice(0, 4)) - Number(hireDate.slice(0, 4)));
  if (years > 0 && anniversary(hireDate, years) > today) years--;
  const periodStart = anniversary(hireDate, years), periodEnd = shiftDay(anniversary(hireDate, years + 1), -1);
  const granted = today < hireDate ? 0 : years === 0
    ? Array.from({ length: 11 }, (_, i) => monthAnniversary(hireDate, i + 1)).filter(date => date <= today).length
    : Math.min(25, 15 + Math.floor((years - 1) / 2));
  return { periodStart, periodEnd, granted };
}


interface AttendanceRecord { checkIn: string; checkOut: string | null; corrected: boolean }
export function createPhase3a(state: State) {
  const clock = state.clock ?? (() => new Date());
  const leaves: MockLeave[] = [];
  const records = new Map<string, AttendanceRecord>();
  const notifications: (MockNotification & { recipientId: number })[] = [];
  const now = () => seoulClock(clock());
  const key = (employeeId: number, date: string) => `${employeeId}/${date}`;
  const active = (e: Employee) => e.status === 'ACTIVE' && e.hireDate <= now().date;
  const admins = (employeeId: number) => state.employees.filter(e => e.role === 'ADMIN' && e.status === 'ACTIVE' && e.id !== employeeId);
  const reasonValid = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= 200;
  const reject = (code: string, status = 409, field?: string) => fail(code, status, field);
  function balance(employee: Employee) {
    const period = annualGrant(employee.hireDate, now().date);
    const inPeriod = leaves.filter(l => l.employee.id === employee.id && l.type !== 'SICK' && l.startDate >= period.periodStart && l.endDate <= period.periodEnd);
    const used = inPeriod.filter(l => l.status === 'APPROVED').reduce((n, l) => n + l.days, 0);
    const reserved = inPeriod.filter(l => l.status === 'PENDING').reduce((n, l) => n + l.days, 0);
    return { ...period, used, reserved, available: period.granted - used - reserved, approverAvailable: admins(employee.id).length > 0 };
  }
  function allowedActions(l: MockLeave, me: Employee): string[] {
    const today = now().date;
    if (l.employee.id === me.id) {
      if (l.status === 'PENDING' || (l.status === 'APPROVED' && l.startDate > today)) return ['CANCEL'];
      return [];
    }
    if (me.role === 'ADMIN' && l.status === 'PENDING') return l.startDate >= today ? ['APPROVE', 'REJECT'] : ['REJECT'];
    return [];
  }
  const leaveDto = (l: MockLeave, me: Employee) => ({ ...clone(l), allowedActions: allowedActions(l, me) });
  function notify(recipients: number[], type: string, targetType: MockNotification['targetType'], targetId: number | null, targetDate: string | null) {
    const messages: Record<string, string> = {
      LEAVE_REQUESTED: '새 휴가 신청이 있습니다.', LEAVE_APPROVED: '휴가가 승인되었습니다.',
      LEAVE_REJECTED: '휴가가 반려되었습니다.', LEAVE_CANCELLED: '휴가가 취소되었습니다.', ATTENDANCE_CORRECTED: '근태 기록이 정정되었습니다.',
    };
    for (const recipientId of new Set(recipients)) notifications.push({ id: notifications.length + 1, recipientId, type, targetType, targetId, targetDate, message: messages[type], read: false, createdAt: now().instant });
  }
  function recordLeaveAudit(actor: Employee, action: string, before: MockLeave | null, after: MockLeave, system = false) {
    state.audit(actor, action, 'LEAVE', before, clone(after), system ? { system: true } : {}, { id: after.id, label: after.employee.name });
  }
  function day(employeeId: number, date: string): MockAttendanceDay {
    const record = records.get(key(employeeId, date));
    const approved = isWorkday(date) ? leaves.filter(l => l.employee.id === employeeId && l.status === 'APPROVED' && l.startDate <= date && l.endDate >= date) : [];
    const morning = approved.some(l => l.type === 'HALF_AM'), afternoon = approved.some(l => l.type === 'HALF_PM');
    const full = approved.some(l => l.type === 'ANNUAL' || l.type === 'SICK') || (morning && afternoon);
    const expectedStart = morning ? '14:00:00' : '09:00:00', expectedEnd = afternoon ? '14:00:00' : '18:00:00';
    const checkIn = record?.checkIn ?? null, checkOut = record?.checkOut ?? null;
    return { date, checkIn, checkOut, expectedStart, expectedEnd, leaves: approved.map(l => ({ id: l.id, type: l.type })), corrected: record?.corrected ?? false,
      status: full ? 'LEAVE' : !checkIn ? 'NO_RECORD' : !checkOut ? 'INCOMPLETE' : 'COMPLETE',
      late: !full && !!checkIn && seoulClock(new Date(checkIn)).time > expectedStart,
      earlyLeave: !full && !!checkOut && seoulClock(new Date(checkOut)).time < expectedEnd };
  }
  function month(employeeId: number, value: string | null) {
    if (!value || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value) || !validDate(value + '-01')) return reject('VALIDATION_ERROR', 400, 'month');
    const first = value + '-01', end = new Date(first + 'T00:00:00Z');
    end.setUTCMonth(end.getUTCMonth() + 1); end.setUTCDate(0);
    return json({ employeeId, month: value, days: workdays(first, end.toISOString().slice(0, 10)).map(date => day(employeeId, date)) });
  }
  function timeValue(value: unknown, date: string): string | undefined {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value) || !validDate(value.slice(0, 10))) return;
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime()) || parsed.getTime() > clock().getTime()) return;
    const normalized = seoulClock(parsed);
    return normalized.date === date ? normalized.instant : undefined;
  }
  function overlap(type: LeaveType, start: string, end: string, employeeId: number) {
    const slots = (t: LeaveType) => t === 'HALF_AM' ? ['AM'] : t === 'HALF_PM' ? ['PM'] : ['AM', 'PM'];
    return leaves.some(l => l.employee.id === employeeId && ['PENDING', 'APPROVED'].includes(l.status) && slots(type).some(slot => slots(l.type).includes(slot)) && workdays(start > l.startDate ? start : l.startDate, end < l.endDate ? end : l.endDate).length > 0);
  }
  function hireDateError(employeeId: number, proposed: string): Response | undefined {
    const employee = state.employees.find(e => e.id === employeeId);
    if (!employee || employee.hireDate === proposed) return;
    if (leaves.some(l => l.employee.id === employeeId)) return reject('LEAVE_RECORDS_EXIST');
    const first = [...records.keys()].filter(k => k.startsWith(`${employeeId}/`)).map(k => k.split('/')[1]).sort()[0];
    if (first && proposed > first) return reject('VALIDATION_ERROR', 400, 'hireDate');
  }
  function retire(employee: Employee, actor: Employee) {
    for (const leave of leaves.filter(l => l.employee.id === employee.id && (l.status === 'PENDING' || (l.status === 'APPROVED' && l.startDate > now().date)))) {
      const before = clone(leave); leave.status = 'CANCELLED'; leave.cancelledBy = 'SYSTEM';
      recordLeaveAudit(actor, 'LEAVE_CANCEL', before, leave, true);
      notify(admins(employee.id).map(e => e.id), 'LEAVE_CANCELLED', 'LEAVE', leave.id, null);
    }
  }
  async function handle(url: URL, method: string, body: Record<string, unknown>, me: Employee): Promise<Response | undefined> {
    const path = url.pathname.replace('/api/v1', ''), q = url.searchParams;
    const balanceMatch = path.match(/^\/employees\/(\d+)\/leave-balance$/);
    if (!/^\/(attendance|leaves|notifications)(\/|$)/.test(path) && !balanceMatch) return;
    if (balanceMatch) {
      if (me.role !== 'ADMIN') return reject('FORBIDDEN', 403);
      const e = state.employees.find(e => e.id === Number(balanceMatch[1]));
      if (!e) return reject('NOT_FOUND', 404);
      return method === 'GET' ? json(balance(e)) : reject('NOT_FOUND', 404);
    }
    if (path === '/leaves/me/balance' && method === 'GET') return json(balance(me));
    if (path === '/attendance/me/today' && method === 'GET') return json(day(me.id, now().date));
    if (path === '/attendance/me' && method === 'GET') return month(me.id, q.get('month'));
    if (path === '/attendance' && method === 'GET') {
      if (me.role !== 'ADMIN') return reject('FORBIDDEN', 403);
      if (!/^[1-9]\d*$/.test(q.get('employeeId') ?? '') || !Number.isSafeInteger(Number(q.get('employeeId')))) return reject('VALIDATION_ERROR', 400, 'employeeId');
      const e = state.employees.find(e => e.id === Number(q.get('employeeId')));
      return e ? month(e.id, q.get('month')) : reject('NOT_FOUND', 404);
    }
    if (['/attendance/me/check-in', '/attendance/me/check-out'].includes(path) && method === 'POST') {
      if (Object.keys(body).length) return reject('VALIDATION_ERROR', 400);
      if (!active(me)) return reject('EMPLOYEE_NOT_ACTIVE');
      const current = now();
      if (!isWorkday(current.date)) return reject('NOT_A_WORKDAY');
      const record = records.get(key(me.id, current.date));
      if (path.endsWith('check-in')) {
        if (day(me.id, current.date).status === 'LEAVE') return reject('ON_LEAVE_DAY');
        if (record) return reject('ALREADY_CHECKED_IN');
        records.set(key(me.id, current.date), { checkIn: current.instant, checkOut: null, corrected: false });
      } else {
        if (!record) return reject('NOT_CHECKED_IN');
        if (record.checkOut) return reject('ALREADY_CHECKED_OUT');
        record.checkOut = current.instant;
      }
      return json(day(me.id, current.date));
    }
    const attendanceMatch = path.match(/^\/attendance\/(\d+)\/(\d{4}-\d{2}-\d{2})$/);
    if (attendanceMatch && method === 'PUT') {
      if (me.role !== 'ADMIN') return reject('FORBIDDEN', 403);
      const e = state.employees.find(e => e.id === Number(attendanceMatch[1])), date = attendanceMatch[2];
      if (!e) return reject('NOT_FOUND', 404);
      if (!validDate(date) || date < e.hireDate || date > now().date) return reject('VALIDATION_ERROR', 400, 'date');
      if (!isWorkday(date)) return reject('NOT_A_WORKDAY');
      if (!reasonValid(body.reason)) return reject('VALIDATION_ERROR', 400, 'reason');
      const checkIn = timeValue(body.checkIn, date), checkOut = body.checkOut == null ? null : timeValue(body.checkOut, date);
      if (!checkIn) return reject('VALIDATION_ERROR', 400, 'checkIn');
      if (checkOut === undefined || (checkOut && Date.parse(checkIn) >= Date.parse(checkOut))) return reject('VALIDATION_ERROR', 400, 'checkOut');
      const before = records.get(key(e.id, date));
      const after = { checkIn, checkOut, corrected: true };
      state.audit(me, 'ATTENDANCE_CORRECT', 'EMPLOYEE', before ? clone(before) : null, after, { date, reason: body.reason }, { id: e.id, label: e.name });
      records.set(key(e.id, date), after);
      notify([e.id], 'ATTENDANCE_CORRECTED', 'ATTENDANCE', null, date);
      return json(day(e.id, date));
    }
    if (path === '/leaves' && method === 'POST') {
      if (!active(me)) return reject('EMPLOYEE_NOT_ACTIVE');
      if (!['ANNUAL', 'HALF_AM', 'HALF_PM', 'SICK'].includes(String(body.type))) return reject('VALIDATION_ERROR', 400, 'type');
      if (!reasonValid(body.reason)) return reject('VALIDATION_ERROR', 400, 'reason');
      if (!validDate(body.startDate) || body.startDate < now().date) return reject('VALIDATION_ERROR', 400, 'startDate');
      if (!validDate(body.endDate) || body.endDate < body.startDate) return reject('VALIDATION_ERROR', 400, 'endDate');
      const type = body.type as LeaveType, start = body.startDate, end = body.endDate, current = balance(me);
      if (start < current.periodStart || end > current.periodEnd) return reject('LEAVE_PERIOD_BOUNDARY', 400);
      if ((type === 'HALF_AM' || type === 'HALF_PM') && start !== end) return reject('VALIDATION_ERROR', 400, 'endDate');
      const dates = workdays(start, end);
      if (!dates.length) return reject('VALIDATION_ERROR', 400, 'startDate');
      if (overlap(type, start, end, me.id)) return reject('LEAVE_OVERLAP');
      const days = type.startsWith('HALF') ? 0.5 : dates.length;
      if (type !== 'SICK' && days > current.available) return reject('INSUFFICIENT_LEAVE_BALANCE');
      const leave: MockLeave = { id: leaves.length + 1, employee: identity(me), type, startDate: start, endDate: end, days, reason: body.reason, status: 'PENDING', rejectReason: null, decidedBy: null, decidedAt: null, cancelledBy: null, createdAt: now().instant };
      leaves.push(leave); recordLeaveAudit(me, 'LEAVE_REQUEST', null, leave);
      notify(admins(me.id).map(e => e.id), 'LEAVE_REQUESTED', 'LEAVE', leave.id, null);
      const response = json(leaveDto(leave, me), 201); response.headers.set('Location', `/api/v1/leaves/${leave.id}`); return response;
    }
    if ((path === '/leaves/me' || path === '/leaves') && method === 'GET') {
      if (path === '/leaves' && me.role !== 'ADMIN') return reject('FORBIDDEN', 403);
      if (q.has('status') && !['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'].includes(q.get('status')!)) return reject('VALIDATION_ERROR', 400, 'status');
      if (path === '/leaves' && q.has('employeeId') && (!/^[1-9]\d*$/.test(q.get('employeeId')!) || !Number.isSafeInteger(Number(q.get('employeeId'))))) return reject('VALIDATION_ERROR', 400, 'employeeId');
      const rows = leaves.filter(l => (path === '/leaves/me' ? l.employee.id === me.id : !q.has('employeeId') || l.employee.id === Number(q.get('employeeId'))) && (!q.has('status') || l.status === q.get('status'))).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id);
      return page(rows.map(l => leaveDto(l, me)), q);
    }
    const leaveMatch = path.match(/^\/leaves\/(\d+)(?:\/(approve|reject|cancel))?$/);
    if (leaveMatch) {
      const leave = leaves.find(l => l.id === Number(leaveMatch[1])), action = leaveMatch[2];
      if (!leave) return reject('NOT_FOUND', 404);
      if (method === 'GET' && !action) return me.role === 'ADMIN' || leave.employee.id === me.id ? json(leaveDto(leave, me)) : reject('FORBIDDEN', 403);
      if (method !== 'POST' || !action) return reject('NOT_FOUND', 404);
      if (action === 'cancel' ? leave.employee.id !== me.id : me.role !== 'ADMIN' || leave.employee.id === me.id) return reject('FORBIDDEN', 403);
      if (action === 'cancel' ? !['PENDING', 'APPROVED'].includes(leave.status) : leave.status !== 'PENDING') return reject('LEAVE_ALREADY_PROCESSED');
      if ((action === 'approve' && leave.startDate < now().date) || (action === 'cancel' && leave.status === 'APPROVED' && leave.startDate <= now().date)) return reject('LEAVE_START_PASSED');
      if (action === 'reject' && !reasonValid(body.reason)) return reject('VALIDATION_ERROR', 400, 'reason');
      const before = clone(leave);
      if (action === 'cancel') { leave.status = 'CANCELLED'; leave.cancelledBy = 'SELF'; }
      else { leave.status = action === 'approve' ? 'APPROVED' : 'REJECTED'; leave.decidedBy = { id: me.id, name: me.name }; leave.decidedAt = now().instant; if (action === 'reject') leave.rejectReason = body.reason as string; }
      recordLeaveAudit(me, `LEAVE_${action.toUpperCase()}`, before, leave);
      notify(action === 'cancel' ? admins(leave.employee.id).map(e => e.id) : [leave.employee.id], action === 'cancel' ? 'LEAVE_CANCELLED' : action === 'approve' ? 'LEAVE_APPROVED' : 'LEAVE_REJECTED', 'LEAVE', leave.id, null);
      return json(leaveDto(leave, me));
    }
    if (path === '/notifications/me/unread-count' && method === 'GET') return json({ count: notifications.filter(n => n.recipientId === me.id && !n.read).length });
    if (path === '/notifications/me' && method === 'GET') {
      if (q.has('unreadOnly') && !['true', 'false'].includes(q.get('unreadOnly')!)) return reject('VALIDATION_ERROR', 400, 'unreadOnly');
      const rows = notifications.filter(n => n.recipientId === me.id && (q.get('unreadOnly') !== 'true' || !n.read)).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id);
      return page(rows.map(({ recipientId: _recipient, ...dto }) => dto), q);
    }
    if (path === '/notifications/me/read-all' && method === 'POST') {
      if (typeof body.upToId !== 'number' || !Number.isSafeInteger(body.upToId) || body.upToId < 0) return reject('VALIDATION_ERROR', 400, 'upToId');
      let updatedCount = 0;
      for (const notification of notifications) if (notification.recipientId === me.id && notification.id <= body.upToId && !notification.read) { notification.read = true; updatedCount++; }
      return json({ updatedCount });
    }
    const notificationMatch = path.match(/^\/notifications\/(\d+)\/read$/);
    if (notificationMatch && method === 'POST') {
      const n = notifications.find(n => n.id === Number(notificationMatch[1]) && n.recipientId === me.id);
      if (!n) return reject('NOT_FOUND', 404);
      n.read = true; return new Response(null, { status: 204 });
    }
    return reject('NOT_FOUND', 404);
  }
  return { handle, hireDateError, retire };
}

