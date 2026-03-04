import "dotenv/config";
import fs from "fs";
import path from "path";
import { db } from "@houston/shared";

const PROJECTS_DIR =
  process.env.OPENCLAW_PROJECTS_DIR ??
  "/Users/openclaw/.openclaw/workspace/memory/projects";
const PROJECTS_REGISTRY = path.join(PROJECTS_DIR, "PROJECTS.md");

function parseProjects() {
  if (!fs.existsSync(PROJECTS_REGISTRY)) return [];
  const registry = fs.readFileSync(PROJECTS_REGISTRY, "utf8");
  const projects = [];
  registry.split(/\r?\n/).forEach((line) => {
    const match = line.match(
      /^- \*\*(.+?)\*\* \(`([^`]+)`\)(?:\s+—\s+(?:\*\*(.+?)\*\*|\*(.+?)\*))?/
    );
    if (!match) return;
    projects.push({ name: match[1].trim(), slug: match[2].trim() });
  });
  return projects;
}

function findProjectTag(templateName, templateTags, projects) {
  const existing = templateTags.find((tag) => tag.startsWith("project:"));
  if (existing) return existing;

  const normalized = templateName.toLowerCase();
  const match = projects.find(
    (project) =>
      normalized.includes(project.name.toLowerCase()) ||
      normalized.includes(project.slug.toLowerCase())
  );
  if (!match) return null;
  return `project:${match.slug}`;
}

async function main() {
  const projects = parseProjects();
  if (!projects.length) {
    console.log("No projects found in PROJECTS.md");
    return;
  }

  const templates = await db.template.findMany({
    select: { id: true, name: true, tags: true },
  });

  let updated = 0;
  for (const template of templates) {
    const tags = Array.isArray(template.tags) ? template.tags.map(String) : [];
    const tag = findProjectTag(template.name, tags, projects);
    if (!tag || tags.includes(tag)) continue;

    await db.template.update({
      where: { id: template.id },
      data: { tags: [...tags, tag] },
    });
    updated += 1;
    console.log(`Tagged "${template.name}" with ${tag}`);
  }

  console.log(`Done. Updated ${updated} templates.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
