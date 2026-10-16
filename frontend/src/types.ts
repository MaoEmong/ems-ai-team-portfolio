export type Role = "ADMIN" | "EMPLOYEE";
export type Status = "ACTIVE" | "ON_LEAVE" | "RETIRED";
export interface User {
  id: number;
  employeeNo: string;
  name: string;
  role: Role;
}
export interface Department {
  id: number;
  name: string;
  description?: string;
}
export interface Position {
  id: number;
  name: string;
  level: number;
}
export interface Employee extends User {
  email: string;
  phone: string;
  hireDate: string;
  status: Status;
  retireDate: string | null;
  department: Department;
  position: Position;
}
export interface Page<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}
export interface ErrorBody {
  code: string;
  message: string;
  fieldErrors: { field: string; reason: string }[];
  rowErrors?: { row: number; field: string; reason: string }[];
}
export interface DashboardData {
  asOfDate: string;
  headcount: {
    active: number;
    onLeave: number;
    employed: number;
    retired: number;
  };
  byDepartment: { departmentId: number; name: string; count: number }[];
  byPosition: {
    positionId: number;
    name: string;
    level: number;
    count: number;
  }[];
  thisMonth: { hires: number; retirements: number };
  monthly: { month: string; hires: number; retirements: number }[];
}
export interface Appointment {
  id: number;
  employeeId: number;
  effectiveDate: string;
  fromDepartment: Department;
  toDepartment: Department;
  fromPosition: Position;
  toPosition: Position;
  reason: string;
  createdBy: { id: number; name: string };
  createdAt: string;
}
export interface AuditLog {
  id: number;
  occurredAt: string;
  actor: Pick<User, "id" | "employeeNo" | "name"> | null;
  action: string;
  targetType: "EMPLOYEE" | "DEPARTMENT" | "POSITION" | null;
  targetId: number | null;
  targetLabel: string | null;
  success: boolean;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
}

