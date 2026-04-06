"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Nav } from "@/components/nav";

type Phase = {
  id: string;
  title: string;
  phaseKey: string;
  status: string;
  planningRequired: boolean;
  summaryMarkdown?: string | null;
};

type WorkItem = {
  id: string;
  title: string;
  status: string;
  type: string;
};

export default function PhaseDetailPage() {
  const params = useParams();
  const slug = params.slug as string;
  const phaseId = params.phaseId as string;
  const [phase, setPhase] = useState<Phase | null>(null);
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!phaseId) return;
    fetch(`/api/v1/projects`, { credentials: "include" })
      .then((res) => res.json())
      .then(async (payload) => {
        const project = (payload.data ?? []).find((item: any) => item.slug === slug);
        if (!project) throw new Error("Project not found");
        const phasesRes = await fetch(`/api/v1/phases?projectId=${project.id}`, { credentials: "include" });
        const itemsRes = await fetch(`/api/v1/work-items?phaseId=${phaseId}`, { credentials: "include" });
        const [phasesData, itemsData] = await Promise.all([phasesRes.json(), itemsRes.json()]);
        setPhase((phasesData.data ?? []).find((entry: any) => entry.id === phaseId) ?? null);
        setWorkItems(itemsData.data ?? []);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load phase"));
  }, [phaseId, slug]);

  async function generateFromPlanning() {
    const res = await fetch(`/api/v1/phases/${phaseId}/generate-work-items`, { method: "POST", credentials: "include" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to generate work items");
      return;
    }
    const itemsRes = await fetch(`/api/v1/work-items?phaseId=${phaseId}`, { credentials: "include" });
    const itemsData = await itemsRes.json();
    setWorkItems(itemsData.data ?? []);
  }

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <div className="mx-auto max-w-5xl px-6 py-10 space-y-6">
        {!phase ? (
          <div className="text-sm text-muted-foreground">{error || "Loading phase..."}</div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Phase</p>
                <h1 className="text-3xl font-bold">{phase.title}</h1>
                <p className="text-sm text-muted-foreground">{phase.phaseKey} - {phase.status.toLowerCase()}</p>
              </div>
              <div className="flex gap-2">
                <a href={`/projects/${slug}`} className="rounded-md border px-3 py-2 text-sm">Project</a>
                <button onClick={generateFromPlanning} className="rounded-md border px-3 py-2 text-sm hover:bg-muted">Generate work items</button>
              </div>
            </div>

            <div className="rounded-lg border bg-card p-5 space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground">Phase Summary</h2>
              <p className="text-sm">Planning required: {phase.planningRequired ? "yes" : "no"}</p>
              {phase.summaryMarkdown ? <pre className="whitespace-pre-wrap rounded-md bg-muted p-3 text-sm">{phase.summaryMarkdown}</pre> : null}
            </div>

            <div className="rounded-lg border bg-card p-5 space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground">Work Items</h2>
              {workItems.length === 0 ? <p className="text-sm text-muted-foreground">No work items yet.</p> : workItems.map((item) => (
                <a key={item.id} href={`/work-items/${item.id}`} className="block rounded-md border p-3 text-sm hover:bg-muted/50">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{item.title}</span>
                    <span className="text-xs text-muted-foreground">{item.status.toLowerCase()}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{item.type.toLowerCase()}</p>
                </a>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
