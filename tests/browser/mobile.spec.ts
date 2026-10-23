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
    await page.getByText("Filters", { exact: true }).click();
    await page
      .getByRole("textbox", { name: "company", exact: true })
      .fill("Hardware");
    await page.getByRole("button", { name: "Search / apply filters" }).click();
    await expect
      .poll(() =>
        calls.some(
          (c) => c.operation === "list_jobs" && c.args.company === "Hardware",
        ),
      )
      .toBe(true);
    await page.getByText("Full details", { exact: true }).click();
    await expect(page.getByText("Technical hardware work.")).toBeVisible();
    await page
      .getByRole("button", { name: "Protect job", exact: true })
      .click();
    await expect
      .poll(() =>
        calls.some(
          (c) => c.operation === "update_job" && c.args.protected === true,
        ),
      )
      .toBe(true);
    await page
      .getByRole("combobox", {
        name: "Move 2027 New Graduate Silicon Validation Engineer to stage",
      })
      .selectOption("to_apply");
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
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Remove", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Undo removal" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Undo removal" }).click();
    await expect
      .poll(() => calls.some((c) => c.operation === "restore_job"))
      .toBe(true);
    await page.getByRole("button", { name: "deleted", exact: true }).click();
    await expect(page.getByText(/days remaining/)).toBeVisible();
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
      page.getByRole("heading", { name: /Cleanup policy/ }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
}
