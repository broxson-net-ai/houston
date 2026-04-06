"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Nav } from "@/components/nav";

type ApprovalRequestDetail = {
  id: string;
  domain: string;
  subjectType: string;
  subjectId: string;
  trigger: string;
  reason: string;
  status: string;
  requestedAt: string;
  decisions?: Array<{ id: string; decision: string; decisionMode: string; createdAt: string; reason?: string | null }>;
  bindings?: Array<{ id: string; bindingType: string; subjectType: string; subjectId: string }>;
  requestedByRun?: {
    id: string;
    status: string;
    project?: { slug: string; title: string } | null;
    workItem?: { id: string; title: string } | null;
    approvalEnvelope?: {
      capabilityPolicyJson?: {
        capabilities?: Record<string, string>;
        matchExplanation?: Record<string, Array<Record<string, unknown>>>;
      };
    } | null;
  } | null;
};

type ApprovalExplanation = {
  request: ApprovalRequestDetail;
  explanation: Array<Record<string, unknown>>;
  resolvedDecision: string | null;
};

export default function ApprovalDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [request, setRequest] = useState<ApprovalRequestDetail | null>(null);
  const [explanation, setExplanation] = useState<ApprovalExplanation | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    fetch(`/api/v1/approvals/${id}/explain`, { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load approval request");
        return res.json();
      })
      .then((data) => {
        setExplanation(data.data);
        setRequest(data.data.request);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load approval request"));
  }, [id]);

  const trace = useMemo(() => {
    return explanation?.explanation ?? [];
  }, [explanation]);

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <div className="mx-auto max-w-5xl px-6 py-10 space-y-6">
        {!request ? (
          <div className="text-sm text-muted-foreground">{error || "Loading approval request..."}</div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Approval Request</p>
              <h1 className="text-3xl font-bold">{request.trigger}</h1>
                <p className="text-sm text-muted-foreground">{request.status.toLowerCase()} - {request.domain.toLowerCase()}{explanation?.resolvedDecision ? ` - resolved as ${explanation.resolvedDecision.toLowerCase()}` : ""}</p>
              </div>
              <div className="flex gap-2">
                <a href="/approvals" className="rounded-md border px-3 py-2 text-sm">Approvals</a>
                {request.requestedByRun ? <a href={`/runs/${request.requestedByRun.id}`} className="rounded-md border px-3 py-2 text-sm">Execution Run</a> : null}
              </div>
            </div>

            <div className="rounded-lg border bg-card p-5 space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground">Request</h2>
              <p className="text-sm">{request.reason}</p>
              <p className="text-xs text-muted-foreground">Requested {new Date(request.requestedAt).toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Subject: {request.subjectType} {request.subjectId}</p>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-lg border bg-card p-5 space-y-3">
                <h2 className="text-sm font-semibold text-muted-foreground">Policy Resolution Trace</h2>
                {trace.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No policy trace available.</p>
                ) : (
                  <div className="space-y-2">
                    {trace.map((match, index) => (
                      <div key={index} className="rounded-md border p-3 text-sm">
                        <p className="font-medium">Policy {String(match.policyId ?? "unknown")}</p>
                        <p className="text-xs text-muted-foreground">
                          decision {String(match.decisionRule ?? "").toLowerCase()} - priority {String(match.priority ?? "?")}
                        </p>
                        <pre className="mt-2 whitespace-pre-wrap rounded bg-muted p-2 text-xs">{JSON.stringify(match, null, 2)}</pre>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="rounded-lg border bg-card p-5 space-y-3">
                <h2 className="text-sm font-semibold text-muted-foreground">Decision History</h2>
                {(request.decisions ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No decisions recorded.</p>
                ) : (
                  <div className="space-y-2">
                    {(request.decisions ?? []).map((decision) => (
                      <div key={decision.id} className="rounded-md border p-3 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{decision.decision.toLowerCase()}</span>
                          <span className="text-xs text-muted-foreground">{new Date(decision.createdAt).toLocaleString()}</span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">Mode: {decision.decisionMode}</p>
                        {decision.reason ? <p className="mt-2 text-xs text-muted-foreground">{decision.reason}</p> : null}
                      </div>
                    ))}
                  </div>
                )}
                {(request.bindings ?? []).length ? (
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold text-muted-foreground">Bindings</h3>
                    {(request.bindings ?? []).map((binding) => (
                      <div key={binding.id} className="rounded-md border p-3 text-sm">
                        {binding.bindingType.toLowerCase()} - {binding.subjectType} {binding.subjectId}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
