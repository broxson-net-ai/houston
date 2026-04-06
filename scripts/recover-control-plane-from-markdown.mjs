import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const HOME = os.homedir();
const DEFAULT_BASE_URL = process.env.HOUSTON_API_BASE_URL || "http://127.0.0.1:3000/api/v1";
const DEFAULT_PROJECTS_DIR = path.join(HOME, ".openclaw", "workspace", "memory", "projects");
const DEFAULT_PROJECTS_INDEX = path.join(DEFAULT_PROJECTS_DIR, "PROJECTS.md");
const DEFAULT_STATE_DIR = path.join(HOME, ".openclaw", "workspace", "state");
const DEFAULT_EXPORTS_ROOT = path.join(HOME, "openclaw-exports", "projects");
const DEFAULT_SESSION_FILES = [
  path.join(HOME, "session-ses_2d06.md"),
  path.join(HOME, "session-ses_2d2f.md"),
];

const VALID_DOC_KINDS = new Set(["PROJECT", "ACTION_PLAN", "NOTES", "STATUS", "DECISIONS", "RUNBOOK", "ARCHITECTURE"]);

function parseArgs(argv) {
  const args = {
    apply: false,
    includeDraft: true,
    baseUrl: DEFAULT_BASE_URL,
    projectsDir: DEFAULT_PROJECTS_DIR,
    projectsIndex: DEFAULT_PROJECTS_INDEX,
    stateDir: DEFAULT_STATE_DIR,
    exportsRoot: DEFAULT_EXPORTS_ROOT,
    sessionFiles: DEFAULT_SESSION_FILES,
    projectSlugs: null,
    reportPath: path.join(HOME, ".openclaw", "workspace", "state", `HOUSTON_MD_RECOVERY_REPORT_${new Date().toISOString().replace(/[:.]/g, "-")}.json`),
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--apply") args.apply = true;
    else if (arg === "--active-only") args.includeDraft = false;
    else if (arg.startsWith("--base-url=")) args.baseUrl = arg.slice("--base-url=".length);
    else if (arg.startsWith("--projects-dir=")) args.projectsDir = arg.slice("--projects-dir=".length);
    else if (arg.startsWith("--projects-index=")) args.projectsIndex = arg.slice("--projects-index=".length);
    else if (arg.startsWith("--state-dir=")) args.stateDir = arg.slice("--state-dir=".length);
    else if (arg.startsWith("--exports-root=")) args.exportsRoot = arg.slice("--exports-root=".length);
    else if (arg.startsWith("--session-files=")) args.sessionFiles = arg.slice("--session-files=".length).split(",").map((v) => v.trim()).filter(Boolean);
    else if (arg.startsWith("--project-slugs=")) args.projectSlugs = new Set(arg.slice("--project-slugs=".length).split(",").map((v) => v.trim()).filter(Boolean));
    else if (arg.startsWith("--report-path=")) args.reportPath = arg.slice("--report-path=".length);
  }
  return args;
}

function mustGetApiKey() {
  const inline = process.env.HOUSTON_API_KEY;
  if (inline) return inline;
  const envPath = path.join(HOME, "projects", "houston-fork", ".env");
  if (!fs.existsSync(envPath)) {
    throw new Error("HOUSTON_API_KEY not set and .env not found");
  }
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith("HOUSTON_API_KEY=")) continue;
    return line.split("=", 2)[1].trim().replace(/^['"]|['"]$/g, "");
  }
  throw new Error("HOUSTON_API_KEY not found in environment or .env");
}

async function api(baseUrl, apiKey, pathname, options = {}) {
  const res = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${pathname} -> HTTP ${res.status}: ${body?.error || JSON.stringify(body)}`);
  }
  return body?.data;
}

function listMarkdownFiles(rootDir) {
  if (!rootDir || !fs.existsSync(rootDir)) return [];
  const out = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) out.push(full);
    }
  }
  return out.sort();
}

function parseProjectsIndex(indexPath) {
  if (!fs.existsSync(indexPath)) return new Map();
  const text = fs.readFileSync(indexPath, "utf8");
  const lines = text.split(/\r?\n/);
  const map = new Map();
  let current = null;
  for (const line of lines) {
    const m = line.match(/^###\s+([a-z0-9-]+)/i);
    if (m) {
      current = m[1].toLowerCase();
      map.set(current, { slug: current, purpose: "", statusLine: "", idLine: "" });
      continue;
    }
    if (!current) continue;
    const entry = map.get(current);
    if (line.includes("**Purpose:**")) entry.purpose = line.split("**Purpose:**", 2)[1].trim();
    else if (line.includes("**Status:**")) entry.statusLine = line.split("**Status:**", 2)[1].trim();
    else if (line.includes("**Houston ID:**")) entry.idLine = line.split("**Houston ID:**", 2)[1].trim().replace(/`/g, "");
  }
  return map;
}

function latestExportSnapshot(exportsRoot) {
  if (!fs.existsSync(exportsRoot)) return null;
  const dirs = fs.readdirSync(exportsRoot, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  if (dirs.length === 0) return null;
  return path.join(exportsRoot, dirs[dirs.length - 1]);
}

function readMaybe(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : null;
}

function sanitizeRecoveredMarkdown(markdown) {
  if (!markdown) return markdown;
  return markdown
    .split(/\r?\n/)
    .filter((line) => !/EXPORTED READ-ONLY SNAPSHOT|NOT CANONICAL|DO NOT USE AS ACTIVE WORKING SOURCE/i.test(line))
    .join("\n")
    .trim();
}

function uniqueBy(arr, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of arr) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function normalizeTitle(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function extractCheckboxWorkItems(markdown, sourcePath) {
  const lines = markdown.split(/\r?\n/);
  const items = [];
  for (const line of lines) {
    const m = line.match(/^\s*[-*]\s+\[( |x|X)\]\s+(.+)/);
    if (!m) continue;
    const done = m[1].toLowerCase() === "x";
    const title = m[2].trim().replace(/\s+/g, " ");
    if (title.length < 8) continue;
    items.push({
      title: title.slice(0, 180),
      status: done ? "DONE" : "PLANNING",
      description: `Recovered from checklist in ${sourcePath}`,
      source: sourcePath,
      sourceType: "CHECKLIST",
    });
  }
  return items;
}

function isHighSignalChecklistSource(filePath) {
  const normalized = filePath.replace(/\\/g, "/").toLowerCase();
  if (normalized.includes("/templates/") || normalized.includes("/udemy-data/")) return false;
  const base = path.basename(normalized);
  if (base === "project.md" || base === "notes.md") return false;
  return /(action_plan|work-items|work_items|work-item|work_item|checklist|todo|plan|workflow|pilot|recovery|adoption)/i.test(base);
}

function extractSessionWorkItems(text, sourcePath) {
  const items = [];
  const jsonPattern = /"project"\s*:\s*"([a-z0-9-]+)"[\s\S]{0,240}?"workItem"\s*:\s*"([^"]+)"[\s\S]{0,180}?"action"\s*:\s*"([a-z_]+)"/gi;
  let match;
  while ((match = jsonPattern.exec(text)) !== null) {
    const slug = match[1].toLowerCase();
    const title = match[2].trim();
    const action = match[3].toLowerCase();
    let status = "PLANNING";
    if (["completed", "done"].includes(action)) status = "DONE";
    else if (["failed", "error", "cancelled"].includes(action)) status = "BLOCKED";
    else if (["skip", "skipped"].includes(action)) status = "READY";
    items.push({ slug, title, status, action, source: sourcePath, sourceType: "SESSION" });
  }

  const textPattern = /Project:\s*([a-z0-9-]+)\s*\nWork item:\s*([^\n]+)/gi;
  while ((match = textPattern.exec(text)) !== null) {
    items.push({
      slug: match[1].toLowerCase(),
      title: match[2].trim().slice(0, 180),
      status: "PLANNING",
      action: "mentioned",
      source: sourcePath,
      sourceType: "SESSION",
    });
  }
  return items;
}

function guessStateFilesForProject(stateDir, slug) {
  if (!fs.existsSync(stateDir)) return [];
  const normalized = slug.replace(/-/g, "_").toLowerCase();
  const files = fs.readdirSync(stateDir).filter((name) => name.toLowerCase().endsWith(".md"));
  const tokens = slug.split("-").filter((t) => t.length >= 4);
  return files
    .filter((name) => {
      const lower = name.toLowerCase();
      if (lower.includes(normalized)) return true;
      if (tokens.length === 0) return false;
      const matched = tokens.filter((token) => lower.includes(token)).length;
      return matched >= Math.min(2, tokens.length);
    })
    .map((name) => path.join(stateDir, name))
    .sort();
}

function compactList(items, limit = 25) {
  return items.slice(0, limit);
}

function synthProjectDoc(project, indexInfo, localProjectDoc, exportProjectDoc, localFiles, exportFiles) {
  const title = project.title || indexInfo?.slug || project.slug;
  const purpose = indexInfo?.purpose && indexInfo.purpose !== "---" ? indexInfo.purpose : (project.summary || "");
  const body = sanitizeRecoveredMarkdown(localProjectDoc || exportProjectDoc || "No PROJECT.md found; synthesized from available metadata.");
  const sourceBullets = uniqueBy([...localFiles, ...exportFiles], (v) => v).map((file) => `- ${file}`).join("\n");
  return `# ${title}\n\n` +
    `> Recovered ${new Date().toISOString()} from markdown, export snapshots, and session logs.\n\n` +
    `- Slug: ${project.slug}\n` +
    `- Houston ID: ${project.id}\n` +
    `- Status: ${project.status}\n` +
    (purpose ? `- Purpose: ${purpose}\n` : "") +
    `\n## Recovery Sources\n${sourceBullets || "- (no files found)"}\n\n` +
    `## Recovered Project Definition\n\n${body}`;
}

function synthActionPlanDoc(localActionPlan, exportActionPlan, checklistItems) {
  if (localActionPlan) return sanitizeRecoveredMarkdown(localActionPlan);
  if (exportActionPlan) return sanitizeRecoveredMarkdown(exportActionPlan);
  const unchecked = checklistItems.filter((item) => item.status !== "DONE");
  const checked = checklistItems.filter((item) => item.status === "DONE");
  return `# Action Plan (Recovered)\n\n` +
    `Generated from checklist and session signals on ${new Date().toISOString()}.\n\n` +
    `## Pending\n` + (unchecked.length ? unchecked.map((item) => `- [ ] ${item.title}`).join("\n") : "- [ ] No pending items detected") +
    `\n\n## Completed\n` + (checked.length ? checked.map((item) => `- [x] ${item.title}`).join("\n") : "- [x] No completed items detected");
}

function synthNotesDoc(localNotes, exportNotes, sourceFiles, sessionSignals) {
  const header = `# Notes (Recovered)\n\nGenerated ${new Date().toISOString()} from project markdown and historical sessions.\n\n`;
  const base = sanitizeRecoveredMarkdown(localNotes || exportNotes || "No NOTES.md found.");
  const sourceSection = `\n\n## Source Files\n` + (sourceFiles.length ? sourceFiles.map((file) => `- ${file}`).join("\n") : "- none");
  const signalSection = `\n\n## Session Signals\n` + (
    sessionSignals.length
      ? sessionSignals.slice(0, 40).map((signal) => `- [${signal.status}] ${signal.title} (${signal.action}; ${path.basename(signal.source)})`).join("\n")
      : "- none"
  );
  return `${header}${base}${sourceSection}${signalSection}`;
}

function synthStatusDoc(project, indexInfo, counts) {
  return `# Recovery Status\n\n` +
    `- Recovered at: ${new Date().toISOString()}\n` +
    `- Project: ${project.slug}\n` +
    `- Houston ID: ${project.id}\n` +
    `- Project status: ${project.status}\n` +
    (indexInfo?.statusLine ? `- PROJECTS.md status snapshot: ${indexInfo.statusLine}\n` : "") +
    `- Local markdown files considered: ${counts.local}\n` +
    `- Export markdown files considered: ${counts.exported}\n` +
    `- State markdown files considered: ${counts.state}\n` +
    `- Session-derived work item signals: ${counts.sessionSignals}\n` +
    `- Checklist-derived work item signals: ${counts.checklistSignals}\n`;
}

function synthDecisionsDoc(auditLikeFiles) {
  if (auditLikeFiles.length === 0) {
    return `# Decisions and Audits (Recovered)\n\nNo audit-like markdown files were found during recovery.`;
  }
  const entries = auditLikeFiles.slice(0, 12).map((file) => {
    const text = sanitizeRecoveredMarkdown(readMaybe(file) || "");
    const preview = text.split(/\r?\n/).slice(0, 18).join("\n");
    return `## Source: ${file}\n\n\`\`\`markdown\n${preview}\n\`\`\``;
  });
  return `# Decisions and Audits (Recovered)\n\n` +
    `Compiled from audit/checklist/history docs on ${new Date().toISOString()}.\n\n` +
    entries.join("\n\n");
}

async function upsertDoc(baseUrl, apiKey, projectId, existingDocsByKind, kind, title, contentMarkdown, apply, reportActions) {
  if (!VALID_DOC_KINDS.has(kind)) return;
  const existing = existingDocsByKind.get(kind);
  if (existing) {
    if (existing.title === title && existing.contentMarkdown === contentMarkdown) {
      reportActions.push({ type: "doc-unchanged", kind, id: existing.id });
      return;
    }
    reportActions.push({ type: "doc-update", kind, id: existing.id, title });
    if (!apply) return;
    const updated = await api(baseUrl, apiKey, `/project-docs/${existing.id}`, {
      method: "PATCH",
      body: JSON.stringify({ version: existing.version, title, contentMarkdown, editedBy: "md-recovery", editReason: "markdown recovery refresh" }),
    });
    existingDocsByKind.set(kind, updated);
    return;
  }

  reportActions.push({ type: "doc-create", kind, title });
  if (!apply) return;
  const created = await api(baseUrl, apiKey, "/project-docs", {
    method: "POST",
    body: JSON.stringify({ projectId, kind, title, contentMarkdown, editedBy: "md-recovery", editReason: "markdown recovery seed" }),
  });
  existingDocsByKind.set(kind, created);
}

async function upsertWorkItems(baseUrl, apiKey, project, existingWorkItems, candidates, apply, reportActions) {
  const byTitle = new Map(existingWorkItems.map((item) => [normalizeTitle(item.title), item]));
  for (const candidate of candidates) {
    const key = normalizeTitle(candidate.title);
    if (!key) continue;
    const existing = byTitle.get(key);
    if (existing) {
      if (existing.status !== candidate.status) {
        reportActions.push({ type: "work-item-status-update", id: existing.id, title: existing.title, from: existing.status, to: candidate.status });
        if (apply) {
          const updated = await api(baseUrl, apiKey, `/work-items/${existing.id}`, {
            method: "PATCH",
            body: JSON.stringify({ status: candidate.status }),
          });
          byTitle.set(key, updated);
        }
      } else {
        reportActions.push({ type: "work-item-unchanged", id: existing.id, title: existing.title });
      }
      continue;
    }

    reportActions.push({ type: "work-item-create", title: candidate.title, status: candidate.status, sourceType: candidate.sourceType });
    if (!apply) continue;
    const created = await api(baseUrl, apiKey, "/work-items", {
      method: "POST",
      body: JSON.stringify({
        projectId: project.id,
        type: "EXECUTION",
        title: candidate.title,
        descriptionMarkdown: candidate.description,
        status: candidate.status,
        autonomyLevel: "MANUAL",
        autonomousEligible: false,
      }),
    });
    byTitle.set(key, created);
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const apiKey = mustGetApiKey();

  const projects = await api(args.baseUrl, apiKey, "/projects?limit=500");
  const indexMap = parseProjectsIndex(args.projectsIndex);
  const exportSnapshot = latestExportSnapshot(args.exportsRoot);
  const sessionSignals = [];
  for (const file of args.sessionFiles) {
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    sessionSignals.push(...extractSessionWorkItems(text, file));
  }

  const report = {
    generatedAt: new Date().toISOString(),
    apply: args.apply,
    baseUrl: args.baseUrl,
    projectsProcessed: 0,
    projectsSkipped: [],
    actions: [],
    exportSnapshot,
  };

  for (const project of projects) {
    if (!args.includeDraft && project.status !== "ACTIVE") continue;
    if (args.projectSlugs && !args.projectSlugs.has(project.slug)) continue;
    if (project.slug === "0") {
      report.projectsSkipped.push({ slug: project.slug, reason: "invalid slug" });
      continue;
    }

    const localProjectDir = path.join(args.projectsDir, project.slug);
    const localFiles = listMarkdownFiles(localProjectDir);
    const exportDir = exportSnapshot ? path.join(exportSnapshot, project.slug) : null;
    const exportFiles = exportDir ? listMarkdownFiles(exportDir) : [];
    const stateFiles = guessStateFilesForProject(args.stateDir, project.slug);
    const sourceFiles = uniqueBy([...localFiles, ...exportFiles, ...stateFiles], (v) => v);

    const localProjectDoc = readMaybe(path.join(localProjectDir, "PROJECT.md"));
    const exportProjectDoc = exportDir ? readMaybe(path.join(exportDir, "PROJECT.md")) : null;
    const localActionPlan = readMaybe(path.join(localProjectDir, "ACTION_PLAN.md"));
    const exportActionPlan = exportDir ? readMaybe(path.join(exportDir, "ACTION_PLAN.md")) : null;
    const localNotes = readMaybe(path.join(localProjectDir, "NOTES.md"));
    const exportNotes = exportDir ? readMaybe(path.join(exportDir, "NOTES.md")) : null;

    const checklistSourceFiles = sourceFiles.filter((file) => {
      const inExportDir = exportDir ? file.startsWith(exportDir) : false;
      if (inExportDir) {
        const base = path.basename(file).toLowerCase();
        return base === "action_plan.md" || base === "work-items.md";
      }
      return isHighSignalChecklistSource(file);
    });

    const checklistSignals = [];
    for (const file of checklistSourceFiles) {
      const text = readMaybe(file);
      if (!text) continue;
      checklistSignals.push(...extractCheckboxWorkItems(text, file));
    }
    const sessionByProject = sessionSignals.filter((s) => s.slug === project.slug);

    const indexInfo = indexMap.get(project.slug);
    const projectActions = [];

    if (indexInfo?.purpose && indexInfo.purpose !== "---" && indexInfo.purpose !== project.summary) {
      projectActions.push({ type: "project-summary-update", from: project.summary || null, to: indexInfo.purpose });
      if (args.apply) {
        await api(args.baseUrl, apiKey, `/projects/${project.id}`, {
          method: "PATCH",
          body: JSON.stringify({ summary: indexInfo.purpose }),
        });
      }
    }

    const docs = await api(args.baseUrl, apiKey, `/project-docs?projectId=${encodeURIComponent(project.id)}`);
    const docsByKind = new Map(docs.map((doc) => [doc.kind, doc]));

    const projectDocContent = synthProjectDoc(project, indexInfo, localProjectDoc, exportProjectDoc, localFiles, exportFiles);
    const actionPlanContent = synthActionPlanDoc(localActionPlan, exportActionPlan, checklistSignals);
    const notesContent = synthNotesDoc(localNotes, exportNotes, sourceFiles, sessionByProject);
    const statusContent = synthStatusDoc(project, indexInfo, {
      local: localFiles.length,
      exported: exportFiles.length,
      state: stateFiles.length,
      sessionSignals: sessionByProject.length,
      checklistSignals: checklistSignals.length,
    });

    const auditLikeFiles = sourceFiles.filter((file) => /audit|verification|rollback|readiness|drill|reality/i.test(path.basename(file)));
    const decisionsContent = synthDecisionsDoc(auditLikeFiles);

    await upsertDoc(args.baseUrl, apiKey, project.id, docsByKind, "PROJECT", `${project.slug} project`, projectDocContent, args.apply, projectActions);
    await upsertDoc(args.baseUrl, apiKey, project.id, docsByKind, "ACTION_PLAN", `${project.slug} action plan`, actionPlanContent, args.apply, projectActions);
    await upsertDoc(args.baseUrl, apiKey, project.id, docsByKind, "NOTES", `${project.slug} notes`, notesContent, args.apply, projectActions);
    await upsertDoc(args.baseUrl, apiKey, project.id, docsByKind, "STATUS", `${project.slug} recovery status`, statusContent, args.apply, projectActions);
    await upsertDoc(args.baseUrl, apiKey, project.id, docsByKind, "DECISIONS", `${project.slug} decisions`, decisionsContent, args.apply, projectActions);

    const workItems = await api(args.baseUrl, apiKey, `/work-items?projectId=${encodeURIComponent(project.id)}`);
    const sessionCandidates = sessionByProject.map((item) => ({
      title: item.title,
      status: item.status,
      description: `Recovered from session log ${item.source} (action=${item.action})`,
      sourceType: "SESSION",
    }));
    const filteredChecklistSignals = checklistSignals.filter((item) => {
      const title = item.title.toLowerCase();
      if (title.endsWith(":")) return false;
      if (["searxng (keep)", "local mcp servers", "other helpers (tbd)", "none", "n/a"].includes(title)) return false;
      return true;
    });

    const hasNonExportSignals = (localFiles.length > 0 || stateFiles.length > 0 || sessionByProject.length > 0) && project.status === "ACTIVE";
    const candidates = hasNonExportSignals
      ? uniqueBy(compactList([...sessionCandidates, ...filteredChecklistSignals], 18), (item) => normalizeTitle(item.title))
      : [];
    await upsertWorkItems(args.baseUrl, apiKey, project, workItems, candidates, args.apply, projectActions);

    report.actions.push({
      projectId: project.id,
      slug: project.slug,
      status: project.status,
      localFiles: localFiles.length,
      exportFiles: exportFiles.length,
      stateFiles: stateFiles.length,
      sessionSignals: sessionByProject.length,
      checklistSignals: checklistSignals.length,
      candidateWorkItems: candidates.length,
      actions: projectActions,
    });
    report.projectsProcessed += 1;
  }

  fs.mkdirSync(path.dirname(args.reportPath), { recursive: true });
  fs.writeFileSync(args.reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    mode: args.apply ? "apply" : "dry-run",
    projectsProcessed: report.projectsProcessed,
    projectsSkipped: report.projectsSkipped.length,
    reportPath: args.reportPath,
    exportSnapshot,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
