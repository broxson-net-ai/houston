"use client";

import { useEffect, useState } from "react";
import { Nav } from "@/components/nav";

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

  useEffect(() => {
    fetch("/api/skills").then((r) => r.json()).then(setSkills);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <div className="container mx-auto px-4 py-6 space-y-4">
        <h1 className="text-2xl font-bold">Skills Registry</h1>
        <p className="text-sm text-muted-foreground">
          Skills are read-only. They are scanned from the OpenClaw skills directory.
        </p>
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="text-left p-3 font-medium">Name</th>
                <th className="text-left p-3 font-medium">Summary</th>
                <th className="text-left p-3 font-medium">Path</th>
                <th className="text-left p-3 font-medium">Last Scanned</th>
              </tr>
            </thead>
            <tbody>
              {skills.map((s) => (
                <tr key={s.id} className="border-t hover:bg-muted/50">
                  <td className="p-3 font-mono font-medium">{s.name}</td>
                  <td className="p-3 text-muted-foreground">{s.summary ?? "—"}</td>
                  <td className="p-3 font-mono text-xs text-muted-foreground">{s.path}</td>
                  <td className="p-3 text-muted-foreground">{new Date(s.lastScannedAt).toLocaleString()}</td>
                </tr>
              ))}
              {skills.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-muted-foreground">
                    No skills found. Make sure OPENCLAW_SKILLS_PATH is configured.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
