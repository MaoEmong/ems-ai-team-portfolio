import { test, expect, type Page } from "@playwright/test";
import ExcelJS from "exceljs";
const evidence = "design-evidence";
async function nav(page: Page, label: string) {
  const toggle = page.getByRole("button", { name: /메뉴 펼치기/ });
  if (await toggle.isVisible()) await toggle.click();
  await page
    .getByRole("navigation", { name: "주 메뉴" })
    .getByRole("link", { name: label, exact: true })
    .click();
}
async function capture(page: Page, name: string) {
  await expect(page.locator("body")).toBeVisible();
  await page.evaluate(async () => {
    window.scrollTo(0, 0);
    await document.fonts.ready;
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: `${evidence}/${name}.png`, fullPage: true });
}
for (const mobile of [false, true])
  test(`${mobile ? "모바일" : "데스크톱"} 2단계 흐름과 디자인 증거`, async ({
    page,
  }) => {
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    );
    const prefix = mobile ? "mobile" : "desktop";
    await page.goto("/login");
    await capture(page, `${prefix}-login`);
    await page.getByLabel("아이디 (사번)").fill("admin");
    await page.getByLabel("비밀번호", { exact: true }).fill("demo1234!");
    await page.getByRole("button", { name: "로그인", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "대시보드", exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/기준일 .*KST/)).toBeVisible();
    await capture(page, `${prefix}-dashboard`);
    await nav(page, "사원 관리");
    await expect(page.locator("tbody tr")).toHaveCount(20);
    await capture(page, `${prefix}-employees`);
    await page
      .getByRole("link", { name: "테스트 사원 1", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "기본 정보", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "발령 등록", exact: true }).click();
    await capture(page, `${prefix}-appointment`);
    await page.screenshot({
      path: `${evidence}/${prefix}-appointment-viewport.png`,
      fullPage: false,
    });
    const dialog = page.getByRole("dialog");
    const box = await dialog.boundingBox();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(
      page.viewportSize()!.height,
    );
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "발령 등록", exact: true }),
    ).toBeFocused();
    await page.getByRole("button", { name: "발령 등록", exact: true }).click();
    await page.getByLabel("발령 후 부서 *").selectOption("1");
    await page.getByLabel("발령 사유 *").fill("합성 검수 이동");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "발령 등록", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByText("합성 검수 이동", { exact: true }),
    ).toBeVisible();
    await capture(page, `${prefix}-history`);
    await page.getByRole("link", { name: "정보 수정", exact: true }).click();
    await expect(page.getByText("소속 (읽기 전용)")).toBeVisible();
    await capture(page, `${prefix}-edit`);
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "테스트 사원 1", exact: true }),
    ).toBeVisible();
    await nav(page, "사원 관리");
    const downloadPromise = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "CSV 내보내기", exact: true })
      .click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/ems-employees-.*\.csv/);
    await page
      .getByRole("link", { name: "엑셀 가져오기", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "엑셀 가져오기", exact: true }),
    ).toBeVisible();
    await capture(page, `${prefix}-import`);
    const pageHeight = await page.evaluate(
      () => document.documentElement.scrollHeight,
    );
    expect(pageHeight).toBeLessThan(mobile ? 1300 : 1100);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("employees");
    sheet.addRow([
      "employeeNo",
      "name",
      "email",
      "phone",
      "hireDate",
      "departmentId",
      "positionId",
      "role",
      "initialPassword",
    ]);
    sheet.addRow([
      "EMP001",
      "합성 오류",
      "duplicate@example.test",
      "",
      "2026-01-01",
      "1",
      "1",
      "EMPLOYEE",
      "demo1234!",
    ]);
    const buffer = await workbook.xlsx.writeBuffer();
    await page.getByLabel("사원 등록 파일").setInputFiles({
      name: "invalid.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from(buffer),
    });
    await page
      .getByRole("button", { name: "등록 내용 확인", exact: true })
      .click();
    await page.screenshot({
      path: `${evidence}/${prefix}-import-confirm.png`,
      fullPage: false,
    });
    await page.getByRole("button", { name: "전체 등록", exact: true }).click();
    await expect(
      page.getByRole("heading", {
        name: "등록이 모두 취소되었습니다",
        exact: true,
      }),
    ).toBeVisible();
    await capture(page, `${prefix}-import-errors`);
    await page.getByLabel("사원 등록 파일").setInputFiles({
      name: "broken.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from("broken"),
    });
    await page
      .getByRole("button", { name: "등록 내용 확인", exact: true })
      .click();
    await page.screenshot({
      path: `${evidence}/${prefix}-import-confirm.png`,
      fullPage: false,
    });
    await page.getByRole("button", { name: "전체 등록", exact: true }).click();
    await expect(page.getByText(/파일 형식·시트·머리글/)).toBeVisible();
    await capture(page, `${prefix}-import-invalid`);
    await nav(page, "감사 로그");
    await expect(page.getByText("상세 보기").first()).toBeVisible();
    await page.getByText("상세 보기").first().click();
    await capture(page, `${prefix}-audit`);
    await nav(page, "부서 관리");
    await expect(
      page.getByRole("heading", { name: "부서 목록", exact: true }),
    ).toBeVisible();
    await capture(page, `${prefix}-departments`);
    await page.getByRole("button", { name: "로그아웃", exact: true }).click();
    await page.getByLabel("아이디 (사번)").fill("EMP001");
    await page.getByLabel("비밀번호", { exact: true }).fill("demo1234!");
    await page.getByRole("button", { name: "로그인", exact: true }).click();
    await expect(
      page.getByText("합성 검수 이동", { exact: true }),
    ).toBeVisible();
    await capture(page, `${prefix}-me`);
    await page.evaluate(() => {
      history.pushState({}, "", "/audit-logs");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await expect(
      page.getByRole("heading", { name: "권한이 없습니다", exact: true }),
    ).toBeVisible();
    await capture(page, `${prefix}-forbidden`);
  });
