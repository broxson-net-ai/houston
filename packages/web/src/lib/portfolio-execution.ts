import "server-only";

import fs from "fs";
import os from "os";
import path from "path";

export type PortfolioExecutionTodo = {
  label: string;
  done: boolean;
};

export type PortfolioExecutionTrack = {
  title: string;
  todos: PortfolioExecutionTodo[];
  doneWhen: PortfolioExecutionTodo[];
};

export type PortfolioExecutionBoard = {
  status?: string;
  owner?: string;
  lastUpdated?: string;
  criticalPath: string[];
  parallelTracks: string[];
  rules: string[];
  tracks: PortfolioExecutionTrack[];
  newAgents: PortfolioExecutionTodo[];
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

function sectionLines(contents: string, heading: string) {
  const lines = contents.split(/\r?\n/);
  const start = lines.findIndex((line) => new RegExp(`^##\\s+${heading}$`, "i").test(line.trim()));
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

function parseCheckboxLine(line: string) {
  const match = line.trim().match(/^-\s+\[(x|X|\s)\]\s+(.+)$/);
  if (!match) return null;
  return {
    done: match[1].toLowerCase() === "x",
    label: match[2].trim(),
  } satisfies PortfolioExecutionTodo;
}

function parseTrackSections(contents: string) {
  const lines = contents.split(/\r?\n/);
  const tracks: PortfolioExecutionTrack[] = [];
  let i = 0;

  while (i < lines.length) {
    const heading = lines[i].trim().match(/^###\s+Track\s+\d+\s*:\s+(.+)$/i);
    if (!heading) {
      i += 1;
      continue;
    }

    const title = heading[1].trim();
    const todos: PortfolioExecutionTodo[] = [];
    const doneWhen: PortfolioExecutionTodo[] = [];
    let inDoneWhen = false;
    i += 1;

    while (i < lines.length) {
      const current = lines[i].trim();
      if (/^###\s+/.test(current) || /^##\s+New agents to create$/i.test(current)) break;
      if (/^Done when:/i.test(current)) {
        inDoneWhen = true;
        i += 1;
        continue;
      }

      const checkbox = parseCheckboxLine(lines[i]);
      if (checkbox) {
        if (inDoneWhen) {
          doneWhen.push(checkbox);
        } else {
          todos.push(checkbox);
        }
      }
      i += 1;
    }

    tracks.push({ title, todos, doneWhen });
  }

  return tracks;
}

export function getPortfolioExecutionBoard(): PortfolioExecutionBoard | null {
  if (!fs.existsSync(BOARD_PATH)) return null;

  const contents = fs.readFileSync(BOARD_PATH, "utf8");
  const stat = fs.statSync(BOARD_PATH);

  const criticalPath = parseSimpleList(sectionLines(contents, "Critical path"));
  const parallelTracks = parseSimpleList(sectionLines(contents, "Parallel tracks"));
  const rules = parseSimpleList(sectionLines(contents, "Portfolio execution rules"));

  const newAgents = sectionLines(contents, "New agents to create")
    .map(parseCheckboxLine)
    .filter((item): item is PortfolioExecutionTodo => Boolean(item));

  return {
    status: parseMeta(contents, "Status"),
    owner: parseMeta(contents, "Owner"),
    lastUpdated: parseMeta(contents, "Last updated"),
    criticalPath,
    parallelTracks,
    rules,
    tracks: parseTrackSections(contents),
    newAgents,
    sourcePath: BOARD_PATH,
    mtimeMs: stat.mtimeMs,
  };
}
