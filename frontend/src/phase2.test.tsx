import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { App } from "./App";
import { AuthProvider } from "./auth";
import { TOKEN_KEY } from "./api";
import { mockFetch } from "./mock";
import { exportQuery, seoulDateRange } from "./phase2-utils";
import { validateAppointment } from "./appointments";
import { downloadName } from "./files";
import type { DashboardData, Employee } from "./types";
const dashboard: DashboardData = {
  asOfDate: "2026-10-16",
  headcount: { active: 3, onLeave: 1, employed: 4, retired: 2 },
  byDepartment: [{ departmentId: 1, name: "검증개발팀", count: 4 }],
  byPosition: [{ positionId: 1, name: "검증직급", level: 1, count: 4 }],
  thisMonth: { hires: 2, retirements: 1 },
  monthly: [{ month: "2026-10", hires: 2, retirements: 1 }],
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
beforeEach(() => {
  sessionStorage.clear();
  vi.stubGlobal("fetch", vi.fn(mockFetch));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
async function mount(path: string, id = "admin") {
  const response = await mockFetch("http://localhost/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ loginId: id, password: "demo1234!" }),
  });
  sessionStorage.setItem(TOKEN_KEY, (await response.json()).accessToken);
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  );
}
function intercept(path: string, body: unknown, status = 200) {
  vi.mocked(fetch).mockImplementation((input, options) =>
    String(input).includes(path)
      ? Promise.resolve(json(body, status))
      : mockFetch(input, options),
  );
}
describe("2단계 화면과 계약", () => {
  it("관리자 첫 화면은 대시보드이고 집계 기준과 수치 표가 있다", async () => {
    intercept("/dashboard", dashboard);
    await mount("/");
    await screen.findByRole("heading", { name: "대시보드" });
    await screen.findAllByText("검증개발팀");
    expect(screen.getByText("기준일 2026-10-16 (KST)")).toBeTruthy();
    expect(screen.getByRole("img", { name: /월별 입사/ })).toBeTruthy();
    expect(screen.getByText("월별 수치 표로 보기")).toBeTruthy();
  });
  it("인원과 입퇴사 0인 대시보드에 빈 상태를 표시한다", async () => {
    intercept("/dashboard", {
      ...dashboard,
      headcount: { active: 0, onLeave: 0, employed: 0, retired: 0 },
      byDepartment: [],
      byPosition: [],
      monthly: [{ month: "2026-10", hires: 0, retirements: 0 }],
    });
    await mount("/dashboard");
    await screen.findByText("최근 12개월 입사·퇴사가 없습니다.");
    expect(screen.getAllByText("재직 중인 사원이 없습니다.")).toHaveLength(2);
  });
  it.each(["/dashboard", "/employees/import", "/audit-logs"])(
    "일반 사원의 %s 직접 진입을 거부한다",
    async (path) => {
      await mount(path, "EMP001");
      await screen.findByRole("heading", { name: "권한이 없습니다" });
    },
  );
  it("발령 폼에서 동일 소속·미래 날짜·빈 사유를 검증한다", () => {
    const employee = {
      department: { id: 1 },
      position: { id: 1 },
      hireDate: "2026-01-01",
    } as Employee;
    const errors = validateAppointment(
      {
        departmentId: "1",
        positionId: "1",
        effectiveDate: "2026-11-01",
        reason: "",
      },
      employee,
      "2026-03-01",
      "2026-10-16",
    );
    expect(Object.keys(errors)).toEqual(
      expect.arrayContaining(["departmentId", "effectiveDate", "reason"]),
    );
  });
  it("사원 수정에서 부서·직급을 전송하지 않고 발령 안내를 제공한다", async () => {
    await mount("/employees/2/edit");
    const user = userEvent.setup();
    await screen.findByText("소속 (읽기 전용)");
    expect(screen.queryByLabelText("부서 *")).toBeNull();
    await user.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => {
      const call = vi
        .mocked(fetch)
        .mock.calls.find(
          ([url, options]) =>
            String(url).endsWith("/employees/2") && options?.method === "PUT",
        );
      expect(call).toBeTruthy();
      const body = JSON.parse(String(call![1]?.body));
      expect(body).not.toHaveProperty("departmentId");
      expect(body).not.toHaveProperty("positionId");
    });
  });
  it("APPOINTMENT_REQUIRED 409는 발령 경로를 안내한다", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockImplementation((url, options) =>
      options?.method === "PUT"
        ? Promise.resolve(
            json(
              {
                code: "APPOINTMENT_REQUIRED",
                message: "부서와 직급은 발령으로 변경해 주세요.",
                fieldErrors: [],
              },
              409,
            ),
          )
        : mockFetch(url, options),
    );
    await mount("/employees/2/edit");
    await user.click(await screen.findByRole("button", { name: "저장" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "발령으로 변경",
    );
    expect(
      screen.getAllByRole("link", { name: "발령 등록하러 가기" }).length,
    ).toBeGreaterThan(0);
  });
  it("발령 중 퇴사된 사원의 409 사유를 대화상자에 표시한다", async () => {
    vi.mocked(fetch).mockImplementation((url, options) =>
      String(url).endsWith("/appointments") && options?.method === "POST"
        ? Promise.resolve(
            json(
              {
                code: "EMPLOYEE_RETIRED",
                message: "퇴사한 사원은 발령할 수 없습니다.",
                fieldErrors: [],
              },
              409,
            ),
          )
        : mockFetch(url, options),
    );
    await mount("/employees/2");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "발령 등록" }));
    const dialog = screen.getByRole("dialog");
    await user.selectOptions(
      within(dialog).getByLabelText("발령 후 부서 *"),
      "1",
    );
    await user.type(within(dialog).getByLabelText("발령 사유 *"), "검증 이동");
    await user.click(within(dialog).getByRole("button", { name: "발령 등록" }));
    expect((await within(dialog).findByRole("alert")).textContent).toContain(
      "퇴사한 사원",
    );
  });
  it("내보내기는 클릭한 필터·정렬을 유지하고 page/size를 제외한다", () => {
    const query = new URLSearchParams(
      exportQuery(
        {
          keyword: "가상",
          status: "ON_LEAVE",
          departmentId: "1",
          positionId: "2",
          sort: "name,desc",
          page: "3",
          size: "10",
        },
        "csv",
      ),
    );
    expect(query.get("keyword")).toBe("가상");
    expect(query.get("sort")).toBe("name,desc");
    expect(query.get("format")).toBe("csv");
    expect(query.has("page")).toBe(false);
    expect(query.has("size")).toBe(false);
  });
  it("다운로드 파일명은 UTF-8 헤더를 해석하고 경로 문자를 제거한다", () => {
    expect(
      downloadName(
        "attachment; filename*=UTF-8''%EA%B2%80%EC%A6%9D.xlsx",
        "fallback.xlsx",
      ),
    ).toBe("검증.xlsx");
    expect(
      downloadName('attachment; filename="../unsafe.xlsx"', "fallback.xlsx"),
    ).toBe(".._unsafe.xlsx");
  });
  it("xlsx rowErrors는 실제 행 번호와 사유를 표시하고 전체 취소를 안내한다", async () => {
    intercept(
      "/employees/import",
      {
        code: "IMPORT_VALIDATION_ERROR",
        message: "전체 등록이 취소되었습니다.",
        fieldErrors: [],
        rowErrors: [
          { row: 7, field: "email", reason: "이미 등록된 이메일입니다." },
        ],
      },
      400,
    );
    await mount("/employees/import");
    const user = userEvent.setup();
    await user.upload(
      await screen.findByLabelText("사원 등록 파일"),
      new File(["mock"], "employees.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );
    await user.click(screen.getByRole("button", { name: "등록 내용 확인" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "전체 등록",
      }),
    );
    await screen.findByRole("heading", { name: "등록이 모두 취소되었습니다" });
    expect(screen.getByRole("cell", { name: "7" })).toBeTruthy();
    expect(screen.getByText("이미 등록된 이메일입니다.")).toBeTruthy();
    const call = vi
      .mocked(fetch)
      .mock.calls.find(([, options]) => options?.method === "POST");
    expect(call?.[1]?.body).toBeInstanceOf(FormData);
    expect(new Headers(call?.[1]?.headers).has("Content-Type")).toBe(false);
  });
  it("서울 날짜는 윤년·연말 경계를 포함해 [from,to)로 변환한다", () => {
    expect(seoulDateRange("2026-12-31", "2026-12-31")).toEqual({
      from: "2026-12-31T00:00:00+09:00",
      to: "2027-01-01T00:00:00+09:00",
    });
    expect(seoulDateRange("2024-02-28", "2024-02-29").to).toBe(
      "2024-03-01T00:00:00+09:00",
    );
    expect(() => seoulDateRange("2026-10-20", "2026-10-01")).toThrow();
  });
  it("감사 조회는 서울 날짜 범위와 필터를 API에 전송한다", async () => {
    await mount("/audit-logs");
    const user = userEvent.setup();
    await user.type(
      await screen.findByLabelText("시작일 (서울)"),
      "2026-10-01",
    );
    await user.type(screen.getByLabelText("종료일 (서울, 포함)"), "2026-10-16");
    await user.selectOptions(screen.getByLabelText("성공 여부"), "false");
    await user.click(screen.getByRole("button", { name: "조회" }));
    await waitFor(() =>
      expect(
        vi.mocked(fetch).mock.calls.some(([url]) => {
          const q = new URL(String(url)).searchParams;
          return (
            q.get("from") === "2026-10-01T00:00:00+09:00" &&
            q.get("to") === "2026-10-17T00:00:00+09:00" &&
            q.get("success") === "false"
          );
        }),
      ).toBe(true),
    );
  });
  it("감사 문자열은 HTML 실행 없이 텍스트로 표시하고 null을 구분한다", async () => {
    intercept("/audit-logs", {
      content: [
        {
          id: 1,
          occurredAt: "2026-10-16T10:00:00+09:00",
          actor: null,
          action: "LOGIN_FAILURE",
          targetType: null,
          targetId: null,
          targetLabel: null,
          success: false,
          before: null,
          after: null,
          metadata: { reason: "<img src=x onerror=alert(1)>" },
        },
      ],
      page: 0,
      size: 20,
      totalElements: 1,
      totalPages: 1,
    });
    await mount("/audit-logs");
    await screen.findAllByText("로그인 실패");
    const user = userEvent.setup();
    await user.click(await screen.findByText("상세 보기"));
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeTruthy();
    expect(document.querySelector("img")).toBeNull();
    expect(
      screen.getByText("변경 전: 해당 없음 · 변경 후: 해당 없음"),
    ).toBeTruthy();
  });
});

