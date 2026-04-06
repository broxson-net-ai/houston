import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ROOT = process.env.OPENCLAW_PROJECTS_DIR || path.join(os.homedir(), ".openclaw", "workspace", "memory", "projects");
const DOCS = [
  { file: "PROJECT.md", kind: "PROJECT" },
  { file: "ACTION_PLAN.md", kind: "ACTION_PLAN" },
  { file: "NOTES.md", kind: "NOTES" },
];

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseProjectMarkdown(markdown) {
  const lines = markdown.split(/\r?\n/);
  const titleLine = lines.find((line) => /^#\s+/.test(line.trim()));
  const title = titleLine ? titleLine.replace(/^#\s+/, "").trim() : null;
  const summary = lines.find((line) => line.trim() && !line.startsWith("#"))?.trim() || null;
  return { title, summary };
}

async function upsertProjectFromDirectory(projectDir) {
  const slug = path.basename(projectDir);
  const projectDocPath = path.join(projectDir, "PROJECT.md");
  const projectMarkdown = fs.existsSync(projectDocPath) ? fs.readFileSync(projectDocPath, "utf8") : "";
  const parsed = parseProjectMarkdown(projectMarkdown);
  const title = parsed.title || slug.replace(/-/g, " ");

  const project = await prisma.cpProject.upsert({
    where: { slug },
    update: {
      title,
      summary: parsed.summary,
      status: "DRAFT",
      docMode: "MANAGED",
      defaultTrustMode: "STRICT",
    },
    create: {
      slug,
      title,
      summary: parsed.summary,
      status: "DRAFT",
      docMode: "MANAGED",
      defaultTrustMode: "STRICT",
    },
  });

  for (const entry of DOCS) {
    const filePath = path.join(projectDir, entry.file);
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, "utf8");
    const existing = await prisma.cpProjectDoc.findFirst({
      where: { projectId: project.id, kind: entry.kind, isActive: true, archivedAt: null },
    });

    if (!existing) {
      await prisma.cpProjectDoc.create({
        data: {
          projectId: project.id,
          kind: entry.kind,
          title: entry.kind,
          contentMarkdown: content,
          version: 1,
          isActive: true,
        },
      });
      continue;
    }

    if (existing.contentMarkdown !== content) {
      await prisma.cpProjectDoc.update({
        where: { id: existing.id },
        data: {
          contentMarkdown: content,
          version: existing.version + 1,
        },
      });
    }
  }

  return project;
}

async function main() {
  const entries = fs.readdirSync(ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(ROOT, entry.name))
    .filter((projectDir) => fs.existsSync(path.join(projectDir, "PROJECT.md")) || fs.existsSync(path.join(projectDir, "ACTION_PLAN.md")) || fs.existsSync(path.join(projectDir, "NOTES.md")));

  const imported = [];
  for (const projectDir of entries) {
    const project = await upsertProjectFromDirectory(projectDir);
    imported.push({ id: project.id, slug: project.slug, title: project.title });
  }

  console.log(JSON.stringify({ root: ROOT, importedCount: imported.length, imported }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
