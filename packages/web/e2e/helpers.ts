import { Page, expect } from "@playwright/test";

export const TEST_EMAIL = "admin@houston.local";
export const TEST_PASSWORD = "admin";

export async function signIn(
  page: Page,
  email = TEST_EMAIL,
  password = TEST_PASSWORD
): Promise<void> {
  await page.goto("/login");
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL("/board", { timeout: 15000 });
}

export async function createTaskViaApi(
  page: Page,
  title: string,
  agentId?: string
): Promise<string> {
  const res = await page.request.post("/api/tasks", {
    data: { title, ...(agentId && { agentId }) },
  });
  const task = await res.json();
  return task.id as string;
}

export async function createAgentViaApi(
  page: Page,
  name: string,
  routingKey: string
): Promise<string> {
  const res = await page.request.post("/api/agents", {
    data: { name, routingKey, enabled: true },
  });
  const agent = await res.json();
  return agent.id as string;
}
