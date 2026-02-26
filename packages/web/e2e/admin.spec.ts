import { test, expect } from "@playwright/test";
import { signIn } from "./helpers";

test.describe("Admin Page", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("admin page loads without errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/admin");
    await expect(page.locator("h1")).toContainText("Admin Diagnostics");
    await page.waitForTimeout(1000);

    expect(errors).toHaveLength(0);
  });

  test("admin page shows System Health section", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "System Health" })).toBeVisible();
    // Health status items appear after fetch
    await expect(
      page.locator("span").filter({ hasText: /^(ok|degraded)$/i }).first()
    ).toBeVisible({ timeout: 5000 });
  });

  test("admin page shows Worker Status section", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Worker Status" })).toBeVisible();
  });

  test("admin page is accessible via nav", async ({ page }) => {
    await page.goto("/board");
    await page.click('a:has-text("Admin")');
    await expect(page).toHaveURL("/admin");
    await expect(page.locator("h1")).toContainText("Admin Diagnostics");
  });
});
