"use client";

import { useEffect, useState } from "react";
import { Nav } from "@/components/nav";
import MarkdownPreview from "@/components/MarkdownPreview";

type Skill = {
  id: string;
  name: string;
  path: string;
  summary?: string | null;
  lastScannedAt: string;
  hash: string;
};

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
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
  }, []);

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
      <div className="container mx-auto max-w-6xl px-4 py-6 space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Skills Registry</h1>
          <p className="text-muted-foreground">
            Skills are read-only. They are scanned from the OpenClaw skills directory.
          </p>
        </div>

        <input
          className="w-full max-w-md rounded-md border bg-background px-3 py-2 text-sm"
          placeholder="Search skills..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />

        {error && !selectedSkill && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            {error}
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((skill) => (
            <div
              key={skill.id}
              className="flex h-full flex-col justify-between rounded-lg border bg-card p-5 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="space-y-3">
                <div>
                  <h3 className="text-lg font-semibold font-mono">{skill.name}</h3>
                  <p className="text-xs text-muted-foreground">{skill.name}</p>
                </div>
                {skill.summary ? (
                  <p className="text-sm text-muted-foreground">{skill.summary}</p>
                ) : (
                  <p className="text-sm text-muted-foreground italic">No summary available</p>
                )}
                <div className="text-xs text-muted-foreground space-y-1">
                  <div className="font-mono text-xs truncate" title={skill.path}>
                    {skill.path}
                  </div>
                  <div>Last scanned: {new Date(skill.lastScannedAt).toLocaleString()}</div>
                </div>
              </div>
              <div className="mt-4">
                <button
                  onClick={() => viewSkill(skill)}
                  className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
                >
                  View SKILL.md
                </button>
              </div>
            </div>
          ))}
        </div>

        {filtered.length === 0 && !error && (
          <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
            {skills.length === 0
              ? "No skills found. Make sure OPENCLAW_SKILLS_PATH is configured."
              : "No skills match your search."}
          </div>
        )}
      </div>

      {/* Modal for viewing SKILL.md */}
      {selectedSkill && (
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
                <h2 className="text-2xl font-bold font-mono">{selectedSkill.name}</h2>
                <p className="text-sm text-muted-foreground font-mono">{selectedSkill.path}</p>
              </div>
              <button
                onClick={closeModal}
                className="rounded-md border px-3 py-1 text-sm hover:bg-muted"
              >
                Close
              </button>
            </div>
            {loadingContent && (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                Loading...
              </div>
            )}
            {error && selectedSkill && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                {error}
              </div>
            )}
            {!loadingContent && !error && skillContent && (
              <MarkdownPreview content={skillContent} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
