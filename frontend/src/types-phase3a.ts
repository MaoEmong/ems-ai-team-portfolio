export type LeaveType = "ANNUAL" | "HALF_AM" | "HALF_PM" | "SICK";
export type LeaveAction = "APPROVE" | "REJECT" | "CANCEL";
export interface AttendanceDay {
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  late: boolean;
  earlyLeave: boolean;
  status: "NO_RECORD" | "INCOMPLETE" | "COMPLETE" | "LEAVE";
  expectedStart: string;
  expectedEnd: string;
  leaves: { id: number; type: LeaveType }[];
  corrected: boolean;
}
export interface AttendanceMonth {
  employeeId: number;
  month: string;
  days: AttendanceDay[];
}
export interface LeaveBalance {
  periodStart: string;
  periodEnd: string;
  granted: number;
  used: number;
  reserved: number;
  available: number;
  approverAvailable: boolean;
}
export interface LeaveItem {
  id: number;
  employee: { id: number; employeeNo: string; name: string };
  type: LeaveType;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  rejectReason: string | null;
  decidedBy: { id: number; name: string } | null;
  decidedAt: string | null;
  cancelledBy: "SELF" | "SYSTEM" | null;
  createdAt: string;
  allowedActions: LeaveAction[];
}
export interface AppNotification {
  id: number;
  type: string;
  targetType: "LEAVE" | "ATTENDANCE";
  targetId: number | null;
  targetDate: string | null;
  message: string;
  read: boolean;
  createdAt: string;
}
export const leaveTypeLabels: Record<LeaveType, string> = {
  ANNUAL: "연차",
  HALF_AM: "오전 반차",
  HALF_PM: "오후 반차",
  SICK: "병가",
};
export const leaveStatusLabels = {
  PENDING: "승인 대기",
  APPROVED: "승인",
  REJECTED: "반려",
  CANCELLED: "취소",
};
export const refreshWork = () =>
  window.dispatchEvent(new Event("ems:work-updated"));
