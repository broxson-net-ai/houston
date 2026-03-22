import "server-only";

import fs from "fs";
import os from "os";
import path from "path";

export type PortfolioLane = {
  title: string;
  projects: string[];
  goal: string[];
};

export type PortfolioGate = {
  title: string;
  mustPass: string[];
  owners: string[];
};

export type PortfolioExecutionQueue = {
  now: string[];
  next: string[];
  later: string[];
};

export type PortfolioExecutionBoard = {
  status?: string;
  owner?: string;
  lastUpdated?: string;
  constraints: string[];
  conflictMap: string[];
  lanes: PortfolioLane[];
  gates: PortfolioGate[];
  queue: PortfolioExecutionQueue;
  sourcePath: string;
  mtimeMs?: number;
};

const DEFAULT_PROJECTS_DIR = path.join(
  os.homedir(),
  ".openclaw",
  "workspace",
  "memory",
  "projects"
);

const PROJECTS_DIR = process.env.OPENCLAW_PROJECTS_DIR ?? DEFAULT_PROJECTS_DIR;
const BOARD_PATH = path.join(PROJECTS_DIR, "PORTFOLIO_EXECUTION.md");

function parseMeta(contents: string, label: string) {
  const regex = new RegExp(`^\\*\\*${label}:\\*\\*\\s*(.+)$`, "mi");
  const match = contents.match(regex);
  return match?.[1]?.trim();
}

function sectionLinesByPrefix(contents: string, headingPrefix: string) {
  const lines = contents.split(/\r?\n/);
  const target = headingPrefix.trim().toLowerCase();
  const start = lines.findIndex((line) => {
    const t = line.trim().toLowerCase();
    return t.startsWith("## ") && t.includes(target);
  });
  if (start === -1) return [] as string[];
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^##\s+/.test(line.trim())) break;
    out.push(line);
  }
  return out;
}

function parseSimpleList(lines: string[]) {
  return lines
    .map((line) => line.trim())
    .map((line) => {
      const numbered = line.match(/^\d+\.\s+(.+)$/);
      if (numbered) return numbered[1].trim();
      const bulleted = line.match(/^-\s+(.+)$/);
      if (bulleted) return bulleted[1].trim();
      return "";
    })
    .filter(Boolean);
}

function parseLanes(contents: string): PortfolioLane[] {
  const lines = sectionLinesByPrefix(contents, "4) portfolio lanes and project ownership");
  const lanes: PortfolioLane[] = [];
  let i = 0;

  while (i < lines.length) {
    const heading = lines[i].trim().match(/^###\s+(.+)$/);
    if (!heading) {
      i += 1;
      continue;
    }

    const title = heading[1].trim();
    const block: string[] = [];
    i += 1;
    while (i < lines.length) {
      const current = lines[i].trim();
      if (/^###\s+/.test(current)) break;
      block.push(lines[i]);
      i += 1;
    }

    const projects: string[] = [];
    const goal: string[] = [];
    let inProjects = false;
    let inGoal = false;

    for (const raw of block) {
      const line = raw.trim();
      if (!line) continue;
      if (/^Projects:\s*$/i.test(line)) {
        inProjects = true;
        inGoal = false;
        continue;
      }
      if (/^Goal:\s*$/i.test(line)) {
        inProjects = false;
        inGoal = true;
        continue;
      }
      const bullet = line.match(/^-\s+(.+)$/);
      if (bullet) {
        if (inProjects) projects.push(bullet[1].trim());
        else if (inGoal) goal.push(bullet[1].trim());
      }
    }

    lanes.push({ title, projects, goal });
  }

  return lanes;
}

function parseGates(contents: string): PortfolioGate[] {
  const lines = sectionLinesByPrefix(contents, "5) stage gates");
  const gates: PortfolioGate[] = [];
  let i = 0;

  while (i < lines.length) {
    const heading = lines[i].trim().match(/^###\s+(.+)$/);
    if (!heading) {
      i += 1;
      continue;
    }

    const title = heading[1].trim();
    const block: string[] = [];
    i += 1;
    while (i < lines.length) {
      const current = lines[i].trim();
      if (/^###\s+/.test(current)) break;
      block.push(lines[i]);
      i += 1;
    }

    const mustPass: string[] = [];
    const owners: string[] = [];
    let inMustPass = false;
    let inOwners = false;

    for (const raw of block) {
      const line = raw.trim();
      if (!line) continue;
      if (/^Must pass:\s*$/i.test(line)) {
        inMustPass = true;
        inOwners = false;
        continue;
      }
      if (/^Primary owners:\s*$/i.test(line)) {
        inMustPass = false;
        inOwners = true;
        continue;
      }
      const bullet = line.match(/^-\s+(.+)$/);
      if (bullet) {
        if (inMustPass) mustPass.push(bullet[1].trim());
        else if (inOwners) owners.push(bullet[1].trim());
      }
    }

    gates.push({ title, mustPass, owners });
  }

  return gates;
}

function parseQueue(contents: string): PortfolioExecutionQueue {
  const lines = sectionLinesByPrefix(contents, "6) now / next / later board");
  const buckets: PortfolioExecutionQueue = { now: [], next: [], later: [] };

  let current: keyof PortfolioExecutionQueue | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (/^###\s+Now/i.test(line)) {
      current = "now";
      continue;
    }
    if (/^###\s+Next/i.test(line)) {
      current = "next";
      continue;
    }
    if (/^###\s+Later/i.test(line)) {
      current = "later";
      continue;
    }
    const item = line.match(/^\d+\.\s+(.+)$/) || line.match(/^[-*]\s+(.+)$/);
    if (item && current) buckets[current].push(item[1].trim());
  }

  return buckets;
}

export function getPortfolioExecutionBoard(): PortfolioExecutionBoard | null {
  if (!fs.existsSync(BOARD_PATH)) return null;

  const contents = fs.readFileSync(BOARD_PATH, "utf8");
  const stat = fs.statSync(BOARD_PATH);

  const constraints = parseSimpleList(sectionLinesByPrefix(contents, "1) non-negotiable constraints"));
  const conflictMap = parseSimpleList(sectionLinesByPrefix(contents, "3) conflict and duplicate resolution map"));
  const lanes = parseLanes(contents);
  const gates = parseGates(contents);
  const queue = parseQueue(contents);

  return {
    status: parseMeta(contents, "Status"),
    owner: parseMeta(contents, "Owner"),
    lastUpdated: parseMeta(contents, "Last updated"),
    constraints,
    conflictMap,
    lanes,
    gates,
    queue,
    sourcePath: BOARD_PATH,
    mtimeMs: stat.mtimeMs,
  };
}
