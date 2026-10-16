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
import { ApiError, request, TOKEN_KEY } from "./api";
import { mockFetch } from "./mock";
import { blankEmployee, validateEmployee } from "./validation";
beforeEach(() => {
  sessionStorage.clear();
  vi.stubGlobal("fetch", vi.fn(mockFetch));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function mount(path = "/login") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  );
}
async function login(id = "admin") {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText("아이디 (사번)"), id);
  await user.type(screen.getByLabelText("비밀번호"), "demo1234!");
  await user.click(screen.getByRole("button", { name: "로그인" }));
  if(id === "admin") await user.click(await screen.findByRole("link", {name:"사원 관리"}));
  return user;
}
describe("인증과 역할", () => {
  it("로그인 후 토큰을 저장하고 Authorization 헤더를 전송한다", async () => {
    mount();
    await login();
    await screen.findByRole("heading", { name: "사원 관리" });
    expect(sessionStorage.getItem(TOKEN_KEY)).toBeTruthy();
    await waitFor(() =>
      expect(
        vi
          .mocked(fetch)
          .mock.calls.some(
            ([url, options]) =>
              String(url).includes("/employees?") &&
              new Headers(options?.headers)
                .get("Authorization")
                ?.startsWith("Bearer "),
          ),
      ).toBe(true),
    );
  });
  it("401 응답은 토큰을 삭제하고 로그인 화면으로 이동한다", async () => {
    mount();
    await login();
    await screen.findByRole("heading", { name: "사원 관리" });
    sessionStorage.setItem(TOKEN_KEY, "expired");
    await expect(request("/auth/me")).rejects.toBeInstanceOf(ApiError);
    await screen.findByRole("button", { name: "로그인" });
    expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull();
  });
  it("로그인 실패는 원인을 표시한다", async () => {
    mount();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("아이디 (사번)"), "unknown");
    await user.type(screen.getByLabelText("비밀번호"), "wrong");
    await user.click(screen.getByRole("button", { name: "로그인" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "아이디 또는 비밀번호",
    );
  });
  it("일반 사원은 내 정보만 보고 관리 메뉴가 없다", async () => {
    mount();
    await login("EMP001");
    await screen.findByRole("heading", { name: "내 정보" });
    expect(screen.queryByRole("link", { name: "사원 관리" })).toBeNull();
    expect(screen.queryByRole("link", { name: "정보 수정" })).toBeNull();
    expect(screen.queryByRole("button", { name: "퇴사 처리" })).toBeNull();
  });
  it("일반 사원이 관리 URL로 직접 진입하면 차단한다", async () => {
    const response = await mockFetch("http://localhost/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ loginId: "EMP001", password: "demo1234!" }),
    });
    sessionStorage.setItem(TOKEN_KEY, (await response.json()).accessToken);
    mount("/employees/new");
    await screen.findByRole("heading", { name: "권한이 없습니다" });
    expect(screen.queryByRole("button", { name: "저장" })).toBeNull();
  });
  it("일반 사원의 타인 정보 조회는 403 안내를 표시한다", async () => {
    const response = await mockFetch("http://localhost/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ loginId: "EMP001", password: "demo1234!" }),
    });
    sessionStorage.setItem(TOKEN_KEY, (await response.json()).accessToken);
    mount("/employees/1");
    expect((await screen.findByRole("alert")).textContent).toContain(
      "권한이 없습니다",
    );
  });
});
describe("사원 폼과 관리 흐름", () => {
  it("필수 입력·이메일·UTF-8 비밀번호 한도를 검증한다", () => {
    expect(validateEmployee(blankEmployee, true)).toHaveProperty("employeeNo");
    expect(
      validateEmployee(
        {
          ...blankEmployee,
          email: "invalid",
          initialPassword: "가".repeat(25),
        },
        true,
      ),
    ).toMatchObject({
      email: "올바른 이메일을 입력하세요.",
      initialPassword: "비밀번호는 UTF-8 72바이트 이내여야 합니다.",
    });
    expect(
      validateEmployee(
        {
          ...blankEmployee,
          name: "테스트",
          email: "test@example.test",
          hireDate: "2026-01-01",
          departmentId: "1",
          positionId: "1",
        },
        false,
      ),
    ).toEqual({});
  });
  it("빈 등록 폼은 필드 오류를 표시하고 저장 요청을 보내지 않는다", async () => {
    mount();
    const user = await login();
    await user.click(await screen.findByRole("link", { name: "+ 사원 등록" }));
    await user.click(await screen.findByRole("button", { name: "저장" }));
    expect(screen.getAllByText("필수 입력입니다.").length).toBeGreaterThan(3);
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(
          ([url, init]) =>
            String(url).endsWith("/employees") && init?.method === "POST",
        ),
    ).toBe(false);
  });
  it("관리자는 사원을 등록·수정·퇴사 처리하고 퇴사 필터로 조회한다", async () => {
    mount();
    const user = await login();
    await user.click(await screen.findByRole("link", { name: "+ 사원 등록" }));
    await user.type(await screen.findByLabelText("사번 *"), "FLOW001");
    await user.type(screen.getByLabelText("이름 *"), "흐름검증 사원");
    await user.type(screen.getByLabelText("이메일 *"), "flow@example.test");
    await user.type(screen.getByLabelText("입사일 *"), "2026-01-02");
    await user.selectOptions(screen.getByLabelText("부서 *"), "1");
    await user.selectOptions(screen.getByLabelText("직급 *"), "1");
    await user.type(screen.getByLabelText("초기 비밀번호 *"), "demo1234!");
    await user.click(screen.getByRole("button", { name: "저장" }));
    await screen.findByRole("heading", { name: "흐름검증 사원" });
    await user.click(screen.getByRole("link", { name: "정보 수정" }));
    const name = await screen.findByLabelText("이름 *");
    await user.clear(name);
    await user.type(name, "수정검증 사원");
    await user.click(screen.getByRole("button", { name: "저장" }));
    await screen.findByRole("heading", { name: "수정검증 사원" });
    await user.click(screen.getByRole("button", { name: "퇴사 처리" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("퇴사일"), "2026-10-16");
    await user.click(within(dialog).getByRole("button", { name: "퇴사 처리" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await screen.findByText("퇴사", { selector: "dd" });
    expect(screen.queryByRole("link", { name: "정보 수정" })).toBeNull();
    await user.click(screen.getByRole("link", { name: "사원 관리" }));
    await user.selectOptions(
      await screen.findByLabelText("재직 상태"),
      "RETIRED",
    );
    await screen.findByRole("link", { name: "수정검증 사원" });
  });
  it("부서 등록·수정·삭제와 참조 중인 부서의 409 사유를 표시한다", async () => {
    mount();
    const user = await login();
    await user.click(await screen.findByRole("link", { name: "부서 관리" }));
    await user.type(await screen.findByLabelText("부서 이름 *"), "검증 부서");
    await user.click(screen.getByRole("button", { name: "등록" }));
    await user.click(
      await screen.findByRole("button", { name: "수정 검증 부서" }),
    );
    await user.clear(screen.getByLabelText("부서 이름 *"));
    await user.type(screen.getByLabelText("부서 이름 *"), "변경 부서");
    await user.click(screen.getByRole("button", { name: "변경 저장" }));
    await user.click(
      await screen.findByRole("button", { name: "삭제 변경 부서" }),
    );
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "삭제" }),
    );
    await waitFor(() => expect(screen.queryByText("변경 부서")).toBeNull());
    // The 3B seed makes 개발팀 the parent; use the occupied leaf to exercise IN_USE.
    await user.click(screen.getByRole("button", { name: "삭제 운영팀" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "삭제" }),
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "소속 사원",
    );
  });
  it("서버 fieldErrors를 해당 필드 아래 표시한다", async () => {
    mount();
    const user = await login();
    await user.click(await screen.findByRole("link", { name: "부서 관리" }));
    await user.type(await screen.findByLabelText("부서 이름 *"), "오류검증");
    vi.mocked(fetch).mockImplementationOnce(
      async () =>
        new Response(
          JSON.stringify({
            code: "VALIDATION_ERROR",
            message: "입력 오류",
            fieldErrors: [{ field: "name", reason: "서버에서 거절한 이름" }],
          }),
          { status: 400 },
        ),
    );
    await user.click(screen.getByRole("button", { name: "등록" }));
    expect((await screen.findByText("서버에서 거절한 이름")).id).toBe(
      "name-error",
    );
  });
});


