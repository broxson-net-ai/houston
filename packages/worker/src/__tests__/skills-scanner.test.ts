import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "fs/promises";
import { join } from "path";
import os from "os";

const mockDb = vi.hoisted(() => ({
  skillsCache: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@houston/shared", () => ({
  db: mockDb,
}));

import { scanSkills } from "../skills-scanner.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(os.tmpdir(), "houston-skills-test-"));
  vi.resetAllMocks();
  mockDb.skillsCache.findMany.mockResolvedValue([]);
  mockDb.skillsCache.upsert.mockResolvedValue({});
  mockDb.skillsCache.update.mockResolvedValue({});
  mockDb.skillsCache.delete.mockResolvedValue({});
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

async function createSkill(name: string, content: string) {
  const skillDir = join(tmpDir, name);
  await mkdir(skillDir, { recursive: true });
  await writeFile(join(skillDir, "SKILL.md"), content);
}

describe("scanSkills", () => {
  it("inserts 2 rows into DB for 2 SKILL.md files", async () => {
    await createSkill("skill-a", "# Skill A\nThis is skill A.");
    await createSkill("skill-b", "# Skill B\nThis is skill B.");
    mockDb.skillsCache.findUnique.mockResolvedValue(null); // New skills

    await scanSkills(tmpDir);

    expect(mockDb.skillsCache.upsert).toHaveBeenCalledTimes(2);
  });

  it("does NOT update rows when mtime and hash are unchanged", async () => {
    await createSkill("skill-c", "# Skill C\nContent.");

    // First scan: insert
    mockDb.skillsCache.findUnique.mockResolvedValue(null);
    await scanSkills(tmpDir);
    const upsertCall = (mockDb.skillsCache.upsert as ReturnType<typeof vi.fn>).mock.calls[0];
    const { hash, mtime } = upsertCall[0].create;

    vi.clearAllMocks();
    mockDb.skillsCache.findMany.mockResolvedValue([]);
    // Second scan: same mtime + hash → only update lastScannedAt, NOT upsert
    mockDb.skillsCache.findUnique.mockResolvedValue({ hash, mtime: new Date(mtime), lastScannedAt: new Date() });
    mockDb.skillsCache.update.mockResolvedValue({});

    await scanSkills(tmpDir);

    expect(mockDb.skillsCache.upsert).not.toHaveBeenCalled();
    expect(mockDb.skillsCache.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ lastScannedAt: expect.any(Date) }) })
    );
  });

  it("updates summary and hash when file content changes", async () => {
    await createSkill("skill-d", "# Skill D\nOriginal content.");
    mockDb.skillsCache.findUnique.mockResolvedValue(null);
    await scanSkills(tmpDir);

    // Wait a moment for mtime to differ
    await new Promise((r) => setTimeout(r, 10));
    const skillDir = join(tmpDir, "skill-d");
    await writeFile(join(skillDir, "SKILL.md"), "# Skill D\nUpdated content.");

    vi.clearAllMocks();
    mockDb.skillsCache.findMany.mockResolvedValue([]);
    // Different content → different hash → upsert
    mockDb.skillsCache.findUnique.mockResolvedValue({
      hash: "old-hash-that-wont-match",
      mtime: new Date("2020-01-01"),
    });
    mockDb.skillsCache.upsert.mockResolvedValue({});

    await scanSkills(tmpDir);

    expect(mockDb.skillsCache.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ summary: expect.stringContaining("Skill D") }),
      })
    );
  });

  it("deletes SkillsCache row when skill directory is removed", async () => {
    await createSkill("skill-e", "# Skill E");
    mockDb.skillsCache.findUnique.mockResolvedValue(null);
    await scanSkills(tmpDir);

    // Remove the skill directory
    await rm(join(tmpDir, "skill-e"), { recursive: true });

    vi.clearAllMocks();
    // DB has skill-e but it's no longer on disk
    mockDb.skillsCache.findMany.mockResolvedValue([{ name: "skill-e" }]);
    mockDb.skillsCache.findUnique.mockResolvedValue(null);
    mockDb.skillsCache.delete.mockResolvedValue({});

    await scanSkills(tmpDir);

    expect(mockDb.skillsCache.delete).toHaveBeenCalledWith(
      expect.objectContaining({ where: { name: "skill-e" } })
    );
  });
});
