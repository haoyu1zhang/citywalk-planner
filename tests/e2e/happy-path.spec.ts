import { expect, test } from "@playwright/test";

test("生成 60 分钟罗马咖啡路线,刷新后复现同一路线", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "罗马" }).click();
  await page.getByRole("button", { name: "60 分钟" }).click();
  await page.getByRole("button", { name: "咖啡" }).click();
  await page.getByRole("button", { name: "生成路线" }).click();

  await expect(page).toHaveURL(/\/route\?/);
  const names = page.getByTestId("stop-name");
  await expect(names.first()).toBeVisible();
  expect(await names.count()).toBeGreaterThanOrEqual(4);

  // Map: one numbered marker per stop and a route polyline.
  await expect(page.locator(".cw-marker")).toHaveCount(await names.count());
  await expect(page.locator("path.cw-route-line")).toBeVisible();
  await expect(page.getByText("OpenStreetMap 贡献者")).toBeVisible();

  // The URL now pins the stops; a reload must give the same route.
  await expect(page).toHaveURL(/stops=/);
  const before = await names.allTextContents();
  await page.reload();
  await expect(names.first()).toBeVisible();
  expect(await names.allTextContents()).toEqual(before);

  // Deleting a stop keeps the page usable and updates the list.
  await page.getByRole("button", { name: /^删除站点/ }).first().click();
  await expect(names).toHaveCount(before.length - 1);
});
