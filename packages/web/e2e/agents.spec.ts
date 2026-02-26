import { test, expect } from "@playwright/test";
import { signIn } from "./helpers";

test.describe("Agent Management", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await page.goto("/agents");
  });

  test("agents page loads with table", async ({ page }) => {
    await expect(page.locator("h1")).toContainText("Agents");
    await expect(page.locator("table")).toBeVisible();
  });

  test("create agent, edit name, then delete", async ({ page }) => {
    const uniqueSuffix = Date.now();
    const agentName = `Test Agent ${uniqueSuffix}`;
    const routingKey = `test-agent-${uniqueSuffix}`;

    // Create
    await page.click('button:has-text("New Agent")');
    await expect(page.getByRole("heading", { name: "New Agent" })).toBeVisible();
    await page.locator("#agent-name").fill(agentName);
    await page.locator("#agent-routing-key").fill(routingKey);
    await page.click('button[type="submit"]:has-text("Create")');

    // Agent appears in table
    await expect(page.locator(`td:has-text("${agentName}")`)).toBeVisible();

    // Edit agent name
    const row = page.locator("tr").filter({ hasText: agentName });
    await row.getByRole("button", { name: "Edit" }).click();
    await expect(page.getByRole("heading", { name: "Edit Agent" })).toBeVisible();
    const renamedAgent = `Renamed Agent ${uniqueSuffix}`;
    await page.locator("#agent-name").clear();
    await page.locator("#agent-name").fill(renamedAgent);
    await page.click('button[type="submit"]:has-text("Save")');

    // Updated name appears
    await expect(page.locator(`td:has-text("${renamedAgent}")`)).toBeVisible();

    // Delete agent — click Delete in table, then confirm in dialog
    const renamedRow = page.locator("tr").filter({ hasText: renamedAgent });
    await renamedRow.getByRole("button", { name: "Delete" }).click();
    // The confirmation dialog renders — click the destructive "Delete" button inside it
    await page.locator("button.bg-destructive").click();

    // Agent disappears
    await expect(page.locator(`td:has-text("${renamedAgent}")`)).not.toBeVisible();
  });
});
