import { createHash } from "crypto";
import { readdir, readFile, stat } from "fs/promises";
import { join } from "path";
import { db } from "@houston/shared";

function extractSummary(content: string): string {
  const lines = content.split("\n").filter((l) => l.trim());
  for (const line of lines) {
    const h1 = line.match(/^#\s+(.+)/);
    if (h1) return h1[1].trim();
  }
  for (const line of lines) {
    if (line.trim() && !line.startsWith("#")) {
      return line.trim().slice(0, 200);
    }
  }
  return "";
}

export async function scanSkills(skillsPath: string): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(skillsPath);
  } catch {
    console.warn(`[skills-scanner] Cannot read skills path: ${skillsPath}`);
    return;
  }

  const foundNames = new Set<string>();

  for (const entry of entries) {
    const skillDir = join(skillsPath, entry);
    const skillFile = join(skillDir, "SKILL.md");

    let dirStat;
    try {
      dirStat = await stat(skillDir);
      if (!dirStat.isDirectory()) continue;
    } catch {
      continue;
    }

    let content: string;
    let fileStat;
    try {
      content = await readFile(skillFile, "utf-8");
      fileStat = await stat(skillFile);
    } catch {
      continue;
    }

    const hash = createHash("sha256").update(content).digest("hex");
    const mtime = fileStat.mtime;
    const summary = extractSummary(content);
    const name = entry;

    foundNames.add(name);

    // Check existing
    const existing = await db.skillsCache.findUnique({ where: { name } });

    if (existing && existing.hash === hash && existing.mtime.getTime() === mtime.getTime()) {
      // No changes, update lastScannedAt
      await db.skillsCache.update({
        where: { name },
        data: { lastScannedAt: new Date() },
      });
      continue;
    }

    await db.skillsCache.upsert({
      where: { name },
      update: {
        path: skillFile,
        mtime,
        hash,
        summary,
        lastScannedAt: new Date(),
      },
      create: {
        name,
        path: skillFile,
        mtime,
        hash,
        summary,
        lastScannedAt: new Date(),
      },
    });

    console.log(`[skills-scanner] ${existing ? "Updated" : "Added"} skill: ${name}`);
  }

  // Remove skills no longer on disk
  const allCached = await db.skillsCache.findMany({ select: { name: true } });
  for (const cached of allCached) {
    if (!foundNames.has(cached.name)) {
      await db.skillsCache.delete({ where: { name: cached.name } });
      console.log(`[skills-scanner] Removed skill: ${cached.name}`);
    }
  }
}
