"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Nav } from "@/components/nav";

type Finding = {
  id: string;
  claimType: string;
  claimText: string;
  result: string;
  proposedNextAction?: string | null;
  resolutionNotes?: string | null;
};

type Audit = {
  id: string;
  status: string;
  summary?: string | null;
  project?: { id: string; slug: string; title: string } | null;
  findings: Finding[];
  createdAt: string;
};

const RESULT_OPTIONS = ["VERIFIED_TRUE", "VERIFIED_FALSE", "UNCLEAR", "NEEDS_HUMAN_REVIEW"] as const;

export default function AuditDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [audit, setAudit] = useState<Audit | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function load() {
    setError("");
    const res = await fetch(`/api/v1/reality-audits/${id}`, { credentials: "include" });
    if (!res.ok) {
      setError("Failed to load audit");
      return;
    }
    const data = await res.json();
    setAudit(data.data);
  }

  useEffect(() => {
    if (id) load();
  }, [id]);

  const grouped = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const finding of audit?.findings ?? []) {
      counts[finding.result] = (counts[finding.result] ?? 0) + 1;
    }
    return counts;
  }, [audit]);

  async function updateFinding(findingId: string, payload: Partial<Finding>) {
    setSavingId(findingId);
    setError("");
    const res = await fetch(`/api/v1/reality-audits/findings/${findingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to update finding");
      setSavingId(null);
      return;
    }
    await load();
    setSavingId(null);
  }

  async function acceptAudit() {
    const res = await fetch(`/api/v1/reality-audits/${id}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ acceptedBy: "houston-ui" }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to accept audit");
      return;
    }
    await load();
  }

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <div className="mx-auto max-w-6xl px-6 py-10 space-y-6">
        {!audit ? (
          <div className="text-sm text-muted-foreground">Loading audit...</div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Reality Audit</p>
                <h1 className="text-3xl font-bold">{audit.project?.title ?? audit.id}</h1>
                <p className="text-sm text-muted-foreground">
                  {audit.status.toLowerCase()} - {new Date(audit.createdAt).toLocaleString()}
                </p>
              </div>
              <div className="flex gap-2">
                <a href="/projects" className="rounded-md border px-3 py-2 text-sm">Projects</a>
                <button onClick={acceptAudit} className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">
                  Accept Audit
                </button>
              </div>
            </div>

            {audit.summary ? <div className="rounded-lg border bg-card p-4 text-sm">{audit.summary}</div> : null}
            {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

            <div className="grid gap-4 md:grid-cols-4">
              {RESULT_OPTIONS.map((result) => (
                <div key={result} className="rounded-lg border bg-card p-4">
                  <p className="text-xs text-muted-foreground">{result.toLowerCase()}</p>
                  <p className="text-2xl font-semibold">{grouped[result] ?? 0}</p>
                </div>
              ))}
            </div>

            <div className="space-y-4">
              {audit.findings.map((finding) => (
                <div key={finding.id} className="rounded-lg border bg-card p-5 space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">{finding.claimType}</p>
                      <h2 className="font-semibold">{finding.claimText}</h2>
                    </div>
                    <select
                      className="rounded-md border bg-background px-3 py-2 text-sm"
                      value={finding.result}
                      onChange={(event) => updateFinding(finding.id, { result: event.target.value })}
                      disabled={savingId === finding.id}
                    >
                      {RESULT_OPTIONS.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </div>
                  <textarea
                    className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm"
                    defaultValue={finding.resolutionNotes ?? ""}
                    placeholder="Resolution notes"
                    onBlur={(event) => updateFinding(finding.id, { resolutionNotes: event.target.value })}
                  />
                  <input
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    defaultValue={finding.proposedNextAction ?? ""}
                    placeholder="Proposed next action"
                    onBlur={(event) => updateFinding(finding.id, { proposedNextAction: event.target.value })}
                  />
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
