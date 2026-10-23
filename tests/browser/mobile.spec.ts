import { test, expect } from "@playwright/test";
for (const width of [320, 375, 390, 430, 768, 1440]) {
  test(`critical job/feed interactions at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    const calls: { operation: string; args: Record<string, unknown> }[] = [];
    let current: Record<string, unknown> | null = null;
    await page.route("**/api/tracker", async (route) => {
      const body = route.request().postDataJSON();
      calls.push(body);
      let result: object = { ok: true };
      if (body.operation === "list_jobs") {
        current ||= {
          id: "11111111-1111-4111-8111-111111111111",
          company: "Advanced Hardware Labs",
          position: "2027 New Graduate Silicon Validation Engineer",
          status: "jobs_found",
          role_type: "full_time",
          location: "Austin, TX",
          url: "https://example.com/job?id=1",
          added_date: "2026-10-22T12:00:00Z",
          updated_at: "2026-10-22T12:00:00Z",
          priority: "strategic",
          protected: false,
          availability: "not_checked",
          review_flags: [],
          notes: "Technical hardware work.",
        };
        result = {
          jobs: [current],
          total: 1,
          has_more: false,
          next_cursor: null,
        };
      }
      if (body.operation === "list_activity")
        result = { events: [], has_more: false, next_cursor: null };
      await route.fulfill({ json: result });
    });
    await page.goto("/");
    await expect(
      page.getByRole("heading", {
        name: "2027 New Graduate Silicon Validation Engineer",
      }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("textbox", { name: "Search opportunities" }).fill("Hardware");
    await expect
      .poll(() =>
        calls.some(
          (c) => c.operation === "list_jobs" && c.args.q === "Hardware",
        ),
      )
      .toBe(true);
    await page.getByText("More details", { exact: true }).click();
    await expect(page.getByText("Technical hardware work.")).toBeVisible();
    await page.getByRole("button", { name: "Actions for 2027 New Graduate Silicon Validation Engineer" }).click();
    await page.getByRole("menuitem", { name: "Protect job", exact: true }).click();
    await expect
      .poll(() =>
        calls.some(
          (c) => c.operation === "update_job" && c.args.protected === true,
        ),
      )
      .toBe(true);
    await page.getByRole("button", { name: "Move to Apply", exact: true }).click();
    await expect
      .poll(() =>
        calls.some(
          (c) => c.operation === "update_job" && c.args.status === "to_apply",
        ),
      )
      .toBe(true);
    await page.getByRole("button", { name: "Edit details / notes" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByLabel("Notes", { exact: true }).fill("Updated from mobile");
    await page.getByRole("button", { name: "Save Changes" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect
      .poll(() =>
        calls.some(
          (c) =>
            c.operation === "update_job" &&
            c.args.notes === "Updated from mobile",
        ),
      )
      .toBe(true);
    await page.getByRole("button", { name: "Actions for 2027 New Graduate Silicon Validation Engineer" }).click();
    await page.getByRole("menuitem", { name: "Move to Deleted", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Undo removal" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Undo removal" }).click();
    await expect
      .poll(() => calls.some((c) => c.operation === "restore_job"))
      .toBe(true);
    await page.getByRole("button", { name: "deleted", exact: true }).click();
    await expect(page.getByRole("columnheader", { name: "Recovery deadline (UTC)" })).toBeVisible();
    await page.getByRole("button", { name: "Restore", exact: true }).click();
    await page.getByRole("button", { name: "feed", exact: true }).click();
    await page.getByText("View affected jobs", { exact: true }).click();
    await expect(
      page.getByRole("link", { name: /Advanced Hardware Labs/ }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Filter feed" }).click();
    await expect(page.getByText(/No activity yet/)).toBeVisible();
    if (width < 768) {
      await page.getByRole("button", { name: "Open navigation" }).click();
      await expect(
        page.getByRole("dialog", { name: "Navigation" }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(
        page.getByRole("dialog", { name: "Navigation" }),
      ).not.toBeVisible();
    }
    await page.getByRole("button", { name: "settings", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: /Connected client permissions/ }),
    ).toBeVisible();
    await expect(page.getByText(/Cleanup policy|Protected companies/)).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
}

test("Applications searches automatically and displays every matching cursor page", async ({ page }) => {
  const requests: Record<string, unknown>[] = [];
  const jobs = Array.from({ length: 135 }, (_,i) => ({
    id: `10000000-0000-4000-8000-${String(i).padStart(12, "0")}`, company: "Lunaris Electronics", position: `Matched Engineer ${i}`,
    status: i < 70 ? "to_apply" : i < 120 ? "applied" : "rejected", role_type: "full_time", added_date: "2026-10-23T00:00:00Z", priority: "review", availability: "not_checked", review_flags: [],
  }));
  await page.route("**/api/tracker", async route => {
    const { args } = route.request().postDataJSON(); requests.push(args);
    const start = args.cursor ? 100 : 0;
    await route.fulfill({ json: { jobs: jobs.slice(start, start + 100), total: 135, has_more: start === 0, next_cursor: start === 0 ? { id: jobs[99].id, added_date: jobs[99].added_date } : null } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "applications", exact: true }).click();
  await page.getByRole("textbox", { name: "Search opportunities" }).fill("Lunari");
  await expect(page.getByRole("row")).toHaveCount(138);
  await expect(page.getByText("135 matching opportunities", { exact: true })).toBeVisible();
  expect(requests.filter(r => r.q === "Lunari").length).toBe(2);
  expect(requests.every(r => r.page_size === 100)).toBe(true);
  await expect(page.getByRole("button", { name: "Next page", exact: true })).toHaveCount(0);
});

test("Applied shortcut moves a job into its group without opening a card", async ({ page }) => {
  let applied = false;
  const job = { id: "11111111-1111-4111-8111-111111111111", company: "Advanced Hardware Labs", position: "2027 New Graduate Silicon Validation Engineer", status: "applied", role_type: "full_time", added_date: "2026-10-22T12:00:00Z", applied_date: "2026-10-23T00:00:00Z", priority: "review", availability: "not_checked", review_flags: [] };
  await page.route("**/api/tracker", async route => {
    const body = route.request().postDataJSON();
    if (body.operation === "update_job") applied = body.args.status === "applied";
    await route.fulfill({ json: body.operation === "list_jobs" ? { jobs: [job], total: 1, has_more: false, next_cursor: null } : { job } });
  });
  await page.goto("/");await page.getByRole("button", { name: "applications", exact: true }).click();
  await page.getByRole("region", { name: "To Apply jobs" }).getByRole("button", { name: "Applied", exact: true }).click();
  await expect(page.getByRole("region", { name: "To Apply jobs" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Applied jobs" }).getByRole("button", { name: job.position, exact: true })).toBeVisible();
  expect(applied).toBe(true);await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("Slower earlier searches cannot replace the newest results", async ({ page }) => {
  let oldStarted = false;
  let completeOld: () => void = () => {};
  const oldFinished = new Promise<void>(resolve => { completeOld = resolve; });
  await page.route("**/api/tracker", async route => {
    const { args } = route.request().postDataJSON();
    if (args.q === "old") { oldStarted = true; await new Promise(resolve => setTimeout(resolve, 1000)); }
    const job = { id: "11111111-1111-4111-8111-111111111111", company: "Hardware Labs", position: args.q === "old" ? "Stale result" : "Newest result", status: "to_apply", role_type: "full_time", added_date: "2026-10-22T12:00:00Z", priority: "review", availability: "not_checked", review_flags: [] };
    await route.fulfill({ json: { jobs: [job], total: 1, has_more: false, next_cursor: null } }).catch(() => {});
    if (args.q === "old") completeOld();
  });
  await page.goto("/");await page.getByRole("button", { name: "applications", exact: true }).click();
  await page.getByRole("textbox", { name: "Search opportunities" }).fill("old");await expect.poll(() => oldStarted).toBe(true);
  await page.getByRole("textbox", { name: "Search opportunities" }).fill("new");await expect(page.getByRole("button", { name: "Newest result", exact: true })).toBeVisible();
  await oldFinished;await expect(page.getByRole("button", { name: "Stale result", exact: true })).toHaveCount(0);
});

for (const width of [320, 375, 390, 430, 768, 1440]) {
  test(`dense applications table at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    const updates: object[] = [];
    await page.route("**/api/tracker", async route => {
      const body = route.request().postDataJSON();
      updates.push(body);
      await route.fulfill({ json: body.operation === "list_jobs" ? { jobs: [], total: 0, has_more: false, next_cursor: null } : { ok: true } });
    });
    await page.goto("/");
    await page.getByRole("button", { name: "applications", exact: true }).click();
    await expect(page.getByRole("table")).toHaveCount(3);
    for (const stage of ["To Apply", "Applied", "Rejected"]) await expect(page.getByRole("heading", { name: stage, exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Next page", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Previous", exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("region", { name: "To Apply jobs" }).getByRole("cell", { name: "Advanced Hardware Labs", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Job details" })).toBeVisible();
    await expect(page.getByText("Technical hardware work.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Close", exact: true }).click();
    const keyboardRow = page.getByRole("region", { name: "To Apply jobs" }).getByRole("row").filter({ has: page.getByRole("button", { name: "2027 New Graduate Silicon Validation Engineer", exact: true }) });
    await keyboardRow.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", { name: "Job details" })).toBeVisible();
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("button", { name: "Actions for 2027 New Graduate Silicon Validation Engineer" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("menuitem", { name: "Edit details / notes" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByLabel("Notes", { exact: true }).fill("Dense table notes");
    await page.getByRole("button", { name: "Save Changes" }).click();
    await expect.poll(() => updates.some((u) => JSON.stringify(u).includes('Dense table notes'))).toBe(true);
    await expect(page.getByRole("dialog")).not.toBeVisible();
  });
}
