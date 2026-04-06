const fs = require("node:fs");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);

function getArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

async function api(pathname, options = {}) {
  const baseUrl = (process.env.APP_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
  const apiKey = process.env.HOUSTON_API_KEY;
  if (!apiKey) throw new Error("HOUSTON_API_KEY not set");

  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
  return data;
}

async function main() {
  const projectSlug = getArg("--project");
  const workItemTitle = getArg("--work-item");
  const promptFile = getArg("--prompt-file");
  const agentId = getArg("--agent") || "main";

  if (!projectSlug || !workItemTitle || !promptFile) {
    throw new Error("Usage: --project <slug> --work-item <title> --prompt-file <path> [--agent <id>]");
  }

  const promptBody = fs.readFileSync(promptFile, "utf8").trim();

  const projectsPayload = await api("/api/v1/projects");
  const project = (projectsPayload.data || []).find((entry) => entry.slug === projectSlug);
  if (!project) throw new Error(`Project not found: ${projectSlug}`);

  const workItemsPayload = await api(`/api/v1/work-items?projectId=${encodeURIComponent(project.id)}`);
  const workItem = (workItemsPayload.data || []).find((entry) => entry.title === workItemTitle);
  if (!workItem) throw new Error(`Work item not found: ${workItemTitle}`);

  const executionRunPayload = await api("/api/v1/execution-runs", {
    method: "POST",
    body: JSON.stringify({
      workItemId: workItem.id,
      reason: `Recurring pilot kickoff for ${projectSlug}`,
    }),
  });
  const executionRun = executionRunPayload.data;

  await api(`/api/v1/execution-runs/${executionRun.id}/report`, {
    method: "POST",
    body: JSON.stringify({
      status: "RUNNING",
      message: `Pilot started for ${projectSlug}`,
      payload: {
        projectSlug,
        workItemTitle,
      },
    }),
  });

  const prompt = [
    `Houston execution run: ${executionRun.id}`,
    `Project: ${project.slug}`,
    `Work item: ${workItem.title}`,
    "",
    promptBody,
  ].join("\n");

  try {
    const { stdout, stderr } = await execFileAsync(
      "openclaw",
      [
        "agent",
        "--agent",
        agentId,
        "--message",
        prompt,
        "--session-id",
        `houston-pilot-${projectSlug}`,
        "--json",
        "--timeout",
        "300",
      ],
      {
        cwd: "/Users/openclaw",
        env: {
          ...process.env,
          HOUSTON_EXECUTION_RUN_ID: executionRun.id,
        },
        maxBuffer: 5 * 1024 * 1024,
      },
    );

    await api(`/api/v1/execution-runs/${executionRun.id}/report`, {
      method: "POST",
      body: JSON.stringify({
        status: "COMPLETED",
        message: `Pilot completed for ${projectSlug}`,
        payload: {
          stdoutPreview: stdout.slice(0, 4000),
          stderrPreview: stderr.slice(0, 1000),
        },
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await api(`/api/v1/execution-runs/${executionRun.id}/report`, {
      method: "POST",
      body: JSON.stringify({
        status: "FAILED",
        message: `Pilot failed for ${projectSlug}`,
        errorText: message,
      }),
    });
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
