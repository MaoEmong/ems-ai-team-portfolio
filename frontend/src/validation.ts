export type EmployeeForm = {
  employeeNo: string;
  name: string;
  email: string;
  phone: string;
  hireDate: string;
  departmentId: string;
  positionId: string;
  role: string;
  status: string;
  initialPassword: string;
};
export const blankEmployee: EmployeeForm = {
  employeeNo: "",
  name: "",
  email: "",
  phone: "",
  hireDate: "",
  departmentId: "",
  positionId: "",
  role: "EMPLOYEE",
  status: "ACTIVE",
  initialPassword: "",
};
export function validateEmployee(
  form: EmployeeForm,
  creating: boolean,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const key of [
    "name",
    "email",
    "hireDate",
    "departmentId",
    "positionId",
    ...(creating ? ["employeeNo", "initialPassword"] : []),
  ])
    if (!form[key as keyof EmployeeForm].trim())
      errors[key] = "필수 입력입니다.";
  for (const [key, max] of Object.entries({
    employeeNo: 50,
    name: 100,
    email: 254,
    phone: 30,
  }))
    if (form[key as keyof EmployeeForm].length > max)
      errors[key] = `${max}자 이내로 입력하세요.`;
  if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
    errors.email = "올바른 이메일을 입력하세요.";
  if (form.hireDate && !/^\d{4}-\d{2}-\d{2}$/.test(form.hireDate))
    errors.hireDate = "올바른 날짜를 입력하세요.";
  if (creating && new TextEncoder().encode(form.initialPassword).length > 72)
    errors.initialPassword = "비밀번호는 UTF-8 72바이트 이내여야 합니다.";
  return errors;
}
