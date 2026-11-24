import { expect, test } from "@playwright/test";

// runs against the offline build (CITYWALK_OFFLINE=1), browser locale zh-CN

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

  await expect(page.locator(".cw-marker")).toHaveCount(await names.count());
  await expect(page.locator("path.cw-route-line")).toBeVisible();
  await expect(page.getByText("OpenStreetMap 贡献者")).toBeVisible();

  // stops are pinned in the URL now, reload must give the same route
  await expect(page).toHaveURL(/stops=/);
  const before = await names.allTextContents();
  await page.reload();
  await expect(names.first()).toBeVisible();
  expect(await names.allTextContents()).toEqual(before);

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

  // cookie: server-rendered pages follow
  await page.getByTestId("language-select").selectOption("it");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Firenze · Passeggiata a due");
  await page.goto("/about");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Informazioni sul progetto");
  await expect(page.locator("html")).toHaveAttribute("lang", "it-IT");
});

test("events: lists and filters", async ({ page }) => {
  const requests: string[] = [];
  await page.route("**/api/events?*", async (r) => {
    requests.push(r.request().url());
    await r.fulfill({
      json: {
        events: [
          { id: "ev1", name: "Concerto di prova", url: "https://example.com/e/1", startsAt: "2026-11-21T21:00", category: "music", venue: "Auditorium", lat: 41.929, lng: 12.4747, priceFrom: 25, currency: "EUR", source: "ticketmaster" },
        ],
      },
    });
  });
  await page.goto("/route?city=rome&lat=41.8986&lng=12.4769&d=60&theme=coffee");
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

test("wheel: spin, add the pick to the route, then open it in Google Maps", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/route?city=bologna&lat=44.4939&lng=11.3428&d=60&theme=classic");
  const names = page.getByTestId("stop-name");
  await expect(names.first()).toBeVisible();
  const before = await names.allTextContents();

  await page.getByTestId("wheel-open").click();
  await page.getByTestId("wheel-spin").click();
  const result = page.getByTestId("wheel-result");
  await expect(result).toBeVisible();
  const picked = await result.locator("p.font-medium").innerText();
  expect(before).not.toContain(picked);

  await result.getByRole("button", { name: "加入路线" }).click();
  await expect(names).toHaveCount(before.length + 1);
  expect(await names.allTextContents()).toContain(picked);

  const href = await page.getByTestId("navigate").getAttribute("href");
  const url = new URL(href!);
  expect(url.searchParams.get("origin")).toBe("44.4939,11.3428");
  expect(url.searchParams.get("travelmode")).toBe("walking");
  expect(url.searchParams.get("waypoints")!.split("|")).toHaveLength(before.length);
});

test("any city: search one, or start from where you are", async ({ page, context }) => {
  await page.route("**/api/geocode?*", (r) =>
    r.fulfill({ json: { results: [{ name: "巴黎", label: "巴黎, 法兰西岛, 法国", lat: 48.8566, lng: 2.3522 }] } }),
  );
  await page.goto("/");
  await page.getByTestId("other-city").click();
  await page.getByTestId("city-search").fill("Paris");
  await page.getByTestId("city-search").press("Enter");
  await page.getByRole("button", { name: /巴黎, 法兰西岛/ }).click();
  await expect(page.locator('[data-city="custom"]')).toHaveText("巴黎");
  await expect(page.getByTestId("start-label")).toHaveText("巴黎市中心");
  await page.getByTestId("generate").click();
  await expect(page).toHaveURL(/city=%E5%B7%B4%E9%BB%8E&lat=48.8566&lng=2.3522/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("巴黎");

  // a location inside a preset city picks that preset
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 43.7731, longitude: 11.2558 });
  await page.goto("/");
  await page.getByTestId("use-location").click();
  await expect(page.locator('[data-city="florence"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("start-label")).toHaveText("你的当前位置");
});
