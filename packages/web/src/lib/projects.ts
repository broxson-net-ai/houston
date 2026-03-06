import "server-only";

import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import matter from "gray-matter";
import { db } from "@houston/shared";
import type { Project as PrismaProject } from "@houston/shared";

export const PROJECT_STATUS_VALUES = ["active", "paused", "done", "draft"] as const;

export type ProjectStatus = (typeof PROJECT_STATUS_VALUES)[number];

export type ProjectModel = Pick<
  PrismaProject,
  "id" | "slug" | "title" | "createdAt" | "updatedAt"
> & {
  status: ProjectStatus;
  metadata: Record<string, unknown> | null;
};

export type ProjectLinks = {
  project?: string;
  actionPlan?: string;
  notes?: string;
};

export type ProjectSummary = {
  slug: string;
  name: string;
  status?: string;
  owner?: string;
  lastUpdated?: string;
  tags?: string[];
  summary?: string;
  links: ProjectLinks;
  taskCount?: number;
  scheduleCount?: number;
};

type RegistryProject = {
  slug: string;
  name: string;
  status?: string;
};

type CreateProjectInput = {
  slug: string;
  name: string;
  status?: ProjectStatus;
  owner?: string;
  summary?: string;
  tags?: string[];
};

type ParsedProjectDoc = {
  name?: string;
  status?: string;
  owner?: string;
  lastUpdated?: string;
  tags?: string[];
  summary?: string;
};

const DEFAULT_PROJECTS_DIR = path.join(
  os.homedir(),
  ".openclaw",
  "workspace",
  "memory",
  "projects"
);

const PROJECTS_DIR =
  process.env.OPENCLAW_PROJECTS_DIR ?? DEFAULT_PROJECTS_DIR;

const PROJECTS_REGISTRY = path.join(PROJECTS_DIR, "PROJECTS.md");

const DOC_MAP: Record<string, string> = {
  PROJECT: "PROJECT.md",
  ACTION_PLAN: "ACTION_PLAN.md",
  NOTES: "NOTES.md",
};

function normalizeStatus(value?: string) {
  if (!value) return undefined;
  const normalized = value.replace(/\s+/g, " ").trim().toLowerCase();
  if (/\bactive\b/.test(normalized)) return "active";
  if (/\bpaused\b/.test(normalized)) return "paused";
  if (/\bdone\b|\bcomplete(?:d)?\b/.test(normalized)) return "done";
  if (/\bdraft\b/.test(normalized)) return "draft";
  return normalized;
}

function parseOverviewSummary(contents: string) {
  const lines = contents.split(/\r?\n/);
  const overviewIndex = lines.findIndex((line) =>
    /^##\s+overview$/i.test(line.trim())
  );
  if (overviewIndex === -1) return undefined;

  for (let i = overviewIndex + 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;
    if (line.startsWith("## ")) break;
    return line;
  }
  return undefined;
}

function parseMetaLine(contents: string, label: string) {
  const regex = new RegExp(`^\\*\\*${label}:\\*\\*\\s*(.+)$`, "mi");
  const match = contents.match(regex);
  return match?.[1]?.trim();
}

function normalizeDate(raw: unknown) {
  if (!raw) return undefined;
  if (typeof raw === "string") return raw.trim();
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  return undefined;
}

function parseTags(contents: string) {
  const raw = parseMetaLine(contents, "Tags");
  if (!raw) return undefined;
  return raw
    .split(/[,;]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function parseProjectRegistry() {
  if (!fs.existsSync(PROJECTS_REGISTRY)) {
    return [] as RegistryProject[];
  }

  const registry = fs.readFileSync(PROJECTS_REGISTRY, "utf8");
  const projects: RegistryProject[] = [];

  registry.split(/\r?\n/).forEach((line) => {
    const match = line.match(
      /^- \*\*(.+?)\*\* \(`([^`]+)`\)(?:\s+—\s+(?:\*\*(.+?)\*\*|\*(.+?)\*))?/
    );
    if (!match) return;
    const name = match[1].trim();
    const slug = match[2].trim();
    const status = normalizeStatus(match[3] || match[4]);
    projects.push({ name, slug, status });
  });

  return projects;
}

function listProjectDirectories() {
  if (!fs.existsSync(PROJECTS_DIR)) return [] as string[];

  return fs
    .readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith("_"));
}

function slugToName(slug: string) {
  return slug
    .split("-")
    .map((part) => (part ? `${part[0].toUpperCase()}${part.slice(1)}` : part))
    .join(" ");
}

function normalizeTagsValue(raw: unknown) {
  if (!raw) return undefined;
  if (Array.isArray(raw)) {
    const tags = raw.map(String).map((tag) => tag.trim()).filter(Boolean);
    return tags.length > 0 ? tags : undefined;
  }
  if (typeof raw === "string") {
    const tags = raw
      .split(/[,;]/)
      .map((tag) => tag.trim())
      .filter(Boolean);
    return tags.length > 0 ? tags : undefined;
  }
  return undefined;
}

function parseProjectDoc(docPath: string): ParsedProjectDoc {
  if (!fs.existsSync(docPath)) return {};

  const raw = fs.readFileSync(docPath, "utf8");
  const parsed = matter(raw);
  const fm = parsed.data as Record<string, unknown>;

  const fallbackStatus =
    normalizeStatus(parseMetaLine(parsed.content, "Status")) ??
    normalizeStatus(parseMetaLine(parsed.content, "Current Status"));

  return {
    name:
      (typeof fm.title === "string" && fm.title.trim()) ||
      (typeof fm.name === "string" && fm.name.trim()) ||
      undefined,
    status: normalizeStatus(typeof fm.status === "string" ? fm.status : undefined) ?? fallbackStatus,
    owner:
      (typeof fm.owner === "string" && fm.owner.trim()) ||
      parseMetaLine(parsed.content, "Owner") ||
      undefined,
    lastUpdated:
      normalizeDate(fm.lastUpdated) ??
      normalizeDate(fm.last_updated) ??
      parseMetaLine(parsed.content, "Last Updated") ??
      parseMetaLine(parsed.content, "Last updated"),
    tags: normalizeTagsValue(fm.tags) ?? parseTags(parsed.content),
    summary:
      (typeof fm.summary === "string" && fm.summary.trim()) ||
      parseOverviewSummary(parsed.content) ||
      undefined,
  };
}

function normalizeProjectStatus(status?: string): ProjectStatus | undefined {
  const normalized = normalizeStatus(status);
  if (!normalized) return undefined;
  if ((PROJECT_STATUS_VALUES as readonly string[]).includes(normalized)) {
    return normalized as ProjectStatus;
  }
  return undefined;
}

const DOC_SLUGS: Record<string, keyof ProjectLinks> = {
  PROJECT: "project",
  ACTION_PLAN: "actionPlan",
  NOTES: "notes",
};

const DOC_ROUTE: Record<string, string> = {
  PROJECT: "project",
  ACTION_PLAN: "action-plan",
  NOTES: "notes",
};

function buildLinks(slug: string): ProjectLinks {
  const links: ProjectLinks = {};
  Object.entries(DOC_MAP).forEach(([key, fileName]) => {
    const fullPath = path.join(PROJECTS_DIR, slug, fileName);
    if (fs.existsSync(fullPath)) {
      const linkKey = DOC_SLUGS[key];
      if (!linkKey) return;
      links[linkKey] = `/projects/docs/${slug}/${DOC_ROUTE[key]}`;
    }
  });
  return links;
}

export function listProjects(): ProjectSummary[] {
  const registry = parseProjectRegistry();
  const registryMap = new Map(registry.map((project) => [project.slug, project]));
  const orderedSlugs = [
    ...registry.map((project) => project.slug),
    ...listProjectDirectories().filter((slug) => !registryMap.has(slug)),
  ];

  return orderedSlugs.map((slug) => {
    const registryProject = registryMap.get(slug);
    const projectPath = path.join(PROJECTS_DIR, slug, DOC_MAP.PROJECT);
    const parsed = parseProjectDoc(projectPath);

    return {
      slug,
      name: parsed.name ?? registryProject?.name ?? slugToName(slug),
      status: normalizeProjectStatus(parsed.status ?? registryProject?.status),
      owner: parsed.owner,
      lastUpdated: parsed.lastUpdated,
      tags: parsed.tags,
      summary: parsed.summary,
      links: buildLinks(slug),
    };
  });
}

function normalizeTags(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String);
  return [];
}

function tagForProject(slug: string) {
  return `project:${slug}`;
}

export async function listProjectsWithCounts(): Promise<ProjectSummary[]> {
  const projects = listProjects();
  if (projects.length === 0) return projects;

  const [schedules, tasks] = await Promise.all([
    db.schedule.findMany({
      select: {
        id: true,
        enabled: true,
        template: { select: { tags: true } },
      },
    }),
    db.task.findMany({
      select: {
        id: true,
        template: { select: { tags: true } },
      },
    }),
  ]);

  const scheduleCounts = new Map<string, number>();
  const taskCounts = new Map<string, number>();

  projects.forEach((project) => {
    scheduleCounts.set(project.slug, 0);
    taskCounts.set(project.slug, 0);
  });

  schedules.forEach((schedule) => {
    const tags = normalizeTags(schedule.template?.tags);
    const slug = projects.find((p) => tags.includes(tagForProject(p.slug)))?.slug;
    if (!slug) return;
    scheduleCounts.set(slug, (scheduleCounts.get(slug) ?? 0) + 1);
  });

  tasks.forEach((task) => {
    const tags = normalizeTags(task.template?.tags);
    const slug = projects.find((p) => tags.includes(tagForProject(p.slug)))?.slug;
    if (!slug) return;
    taskCounts.set(slug, (taskCounts.get(slug) ?? 0) + 1);
  });

  return projects.map((project) => ({
    ...project,
    scheduleCount: scheduleCounts.get(project.slug) ?? 0,
    taskCount: taskCounts.get(project.slug) ?? 0,
  }));
}

export function getProject(slug: string) {
  return listProjects().find((project) => project.slug === slug);
}

export function getProjectDocPath(slug: string, doc: string) {
  if (!doc) return null;
  const normalized = doc.toUpperCase().replace(/[-\s]/g, "_");
  const fileName = DOC_MAP[normalized];
  if (!fileName) return null;
  return path.join(PROJECTS_DIR, slug, fileName);
}

function writeProjectDocWithFrontmatter(
  docPath: string,
  nextData: Record<string, unknown>
): boolean {
  // Check if file exists and get current hash
  const currentHash = fs.existsSync(docPath)
    ? crypto.createHash("sha256").update(fs.readFileSync(docPath, "utf8")).digest("hex")
    : "";

  const raw = fs.existsSync(docPath) ? fs.readFileSync(docPath, "utf8") : "";
  const parsed = matter(raw);
  const merged = { ...(parsed.data as Record<string, unknown>), ...nextData };
  const serialized = matter.stringify(parsed.content, merged, { lineWidth: 0 });
  fs.writeFileSync(docPath, serialized, "utf8");

  // Check if content was modified (conflict detection)
  const newHash = crypto.createHash("sha256").update(serialized).digest("hex");
  return currentHash !== newHash;
}

function formatStatusLabel(status: ProjectStatus) {
  return `${status[0].toUpperCase()}${status.slice(1)}`;
}

function upsertRegistryEntry(slug: string, name: string, status: ProjectStatus) {
  const statusLabel = formatStatusLabel(status);
  const nextLine = `- **${name}** (\`${slug}\`) — **${statusLabel}**`;

  if (!fs.existsSync(PROJECTS_REGISTRY)) {
    fs.mkdirSync(PROJECTS_DIR, { recursive: true });
    fs.writeFileSync(
      PROJECTS_REGISTRY,
      `# Projects Registry\n\n## Active projects\n\n${nextLine}\n`,
      "utf8"
    );
    return;
  }

  // Check for conflicts before writing
  const currentHash = crypto
    .createHash("sha256")
    .update(fs.readFileSync(PROJECTS_REGISTRY, "utf8"))
    .digest("hex");

  const lines = fs.readFileSync(PROJECTS_REGISTRY, "utf8").split(/\r?\n/);
  const existingIndex = lines.findIndex((line) => line.includes(`(\`${slug}\`)`));
  if (existingIndex >= 0) {
    lines[existingIndex] = nextLine;
    fs.writeFileSync(PROJECTS_REGISTRY, `${lines.join("\n")}\n`, "utf8");
  } else {
    const activeHeader = lines.findIndex((line) => /^##\s+Active projects/i.test(line.trim()));
    if (activeHeader >= 0) {
      let insertAt = activeHeader + 1;
      while (insertAt < lines.length && !lines[insertAt].trim().startsWith("## ")) {
        insertAt += 1;
      }
      lines.splice(insertAt, 0, "", nextLine);
      fs.writeFileSync(PROJECTS_REGISTRY, `${lines.join("\n")}\n`, "utf8");
    } else {
      lines.push("", "## Active projects", "", nextLine);
      fs.writeFileSync(PROJECTS_REGISTRY, `${lines.join("\n")}\n`, "utf8");
    }
  }

  // Check if content was modified (conflict detection)
  const newHash = crypto
    .createHash("sha256")
    .update(fs.readFileSync(PROJECTS_REGISTRY, "utf8"))
    .digest("hex");

  if (currentHash !== newHash) {
    console.warn(`⚠️  Conflict detected in PROJECTS.md: manual edits detected during project update`);
  }
}

function removeRegistryEntry(slug: string) {
  if (!fs.existsSync(PROJECTS_REGISTRY)) return;

  // Check for conflicts before writing
  const currentHash = crypto
    .createHash("sha256")
    .update(fs.readFileSync(PROJECTS_REGISTRY, "utf8"))
    .digest("hex");

  const lines = fs
    .readFileSync(PROJECTS_REGISTRY, "utf8")
    .split(/\r?\n/)
    .filter((line) => !line.includes(`(\`${slug}\`)`));
  fs.writeFileSync(PROJECTS_REGISTRY, `${lines.join("\n").trimEnd()}\n`, "utf8");

  // Check if content was modified (conflict detection)
  const newHash = crypto
    .createHash("sha256")
    .update(fs.readFileSync(PROJECTS_REGISTRY, "utf8"))
    .digest("hex");

  if (currentHash !== newHash) {
    console.warn(`⚠️  Conflict detected in PROJECTS.md: manual edits detected during project deletion`);
  }
}

function projectTemplate(
  name: string,
  slug: string,
  status: ProjectStatus,
  owner?: string,
  summary?: string,
  tags?: string[]
) {
  const yaml = {
    title: name,
    slug,
    status,
    lastUpdated: new Date().toISOString().slice(0, 10),
    owner: owner ?? null,
    tags: tags ?? [],
    summary: summary ?? "",
  };

  const content = `# ${name}

## Overview

${summary ?? "Describe this project in one paragraph."}

## Goals

- [ ] Define goals

## Scope

- In scope:
- Out of scope:

## Dependencies / Related Projects

- None yet.

## Open Questions

- None yet.
`;

  return matter.stringify(content, yaml, { lineWidth: 0 });
}

function actionPlanTemplate(name: string) {
  return `# ${name} Action Plan

## Next Steps

- [ ] Add first milestone
`;
}

function notesTemplate(name: string) {
  return `# ${name} Notes

## Scratchpad

- Add notes here.
`;
}

function secretsTemplate(name: string) {
  return `# ${name} Secrets

Store project credentials and sensitive config here.
`;
}

function assertValidSlug(slug: string) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

export function createProject(input: CreateProjectInput) {
  if (!assertValidSlug(input.slug)) {
    return { error: "Invalid slug", status: 400 as const };
  }
  if (!isValidProjectStatus(input.status ?? "draft")) {
    return { error: "Invalid status", status: 400 as const };
  }

  const status = input.status ?? "draft";
  const projectDir = path.join(PROJECTS_DIR, input.slug);
  if (fs.existsSync(projectDir)) {
    return { error: "Project already exists", status: 400 as const };
  }

  fs.mkdirSync(projectDir, { recursive: true });
  fs.writeFileSync(
    path.join(projectDir, DOC_MAP.PROJECT),
    projectTemplate(input.name, input.slug, status, input.owner, input.summary, input.tags),
    "utf8"
  );
  fs.writeFileSync(path.join(projectDir, DOC_MAP.ACTION_PLAN), actionPlanTemplate(input.name), "utf8");
  fs.writeFileSync(path.join(projectDir, DOC_MAP.NOTES), notesTemplate(input.name), "utf8");
  fs.writeFileSync(path.join(projectDir, "SECRETS.md"), secretsTemplate(input.name), "utf8");

  upsertRegistryEntry(input.slug, input.name, status);
  const project = getProject(input.slug);
  if (!project) {
    return { error: "Project created but could not be reloaded", status: 500 as const };
  }
  return { project, status: 201 as const };
}

// Helper function to check for conflicts (only for updates, not creates)
function checkForConflict(docPath: string): boolean {
  const currentHash = fs.existsSync(docPath)
    ? crypto.createHash("sha256").update(fs.readFileSync(docPath, "utf8")).digest("hex")
    : "";

  const raw = fs.existsSync(docPath) ? fs.readFileSync(docPath, "utf8") : "";
  const parsed = matter(raw);
  const serialized = matter.stringify(parsed.content, parsed.content, { lineWidth: 0 });

  const newHash = crypto.createHash("sha256").update(serialized).digest("hex");
  return currentHash !== newHash;
}

export function updateProjectStatus(slug: string, status: ProjectStatus): boolean {
  const docPath = path.join(PROJECTS_DIR, slug, DOC_MAP.PROJECT);
  if (!fs.existsSync(docPath)) return false;

  // Check for conflicts before writing
  const hasConflict = checkForConflict(docPath);

  writeProjectDocWithFrontmatter(docPath, {
    status,
    lastUpdated: new Date().toISOString().slice(0, 10),
  });

  // Warn if there was a conflict (manual edit detected)
  if (hasConflict) {
    console.warn(`⚠️  Conflict detected for project "${slug}": manual edits detected in PROJECT.md`);
  }

  const project = getProject(slug);
  if (project?.name) {
    upsertRegistryEntry(slug, project.name, status);
  }

  return true;
}

export function deleteProject(slug: string) {
  const projectDir = path.join(PROJECTS_DIR, slug);
  if (!fs.existsSync(projectDir)) return false;
  fs.rmSync(projectDir, { recursive: true });
  removeRegistryEntry(slug);
  return true;
}

export function isValidProjectStatus(value: string): value is ProjectStatus {
  return (PROJECT_STATUS_VALUES as readonly string[]).includes(value);
}

export function isValidProjectSlug(value: string) {
  return assertValidSlug(value);
}
