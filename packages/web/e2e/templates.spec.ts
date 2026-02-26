import { test, expect } from "@playwright/test";
import { signIn } from "./helpers";

test.describe("Templates", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await page.goto("/templates");
  });

  test("templates page loads", async ({ page }) => {
    await expect(page.locator("h1")).toContainText("Templates");
  });

  test("create template, add daily schedule, edit template name", async ({ page }) => {
    const uniqueSuffix = Date.now();
    const templateName = `Daily Synthesis ${uniqueSuffix}`;

    // Create template
    await page.click('button:has-text("New Template")');
    await expect(page.getByRole("heading", { name: "New Template" })).toBeVisible();
    await page.locator("#tpl-name").fill(templateName);
    await page.locator("#tpl-instructions").fill(
      "Synthesize the key events and insights from today."
    );
    await page.click('button[type="submit"]:has-text("Create")');

    // Template appears
    await expect(page.locator(`h3:has-text("${templateName}")`)).toBeVisible();

    // Add daily-at-5am schedule via preset
    const card = page.locator("div.border").filter({ hasText: templateName });
    await card.getByRole("button", { name: "Add Schedule" }).click();
    await expect(page.getByRole("heading", { name: "Add Schedule" })).toBeVisible();
    await page.selectOption("select", "daily_5am");
    await page.click('button[type="submit"]:has-text("Add")');

    // Schedule appears in template card
    const updatedCard = page.locator("div.border").filter({ hasText: templateName });
    await expect(updatedCard.locator("span.font-mono").first()).toBeVisible();

    // Edit template name
    await updatedCard.getByRole("button", { name: "Edit" }).click();
    const editedName = `Edited ${templateName}`;
    await page.locator("#tpl-name").clear();
    await page.locator("#tpl-name").fill(editedName);
    await page.click('button[type="submit"]:has-text("Save")');
    await expect(page.locator(`h3:has-text("${editedName}")`)).toBeVisible();

    // Cleanup
    const editedCard = page.locator("div.border").filter({ hasText: editedName });
    await editedCard.getByRole("button", { name: "Delete" }).click();
  });
});
