const fs = require("node:fs");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);

const LOCK_PATH = "/tmp/houston-autonomous-runner.lock";
const APP_BASE_URL = (
  process.env.HOUSTON_INTERNAL_BASE_URL ||
  process.env.APP_BASE_URL ||
  "http://127.0.0.1:3000"
).replace(/\/$/, "");
const HOUSTON_API_KEY = process.env.HOUSTON_API_KEY;
const MAX_RUNS_PER_CYCLE = Number.parseInt(process.env.HOUSTON_AUTONOMOUS_MAX_RUNS_PER_CYCLE || "3", 10);
const AUTONOMOUS_ENABLED = String(process.env.HOUSTON_AUTONOMOUS_ENABLED ?? "true").toLowerCase() === "true";

const SPECIAL_RUN_CONFIG = {
  "Run recurring skill telemetry quality pilot": {
    promptFile: "/Users/openclaw/projects/houston-fork/scripts/pilot-prompts/skill-usage-tracking.md",
    agentId: "main",
    minIntervalHours: 24,
    recurring: true,
  },
  "Run recurring enhancement intake digest pilot": {
    promptFile: "/Users/openclaw/projects/houston-fork/scripts/pilot-prompts/enhancement-research.md",
    agentId: "main",
    minIntervalHours: 24 * 7,
    recurring: true,
  },
};

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function acquireRunnerLock() {
  if (fs.existsSync(LOCK_PATH)) {
    const existing = fs.readFileSync(LOCK_PATH, "utf8").trim();
    const existingPid = Number.parseInt(existing, 10);
    if (!Number.isNaN(existingPid) && isProcessAlive(existingPid)) {
      const error = new Error("runner lock already held");
      error.code = "EEXIST";
      throw error;
    }
    fs.unlinkSync(LOCK_PATH);
  }

  const fd = fs.openSync(LOCK_PATH, "wx");
  fs.writeFileSync(fd, `${process.pid}\n`, { encoding: "utf8" });
  return fd;
}

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
  if (!response.ok) {
    throw new Error(data?.error || `HTTP ${response.status}`);
  }
  return data;
}

function hoursSince(timestamp) {
  return (Date.now() - new Date(timestamp).getTime()) / (1000 * 60 * 60);
}

async function listReadyDraftOnlyWorkItems() {
  const payload = await api("/api/v1/work-items?status=READY&autonomousEligible=true");
  return (payload.data || []).filter((entry) => entry.autonomyLevel === "DRAFT_ONLY");
}

async function getAutonomySetting() {
  const payload = await api("/api/v1/autonomy");
  return payload.data || { autonomyPaused: false };
}

async function getWorkItem(workItemId) {
  const payload = await api(`/api/v1/work-items/${encodeURIComponent(workItemId)}`);
  return payload.data || null;
}

async function getRuns(workItemId) {
  const payload = await api(`/api/v1/execution-runs?workItemId=${encodeURIComponent(workItemId)}`);
  return payload.data || [];
}

async function listProjectDocs(projectId) {
  const payload = await api(`/api/v1/project-docs?projectId=${encodeURIComponent(projectId)}`);
  return payload.data || [];
}

function shouldRunWorkItem(workItem, runs) {
  const config = SPECIAL_RUN_CONFIG[workItem.title] || null;
  const activeStatuses = new Set(["ACCEPTED", "RUNNING", "WAITING_APPROVAL"]);
  if (runs.some((run) => activeStatuses.has(String(run.status).toUpperCase()))) {
    return { run: false, reason: "active run already exists" };
  }

  const latestFinished = runs.find((run) => ["COMPLETED", "FAILED", "CANCELLED"].includes(String(run.status).toUpperCase()));
  if (!latestFinished) {
    return { run: true, reason: "no previous finished run found" };
  }

  if (!config?.recurring) {
    return { run: false, reason: `non-recurring item already has terminal run ${String(latestFinished.status).toLowerCase()}` };
  }

  const lastTimestamp = latestFinished.finishedAt || latestFinished.updatedAt || latestFinished.createdAt;
  if (!lastTimestamp) {
    return { run: true, reason: "previous run missing timestamp" };
  }

  const elapsed = hoursSince(lastTimestamp);
  if (elapsed < config.minIntervalHours) {
    return { run: false, reason: `last finished run only ${elapsed.toFixed(1)}h ago` };
  }

  return { run: true, reason: `last finished run ${elapsed.toFixed(1)}h ago` };
}

function buildGenericPrompt(project, workItem) {
  const parts = [
    `You are running Houston work item \`${workItem.title}\` for project \`${project.slug}\`.`,
    "",
    "Goal:",
    "- produce the next draft-only output for this work item",
    "- stay within Houston guardrails and the project's documented boundaries",
    "",
    "Project summary:",
    project.summary || "- none provided",
    "",
    "Work item description:",
    workItem.descriptionMarkdown || "- none provided",
  ];

  if (workItem.phase?.title) parts.push("", `Phase: ${workItem.phase.title}`);
  if ((workItem.recommendedCapabilities || []).length) parts.push("", `Recommended capabilities: ${(workItem.recommendedCapabilities || []).join(", ")}`);
  if ((workItem.recommendedSkills || []).length) parts.push("", `Recommended skills: ${(workItem.recommendedSkills || []).join(", ")}`);
  if ((workItem.recommendedTools || []).length) parts.push("", `Recommended tools: ${(workItem.recommendedTools || []).join(", ")}`);

  parts.push(
    "",
    "Constraints:",
    "- draft-only unless Houston explicitly allows a stronger action",
    "- if a guarded action requires approval, stop and report it",
    "- do not perform external side effects unless Houston says they are allowed",
    "",
    "Output:",
    "- concise result",
    "- blockers or approvals needed",
    "- recommended next action",
  );

  return parts.join("\n");
}

async function appendRunResultToNotes(projectId, workItemTitle, executionRunId, status, text) {
  const docs = await listProjectDocs(projectId);
  const notesDoc = docs.find((entry) => entry.kind === "NOTES");
  if (!notesDoc) return;

  const now = new Date().toISOString();
  const snippet = (text || "").trim().slice(0, 1500) || "No result preview captured.";
  const entry = [
    "",
    `## Autonomous Run ${now}`,
    `- Work item: ${workItemTitle}`,
    `- Run: ${executionRunId}`,
    `- Status: ${status.toLowerCase()}`,
    "",
    "```text",
    snippet,
    "```",
  ].join("\n");

  await api(`/api/v1/project-docs/${notesDoc.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      version: notesDoc.version,
      title: notesDoc.title,
      contentMarkdown: `${notesDoc.contentMarkdown}${entry}`,
      editedBy: "autonomous-runner",
      editReason: `Append autonomous run result for ${workItemTitle}`,
    }),
  });
}

function extractFailureDetails(error) {
  if (!error || typeof error !== "object") {
    return { message: String(error), stdoutPreview: "", stderrPreview: "" };
  }

  const err = error;
  const message = typeof err.message === "string" ? err.message : String(error);
  const stdoutPreview = typeof err.stdout === "string" ? err.stdout.slice(0, 4000) : "";
  const stderrPreview = typeof err.stderr === "string" ? err.stderr.slice(0, 4000) : "";
  return { message, stdoutPreview, stderrPreview };
}

async function executeWorkItem(project, workItem) {
  const config = SPECIAL_RUN_CONFIG[workItem.title] || {};
  const promptBody = config.promptFile ? fs.readFileSync(config.promptFile, "utf8").trim() : buildGenericPrompt(project, workItem);
  const executionRunPayload = await api("/api/v1/execution-runs", {
    method: "POST",
    body: JSON.stringify({
      workItemId: workItem.id,
      reason: `Autonomous runner kickoff for ${project.slug}`,
    }),
  });
  const executionRun = executionRunPayload.data;

  await api(`/api/v1/execution-runs/${executionRun.id}/report`, {
    method: "POST",
    body: JSON.stringify({
      status: "RUNNING",
      message: `Autonomous runner started ${project.slug}`,
      payload: {
        projectSlug: project.slug,
        workItemTitle: workItem.title,
        runner: "autonomous-control-plane-runner",
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
        config.agentId || workItem.assignedAgentKey || "main",
        "--message",
        prompt,
        "--session-id",
        `houston-auto-${project.slug}`,
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
        timeout: 330 * 1000,
        maxBuffer: 5 * 1024 * 1024,
      },
    );

    await api(`/api/v1/execution-runs/${executionRun.id}/report`, {
      method: "POST",
      body: JSON.stringify({
        status: "COMPLETED",
        message: `Autonomous runner completed ${project.slug}`,
        payload: {
          stdoutPreview: stdout.slice(0, 4000),
          stderrPreview: stderr.slice(0, 1000),
        },
      }),
    });
    await appendRunResultToNotes(project.id, workItem.title, executionRun.id, "COMPLETED", stdout || stderr);
    return { status: "completed", runId: executionRun.id };
  } catch (error) {
    const failure = extractFailureDetails(error);
    await api(`/api/v1/execution-runs/${executionRun.id}/report`, {
      method: "POST",
      body: JSON.stringify({
        status: "FAILED",
        message: `Autonomous runner failed ${project.slug}`,
        errorText: failure.message,
        payload: {
          stdoutPreview: failure.stdoutPreview,
          stderrPreview: failure.stderrPreview,
        },
      }),
    });
    await appendRunResultToNotes(
      project.id,
      workItem.title,
      executionRun.id,
      "FAILED",
      [failure.message, failure.stderrPreview, failure.stdoutPreview].filter(Boolean).join("\n\n")
    );
    return { status: "failed", runId: executionRun.id, error: failure.message };
  }
}

async function main() {
  if (!AUTONOMOUS_ENABLED) {
    console.log(JSON.stringify({ results: [{ action: "skip", reason: "HOUSTON_AUTONOMOUS_ENABLED=false" }] }, null, 2));
    return;
  }

  const lockHandle = acquireRunnerLock();

  try {
    const results = [];

     const autonomySetting = await getAutonomySetting().catch(() => null);
     if (autonomySetting?.autonomyPaused) {
       results.push({ action: "skip", reason: `autonomy paused${autonomySetting.autonomyPausedReason ? `: ${autonomySetting.autonomyPausedReason}` : ""}` });
       console.log(JSON.stringify({ results }, null, 2));
       return;
     }

    const candidates = await listReadyDraftOnlyWorkItems();
    let launched = 0;

    for (const candidate of candidates) {
      const project = candidate.project;
      if (!project) {
        results.push({ project: candidate.projectId || "unknown", workItem: candidate.title, action: "skip", reason: "project not found" });
        continue;
      }

      const workItem = await getWorkItem(candidate.id);
      if (!workItem) {
        results.push({ project: project.slug, workItem: candidate.title, action: "skip", reason: "work item not found" });
        continue;
      }

      const runs = await getRuns(workItem.id);
      const decision = shouldRunWorkItem(workItem, runs);
      if (!decision.run) {
        results.push({ project: project.slug, workItem: workItem.title, action: "skip", reason: decision.reason });
        continue;
      }

      if (launched >= MAX_RUNS_PER_CYCLE) {
        results.push({ project: project.slug, workItem: workItem.title, action: "skip", reason: `cycle launch limit reached (${MAX_RUNS_PER_CYCLE})` });
        continue;
      }

      const execution = await executeWorkItem(project, workItem);
      launched += 1;
      results.push({ project: project.slug, workItem: workItem.title, action: execution.status, runId: execution.runId, reason: decision.reason, error: execution.error || null });
    }

    console.log(JSON.stringify({ results }, null, 2));
  } finally {
    fs.closeSync(lockHandle);
    fs.unlinkSync(LOCK_PATH);
  }
}

main().catch((error) => {
  if (error && error.code === "EEXIST") {
    console.log(JSON.stringify({ results: [{ action: "skip", reason: "runner lock already held" }] }, null, 2));
    process.exit(0);
  }
  console.error(error);
  process.exit(1);
});
