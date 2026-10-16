import { test, expect } from "@playwright/test";
test("관리자 목업: 필터·정렬·페이지·직급 CRUD·모바일", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("아이디 (사번)").fill("admin");
  await page.getByLabel("비밀번호", { exact: true }).fill("demo1234!");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page.getByRole('link', { name: '사원 관리', exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "사원 관리", exact: true }),
  ).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(20);
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(11);
  await page.getByLabel("사원 검색").fill("EMP001");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByLabel("사원 검색").fill("없는 검색어");
  await expect(page.getByText("조건에 맞는 사원이 없습니다.")).toBeVisible();
  await page.getByLabel("사원 검색").fill("");
  await page.getByLabel("부서", { exact: true }).selectOption("1");
  await expect(page.locator("tbody tr")).toHaveCount(16);
  await page
    .getByLabel("정렬", { exact: true })
    .selectOption("employeeNo,desc");
  await page.screenshot({
    path: "test-results/admin-desktop.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "직급 관리", exact: true }).click();
  await page.getByLabel("직급 이름 *").fill("검증직급");
  await page.getByLabel("정렬 순서 *").fill("3");
  await page.getByRole("button", { name: "등록", exact: true }).click();
  await page
    .getByRole("button", { name: "수정 검증직급", exact: true })
    .click();
  await page.getByLabel("직급 이름 *").fill("수정직급");
  await page.getByRole("button", { name: "변경 저장", exact: true }).click();
  await page
    .getByRole("button", { name: "삭제 수정직급", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "삭제", exact: true })
    .click();
  await expect(page.getByText("수정직급", { exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "사원 관리", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", { name: "사원 관리", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/admin-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "로그인", exact: true }),
  ).toBeVisible();
});
test("일반 사원 목업: 본인 정보·관리 URL 차단", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("아이디 (사번)").fill("EMP001");
  await page.getByLabel("비밀번호", { exact: true }).fill("demo1234!");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "내 정보", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "사원 관리", exact: true }),
  ).toHaveCount(0);
  await page.evaluate(() => {
    history.pushState({}, "", "/employees/new");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(
    page.getByRole("heading", { name: "권한이 없습니다", exact: true }),
  ).toBeVisible();
});


