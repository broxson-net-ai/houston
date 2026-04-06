const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);
const APP_BASE_URL = (process.env.APP_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const HOUSTON_API_KEY = process.env.HOUSTON_API_KEY;

function requireEnv(name, value) {
  if (!value) throw new Error(`${name} not set`);
  return value;
}

async function api(pathname, options = {}) {
  const response = await fetch(`${APP_BASE_URL}${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${requireEnv("HOUSTON_API_KEY", HOUSTON_API_KEY)}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
  return data;
}

function extractFailureDetails(error) {
  if (!error || typeof error !== "object") return { message: String(error), stdoutPreview: "", stderrPreview: "" };
  return {
    message: typeof error.message === "string" ? error.message : String(error),
    stdoutPreview: typeof error.stdout === "string" ? error.stdout.slice(0, 4000) : "",
    stderrPreview: typeof error.stderr === "string" ? error.stderr.slice(0, 4000) : "",
  };
}

async function main() {
  const workItemId = process.argv[2];
  if (!workItemId) throw new Error("usage: node retry-autonomous-work-item.cjs <workItemId>");

  const workItemPayload = await api(`/api/v1/work-items/${workItemId}`);
  const workItem = workItemPayload.data;
  const project = workItem.project;
  const prompt = [
    `Houston execution retry for work item ${workItem.id}`,
    `Project: ${project.slug}`,
    `Work item: ${workItem.title}`,
    "",
    "Retry this draft-only work item and produce the next safe output.",
    "Stay inside Houston guardrails. If blocked, explain why.",
    "",
    `Description: ${workItem.descriptionMarkdown || "-"}`,
  ].join("\n");

  const executionRunPayload = await api("/api/v1/execution-runs", {
    method: "POST",
    body: JSON.stringify({ workItemId: workItem.id, reason: `Manual retry for diagnostics: ${workItem.title}` }),
  });
  const run = executionRunPayload.data;

  await api(`/api/v1/execution-runs/${run.id}/report`, {
    method: "POST",
    body: JSON.stringify({
      status: "RUNNING",
      message: `Manual retry started for ${project.slug}`,
      payload: { retry: true, workItemTitle: workItem.title },
    }),
  });

  try {
    const { stdout, stderr } = await execFileAsync(
      "openclaw",
      ["agent", "--agent", "main", "--message", prompt, "--session-id", `houston-retry-${project.slug}`, "--json", "--timeout", "300"],
      {
        cwd: "/Users/openclaw",
        env: { ...process.env, HOUSTON_EXECUTION_RUN_ID: run.id },
        timeout: 330 * 1000,
        maxBuffer: 5 * 1024 * 1024,
      },
    );

    await api(`/api/v1/execution-runs/${run.id}/report`, {
      method: "POST",
      body: JSON.stringify({
        status: "COMPLETED",
        message: `Manual retry completed for ${project.slug}`,
        payload: { stdoutPreview: stdout.slice(0, 4000), stderrPreview: stderr.slice(0, 2000) },
      }),
    });
    console.log(JSON.stringify({ runId: run.id, status: "COMPLETED" }, null, 2));
  } catch (error) {
    const failure = extractFailureDetails(error);
    await api(`/api/v1/execution-runs/${run.id}/report`, {
      method: "POST",
      body: JSON.stringify({
        status: "FAILED",
        message: `Manual retry failed for ${project.slug}`,
        errorText: failure.message,
        payload: { stdoutPreview: failure.stdoutPreview, stderrPreview: failure.stderrPreview },
      }),
    });
    console.log(JSON.stringify({ runId: run.id, status: "FAILED", ...failure }, null, 2));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
