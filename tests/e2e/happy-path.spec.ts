import { expect, test } from "@playwright/test";

// Runs against the offline build (CITYWALK_OFFLINE=1): bundled OSM snapshot,
// no calls to public APIs. The browser locale is zh-CN (see playwright.config).

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
  await page.getByTestId("delete-stop").first().click();
  await expect(names).toHaveCount(before.length - 1);
});

test("date mode plans an arc, and the language can be switched", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("language-select").selectOption("en");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Where shall we walk today?");

  await page.getByRole("radio", { name: "Date" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("No idea where to go on your date?");
  await page.locator('[data-city="florence"]').click();
  await page.getByTestId("generate").click();

  await expect(page).toHaveURL(/theme=date/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Florence · Date walk");
  const badges = page.locator('[data-testid="stop-list"] li span.rounded-full.bg-accent-soft');
  await expect(badges.first()).toBeVisible();
  const kinds = await badges.allTextContents();
  expect(["Gelato", "Café"]).toContain(kinds[0]);
  expect(["Restaurant", "Bar"]).toContain(kinds[kinds.length - 1]);

  // The choice survives a reload (cookie) and applies to server-rendered pages.
  await page.getByTestId("language-select").selectOption("it");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Firenze · Passeggiata a due");
  await page.goto("/about");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Informazioni sul progetto");
  await expect(page.locator("html")).toHaveAttribute("lang", "it-IT");
});

test("events: explains itself without a key, lists and filters with one", async ({ page }) => {
  const route = "/route?city=rome&lat=41.8986&lng=12.4769&d=60&theme=coffee";
  await page.goto(route);
  await page.getByTestId("events-open").click();
  await expect(page.getByTestId("events-unconfigured")).toBeVisible();

  // With a provider configured the API returns events; stub that response.
  const requests: string[] = [];
  await page.route("**/api/events?*", async (r) => {
    requests.push(r.request().url());
    await r.fulfill({
      json: {
        configured: true,
        events: [
          { id: "ev1", name: "Concerto di prova", url: "https://example.com/e/1", startsAt: "2026-11-21T21:00", category: "music", venue: "Auditorium", lat: 41.929, lng: 12.4747, priceFrom: 25, currency: "EUR" },
        ],
      },
    });
  });
  await page.reload();
  await page.getByTestId("events-open").click();
  const panel = page.getByTestId("events-panel");
  await expect(panel.getByText("Concerto di prova")).toBeVisible();
  await expect(panel.getByRole("button", { name: "加入路线" })).toBeEnabled();

  await panel.getByRole("button", { name: "音乐" }).click();
  await panel.getByPlaceholder("搜索活动、艺人或场馆").fill("jazz");
  await panel.getByPlaceholder("搜索活动、艺人或场馆").press("Enter");
  await expect.poll(() => requests.at(-1) ?? "").toMatch(/q=jazz/);
  expect(requests.at(-1)).toMatch(/category=music/);
});
