"use client";

import { useEffect, useState } from "react";
import { Nav } from "@/components/nav";

type Version = {
  id: string;
  version: number;
  content: string;
  isActive: boolean;
  createdAt: string;
};

export default function PreInstructionsPage() {
  const [versions, setVersions] = useState<Version[]>([]);
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function load() {
    const res = await fetch("/api/pre-instructions");
    setVersions(await res.json());
  }

  useEffect(() => { load(); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    const res = await fetch("/api/pre-instructions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) { setError((await res.json()).error); return; }
    setSuccess("New version created and activated!");
    setContent("");
    load();
  }

  const active = versions.find((v) => v.isActive);

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <div className="container mx-auto px-4 py-6 space-y-6">
        <h1 className="text-2xl font-bold">Pre-Instructions</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <h2 className="font-semibold">Create New Version</h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <textarea
                className="w-full px-3 py-2 border rounded-md text-sm bg-background"
                rows={10}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Enter pre-instructions that will be prepended to all dispatched tasks..."
                required
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
              {success && <p className="text-sm text-green-600">{success}</p>}
              <button type="submit" className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90">
                Create &amp; Activate
              </button>
            </form>
          </div>

          <div className="space-y-4">
            <h2 className="font-semibold">Version History</h2>
            {versions.map((v) => (
              <div key={v.id} className={`border rounded-lg p-3 space-y-2 ${v.isActive ? "border-primary" : ""}`}>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">v{v.version}</span>
                  {v.isActive && <span className="text-xs bg-green-100 text-green-800 px-1.5 py-0.5 rounded">Active</span>}
                  <span className="text-xs text-muted-foreground">{new Date(v.createdAt).toLocaleString()}</span>
                </div>
                <pre className="text-xs bg-muted p-2 rounded max-h-24 overflow-auto whitespace-pre-wrap">{v.content}</pre>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
