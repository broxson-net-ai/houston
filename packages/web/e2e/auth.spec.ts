import { test, expect } from "@playwright/test";
import { signIn } from "./helpers";

test.describe("Authentication", () => {
  test("redirects unauthenticated user from /board to /login", async ({ page }) => {
    await page.goto("/board");
    await expect(page).toHaveURL(/\/login/);
  });

  test("redirects unauthenticated user from / to /login", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
  });

  test("shows error on wrong credentials", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', "admin@houston.local");
    await page.fill('input[type="password"]', "wrong-password");
    await page.click('button[type="submit"]');
    const alert = page.locator("p.text-destructive");
    await expect(alert).toBeVisible({ timeout: 5000 });
    await expect(alert).toContainText(/invalid/i);
  });

  test("logs in with correct credentials and lands on /board", async ({ page }) => {
    await signIn(page);
    await expect(page).toHaveURL("/board");
    await expect(page.locator("h1")).toContainText("Board");
  });

  test("logs out and redirects to /login", async ({ page }) => {
    await signIn(page);
    await expect(page).toHaveURL("/board");
    await page.click('button:has-text("Sign out")');
    await expect(page).toHaveURL(/\/login/);
  });
});
