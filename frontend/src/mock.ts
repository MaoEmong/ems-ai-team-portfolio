import type { Department, Employee, Position } from "./types";
let departments: Department[] = [
  { id: 1, name: "개발팀", description: "서비스 개발" },
  { id: 2, name: "운영팀", description: "서비스 운영" },
];
let positions: Position[] = [
  { id: 1, name: "사원", level: 1 },
  { id: 2, name: "매니저", level: 2 },
];
const employees: Employee[] = Array.from({ length: 31 }, (_, i) => ({
  id: i + 1,
  employeeNo: i === 0 ? "admin" : `EMP${String(i).padStart(3, "0")}`,
  name: i === 0 ? "데모 관리자" : `테스트 사원 ${i}`,
  role: i === 0 ? "ADMIN" : "EMPLOYEE",
  email: `demo${i}@example.test`,
  phone: "010-0000-0000",
  hireDate: "2026-01-01",
  status: "ACTIVE",
  retireDate: null,
  department: departments[i % 2],
  position: positions[i % 2],
}));
const passwords = new Map(employees.map((e) => [e.employeeNo, "demo1234!"]));
const sessions = new Map<string, { id: number; expires: number }>();
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const fail = (
  status: number,
  code: string,
  message: string,
  fieldErrors: unknown[] = [],
) => json({ code, message, fieldErrors }, status);
export async function mockFetch(
  input: string | URL | Request,
  init: RequestInit = {},
): Promise<Response> {
  const url = new URL(String(input));
  const path = url.pathname.replace("/api/v1", "");
  const method = init.method || "GET";
  const body = init.body ? JSON.parse(String(init.body)) : {};
  if (path === "/auth/login" && method === "POST") {
    const e = employees.find(
      (e) => e.employeeNo === body.loginId && e.status !== "RETIRED",
    );
    if (!e || passwords.get(e.employeeNo) !== body.password)
      return fail(401, "UNAUTHORIZED", "아이디 또는 비밀번호를 확인하세요.");
    const token = `mock-${crypto.randomUUID()}`;
    sessions.set(token, { id: e.id, expires: Date.now() + 3600000 });
    return json({
      accessToken: token,
      tokenType: "Bearer",
      expiresIn: 3600,
      user: { id: e.id, employeeNo: e.employeeNo, name: e.name, role: e.role },
    });
  }
  const session = sessions.get(
    new Headers(init.headers).get("Authorization")?.replace("Bearer ", "") ||
      "",
  );
  const me = employees.find((e) => e.id === session?.id);
  if (
    !session ||
    session.expires < Date.now() ||
    !me ||
    me.status === "RETIRED"
  )
    return fail(
      401,
      "UNAUTHORIZED",
      "로그인이 만료되었습니다. 다시 로그인하세요.",
    );
  if (path === "/auth/me")
    return json({
      id: me.id,
      employeeNo: me.employeeNo,
      name: me.name,
      role: me.role,
    });
  const [resource, idText, action] = path.split("/").filter(Boolean);
  const id = Number(idText);
  if (resource === "employees") {
    if (me.role !== "ADMIN" && !(method === "GET" && id === me.id))
      return fail(403, "FORBIDDEN", "본인 정보만 조회할 수 있습니다.");
    const employee = employees.find((e) => e.id === id);
    if (idText && !employee)
      return fail(404, "NOT_FOUND", "사원을 찾을 수 없습니다.");
    if (method === "GET" && idText) return json(employee);
    if (method === "GET") {
      const q = url.searchParams;
      const keyword = (q.get("keyword") || "").toLowerCase();
      let list = employees.filter(
        (e) =>
          (q.get("status")
            ? e.status === q.get("status")
            : e.status !== "RETIRED") &&
          (!q.get("departmentId") ||
            e.department.id === Number(q.get("departmentId"))) &&
          (!q.get("positionId") ||
            e.position.id === Number(q.get("positionId"))) &&
          `${e.name} ${e.employeeNo} ${e.email}`
            .toLowerCase()
            .includes(keyword),
      );
      const [field, direction] = (q.get("sort") || "employeeNo,asc").split(",");
      const key = (
        ["employeeNo", "name", "hireDate"].includes(field)
          ? field
          : "employeeNo"
      ) as "name" | "employeeNo" | "hireDate";
      list = list.sort(
        (a, b) =>
          a[key].localeCompare(b[key]) * (direction === "desc" ? -1 : 1),
      );
      const page = Math.max(0, Number(q.get("page") || 0));
      const size = Math.min(100, Math.max(1, Number(q.get("size") || 20)));
      return json({
        content: list.slice(page * size, (page + 1) * size),
        page,
        size,
        totalElements: list.length,
        totalPages: Math.ceil(list.length / size),
      });
    }
    if (employee?.status === "RETIRED")
      return fail(409, "EMPLOYEE_RETIRED", "퇴사한 사원은 변경할 수 없습니다.");
    if (action === "retire" && method === "POST" && employee) {
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(body.retireDate || "") ||
        body.retireDate < employee.hireDate
      )
        return fail(400, "VALIDATION_ERROR", "퇴사일을 확인하세요.", [
          { field: "retireDate", reason: "입사일 이후의 날짜를 입력하세요." },
        ]);
      employee.status = "RETIRED";
      employee.retireDate = body.retireDate;
      return json(employee);
    }
    if (method === "POST" || method === "PUT") {
      const required = [
        "name",
        "email",
        "hireDate",
        "departmentId",
        "positionId",
        "role",
        ...(method === "POST" ? ["employeeNo", "initialPassword"] : ["status"]),
      ];
      const errors = required
        .filter((k) => !body[k])
        .map((field) => ({ field, reason: "필수 입력입니다." }));
      if (errors.length)
        return fail(400, "VALIDATION_ERROR", "입력값을 확인하세요.", errors);
      if (employees.some((e) => e.id !== id && e.email === body.email))
        return fail(409, "DUPLICATE_EMAIL", "이미 사용 중인 이메일입니다.");
      if (
        method === "POST" &&
        employees.some((e) => e.employeeNo === body.employeeNo)
      )
        return fail(409, "DUPLICATE_EMPLOYEE_NO", "이미 사용한 사번입니다.");
      const department = departments.find(
        (d) => d.id === Number(body.departmentId),
      );
      const position = positions.find((p) => p.id === Number(body.positionId));
      if (!department || !position)
        return fail(404, "NOT_FOUND", "부서 또는 직급을 찾을 수 없습니다.");
      const data = {
        name: body.name,
        email: body.email,
        phone: body.phone,
        hireDate: body.hireDate,
        role: body.role,
        department,
        position,
      };
      if (employee) {
        Object.assign(employee, data, { status: body.status });
        return json(employee);
      }
      const created: Employee = {
        ...data,
        id: Math.max(...employees.map((e) => e.id)) + 1,
        employeeNo: body.employeeNo,
        status: "ACTIVE",
        retireDate: null,
      };
      employees.push(created);
      passwords.set(created.employeeNo, body.initialPassword);
      return json(created, 201);
    }
  }
  if (resource === "departments" || resource === "positions") {
    const list = resource === "departments" ? departments : positions;
    if (method === "GET")
      return json(
        [...list].sort((a, b) =>
          resource === "departments"
            ? a.name.localeCompare(b.name)
            : (a as Position).level - (b as Position).level || a.id - b.id,
        ),
      );
    if (me.role !== "ADMIN")
      return fail(403, "FORBIDDEN", "관리자 권한이 필요합니다.");
    const existing = list.find((e) => e.id === id);
    if (idText && !existing)
      return fail(404, "NOT_FOUND", "항목을 찾을 수 없습니다.");
    if (method === "DELETE") {
      if (
        employees.some(
          (e) =>
            (resource === "departments" ? e.department.id : e.position.id) ===
            id,
        )
      )
        return fail(
          409,
          resource === "departments" ? "DEPARTMENT_IN_USE" : "POSITION_IN_USE",
          "소속 사원(퇴사자 포함)이 있어 삭제할 수 없습니다.",
        );
      if (resource === "departments")
        departments = departments.filter((d) => d.id !== id);
      else positions = positions.filter((p) => p.id !== id);
      return new Response(null, { status: 204 });
    }
    if (!body.name?.trim())
      return fail(400, "VALIDATION_ERROR", "이름을 입력하세요.", [
        { field: "name", reason: "필수 입력입니다." },
      ]);
    if (list.some((e) => e.id !== id && e.name === body.name))
      return fail(409, "DUPLICATE_NAME", "이미 사용 중인 이름입니다.");
    const data =
      resource === "departments"
        ? { name: body.name, description: body.description }
        : { name: body.name, level: Number(body.level) };
    if (existing) {
      Object.assign(existing, data);
      return json(existing);
    }
    const created = { id: Math.max(0, ...list.map((e) => e.id)) + 1, ...data };
    if (resource === "departments") departments.push(created as Department);
    else positions.push(created as Position);
    return json(created, 201);
  }
  return fail(404, "NOT_FOUND", "지원하지 않는 API입니다.");
}
