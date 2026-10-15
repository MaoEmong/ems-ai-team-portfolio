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
}
