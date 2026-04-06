"use client";

import { useEffect, useMemo, useState } from "react";
import { Nav } from "@/components/nav";

type ApprovalPolicy = {
  id: string;
  domain: string;
  capabilityKey?: string | null;
  decisionRule: string;
  requiresRole?: string | null;
  priority: number;
  projectId?: string | null;
  phaseId?: string | null;
  workItemType?: string | null;
  autonomyLevel?: string | null;
  riskLevel?: string | null;
  dataClass?: string | null;
};

type ApprovalRequest = {
  id: string;
  domain: string;
  subjectType: string;
  subjectId: string;
  trigger: string;
  reason: string;
  status: string;
  requestedAt: string;
  decisions?: Array<{ id: string; decision: string; decisionMode: string; createdAt: string; reason?: string | null }>;
  bindings?: Array<{ id: string; bindingType: string }>;
};

const DECISION_RULES = ["ALLOW", "DENY", "APPROVAL_REQUIRED", "AUTO_RESOLVE_IF_POLICY_MATCH"] as const;

export default function ApprovalsPage() {
  const [policies, setPolicies] = useState<ApprovalPolicy[]>([]);
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [filter, setFilter] = useState("PENDING");
  const [error, setError] = useState("");
  const [editingPolicyId, setEditingPolicyId] = useState<string | null>(null);
  const [form, setForm] = useState({
    domain: "ACTION",
    capabilityKey: "",
    decisionRule: "APPROVAL_REQUIRED",
    requiresRole: "",
    priority: 100,
    workItemType: "",
    riskLevel: "",
    autonomyLevel: "",
  });

  async function load() {
    setError("");
    try {
      const [policyRes, requestRes] = await Promise.all([
        fetch("/api/v1/approvals/policies", { credentials: "include" }),
        fetch(`/api/v1/approvals?status=${encodeURIComponent(filter)}`, { credentials: "include" }),
      ]);
      const [policyData, requestData] = await Promise.all([policyRes.json(), requestRes.json()]);
      setPolicies(policyData.data ?? []);
      setRequests(requestData.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load approvals");
    }
  }

  useEffect(() => {
    load();
  }, [filter]);

  const pendingCount = useMemo(() => requests.filter((item) => item.status === "PENDING").length, [requests]);

  async function createPolicy() {
    setError("");
    const res = await fetch("/api/v1/approvals/policies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        domain: form.domain,
        capabilityKey: form.capabilityKey || undefined,
        decisionRule: form.decisionRule,
        requiresRole: form.requiresRole || undefined,
        priority: form.priority,
        workItemType: form.workItemType || undefined,
        riskLevel: form.riskLevel || undefined,
        autonomyLevel: form.autonomyLevel || undefined,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to create policy");
      return;
    }
    setForm((current) => ({ ...current, capabilityKey: "", requiresRole: "" }));
    await load();
  }

  async function updatePolicy(id: string, updates: Record<string, unknown>) {
    const res = await fetch(`/api/v1/approvals/policies/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to update policy");
      return;
    }
    await load();
  }

  async function decide(id: string, decision: "APPROVED" | "DENIED") {
    const res = await fetch(`/api/v1/approvals/${id}/decide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        decision,
        decisionMode: "manual",
        decidedBy: "houston-ui",
        bindingType: decision === "APPROVED" ? "ALLOWS_ACTION" : undefined,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to decide approval");
      return;
    }
    await load();
  }

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <div className="mx-auto max-w-7xl px-6 py-10 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Approvals</h1>
            <p className="text-sm text-muted-foreground">Manage approval policies and review runtime approval requests.</p>
          </div>
          <div className="rounded-lg border bg-card px-4 py-3 text-sm">
            Pending requests: <span className="font-semibold">{pendingCount}</span>
          </div>
        </div>

        {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

        <div className="grid gap-6 xl:grid-cols-[1.2fr_1.8fr]">
          <div className="rounded-xl border bg-card p-5 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground">Policy Authoring</h2>
              <p className="mt-1 text-sm text-muted-foreground">Create declarative approval policies for action and workflow decisions.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <select className="rounded-md border bg-background px-3 py-2 text-sm" value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })}>
                <option value="ACTION">ACTION</option>
                <option value="WORKFLOW">WORKFLOW</option>
              </select>
              <select className="rounded-md border bg-background px-3 py-2 text-sm" value={form.decisionRule} onChange={(e) => setForm({ ...form, decisionRule: e.target.value })}>
                {DECISION_RULES.map((rule) => <option key={rule} value={rule}>{rule}</option>)}
              </select>
              <input className="rounded-md border bg-background px-3 py-2 text-sm" placeholder="Capability key" value={form.capabilityKey} onChange={(e) => setForm({ ...form, capabilityKey: e.target.value })} />
              <input className="rounded-md border bg-background px-3 py-2 text-sm" placeholder="Required role" value={form.requiresRole} onChange={(e) => setForm({ ...form, requiresRole: e.target.value })} />
              <input className="rounded-md border bg-background px-3 py-2 text-sm" placeholder="Work item type" value={form.workItemType} onChange={(e) => setForm({ ...form, workItemType: e.target.value })} />
              <input className="rounded-md border bg-background px-3 py-2 text-sm" placeholder="Risk level" value={form.riskLevel} onChange={(e) => setForm({ ...form, riskLevel: e.target.value })} />
              <input className="rounded-md border bg-background px-3 py-2 text-sm" placeholder="Autonomy level" value={form.autonomyLevel} onChange={(e) => setForm({ ...form, autonomyLevel: e.target.value })} />
              <input className="rounded-md border bg-background px-3 py-2 text-sm" type="number" placeholder="Priority" value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) || 100 })} />
            </div>
            <button onClick={createPolicy} className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">Create policy</button>

            <div className="space-y-3">
              {policies.map((policy) => (
                <div key={policy.id} className="rounded-md border p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">{policy.capabilityKey || policy.domain}</span>
                    <span className="text-xs text-muted-foreground">priority {policy.priority}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {policy.domain.toLowerCase()} - {policy.decisionRule.toLowerCase()}
                    {policy.requiresRole ? ` - role ${policy.requiresRole}` : ""}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => {
                        setEditingPolicyId(policy.id);
                        setForm({
                          domain: policy.domain,
                          capabilityKey: policy.capabilityKey ?? "",
                          decisionRule: policy.decisionRule,
                          requiresRole: policy.requiresRole ?? "",
                          priority: policy.priority,
                          workItemType: policy.workItemType ?? "",
                          riskLevel: policy.riskLevel ?? "",
                          autonomyLevel: policy.autonomyLevel ?? "",
                        });
                      }}
                      className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
                    >
                      Edit form
                    </button>
                    <button
                      onClick={() => updatePolicy(policy.id, { isActive: false })}
                      className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
                    >
                      Deactivate
                    </button>
                  </div>
                </div>
              ))}
              {policies.length === 0 ? <p className="text-sm text-muted-foreground">No policies configured.</p> : null}
            </div>
          </div>

          <div className="rounded-xl border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-muted-foreground">Approval Requests</h2>
                <p className="mt-1 text-sm text-muted-foreground">Review approval requests generated by workflow and runtime gates.</p>
              </div>
              <select className="rounded-md border bg-background px-3 py-2 text-sm" value={filter} onChange={(e) => setFilter(e.target.value)}>
                <option value="PENDING">PENDING</option>
                <option value="APPROVED">APPROVED</option>
                <option value="DENIED">DENIED</option>
                <option value="REVISED">REVISED</option>
              </select>
            </div>
            <div className="space-y-3">
              {requests.map((request) => (
                <div key={request.id} className="rounded-md border p-4 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <a href={`/approvals/${request.id}`} className="font-medium hover:underline">{request.trigger}</a>
                      <p className="text-xs text-muted-foreground">{request.domain.toLowerCase()} - {request.subjectType} {request.subjectId}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">{request.status.toLowerCase()}</span>
                  </div>
                  <p className="mt-2">{request.reason}</p>
                  <p className="mt-2 text-xs text-muted-foreground">Requested {new Date(request.requestedAt).toLocaleString()}</p>
                  {request.decisions?.[0] ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Latest decision: {request.decisions[0].decision.toLowerCase()} via {request.decisions[0].decisionMode}
                    </p>
                  ) : null}
                  {request.bindings?.length ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Bindings: {request.bindings.map((binding) => binding.bindingType.toLowerCase()).join(", ")}
                    </p>
                  ) : null}
                  {request.status === "PENDING" ? (
                    <div className="mt-3 flex gap-2">
                      <button onClick={() => decide(request.id, "APPROVED")} className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs text-white">Approve</button>
                      <button onClick={() => decide(request.id, "DENIED")} className="rounded-md bg-red-600 px-3 py-1.5 text-xs text-white">Deny</button>
                    </div>
                  ) : null}
                </div>
              ))}
              {requests.length === 0 ? <p className="text-sm text-muted-foreground">No approval requests for this filter.</p> : null}
            </div>
          </div>
        </div>
        {editingPolicyId ? (
          <div className="rounded-xl border bg-card p-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-muted-foreground">Edit Policy</h2>
              <button className="rounded-md border px-3 py-1.5 text-xs" onClick={() => setEditingPolicyId(null)}>
                Close
              </button>
            </div>
            <button
              onClick={async () => {
                await updatePolicy(editingPolicyId, {
                  domain: form.domain,
                  capabilityKey: form.capabilityKey || undefined,
                  decisionRule: form.decisionRule,
                  requiresRole: form.requiresRole || undefined,
                  priority: form.priority,
                  workItemType: form.workItemType || undefined,
                  riskLevel: form.riskLevel || undefined,
                  autonomyLevel: form.autonomyLevel || undefined,
                  isActive: true,
                });
                setEditingPolicyId(null);
              }}
              className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
            >
              Save policy changes
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
