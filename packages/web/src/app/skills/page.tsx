"use client";

import { useEffect, useMemo, useState } from "react";
import { Nav } from "@/components/nav";
import MarkdownPreview from "@/components/MarkdownPreview";
import SkillUsageView from "./SkillUsageView";

type Skill = {
  id: string;
  name: string;
  path: string;
  summary?: string | null;
  lastScannedAt: string;
  hash: string;
};

type SkillUsageResponse = {
  totalEvents: number;
  eventsLast24h: number;
  bySkill: Array<{
    skill_name: string;
    count: number;
    last_used: string;
  }>;
  byAgent: Array<{
    agent_id: string;
    count: number;
    last_used: string;
  }>;
  degraded: boolean;
  degradedReason?: string;
};

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [usage, setUsage] = useState<SkillUsageResponse | null>(null);
  const [query, setQuery] = useState("");
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [skillContent, setSkillContent] = useState<string>("");
  const [loadingContent, setLoadingContent] = useState(false);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    fetch("/api/skills")
      .then((r) => r.json())
      .then(setSkills)
      .catch((err) => {
        console.error("Failed to fetch skills:", err);
        setError("Failed to load skills");
      });

    fetch("/api/skills/usage")
      .then((r) => r.json())
      .then(setUsage)
      .catch((err) => {
        console.error("Failed to fetch skill usage:", err);
      });
  }, []);

  const usageBySkill = useMemo(() => {
    const entries = usage?.bySkill ?? [];
    return new Map(entries.map((entry) => [entry.skill_name, entry]));
  }, [usage]);

  const filtered = skills.filter((s) =>
    !query ||
    s.name.toLowerCase().includes(query.toLowerCase()) ||
    s.summary?.toLowerCase().includes(query.toLowerCase())
  );

  const viewSkill = async (skill: Skill) => {
    setSelectedSkill(skill);
    setLoadingContent(true);
    setError("");
    try {
      const res = await fetch(`/api/skills/${encodeURIComponent(skill.name)}/content`);
      if (!res.ok) throw new Error("Failed to load skill content");
      const data = await res.json();
      setSkillContent(data.content);
    } catch (err) {
      console.error("Failed to load skill content:", err);
      setError("Failed to load skill content");
    } finally {
      setLoadingContent(false);
    }
  };

  const closeModal = () => {
    setSelectedSkill(null);
    setSkillContent("");
    setError("");
  };

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <div className="container mx-auto max-w-6xl space-y-8 px-4 py-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Skills Registry</h1>
          <p className="text-muted-foreground">
            Skills are read-only. They are scanned from the OpenClaw skills directory.
          </p>
        </div>

        <SkillUsageView />

        <section className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Registered Skills</h2>
              <p className="text-sm text-muted-foreground">
                Browse scanned `SKILL.md` files and inspect the current registry snapshot.
              </p>
            </div>
            <input
              className="w-full max-w-md rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="Search skills..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>

          {error && !selectedSkill ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
              {error}
            </div>
          ) : null}

          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((skill) => {
              const usageEntry = usageBySkill.get(skill.name);
              const usageCount = usageEntry?.count ?? 0;
              const hasUsage = usageCount > 0;

              return (
                <div
                  key={skill.id}
                  className="flex h-full flex-col justify-between rounded-lg border bg-card p-5 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-mono text-lg font-semibold">{skill.name}</h3>
                        <p className="text-xs text-muted-foreground">{skill.name}</p>
                      </div>
                      <div
                        className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                          hasUsage
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-amber-200 bg-amber-50 text-amber-700"
                        }`}
                        title={hasUsage && usageEntry?.last_used ? `Last used ${new Date(usageEntry.last_used).toLocaleString()}` : "No recorded usage yet"}
                      >
                        {usageCount.toLocaleString()} uses
                      </div>
                    </div>
                    {skill.summary ? (
                      <p className="text-sm text-muted-foreground">{skill.summary}</p>
                    ) : (
                      <p className="text-sm italic text-muted-foreground">No summary available</p>
                    )}
                    <div className="space-y-1 text-xs text-muted-foreground">
                      <div className="truncate font-mono text-xs" title={skill.path}>
                        {skill.path}
                      </div>
                      <div>Last scanned: {new Date(skill.lastScannedAt).toLocaleString()}</div>
                      <div>
                        Usage window: all recorded events
                        {hasUsage && usageEntry?.last_used ? ` • last used ${new Date(usageEntry.last_used).toLocaleString()}` : " • no activity recorded"}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4">
                    <button
                      onClick={() => viewSkill(skill)}
                      className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
                    >
                      View SKILL.md
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {filtered.length === 0 && !error ? (
            <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
              {skills.length === 0
                ? "No skills found. Make sure OPENCLAW_SKILLS_PATH is configured."
                : "No skills match your search."}
            </div>
          ) : null}
        </section>
      </div>

      {selectedSkill ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={closeModal}
        >
          <div
            className="max-h-[80vh] w-full max-w-4xl overflow-auto rounded-lg border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-mono text-2xl font-bold">{selectedSkill.name}</h2>
                <p className="font-mono text-sm text-muted-foreground">{selectedSkill.path}</p>
              </div>
              <button
                onClick={closeModal}
                className="rounded-md border px-3 py-1 text-sm hover:bg-muted"
              >
                Close
              </button>
            </div>
            {loadingContent ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                Loading...
              </div>
            ) : null}
            {error && selectedSkill ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                {error}
              </div>
            ) : null}
            {!loadingContent && !error && skillContent ? <MarkdownPreview content={skillContent} /> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
