import "server-only";

import fs from "fs";
import path from "path";
import { db } from "@houston/shared";

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

const DEFAULT_PROJECTS_DIR =
  "/Users/openclaw/.openclaw/workspace/memory/projects";

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
  return value.replace(/\s+/g, " ").trim();
}

function parseOverviewSummary(contents: string) {
  const lines = contents.split(/\r?\n/);
  const overviewIndex = lines.findIndex((line) => line.trim() === "## Overview");
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
    return [] as Array<{ slug: string; name: string; status?: string }>;
  }

  const registry = fs.readFileSync(PROJECTS_REGISTRY, "utf8");
  const projects: Array<{ slug: string; name: string; status?: string }> = [];

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

  return registry.map(({ slug, name, status }) => {
    const projectPath = path.join(PROJECTS_DIR, slug, DOC_MAP.PROJECT);
    let projectContents = "";
    if (fs.existsSync(projectPath)) {
      projectContents = fs.readFileSync(projectPath, "utf8");
    }

    const projectStatus =
      normalizeStatus(parseMetaLine(projectContents, "Status")) ?? status;

    return {
      slug,
      name,
      status: projectStatus,
      owner: parseMetaLine(projectContents, "Owner"),
      lastUpdated: parseMetaLine(projectContents, "Last Updated"),
      tags: parseTags(projectContents),
      summary: parseOverviewSummary(projectContents),
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
  const normalized = doc.toUpperCase().replace(/[-\s]/g, "_");
  const fileName = DOC_MAP[normalized];
  if (!fileName) return null;
  return path.join(PROJECTS_DIR, slug, fileName);
}

export function updateProjectStatus(slug: string, status: string) {
  const docPath = path.join(PROJECTS_DIR, slug, DOC_MAP.PROJECT);
  if (!fs.existsSync(docPath)) return false;

  const contents = fs.readFileSync(docPath, "utf8");
  const statusLine = `**Status:** ${status}`;
  let updated = contents;

  if (/^\*\*Status:\*\*.*$/im.test(contents)) {
    updated = contents.replace(/^\*\*Status:\*\*.*$/im, statusLine);
  } else {
    updated = `${statusLine}\n${contents}`;
  }

  const lastUpdatedLine = `**Last Updated:** ${new Date().toISOString().slice(0, 10)}`;
  if (/^\*\*Last Updated:\*\*.*$/im.test(updated)) {
    updated = updated.replace(/^\*\*Last Updated:\*\*.*$/im, lastUpdatedLine);
  } else {
    updated = updated.replace(statusLine, `${statusLine}\n${lastUpdatedLine}`);
  }

  fs.writeFileSync(docPath, updated, "utf8");
  return true;
}
