"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Nav } from "@/components/nav";

type Node = { id: string; title: string; status: string; type: string };
type Edge = { id: string; fromSubjectId: string; toSubjectId: string; edgeType: string; strength: string; reason?: string | null };

export default function ProjectDependencyMapPage() {
  const params = useParams();
  const slug = params.slug as string;
  const [data, setData] = useState<{ nodes: Node[]; edges: Edge[] } | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!slug) return;
    fetch(`/api/v1/projects`, { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load projects");
        return res.json();
      })
      .then(async (payload) => {
        const project = (payload.data ?? []).find((item: any) => item.slug === slug);
        if (!project) throw new Error("Project not found");
        setProjectId(project.id);
        const res = await fetch(`/api/v1/projects/${project.id}/dependency-map`, { credentials: "include" });
        if (!res.ok) throw new Error("Failed to load dependency map");
        const mapData = await res.json();
        setData(mapData.data);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load dependency map"));
  }, [slug]);

  async function addDependency() {
    if (!fromId || !toId) return;
    const res = await fetch(`/api/v1/dependencies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        fromSubjectType: "WORK_ITEM",
        fromSubjectId: fromId,
        toSubjectType: "WORK_ITEM",
        toSubjectId: toId,
        edgeType: "BLOCKS",
        scope: "INTRA_PROJECT",
        strength: "HARD",
        reason: `Added from project dependency map for ${slug}`,
      }),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      setError(payload.error || "Failed to add dependency");
      return;
    }
    if (!projectId) return;
    const mapRes = await fetch(`/api/v1/projects/${projectId}/dependency-map`, { credentials: "include" });
    const mapData = await mapRes.json();
    setData(mapData.data);
    setFromId("");
    setToId("");
  }

  async function removeDependency(edgeId: string) {
    const res = await fetch(`/api/v1/dependencies?id=${encodeURIComponent(edgeId)}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      setError(payload.error || "Failed to remove dependency");
      return;
    }
    setData((current) => current ? { ...current, edges: current.edges.filter((edge) => edge.id !== edgeId) } : current);
  }

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <div className="mx-auto max-w-7xl px-6 py-10 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Project Dependency Map</p>
            <h1 className="text-3xl font-bold">{slug}</h1>
          </div>
          <a href={`/projects/${slug}`} className="rounded-md border px-3 py-2 text-sm">Project</a>
        </div>

        {!data ? (
          <div className="text-sm text-muted-foreground">{error || "Loading dependency map..."}</div>
        ) : (
          <div className="rounded-lg border bg-card p-5 space-y-4">
            <div className="text-sm text-muted-foreground">Nodes: {data.nodes.length} · Edges: {data.edges.length}</div>
            <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
              <select className="rounded-md border bg-background px-3 py-2 text-sm" value={fromId} onChange={(e) => setFromId(e.target.value)}>
                <option value="">Blocker work item</option>
                {data.nodes.map((node) => <option key={node.id} value={node.id}>{node.status.toLowerCase()} - {node.title}</option>)}
              </select>
              <select className="rounded-md border bg-background px-3 py-2 text-sm" value={toId} onChange={(e) => setToId(e.target.value)}>
                <option value="">Blocked work item</option>
                {data.nodes.map((node) => <option key={node.id} value={node.id}>{node.status.toLowerCase()} - {node.title}</option>)}
              </select>
              <button onClick={addDependency} className="rounded-md border px-3 py-2 text-sm hover:bg-muted">Add edge</button>
            </div>
            <div className="overflow-auto rounded-md border bg-background p-4">
              <svg width="980" height={Math.max(320, data.nodes.length * 90)} viewBox={`0 0 980 ${Math.max(320, data.nodes.length * 90)}`} className="max-w-full">
                {data.edges.map((edge, index) => {
                  const fromIndex = Math.max(0, data.nodes.findIndex((node) => node.id === edge.fromSubjectId));
                  const toIndex = Math.max(0, data.nodes.findIndex((node) => node.id === edge.toSubjectId));
                  const x1 = 200;
                  const x2 = 760;
                  const y1 = 70 + fromIndex * 90;
                  const y2 = 70 + toIndex * 90;
                  return <line key={edge.id} x1={x1} y1={y1} x2={x2} y2={y2} stroke={edge.strength === "HARD" ? "#dc2626" : "#2563eb"} strokeWidth="2" opacity="0.5" />;
                })}
                {data.nodes.map((node, index) => {
                  const x = index % 2 === 0 ? 160 : 820;
                  const y = 70 + index * 90;
                  return (
                    <g key={node.id}>
                      <rect x={x - 110} y={y - 24} rx="14" ry="14" width="220" height="48" fill="#ffffff" stroke="#d1d5db" />
                      <text x={x} y={y - 2} textAnchor="middle" fontSize="12" fill="#111827">{node.title.slice(0, 28)}</text>
                      <text x={x} y={y + 14} textAnchor="middle" fontSize="10" fill="#6b7280">{node.type.toLowerCase()} · {node.status.toLowerCase()}</text>
                    </g>
                  );
                })}
              </svg>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {data.edges.map((edge) => (
                <div key={edge.id} className="rounded-md border p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{edge.edgeType.toLowerCase()}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{edge.strength.toLowerCase()}</span>
                      <button onClick={() => removeDependency(edge.id)} className="text-xs text-red-600 hover:underline">Remove</button>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{edge.fromSubjectId} {"->"} {edge.toSubjectId}</p>
                  {edge.reason ? <p className="mt-2 text-xs text-muted-foreground">{edge.reason}</p> : null}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
