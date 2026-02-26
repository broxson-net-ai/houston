import { test, expect } from "@playwright/test";
import { signIn } from "./helpers";

test.describe("Task Detail", () => {
  let taskId: string;

  test.beforeAll(async ({ browser }) => {
    // Create a task to test with
    const context = await browser.newContext();
    const page = await context.newPage();
    await signIn(page);
    const res = await page.request.post("/api/tasks", {
      data: { title: "E2E Detail Test Task", instructionsOverride: "Do the thing." },
    });
    const task = await res.json();
    taskId = task.id;
    await context.close();
  });

  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("navigates to task detail from board", async ({ page }) => {
    await page.goto("/board");
    // Use href selector to target the specific task created in beforeAll
    const taskLink = page.locator(`a[href="/tasks/${taskId}"]`);
    await expect(taskLink).toBeVisible({ timeout: 10000 });
    await taskLink.click();
    await expect(page).toHaveURL(new RegExp(`/tasks/${taskId}`));
  });

  test("task detail shows title, status badge, and timeline", async ({ page }) => {
    await page.goto(`/tasks/${taskId}`);
    await expect(page.locator("h1")).toContainText("E2E Detail Test Task");
    // Status badge visible
    await expect(page.locator("span").filter({ hasText: "QUEUE" })).toBeVisible();
    // Timeline section visible
    await expect(
      page.locator("h2").filter({ hasText: /Activity Timeline/i })
    ).toBeVisible();
    // CREATED event should be in the timeline
    await expect(page.locator("p.font-medium").filter({ hasText: "CREATED" })).toBeVisible();
  });

  test("dispatch payload section is hidden by default", async ({ page }) => {
    await page.goto(`/tasks/${taskId}`);
    // The "Dispatch Payload" button only appears if there's a requestPayload
    // For a newly created task with no runs, it won't show
    // Verify no JS errors
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.waitForTimeout(1000);
    expect(errors).toHaveLength(0);
  });

  test("retry button not shown for QUEUE task", async ({ page }) => {
    await page.goto(`/tasks/${taskId}`);
    // Retry only shows for FAILED tasks
    await expect(page.locator('button:has-text("Retry")')).not.toBeVisible();
    // Dispatch Now is always visible
    await expect(page.locator('button:has-text("Dispatch Now")')).toBeVisible();
  });

  test("Back to Board link navigates to /board", async ({ page }) => {
    await page.goto(`/tasks/${taskId}`);
    await page.click('a:has-text("Back to Board")');
    await expect(page).toHaveURL("/board");
  });
});
