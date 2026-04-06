"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Nav } from "@/components/nav";

type RunEvent = {
  id: string;
  eventType: string;
  message?: string | null;
  payload?: Record<string, unknown> | null;
  occurredAt: string;
};

type ApprovalEnvelope = {
  trustMode: string;
  capabilityPolicyJson: {
    capabilities?: Record<string, string>;
    matchExplanation?: Record<string, Array<Record<string, unknown>>>;
  };
};

type RunDetail = {
  id: string;
  status: string;
  attemptNumber: number;
  assembledInstructionsSnapshot: string;
  createdAt: string;
  updatedAt: string;
  errorText?: string | null;
  project?: { id: string; slug: string; title: string } | null;
  phase?: { id: string; title: string } | null;
  workItem?: { id: string; title: string; status: string; type: string } | null;
  approvalEnvelope?: ApprovalEnvelope | null;
  events: RunEvent[];
};

function getPilotHistoricalFailureNote(run: RunDetail) {
  const title = run.workItem?.title ?? "";
  const errorText = run.errorText ?? "";
  const isPilot = title.startsWith("Run recurring ");
  if (!isPilot) return null;

  const knownBringUpFailure =
    errorText.includes("before /report route was live") ||
    errorText.includes("Manual verification run exceeded CLI tool timeout") ||
    errorText.includes("rollout timeout");

  if (!knownBringUpFailure) return null;
  return "This failure came from early pilot bring-up while the runtime/reporting flow was being stabilized. Check the latest run for the current health signal.";
}

export default function RunDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [run, setRun] = useState<RunDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    fetch(`/api/v1/execution-runs/${id}`, { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load execution run");
        return res.json();
      })
      .then((data) => setRun(data.data))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load execution run"));
  }, [id]);

  const policyEntries = useMemo(
    () => Object.entries(run?.approvalEnvelope?.capabilityPolicyJson?.capabilities ?? {}),
    [run?.approvalEnvelope?.capabilityPolicyJson]
  );
  const pilotHistoricalFailureNote = run ? getPilotHistoricalFailureNote(run) : null;
  const latestResultPreview = useMemo(() => {
    if (!run) return null;
    const terminalEvent = [...run.events].reverse().find((event) => event.eventType === "COMPLETED" || event.eventType === "FAILED");
    const payload = (terminalEvent?.payload ?? {}) as Record<string, unknown>;
    const stdoutPreview = typeof payload.stdoutPreview === "string" ? payload.stdoutPreview.trim() : "";
    const stderrPreview = typeof payload.stderrPreview === "string" ? payload.stderrPreview.trim() : "";
    if (stdoutPreview) return { label: "stdout preview", value: stdoutPreview };
    if (stderrPreview) return { label: "stderr preview", value: stderrPreview };
    if (run.errorText) return { label: "error", value: run.errorText };
    return null;
  }, [run]);

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <div className="mx-auto max-w-6xl px-6 py-10 space-y-6">
        {!run ? (
          <div className="text-sm text-muted-foreground">{error || "Loading execution run..."}</div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Execution Run</p>
                <h1 className="text-3xl font-bold">{run.workItem?.title ?? run.id}</h1>
                <p className="text-sm text-muted-foreground">
                  {run.status.toLowerCase()} - attempt {run.attemptNumber}
                </p>
              </div>
              <div className="flex gap-2">
                <a href="/board" className="rounded-md border px-3 py-2 text-sm">Board</a>
                {run.project ? <a href={`/projects/${run.project.slug}`} className="rounded-md border px-3 py-2 text-sm">Project</a> : null}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
              <div className="rounded-lg border bg-card p-4">
                <p className="text-xs text-muted-foreground">Project</p>
                <p className="text-sm font-medium">{run.project?.title ?? "-"}</p>
              </div>
              <div className="rounded-lg border bg-card p-4">
                <p className="text-xs text-muted-foreground">Phase</p>
                <p className="text-sm font-medium">{run.phase?.title ?? "-"}</p>
              </div>
              <div className="rounded-lg border bg-card p-4">
                <p className="text-xs text-muted-foreground">Trust Mode</p>
                <p className="text-sm font-medium">{run.approvalEnvelope?.trustMode?.toLowerCase() ?? "-"}</p>
              </div>
              <div className="rounded-lg border bg-card p-4">
                <p className="text-xs text-muted-foreground">Updated</p>
                <p className="text-sm font-medium">{new Date(run.updatedAt).toLocaleString()}</p>
              </div>
            </div>

            {run.errorText ? (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{run.errorText}</div>
            ) : null}

            {pilotHistoricalFailureNote ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{pilotHistoricalFailureNote}</div>
            ) : null}

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-lg border bg-card p-5 space-y-3">
                <h2 className="text-sm font-semibold text-muted-foreground">Instructions Snapshot</h2>
                <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs">
                  {run.assembledInstructionsSnapshot}
                </pre>
              </div>
              <div className="rounded-lg border bg-card p-5 space-y-3">
                <h2 className="text-sm font-semibold text-muted-foreground">Capability Policy</h2>
                {policyEntries.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No capability policy entries.</p>
                ) : (
                  <div className="space-y-2">
                    {policyEntries.map(([capability, decision]) => (
                      <div key={capability} className="rounded-md border px-3 py-2 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <span>{capability}</span>
                          <span className="text-muted-foreground">{String(decision).toLowerCase()}</span>
                        </div>
                        {(run.approvalEnvelope?.capabilityPolicyJson?.matchExplanation?.[capability] ?? []).length ? (
                          <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                            {(run.approvalEnvelope?.capabilityPolicyJson?.matchExplanation?.[capability] ?? []).map((match, index) => (
                              <div key={`${capability}-${index}`}>
                                policy {String(match.policyId ?? "unknown")} - {String(match.decisionRule ?? "").toLowerCase()} - priority {String(match.priority ?? "?")}
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {latestResultPreview ? (
              <div className="rounded-lg border bg-card p-5 space-y-3">
                <h2 className="text-sm font-semibold text-muted-foreground">Latest Result Preview</h2>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{latestResultPreview.label}</p>
                <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs">
                  {latestResultPreview.value}
                </pre>
              </div>
            ) : null}

            <div className="rounded-lg border bg-card p-5 space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground">Timeline</h2>
              {run.events.length === 0 ? (
                <p className="text-sm text-muted-foreground">No run events recorded.</p>
              ) : (
                <div className="space-y-3">
                  {run.events.map((event) => (
                    <div key={event.id} className="flex gap-3 text-sm">
                      <div className="mt-1 h-2 w-2 rounded-full bg-primary" />
                      <div className="flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium">{event.eventType}</p>
                          <p className="text-xs text-muted-foreground">{new Date(event.occurredAt).toLocaleString()}</p>
                        </div>
                        {event.message ? <p className="text-muted-foreground">{event.message}</p> : null}
                        {event.payload ? (
                          <pre className="mt-2 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs">
                            {JSON.stringify(event.payload, null, 2)}
                          </pre>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
