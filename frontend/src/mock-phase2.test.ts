// @vitest-environment node
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { Workbook } from "exceljs";
import type { Employee } from "./types";
import { createPhase2, importHeaders } from "./mock-phase2";

let request: (path: string, method?: string, body?: unknown) => Promise<Response>;
let employeeRequest: typeof request;
let mock: typeof import("./mock");
async function client(loginId: string) {
  const response = await mock.mockFetch("http://localhost/api/v1/auth/login", { method: "POST", body: JSON.stringify({ loginId, password: "demo1234!" }) });
  const { accessToken } = await response.json();
  return (path: string, method = "GET", body?: unknown) => mock.mockFetch("http://localhost/api/v1" + path, { method, headers: { Authorization: "Bearer " + accessToken }, body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body) });
}
const newEmployee = (overrides = {}) => ({ employeeNo: "NEW001", name: "합성 사원", email: "new001@example.test", phone: "", hireDate: "2026-01-01", departmentId: 1, positionId: 1, role: "EMPLOYEE", initialPassword: "demo1234!", ...overrides });
async function upload(rows: unknown[][], customize?: (book: Workbook) => void) {
  const book = new Workbook(), sheet = book.addWorksheet("employees");
  sheet.addRow(importHeaders);
  for (const row of rows) sheet.addRow(row);
  customize?.(book);
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(await book.xlsx.writeBuffer())]), "employees.xlsx");
  return form;
}
const importRow = (no = "000101", email = "import101@example.test") => [no, "합성 신입", email, "", "2026-10-16", "1", 1, "EMPLOYEE", "private-demo-password"];
async function readWorkbook(response: Response) { const book = new Workbook(); await book.xlsx.load(await response.arrayBuffer()); return book; }

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-15T16:00:00Z"));
  mock = await import("./mock");
  request = await client("admin");
  employeeRequest = await client("EMP001");
});
afterEach(() => { vi.useRealTimers(); });

describe("2단계 권한과 발령 계약", () => {
  it("관리자 API와 본인 이력 권한을 구분한다", async () => {
    for (const path of ["/dashboard", "/audit-logs", "/employees/export?format=csv", "/employees/import-template"]) {
      expect((await employeeRequest(path)).status).toBe(403);
      expect((await mock.mockFetch("http://localhost/api/v1" + path)).status).toBe(401);
    }
    expect((await employeeRequest("/employees/import", "POST", new FormData())).status).toBe(403);
    expect((await employeeRequest("/employees/2/appointments")).status).toBe(200);
    expect((await employeeRequest("/employees/1/appointments")).status).toBe(403);
    expect((await employeeRequest("/employees/2/appointments", "POST", {})).status).toBe(403);
    expect((await request("/employees/99999/appointments")).status).toBe(404);
    expect((await request("/employees/2/appointments?page=-1")).status).toBe(400);
  });
  it("PUT은 생략/null/같은 소속을 유지하고 다른 소속은 거부한다", async () => {
    const e = await (await request("/employees", "POST", newEmployee())).json();
    for (const fields of [{}, { departmentId: null, positionId: null }, { departmentId: 1, positionId: 1 }]) {
      const { departmentId: _d, positionId: _p, ...data } = newEmployee();
      const response = await request("/employees/" + e.id, "PUT", { ...data, status: "ACTIVE", ...fields });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ department: { id: 1 }, position: { id: 1 } });
    }
    const result = await request("/employees/" + e.id, "PUT", { ...newEmployee(), status: "ACTIVE", departmentId: 2 });
    expect(result.status).toBe(409);
    expect((await result.json()).code).toBe("APPOINTMENT_REQUIRED");
  });
  it("날짜 순서와 변경 여부를 검사하고 당시 이름/level/작성자를 보존한다", async () => {
    const payload = { effectiveDate: "2026-10-16", departmentId: 1, positionId: 1, reason: "합성 발령" };
    for (const effectiveDate of ["2025-12-31", "2026-10-17", "2026-02-30"]) expect((await request("/employees/2/appointments", "POST", { ...payload, effectiveDate })).status).toBe(400);
    const first = await request("/employees/2/appointments", "POST", payload);
    expect(first.status).toBe(201);
    expect((await first.json()).fromPosition).toMatchObject({ id: 2, level: 2 });
    expect((await request("/employees/2/appointments", "POST", payload)).status).toBe(400);
    expect((await request("/employees/2/appointments", "POST", { ...payload, departmentId: 2, effectiveDate: "2026-10-15" })).status).toBe(400);
    await request("/departments/1", "PUT", { name: "새 부서명" });
    await request("/positions/1", "PUT", { name: "새 직급명", level: 7 });
    const second = await request("/employees/2/appointments", "POST", { ...payload, departmentId: 2, positionId: 2 });
    expect(second.status).toBe(201);
    const history = await (await request("/employees/2/appointments")).json();
    expect(history.content[0].id).toBeGreaterThan(history.content[1].id);
    expect(history.content[1]).toMatchObject({ toDepartment: { name: "개발팀" }, toPosition: { name: "사원", level: 1 }, createdBy: { name: "데모 관리자" } });
    const e = await (await request("/employees/2")).json();
    expect((await request("/employees/2", "PUT", { ...e, hireDate: "2026-10-17" })).status).toBe(400);
    expect((await request("/employees/2/retire", "POST", { retireDate: "2026-10-15" })).status).toBe(400);
    expect((await request("/employees/2/retire", "POST", { retireDate: "2026-10-16" })).status).toBe(200);
    expect((await request("/employees/2/appointments", "POST", payload)).status).toBe(409);
  });
  it("현재 참조 사원이 없어도 이력 참조 조직은 삭제할 수 없다", async () => {
    const d = await (await request("/departments", "POST", { name: "발령 전용" })).json();
    const p = await (await request("/positions", "POST", { name: "발령 전용", level: 9 })).json();
    for (const [departmentId, positionId] of [[d.id, p.id], [1, 1]]) expect((await request("/employees/2/appointments", "POST", { departmentId, positionId, effectiveDate: "2026-10-16", reason: "이력 검증" })).status).toBe(201);
    expect((await (await request("/departments/" + d.id, "DELETE")).json()).code).toBe("DEPARTMENT_IN_USE");
    expect((await (await request("/positions/" + p.id, "DELETE")).json()).code).toBe("POSITION_IN_USE");
  });
});

describe("대시보드와 파일 계약", () => {
  it("서울 오늘, 12개월, 재직 상태와 미래 날짜 제외를 적용한다", async () => {
    await request("/employees", "POST", newEmployee({ hireDate: "2026-10-17" }));
    await request("/employees/2", "PUT", { ...newEmployee({ email: "demo1@example.test" }), departmentId: null, positionId: null, status: "ON_LEAVE" });
    await request("/employees/3/retire", "POST", { retireDate: "2026-10-16" });
    const data = await (await request("/dashboard")).json();
    expect(data.asOfDate).toBe("2026-10-16");
    expect(data.monthly).toHaveLength(12);
    expect(data.monthly[0].month).toBe("2025-11");
    expect(data.monthly[11]).toMatchObject({ month: "2026-10", hires: 0, retirements: 1 });
    expect(data.headcount).toEqual({ active: 30, onLeave: 1, employed: 31, retired: 1 });
    expect(data.byDepartment.reduce((n: number, d: { count: number }) => n + d.count, 0)).toBe(31);
  });
  it("CSV는 BOM/수식 방어/전체 필터 결과, xlsx는 문자열 셀이다", async () => {
    await request("/employees", "POST", newEmployee({ name: "=SUM(1,2)" }));
    const csv = await request("/employees/export?format=csv&keyword=NEW001&page=999&size=1");
    expect(csv.status).toBe(200);
    expect(csv.headers.get("Content-Disposition")).toContain("filename*=UTF-8''ems-employees-20261016.csv");
    expect(csv.headers.get("Access-Control-Expose-Headers")).toBe("Content-Disposition");
    const bytes = new Uint8Array(await csv.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([239, 187, 191]);
    expect(new TextDecoder().decode(bytes)).toContain("\"'=SUM(1,2)\"");
    const sheet = (await readWorkbook(await request("/employees/export?format=xlsx&keyword=NEW001"))).getWorksheet("employees")!;
    expect(sheet.rowCount).toBe(2);
    sheet.eachRow(row => row.eachCell(cell => expect(typeof cell.value).toBe("string")));
    expect(sheet.getCell("B2").value).toBe("=SUM(1,2)");
    for (const query of ["", "?format=pdf", "?format=csv&sort=role,desc", "?format=csv&status=bad", "?format=csv&departmentId=no"]) expect((await request("/employees/export" + query)).status).toBe(400);
  });
  it("템플릿은 실제 3개 시트와 문자열 서식을 포함한다", async () => {
    const book = await readWorkbook(await request("/employees/import-template"));
    expect(book.worksheets.map(s => s.name)).toEqual(["employees", "departments", "positions"]);
    expect(book.getWorksheet("employees")!.getRow(1).values).toEqual([undefined, ...importHeaders]);
    for (const i of [1, 5, 9]) expect(book.getWorksheet("employees")!.getColumn(i).numFmt).toBe("@");
  });
  it("10000행은 허용하고 초과하면 일부 파일 없이 거부한다", async () => {
    const sample = await (await request("/employees/1")).json() as Employee;
    const employees = Array.from({ length: 10000 }, (_, i) => ({ ...sample, id: i + 1, employeeNo: String(i) }));
    const phase = createPhase2({ employees, departments: () => [sample.department], positions: () => [sample.position], passwords: new Map() });
    const url = new URL("http://localhost/api/v1/employees/export?format=csv");
    expect((await phase.handle(url, "GET", {}, undefined, sample))!.status).toBe(200);
    employees.push({ ...sample, id: 10001 });
    const result = (await phase.handle(url, "GET", {}, undefined, sample))!;
    expect(result.status).toBe(400);
    expect((await result.json()).code).toBe("EXPORT_LIMIT_EXCEEDED");
  });
});

describe("가져오기와 감사 계약", () => {
  it("실제 xlsx에서 사번 0을 보존하고 성공 감사와 사원별 감사를 생성한다", async () => {
    const result = await request("/employees/import", "POST", await upload([importRow()]));
    expect(result.status).toBe(201);
    expect(await result.json()).toEqual({ importedCount: 1 });
    const list = await (await request("/employees?keyword=000101")).json();
    expect(list.content[0]).toMatchObject({ employeeNo: "000101", status: "ACTIVE" });
    const logs = await (await request("/audit-logs?action=EMPLOYEE_CREATE")).json();
    expect(logs.content[0].metadata).toEqual({ source: "IMPORT" });
    expect(JSON.stringify(logs)).not.toContain("private-demo-password");
  });
  it("빈 행 뒤 실제 행 번호/중복/수식/문자열 오류와 일괄 취소를 반환한다", async () => {
    const bad = importRow("000102", "import101@example.test"); bad[4] = 123;
    const form = await upload([importRow(), [], bad], book => { book.getWorksheet("employees")!.getCell("B4").value = { formula: '"secret"', result: "secret" }; });
    const result = await request("/employees/import", "POST", form);
    expect(result.status).toBe(400);
    const error = await result.json();
    expect(error.code).toBe("IMPORT_VALIDATION_ERROR");
    expect(error.rowErrors).toEqual(expect.arrayContaining([expect.objectContaining({ row: 4, field: "email" }), expect.objectContaining({ row: 4, field: "hireDate", reason: "문자열 서식 필요" }), expect.objectContaining({ row: 4, field: "name" })]));
    expect(JSON.stringify(error)).not.toContain("secret");
    expect((await (await request("/employees?keyword=000101")).json()).totalElements).toBe(0);
    const logs = await (await request("/audit-logs?action=EMPLOYEE_IMPORT&success=false")).json();
    expect(logs.content[0].metadata.errorCount).toBe(error.rowErrors.length);
  });
  it("0行/1001행/잘못된 헤더/손상/5MiB 초과를 파일 오류로 거부한다", async () => {
    for (const form of [await upload([]), await upload(Array.from({ length: 1001 }, (_, i) => importRow(String(i), i + "@example.test"))), await upload([importRow()], book => { book.getWorksheet("employees")!.getCell("A1").value = "wrong"; })]) {
      const result = await request("/employees/import", "POST", form);
      expect((await result.json()).code).toBe("IMPORT_INVALID_FILE");
    }
    const broken = new FormData(); broken.append("file", new Blob(["not a workbook"]), "bad.xlsx");
    expect((await (await request("/employees/import", "POST", broken)).json()).code).toBe("IMPORT_INVALID_FILE");
    const huge = new FormData(); huge.append("file", new Blob([new Uint8Array(5242881)]), "large.xlsx");
    expect((await request("/employees/import", "POST", huge)).status).toBe(413);
  });
  it("로그인 실패 원문을 숨기고 감사 필터는 AND 및 [from,to)이다", async () => {
    await mock.mockFetch("http://localhost/api/v1/auth/login", { method: "POST", body: JSON.stringify({ loginId: "unknown-sensitive", password: "secret" }) });
    const logs = await (await request("/audit-logs?action=LOGIN_FAILURE&success=false")).json();
    expect(logs.content[0]).toMatchObject({ actor: null, targetType: null, targetId: null, targetLabel: null, before: null, after: null, metadata: { reason: "BAD_CREDENTIALS" } });
    expect(JSON.stringify(logs)).not.toContain("unknown-sensitive");
    const from = encodeURIComponent("2026-10-16T01:00:00+09:00");
    expect((await (await request("/audit-logs?action=LOGIN_FAILURE&from=" + from)).json()).totalElements).toBe(1);
    expect((await (await request("/audit-logs?action=LOGIN_FAILURE&to=" + from)).json()).totalElements).toBe(0);
    expect((await (await request("/audit-logs?action=LOGIN_FAILURE&actorId=1")).json()).totalElements).toBe(0);
    for (const query of ["from=2026-10-16", "success=1", "action=BAD", "size=101", "from=2026-10-17T00:00:00Z&to=2026-10-16T00:00:00Z"]) expect((await request("/audit-logs?" + query)).status).toBe(400);
  });
});


describe('가져오기 경계와 충돌', () => {
  it('1000행까지 등록하며 파일 내부와 기존 사원의 중복은 같은 비교를 쓴다', async () => {
    const data = Array.from({ length: 1000 }, (_, i) => importRow(String(i).padStart(6, '0'), `batch${i}@example.test`));
    const response = await request('/employees/import', 'POST', await upload(data));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ importedCount: 1000 });
    const duplicate = await request('/employees/import', 'POST', await upload([data[0], data[0]]));
    expect(duplicate.status).toBe(400);
    const errors = (await duplicate.json()).rowErrors;
    expect(errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ row: 2, field: 'employeeNo' }),
      expect.objectContaining({ row: 2, field: 'email' }),
      expect.objectContaining({ row: 3, field: 'employeeNo' }),
      expect.objectContaining({ row: 3, field: 'email' }),
    ]));
  });
  it('검증 후 충돌은 행 번호 없이 409이며 등록/성공 감사가 남지 않는다', async () => {
    const admin = await (await request('/employees/1')).json() as Employee;
    const employees = [admin];
    const phase = createPhase2({
      employees, departments: () => [admin.department], positions: () => [admin.position], passwords: new Map(),
      beforeImportCommit: async () => { employees.push({ ...admin, id: 2, employeeNo: '000101', email: 'concurrent@example.test' }); },
    });
    const result = (await phase.handle(new URL('http://localhost/api/v1/employees/import'), 'POST', {}, await upload([importRow()]), admin))!;
    expect(result.status).toBe(409);
    expect(await result.json()).toEqual({ code: 'IMPORT_CONFLICT', message: '전체 등록이 취소되었습니다.', fieldErrors: [] });
    expect(employees).toHaveLength(2);
    const logs = await (await phase.handle(new URL('http://localhost/api/v1/audit-logs'), 'GET', {}, undefined, admin))!.json();
    expect(logs.content).toHaveLength(1);
    expect(logs.content[0]).toMatchObject({ action: 'EMPLOYEE_IMPORT', success: false, metadata: { code: 'IMPORT_CONFLICT', errorCount: 1 } });
  });
});
