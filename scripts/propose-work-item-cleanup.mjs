import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const BASE_URL = process.env.HOUSTON_API_BASE_URL || "http://127.0.0.1:3000/api/v1";
const REPORT_DIR = path.join(os.homedir(), ".openclaw", "workspace", "state");

function readApiKey() {
  if (process.env.HOUSTON_API_KEY) return process.env.HOUSTON_API_KEY;
  const envPath = path.join(os.homedir(), "projects", "houston-fork", ".env");
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("HOUSTON_API_KEY=")) {
      return line.split("=", 2)[1].trim().replace(/^['"]|['"]$/g, "");
    }
  }
  throw new Error("HOUSTON_API_KEY not found");
}

async function apiGet(apiKey, urlPath) {
  const res = await fetch(`${BASE_URL}${urlPath}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`GET ${urlPath} -> ${res.status}`);
  return body.data || [];
}

function normalizeTitle(input) {
  return String(input || "")
    .toLowerCase()
    .replace(/[`*_~]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(input) {
  const stop = new Set(["the", "a", "an", "and", "or", "to", "of", "for", "with", "in", "on", "is", "are", "be", "as"]);
  return new Set(normalizeTitle(input).split(" ").filter((t) => t && !stop.has(t)));
}

function jaccard(aSet, bSet) {
  const a = [...aSet];
  const b = [...bSet];
  if (a.length === 0 || b.length === 0) return 0;
  const inter = a.filter((v) => bSet.has(v)).length;
  const union = new Set([...a, ...b]).size;
  return inter / union;
}

function looksPlaceholder(title) {
  const t = normalizeTitle(title);
  if (!t) return true;
  if (t.endsWith(":")) return true;
  if (/(^|\s)(tbd|todo|none|na|n a)(\s|$)/.test(t)) return true;
  if (/(keep|other helpers|local mcp servers|searxng)\b/.test(t) && t.split(" ").length <= 4) return true;
  return t.split(" ").length < 3;
}

function looksFragment(title) {
  const t = normalizeTitle(title);
  if (t.length < 16) return true;
  if (/^(define|decide|identify|inventory)\b/.test(t) && t.split(" ").length < 6) return true;
  return false;
}

function analyzeProject(project, workItems) {
  const byNorm = new Map();
  for (const item of workItems) {
    const norm = normalizeTitle(item.title);
    if (!byNorm.has(norm)) byNorm.set(norm, []);
    byNorm.get(norm).push(item);
  }

  const exactDuplicateGroups = [...byNorm.entries()].filter(([norm, items]) => norm && items.length > 1);

  const nearDuplicates = [];
  for (let i = 0; i < workItems.length; i += 1) {
    for (let j = i + 1; j < workItems.length; j += 1) {
      const a = workItems[i];
      const b = workItems[j];
      const score = jaccard(tokenSet(a.title), tokenSet(b.title));
      if (score >= 0.78) {
        nearDuplicates.push({
          score,
          a: { id: a.id, title: a.title, status: a.status },
          b: { id: b.id, title: b.title, status: b.status },
        });
      }
    }
  }

  const placeholders = workItems.filter((item) => looksPlaceholder(item.title));
  const fragments = workItems.filter((item) => !looksPlaceholder(item.title) && looksFragment(item.title));

  const archiveCandidates = [];
  for (const item of placeholders) {
    if (item.status === "PLANNING" || item.status === "READY") {
      archiveCandidates.push({ id: item.id, title: item.title, reason: "placeholder" });
    }
  }

  for (const group of exactDuplicateGroups) {
    const [, items] = group;
    const sorted = [...items].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    for (const item of sorted.slice(1)) {
      if (item.status !== "DONE") {
        archiveCandidates.push({ id: item.id, title: item.title, reason: "exact-duplicate" });
      }
    }
  }

  return {
    project: {
      id: project.id,
      slug: project.slug,
      status: project.status,
      workItemCount: workItems.length,
    },
    exactDuplicateGroups: exactDuplicateGroups.map(([norm, items]) => ({
      key: norm,
      ids: items.map((i) => i.id),
      titles: items.map((i) => i.title),
      statuses: items.map((i) => i.status),
    })),
    nearDuplicates: nearDuplicates.sort((a, b) => b.score - a.score).slice(0, 12),
    placeholders: placeholders.map((i) => ({ id: i.id, title: i.title, status: i.status })),
    fragments: fragments.map((i) => ({ id: i.id, title: i.title, status: i.status })).slice(0, 12),
    archiveCandidates,
  };
}

function toMarkdown(summary) {
  const lines = [];
  lines.push("# Houston Work-Item Cleanup Proposal");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("This is a proposal only. No statuses were changed.");
  lines.push("");

  for (const entry of summary.projects) {
    lines.push(`## ${entry.project.slug}`);
    lines.push(`- Work items: ${entry.project.workItemCount}`);
    lines.push(`- Exact duplicate groups: ${entry.exactDuplicateGroups.length}`);
    lines.push(`- Near-duplicate pairs: ${entry.nearDuplicates.length}`);
    lines.push(`- Placeholder items: ${entry.placeholders.length}`);
    lines.push(`- Proposed archive candidates: ${entry.archiveCandidates.length}`);

    if (entry.archiveCandidates.length > 0) {
      lines.push("- Proposed archive list:");
      for (const c of entry.archiveCandidates.slice(0, 20)) {
        lines.push(`  - ${c.id} :: ${c.title} (${c.reason})`);
      }
    }

    if (entry.nearDuplicates.length > 0) {
      lines.push("- Top merge candidates:");
      for (const pair of entry.nearDuplicates.slice(0, 6)) {
        lines.push(`  - ${pair.a.id} / ${pair.b.id} :: score=${pair.score.toFixed(2)} :: \"${pair.a.title}\" <-> \"${pair.b.title}\"`);
      }
    }

    lines.push("");
  }

  lines.push("## Totals");
  lines.push(`- Active projects analyzed: ${summary.totals.projects}`);
  lines.push(`- Work items analyzed: ${summary.totals.workItems}`);
  lines.push(`- Exact duplicate groups: ${summary.totals.exactDuplicateGroups}`);
  lines.push(`- Placeholder items: ${summary.totals.placeholders}`);
  lines.push(`- Proposed archive candidates: ${summary.totals.archiveCandidates}`);
  return lines.join("\n");
}

async function main() {
  const apiKey = readApiKey();
  const projects = await apiGet(apiKey, "/projects?limit=500");
  const active = projects.filter((p) => p.status === "ACTIVE");
  const analyzed = [];

  for (const project of active) {
    const workItems = await apiGet(apiKey, `/work-items?projectId=${encodeURIComponent(project.id)}`);
    if (workItems.length === 0) continue;
    analyzed.push(analyzeProject(project, workItems));
  }

  const totals = {
    projects: analyzed.length,
    workItems: analyzed.reduce((sum, e) => sum + e.project.workItemCount, 0),
    exactDuplicateGroups: analyzed.reduce((sum, e) => sum + e.exactDuplicateGroups.length, 0),
    placeholders: analyzed.reduce((sum, e) => sum + e.placeholders.length, 0),
    archiveCandidates: analyzed.reduce((sum, e) => sum + e.archiveCandidates.length, 0),
  };

  const summary = { generatedAt: new Date().toISOString(), baseUrl: BASE_URL, totals, projects: analyzed };
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = path.join(REPORT_DIR, `HOUSTON_WORKITEM_CLEANUP_PROPOSAL_${stamp}.json`);
  const mdPath = path.join(REPORT_DIR, `HOUSTON_WORKITEM_CLEANUP_PROPOSAL_${stamp}.md`);
  fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2));
  fs.writeFileSync(mdPath, toMarkdown(summary));

  console.log(JSON.stringify({ jsonPath, mdPath, totals }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
