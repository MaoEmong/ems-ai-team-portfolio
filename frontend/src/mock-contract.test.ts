import { describe, expect, it } from "vitest";
import { mockFetch } from "./mock";

async function client(loginId: string) {
  const login = await mockFetch("http://localhost/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ loginId, password: "demo1234!" }),
  });
  const { accessToken } = await login.json();
  return (path: string, method = "GET", body?: unknown) =>
    mockFetch(`http://localhost/api/v1${path}`, {
      method,
      headers: { Authorization: `Bearer ${accessToken}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
}

describe("보충 계약", () => {
  it.each(["departments", "positions"])(
    "EMPLOYEE는 %s 조회만 가능하고 모든 변경은 거부된다",
    async (resource) => {
      const request = await client("EMP001");
      const list = await request(`/${resource}`);
      expect(list.status).toBe(200);
      expect(Array.isArray(await list.json())).toBe(true);
      for (const method of ["POST", "PUT", "DELETE"]) {
        const path = `/${resource}${method === "POST" ? "" : "/1"}`;
        const response = await request(path, method, { name: "금지 변경", level: 1 });
        expect(response.status).toBe(403);
        expect((await response.json()).code).toBe("FORBIDDEN");
      }
    },
  );

  it.each(["departments", "positions"])(
    "%s 생성/수정/삭제는 201 객체, 200 객체, 204 빈 본문이다",
    async (resource) => {
      const request = await client("admin");
      const created = await request(`/${resource}`, "POST", {
        name: `계약 검증 ${resource}`, description: "합성 자료", level: 5,
      });
      expect(created.status).toBe(201);
      const entity = await created.json();
      expect(entity.id).toBeTypeOf("number");
      const updated = await request(`/${resource}/${entity.id}`, "PUT", {
        name: `변경 ${resource}`, description: "변경 자료", level: 6,
      });
      expect(updated.status).toBe(200);
      expect((await updated.json()).name).toBe(`변경 ${resource}`);
      const removed = await request(`/${resource}/${entity.id}`, "DELETE");
      expect(removed.status).toBe(204);
      expect(await removed.text()).toBe("");
    },
  );

  it("사원 상태 코드, 퇴사일 fieldErrors, 퇴사 후 수정·중복 퇴사 409를 보장한다", async () => {
    const request = await client("admin");
    const data = {
      employeeNo: "CONTRACT001", name: "계약 검증 사원",
      email: "contract001@example.test", phone: "", hireDate: "2026-01-01",
      departmentId: 1, positionId: 1, role: "EMPLOYEE", initialPassword: "demo1234!",
    };
    const created = await request("/employees", "POST", data);
    expect(created.status).toBe(201);
    const employee = await created.json();
    const path = `/employees/${employee.id}`;
    const updated = await request(path, "PUT", { ...data, status: "ON_LEAVE" });
    expect(updated.status).toBe(200);
    expect((await updated.json()).status).toBe("ON_LEAVE");
    for (const body of [{}, { retireDate: "2025-12-31" }]) {
      const invalid = await request(`${path}/retire`, "POST", body);
      expect(invalid.status).toBe(400);
      expect(await invalid.json()).toMatchObject({
        code: "VALIDATION_ERROR", fieldErrors: [{ field: "retireDate", reason: expect.any(String) }],
      });
    }
    const retired = await request(`${path}/retire`, "POST", { retireDate: "2026-10-16" });
    expect(retired.status).toBe(200);
    expect(await retired.json()).toMatchObject({ status: "RETIRED", retireDate: "2026-10-16" });
    for (const [url, method, body] of [
      [path, "PUT", { ...data, status: "ACTIVE" }],
      [`${path}/retire`, "POST", { retireDate: "2026-10-16" }],
    ] as const) {
      const conflict = await request(url, method, body);
      expect(conflict.status).toBe(409);
      expect(await conflict.json()).toMatchObject({ code: "EMPLOYEE_RETIRED", message: expect.any(String) });
    }
  });
});
