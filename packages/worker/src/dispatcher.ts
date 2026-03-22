import { db, TaskStatus, TaskRunStatus } from "@houston/shared";
import { createHash } from "crypto";
import { v4 as uuidv4 } from "uuid";
import { GatewayClient } from "./gateway.js";

type ApprovalTrigger =
  | "external-send"
  | "destructive-op"
  | "production-change"
  | "service-restart"
  | "config-change"
  | "calendar-write"
  | "contact-write"
  | "record-write"
  | "workflow-side-effect";

type TrustMode = "always" | "once-per-session" | "once-ever" | "auto";

function parsePositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

const GATEWAY_RETRY_MAX_ATTEMPTS = parsePositiveIntEnv("HOUSTON_GATEWAY_RETRY_MAX_ATTEMPTS", 3);
const GATEWAY_RETRY_BASE_DELAY_MS = parsePositiveIntEnv("HOUSTON_GATEWAY_RETRY_BASE_DELAY_MS", 500);
const GATEWAY_RETRY_MAX_DELAY_MS = parsePositiveIntEnv("HOUSTON_GATEWAY_RETRY_MAX_DELAY_MS", 8_000);

function deriveRoleFromRoutingKey(routingKey: string): string {
  const m = String(routingKey || "").match(/^agent:([^:]+):/i);
  return (m?.[1] || "main").toLowerCase();
}

function detectApprovalTrigger(role: string, instructions: string): ApprovalTrigger | null {
  const text = instructions.toLowerCase();

  if (role === "exec-assistant") {
    if (/\b(send|email|post|publish|webhook|notify|message\s+to)\b/.test(text)) return "external-send";
    if (/\b(calendar|meeting|event|reschedul|invite)\b/.test(text) && /\b(create|update|delete|move|reschedul)\b/.test(text)) return "calendar-write";
    if (/\b(contact|address book)\b/.test(text) && /\b(create|update|delete|write)\b/.test(text)) return "contact-write";
    return null;
  }

  if (role === "ops-agent") {
    if (/\b(rm\s+-rf|delete|wipe|reset|truncate|drop table|force push)\b/.test(text)) return "destructive-op";
    if (/\b(restart|reboot|systemctl\s+restart|pm2\s+restart|docker\s+restart)\b/.test(text)) return "service-restart";
    if (/\b(config|environment variable|env file|nginx conf|systemd unit)\b/.test(text) && /\b(change|edit|update|write)\b/.test(text)) return "config-change";
    return null;
  }

  if (role === "biz-ops-agent") {
    if (/\b(send|email|post|publish|notify|message\s+to)\b/.test(text)) return "external-send";
    if (/\b(crm|record|database row|sheet row|entry)\b/.test(text) && /\b(create|update|delete|write|insert)\b/.test(text)) return "record-write";
    if (/\b(trigger|fire|invoke|run workflow|automate)\b/.test(text)) return "workflow-side-effect";
    return null;
  }

  return null;
}

function triggerSeverity(trigger: ApprovalTrigger): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
  if (trigger === "destructive-op" || trigger === "production-change") return "CRITICAL";
  if (trigger === "external-send" || trigger === "service-restart" || trigger === "config-change") return "HIGH";
  return "MEDIUM";
}

function normalizeTrustMode(value: unknown): TrustMode | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "always" ||
    normalized === "once-per-session" ||
    normalized === "once-ever" ||
    normalized === "auto"
  ) {
    return normalized;
  }
  return null;
}

function parseTrustModeConfig(): Record<string, TrustMode> {
  const raw = process.env.HOUSTON_APPROVAL_TRUST_MODES;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, TrustMode> = {};
    for (const [key, value] of Object.entries(parsed)) {
      const mode = normalizeTrustMode(value);
      if (mode) out[key] = mode;
    }
    return out;
  } catch {
    console.warn("[dispatcher] Invalid HOUSTON_APPROVAL_TRUST_MODES JSON; using defaults");
    return {};
  }
}

function resolveTrustMode(role: string, trigger: ApprovalTrigger): TrustMode {
  const trustModeConfig = parseTrustModeConfig();
  const trustModeDefault: TrustMode =
    normalizeTrustMode(process.env.HOUSTON_APPROVAL_TRUST_DEFAULT) ?? "always";

  const exact = trustModeConfig[`${role}.${trigger}`];
  if (exact) return exact;

  const roleWildcard = trustModeConfig[`${role}.*`];
  if (roleWildcard) return roleWildcard;

  const triggerWildcard = trustModeConfig[`*.${trigger}`];
  if (triggerWildcard) return triggerWildcard;

  return trustModeConfig.default ?? trustModeDefault;
}

function extractApprovalIntentText(assembled: string): string {
  const sectionContent = new Map<string, string[]>();
  let currentSection = "BODY";
  sectionContent.set(currentSection, []);

  for (const line of assembled.split(/\r?\n/)) {
    const marker = line.match(/^===\s+(.+?)\s+===$/);
    if (marker) {
      currentSection = marker[1].trim().toUpperCase();
      if (!sectionContent.has(currentSection)) sectionContent.set(currentSection, []);
      continue;
    }
    sectionContent.get(currentSection)?.push(line);
  }

  const selected = ["TASK INSTRUCTIONS", "OVERRIDE", "REVISION"]
    .map((key) => (sectionContent.get(key) || []).join("\n").trim())
    .filter(Boolean);

  return selected.length > 0 ? selected.join("\n\n") : assembled;
}

function canonicalizeIntentText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function approvalPattern(role: string, trigger: ApprovalTrigger, assembled: string): string {
  const canonical = canonicalizeIntentText(extractApprovalIntentText(assembled));
  return createHash("sha256").update(`v2|${role}|${trigger}|${canonical}`).digest("hex").slice(0, 16);
}

function intentSignature(trigger: ApprovalTrigger, assembled: string): string {
  const canonical = canonicalizeIntentText(extractApprovalIntentText(assembled));
  return createHash("sha256").update(`v1|${trigger}|${canonical}`).digest("hex").slice(0, 16);
}

function parseContextObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function isNonRetriableGatewayError(errorText: string): boolean {
  return /\b(unauthorized|forbidden|invalid token|invalid auth|authentication failed|connect\.challenge missing nonce|invalid device identity)\b/i.test(
    errorText
  );
}

function isRetriableGatewayError(errorText: string): boolean {
  if (!errorText) return false;
  if (isNonRetriableGatewayError(errorText)) return false;
  return /\b(timeout|timed out|gateway not connected|gateway disconnected|closed before connect|econnreset|econnrefused|etimedout|network|socket hang up)\b/i.test(
    errorText
  );
}

function computeRetryDelayMs(attempt: number): number {
  const exp = Math.min(
    GATEWAY_RETRY_BASE_DELAY_MS * Math.pow(2, Math.max(0, attempt - 1)),
    GATEWAY_RETRY_MAX_DELAY_MS
  );
  const jitter = Math.floor(Math.random() * Math.max(250, Math.floor(exp * 0.2)));
  return Math.min(GATEWAY_RETRY_MAX_DELAY_MS, exp + jitter);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export type DispatchJobData = {
  scheduleId: string;
  dueAt: string; // ISO string
};

export type DispatchTaskJobData = {
  taskId: string;
  reason?: string;
};

export class DispatchService {
  constructor(private gatewayClient?: GatewayClient) {}

  private extractLane(value: string | null | undefined): string | null {
    if (!value) return null;
    const m = value.match(/\bLane:\s*([A-E])\b/i);
    return m?.[1]?.toUpperCase() ?? null;
  }

  private async writeApprovalAuditEvent(args: {
    requestId: string;
    taskRunId?: string | null;
    taskId?: string | null;
    projectId?: string | null;
    lane?: string | null;
    role: string;
    trigger: string;
    severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    decision: "REQUESTED" | "APPROVED" | "DENIED" | "REVISED" | "EXPIRED" | "CANCELLED" | "EXECUTED";
    decisionPath: "MANUAL" | "POLICY_AUTO" | "SYSTEM";
    deciderType: string;
    deciderId?: string | null;
    autonomyTier?: string | null;
    dataClass?: string | null;
    summary: string;
    evidenceRefs?: Record<string, unknown> | null;
    decidedAt?: Date | null;
    createdAt?: Date | null;
    meta?: Record<string, unknown> | null;
  }): Promise<void> {
    try {
      const latencyMs =
        args.decidedAt && args.createdAt
          ? Math.max(0, args.decidedAt.getTime() - args.createdAt.getTime())
          : null;

      await db.approvalAuditEvent.create({
        data: {
          eventId: uuidv4(),
          requestId: args.requestId,
          taskRunId: args.taskRunId ?? null,
          taskId: args.taskId ?? null,
          projectId: args.projectId ?? null,
          lane: args.lane ?? null,
          role: args.role,
          trigger: args.trigger,
          severity: args.severity,
          decision: args.decision,
          decisionPath: args.decisionPath,
          deciderType: args.deciderType,
          deciderId: args.deciderId ?? null,
          autonomyTier: args.autonomyTier ?? null,
          dataClass: args.dataClass ?? null,
          summary: args.summary,
          evidenceRefs: (args.evidenceRefs as any) ?? undefined,
          decidedAt: args.decidedAt ?? null,
          latencyMs,
          meta: (args.meta as any) ?? undefined,
        },
      });
    } catch (error) {
      const errorText = error instanceof Error ? error.message : String(error);
      console.warn(`[dispatcher] Failed to write approval audit event: ${errorText}`);
      await db.systemStatus
        .upsert({
          where: { key: "approval_audit_last_write_error" },
          create: {
            key: "approval_audit_last_write_error",
            value: {
              at: new Date().toISOString(),
              requestId: args.requestId,
              taskRunId: args.taskRunId ?? null,
              error: errorText,
            },
          },
          update: {
            value: {
              at: new Date().toISOString(),
              requestId: args.requestId,
              taskRunId: args.taskRunId ?? null,
              error: errorText,
            },
          },
        })
        .catch(() => null);
    }
  }

  private async assembleTaskInstructions(task: {
    templateId: string | null;
    instructionsOverride: string | null;
  }): Promise<{ assembled: string; preVersion: string | null }> {
    if (task.templateId) {
      return this.assembleInstructions(task.templateId, task.instructionsOverride ?? null);
    }

    const activePreInstr = await db.preInstructionsVersion.findFirst({ where: { isActive: true } });
    const parts: string[] = [];

    if (activePreInstr) {
      parts.push("=== PRE-INSTRUCTIONS ===");
      parts.push(activePreInstr.content);
    }

    parts.push("=== TASK INSTRUCTIONS ===");
    parts.push(task.instructionsOverride?.trim() || "No template instructions provided.");

    return {
      assembled: parts.join("\n\n"),
      preVersion: activePreInstr?.id ?? null,
    };
  }

  private async dispatchTaskRunToGateway(args: {
    task: { id: string; scheduleId: string | null; agentId: string | null };
    taskRun: { id: string; idempotencyKey: string | null };
    agent: { routingKey: string };
    assembled: string;
    templateId: string;
  }): Promise<{ ok: true; runId: string | null } | { ok: false; errorText: string }> {
    const { task, taskRun, agent, assembled, templateId } = args;

    if (!this.gatewayClient?.isConnected()) {
      return { ok: false, errorText: "Gateway not connected" };
    }

    const idempotencyKey = taskRun.idempotencyKey ?? `taskrun:${taskRun.id}`;

    const requestPayload = {
      message: assembled,
      sessionKey: agent.routingKey,
      idempotencyKey,
      deliver: false,
      channel: "webchat",
      lane: "cron",
      timeout: 0,
    };

    for (let attempt = 1; attempt <= GATEWAY_RETRY_MAX_ATTEMPTS; attempt++) {
      try {
        const response = await this.gatewayClient.request(
          "agent",
          requestPayload,
          idempotencyKey
        ) as Record<string, unknown>;

        const gatewayRunId = (response?.runId as string) ?? null;

        await db.taskRun.update({
          where: { id: taskRun.id },
          data: {
            wsRequestId: taskRun.id,
            gatewayRunId,
            requestPayload: requestPayload as object,
            responsePayload: response as object,
            status: TaskRunStatus.ACCEPTED,
          },
        });

        await db.taskEvent.create({
          data: {
            taskId: task.id,
            taskRunId: taskRun.id,
            scheduleId: task.scheduleId,
            type: "DISPATCHED",
            message: `Dispatched to agent ${agent.routingKey}`,
            metadata: { gatewayRunId, templateId },
          },
        });

        return { ok: true, runId: gatewayRunId };
      } catch (err) {
        const errorText = err instanceof Error ? err.message : String(err);
        const retriable = isRetriableGatewayError(errorText);
        const lastAttempt = attempt >= GATEWAY_RETRY_MAX_ATTEMPTS;

        if (!retriable || lastAttempt) {
          const classification = retriable ? "retriable-final" : "non-retriable";
          console.error(
            `[dispatcher] Gateway dispatch failed (${classification}) ` +
              `(attempt ${attempt}/${GATEWAY_RETRY_MAX_ATTEMPTS}, taskRunId: ${taskRun.id}): ${errorText}`
          );
          return { ok: false, errorText };
        }

        const delayMs = computeRetryDelayMs(attempt);
        console.warn(
          `[dispatcher] Gateway dispatch retry scheduled ` +
            `(attempt ${attempt}/${GATEWAY_RETRY_MAX_ATTEMPTS}, delayMs=${delayMs}, taskRunId: ${taskRun.id}): ${errorText}`
        );
        await sleep(delayMs);
      }
    }

    return { ok: false, errorText: "Gateway dispatch failed: exhausted retry attempts" };
  }

  async assembleInstructions(
    templateId: string,
    instructionsOverride?: string | null
  ): Promise<{ assembled: string; preVersion: string | null }> {
    const [activePreInstr, template] = await Promise.all([
      db.preInstructionsVersion.findFirst({ where: { isActive: true } }),
      db.template.findUnique({ where: { id: templateId } }),
    ]);

    if (!template) {
      const errorText = `Template not found: ${templateId}`;
      console.error(`[dispatcher] ${errorText}`);
      throw new Error(errorText);
    }

    const parts: string[] = [];

    if (activePreInstr) {
      parts.push("=== PRE-INSTRUCTIONS ===");
      parts.push(activePreInstr.content);
    }

    parts.push("=== TASK INSTRUCTIONS ===");
    parts.push(template.instructions);

    if (instructionsOverride) {
      parts.push("=== OVERRIDE ===");
      parts.push(instructionsOverride);
    }

    return {
      assembled: parts.join("\n\n"),
      preVersion: activePreInstr?.id ?? null,
    };
  }

  async dispatch(data: DispatchJobData): Promise<void> {
    const { scheduleId, dueAt } = data;
    const dueAtDate = new Date(dueAt);

    const schedule = await db.schedule.findUnique({
      where: { id: scheduleId },
      include: { template: true },
    });

    if (!schedule) {
      const errorText = `Schedule not found: ${scheduleId}`;
      console.error(`[dispatcher] ${errorText}`);
      throw new Error(errorText);
    }
    if (!schedule.template) {
      const errorText = `Template not found for schedule: ${scheduleId}`;
      console.error(`[dispatcher] ${errorText}`);
      throw new Error(errorText);
    }

    const agentId = schedule.template.defaultAgentId;
    if (!agentId) {
      const errorText = "Template has no default agent";
      console.error(`[dispatcher] ${errorText} (scheduleId: ${scheduleId})`);
      throw new Error(errorText);
    }

    const agent = await db.agent.findUnique({ where: { id: agentId } });
    if (!agent) {
      const errorText = `Agent not found: ${agentId}`;
      console.error(`[dispatcher] ${errorText}`);
      throw new Error(errorText);
    }

    const { assembled, preVersion } = await this.assembleInstructions(
      schedule.templateId,
      null
    );

    const role = deriveRoleFromRoutingKey(agent.routingKey);
    const approvalTrigger = detectApprovalTrigger(role, assembled);
    const triggerMode = approvalTrigger ? resolveTrustMode(role, approvalTrigger) : null;
    const pattern = approvalTrigger ? approvalPattern(role, approvalTrigger, assembled) : null;
    const signature = approvalTrigger ? intentSignature(approvalTrigger, assembled) : null;

    // Idempotency key: scheduleId + dueAt
    const idempotencyKey = `dispatch:${scheduleId}:${dueAt}`;

    // Check for existing task (idempotency)
    const existingRun = await db.taskRun.findFirst({
      where: { idempotencyKey },
    });
    if (existingRun) {
      console.log(`[dispatcher] Skipping duplicate dispatch: ${idempotencyKey}`);
      return;
    }

    // Create Task
    const task = await db.task.create({
      data: {
        title: `${schedule.template.name} — ${dueAtDate.toISOString()}`,
        templateId: schedule.templateId,
        scheduleId,
        agentId,
        dueAt: dueAtDate,
        status: TaskStatus.QUEUE,
        assembledInstructionsSnapshot: assembled,
        preInstructionsVersion: preVersion ?? undefined,
      },
    });

    // Create TaskRun
    const taskRun = await db.taskRun.create({
      data: {
        taskId: task.id,
        attemptNumber: 1,
        status: TaskRunStatus.ACCEPTED,
        idempotencyKey,
        dispatchedAt: new Date(),
      },
    });

    // Create CREATED event
    await db.taskEvent.create({
      data: {
        taskId: task.id,
        scheduleId,
        type: "CREATED",
        message: `Task created for schedule ${scheduleId}`,
        metadata: { templateId: schedule.templateId },
      },
    });

    if (approvalTrigger) {
      let requiresApproval = true;

      if (triggerMode === "auto") {
        requiresApproval = false;
      } else if (triggerMode === "once-per-session" || triggerMode === "once-ever") {
        const approvedHistory = await db.approvalRequest.findMany({
          where: {
            decision: "APPROVED",
            role,
            trigger: approvalTrigger,
          },
          orderBy: { decidedAt: "desc" },
          take: 200,
        });

        const hasMatch = approvedHistory.some((item) => {
          const ctx = parseContextObject(item.context);
          const approvedPattern = typeof ctx.approvalPattern === "string" ? ctx.approvalPattern : null;
          const approvedSignature = typeof ctx.intentSignature === "string" ? ctx.intentSignature : null;
          if (approvedPattern !== pattern && approvedSignature !== signature) return false;
          if (triggerMode === "once-ever") return true;
          const approvedSessionId = typeof ctx.sessionId === "string" ? ctx.sessionId : null;
          return approvedSessionId === agent.routingKey;
        });

        requiresApproval = !hasMatch;
      }

      const requestId = `approval:${taskRun.id}:${approvalTrigger}`;
      const existingApproval = await db.approvalRequest.findUnique({ where: { requestId } });

      const baseApprovalData = {
        requestId,
        role,
        trigger: approvalTrigger,
        severity: triggerSeverity(approvalTrigger),
        intent: `Approval required before dispatching task ${task.id}`,
        target: agent.routingKey,
        risk: `Task instructions matched trigger '${approvalTrigger}' for role '${role}'.`,
        rollback: "Do not dispatch task until approved.",
        budget: {
          toolCallsUsed: 0,
          runtimeMinutes: 0,
          previousApprovalsThisTask: 0,
        },
        context: {
          taskId: task.id,
          projectId: task.projectId,
          sessionId: agent.routingKey,
          approvalPattern: pattern,
          intentSignature: signature,
          trustMode: triggerMode,
        },
        taskRunId: taskRun.id,
      };

      const approval = existingApproval
        ? existingApproval
        : await db.approvalRequest.create({
            data: requiresApproval
              ? baseApprovalData
              : {
                  ...baseApprovalData,
                  decision: "APPROVED",
                  decider: "policy:trust-ladder",
                  reason: `Auto-approved by trust mode '${triggerMode}'`,
                  outcome: "auto-approved inline; dispatched",
                  decidedAt: new Date(),
                },
          });

      if (!existingApproval) {
        await this.writeApprovalAuditEvent({
          requestId,
          taskRunId: taskRun.id,
          taskId: task.id,
          projectId: task.projectId,
          lane: this.extractLane(task.instructionsOverride ?? task.assembledInstructionsSnapshot),
          role,
          trigger: approvalTrigger,
          severity: triggerSeverity(approvalTrigger),
          decision: requiresApproval ? "REQUESTED" : "APPROVED",
          decisionPath: requiresApproval ? "SYSTEM" : "POLICY_AUTO",
          deciderType: requiresApproval ? "system:dispatcher" : "policy:trust-ladder",
          deciderId: requiresApproval ? null : "policy:trust-ladder",
          summary: requiresApproval
            ? `Approval requested for task ${task.id}`
            : `Approval auto-approved by trust mode '${triggerMode}' for task ${task.id}`,
          evidenceRefs: {
            trustMode: triggerMode,
            approvalPattern: pattern,
            intentSignature: signature,
          },
          decidedAt: requiresApproval ? null : approval.decidedAt,
          createdAt: approval.createdAt,
        });
      }

      if (!requiresApproval) {
        await db.taskEvent.create({
          data: {
            taskId: task.id,
            taskRunId: taskRun.id,
            scheduleId,
            type: "STATUS_CHANGED",
            message: `Approval auto-satisfied (${triggerMode}) before dispatch`,
            metadata: {
              approvalRequestId: approval.id,
              trigger: approvalTrigger,
              role,
              templateId: schedule.templateId,
              trustMode: triggerMode,
              approvalPattern: pattern,
              intentSignature: signature,
            },
          },
        });

        await db.taskRun.update({
          where: { id: taskRun.id },
          data: {
            responsePayload: {
              approvalPending: false,
              approvalAutoSatisfied: true,
              approvalRequestId: approval.id,
              trigger: approvalTrigger,
              trustMode: triggerMode,
              approvalPattern: pattern,
              intentSignature: signature,
            },
          },
        });
      }

      if (requiresApproval) {
        await db.taskEvent.create({
          data: {
            taskId: task.id,
            taskRunId: taskRun.id,
            scheduleId,
            type: "QUEUED",
            message: `Awaiting approval (${approvalTrigger}) before dispatch`,
            metadata: {
              approvalRequestId: approval.id,
              trigger: approvalTrigger,
              role,
              templateId: schedule.templateId,
              trustMode: triggerMode,
              approvalPattern: pattern,
              intentSignature: signature,
            },
          },
        });

        await db.taskRun.update({
          where: { id: taskRun.id },
          data: {
            responsePayload: {
              approvalPending: true,
              approvalRequestId: approval.id,
              trigger: approvalTrigger,
              trustMode: triggerMode,
              approvalPattern: pattern,
              intentSignature: signature,
            },
          },
        });

        return;
      }
    }

    const dispatchResult = await this.dispatchTaskRunToGateway({
      task: { id: task.id, scheduleId: task.scheduleId, agentId: task.agentId },
      taskRun: { id: taskRun.id, idempotencyKey: taskRun.idempotencyKey ?? idempotencyKey },
      agent: { routingKey: agent.routingKey },
      assembled,
      templateId: schedule.templateId,
    });

    if (!dispatchResult.ok) {
      const errorText = dispatchResult.errorText;
      console.error(`[dispatcher] ${errorText} (scheduleId: ${scheduleId}, taskId: ${task.id}, templateId: ${schedule.templateId})`);
      await db.taskRun.update({
        where: { id: taskRun.id },
        data: { status: TaskRunStatus.FAILED, errorText },
      });
      await db.task.update({
        where: { id: task.id },
        data: { status: TaskStatus.FAILED },
      });
      await db.taskEvent.create({
        data: {
          taskId: task.id,
          taskRunId: taskRun.id,
          type: "FAILED",
          message: errorText,
          metadata: { scheduleId, templateId: schedule.templateId },
        },
      });
      return;
    }

    return;
  }

  async dispatchTask(data: DispatchTaskJobData): Promise<void> {
    const { taskId } = data;

    const task = await db.task.findUnique({
      where: { id: taskId },
      include: {
        template: true,
        taskRuns: {
          orderBy: { attemptNumber: "desc" },
          take: 1,
        },
      },
    });

    if (!task) {
      const errorText = `Task not found: ${taskId}`;
      console.error(`[dispatcher] ${errorText}`);
      throw new Error(errorText);
    }

    if (!task.agentId) {
      const errorText = `Task has no agentId: ${taskId}`;
      console.error(`[dispatcher] ${errorText}`);
      throw new Error(errorText);
    }

    const agent = await db.agent.findUnique({ where: { id: task.agentId } });
    if (!agent) {
      const errorText = `Agent not found: ${task.agentId}`;
      console.error(`[dispatcher] ${errorText}`);
      throw new Error(errorText);
    }

    const latestRun = task.taskRuns[0] ?? null;
    if (latestRun && (latestRun.status === TaskRunStatus.ACCEPTED || latestRun.status === TaskRunStatus.RUNNING)) {
      console.log(`[dispatcher] Skipping dispatch; latest run still active for task ${taskId}`);
      return;
    }

    const { assembled, preVersion } = await this.assembleTaskInstructions({
      templateId: task.templateId,
      instructionsOverride: task.instructionsOverride,
    });

    const role = deriveRoleFromRoutingKey(agent.routingKey);
    const approvalTrigger = detectApprovalTrigger(role, assembled);
    const triggerMode = approvalTrigger ? resolveTrustMode(role, approvalTrigger) : null;
    const pattern = approvalTrigger ? approvalPattern(role, approvalTrigger, assembled) : null;
    const signature = approvalTrigger ? intentSignature(approvalTrigger, assembled) : null;

    const nextAttempt = latestRun ? latestRun.attemptNumber + 1 : 1;
    const idempotencyKey = `manual:${task.id}:attempt:${nextAttempt}`;

    const taskRun = await db.taskRun.create({
      data: {
        taskId: task.id,
        attemptNumber: nextAttempt,
        status: TaskRunStatus.ACCEPTED,
        idempotencyKey,
        dispatchedAt: new Date(),
      },
    });

    await db.task.update({
      where: { id: task.id },
      data: {
        status: TaskStatus.QUEUE,
        assembledInstructionsSnapshot: assembled,
        preInstructionsVersion: preVersion ?? undefined,
      },
    });

    if (approvalTrigger) {
      let requiresApproval = true;

      if (triggerMode === "auto") {
        requiresApproval = false;
      } else if (triggerMode === "once-per-session" || triggerMode === "once-ever") {
        const approvedHistory = await db.approvalRequest.findMany({
          where: {
            decision: "APPROVED",
            role,
            trigger: approvalTrigger,
          },
          orderBy: { decidedAt: "desc" },
          take: 200,
        });

        const hasMatch = approvedHistory.some((item) => {
          const ctx = parseContextObject(item.context);
          const approvedPattern = typeof ctx.approvalPattern === "string" ? ctx.approvalPattern : null;
          const approvedSignature = typeof ctx.intentSignature === "string" ? ctx.intentSignature : null;
          if (approvedPattern !== pattern && approvedSignature !== signature) return false;
          if (triggerMode === "once-ever") return true;
          const approvedSessionId = typeof ctx.sessionId === "string" ? ctx.sessionId : null;
          return approvedSessionId === agent.routingKey;
        });

        requiresApproval = !hasMatch;
      }

      const requestId = `approval:${taskRun.id}:${approvalTrigger}`;
      const existingApproval = await db.approvalRequest.findUnique({ where: { requestId } });

      const baseApprovalData = {
        requestId,
        role,
        trigger: approvalTrigger,
        severity: triggerSeverity(approvalTrigger),
        intent: `Approval required before dispatching task ${task.id}`,
        target: agent.routingKey,
        risk: `Task instructions matched trigger '${approvalTrigger}' for role '${role}'.`,
        rollback: "Do not dispatch task until approved.",
        budget: {
          toolCallsUsed: 0,
          runtimeMinutes: 0,
          previousApprovalsThisTask: 0,
        },
        context: {
          taskId: task.id,
          projectId: task.projectId,
          sessionId: agent.routingKey,
          approvalPattern: pattern,
          intentSignature: signature,
          trustMode: triggerMode,
        },
        taskRunId: taskRun.id,
      };

      const approval = existingApproval
        ? existingApproval
        : await db.approvalRequest.create({
            data: requiresApproval
              ? baseApprovalData
              : {
                  ...baseApprovalData,
                  decision: "APPROVED",
                  decider: "policy:trust-ladder",
                  reason: `Auto-approved by trust mode '${triggerMode}'`,
                  outcome: "auto-approved inline; dispatched",
                  decidedAt: new Date(),
                },
          });

      if (!existingApproval) {
        await this.writeApprovalAuditEvent({
          requestId,
          taskRunId: taskRun.id,
          taskId: task.id,
          projectId: task.projectId,
          lane: this.extractLane(task.instructionsOverride ?? task.assembledInstructionsSnapshot),
          role,
          trigger: approvalTrigger,
          severity: triggerSeverity(approvalTrigger),
          decision: requiresApproval ? "REQUESTED" : "APPROVED",
          decisionPath: requiresApproval ? "SYSTEM" : "POLICY_AUTO",
          deciderType: requiresApproval ? "system:dispatcher" : "policy:trust-ladder",
          deciderId: requiresApproval ? null : "policy:trust-ladder",
          summary: requiresApproval
            ? `Approval requested for task ${task.id}`
            : `Approval auto-approved by trust mode '${triggerMode}' for task ${task.id}`,
          evidenceRefs: {
            trustMode: triggerMode,
            approvalPattern: pattern,
            intentSignature: signature,
          },
          decidedAt: requiresApproval ? null : approval.decidedAt,
          createdAt: approval.createdAt,
        });
      }

      if (!requiresApproval) {
        await db.taskEvent.create({
          data: {
            taskId: task.id,
            taskRunId: taskRun.id,
            scheduleId: task.scheduleId,
            type: "STATUS_CHANGED",
            message: `Approval auto-satisfied (${triggerMode}) before dispatch`,
            metadata: {
              approvalRequestId: approval.id,
              trigger: approvalTrigger,
              role,
              templateId: task.templateId,
              trustMode: triggerMode,
              approvalPattern: pattern,
              intentSignature: signature,
            },
          },
        });

        await db.taskRun.update({
          where: { id: taskRun.id },
          data: {
            responsePayload: {
              approvalPending: false,
              approvalAutoSatisfied: true,
              approvalRequestId: approval.id,
              trigger: approvalTrigger,
              trustMode: triggerMode,
              approvalPattern: pattern,
              intentSignature: signature,
            },
          },
        });
      }

      if (requiresApproval) {
        await db.taskEvent.create({
          data: {
            taskId: task.id,
            taskRunId: taskRun.id,
            scheduleId: task.scheduleId,
            type: "QUEUED",
            message: `Awaiting approval (${approvalTrigger}) before dispatch`,
            metadata: {
              approvalRequestId: approval.id,
              trigger: approvalTrigger,
              role,
              templateId: task.templateId,
              trustMode: triggerMode,
              approvalPattern: pattern,
              intentSignature: signature,
            },
          },
        });

        await db.taskRun.update({
          where: { id: taskRun.id },
          data: {
            responsePayload: {
              approvalPending: true,
              approvalRequestId: approval.id,
              trigger: approvalTrigger,
              trustMode: triggerMode,
              approvalPattern: pattern,
              intentSignature: signature,
            },
          },
        });

        return;
      }
    }

    const dispatchResult = await this.dispatchTaskRunToGateway({
      task: { id: task.id, scheduleId: task.scheduleId, agentId: task.agentId },
      taskRun: { id: taskRun.id, idempotencyKey: taskRun.idempotencyKey ?? idempotencyKey },
      agent: { routingKey: agent.routingKey },
      assembled,
      templateId: task.templateId ?? "adhoc",
    });

    if (!dispatchResult.ok) {
      const errorText = dispatchResult.errorText;
      console.error(`[dispatcher] ${errorText} (taskId: ${task.id}, templateId: ${task.templateId ?? "adhoc"})`);
      await db.taskRun.update({
        where: { id: taskRun.id },
        data: { status: TaskRunStatus.FAILED, errorText },
      });
      await db.task.update({
        where: { id: task.id },
        data: { status: TaskStatus.FAILED },
      });
      await db.taskEvent.create({
        data: {
          taskId: task.id,
          taskRunId: taskRun.id,
          type: "FAILED",
          message: errorText,
          metadata: { scheduleId: task.scheduleId, templateId: task.templateId ?? "adhoc" },
        },
      });
    }
  }

  async resumeApprovedRequests(limit = 25): Promise<void> {
    const approvals = await db.approvalRequest.findMany({
      where: {
        decision: { in: ["APPROVED", "DENIED", "REVISED"] },
        taskRunId: { not: null },
        OR: [
          { outcome: null },
          { outcome: { startsWith: "resume failed:" } },
          { outcome: { startsWith: "pending blocked apply" } },
          { outcome: { startsWith: "revision captured;" } },
        ],
      },
      orderBy: { decidedAt: "asc" },
      take: limit,
    });

    for (const approval of approvals) {
      const taskRunId = approval.taskRunId;
      if (!taskRunId) continue;

      const taskRun = await db.taskRun.findUnique({
        where: { id: taskRunId },
        include: {
          task: true,
        },
      });

      if (!taskRun || !taskRun.task) {
        await db.approvalRequest.update({
          where: { id: approval.id },
          data: { outcome: "task run missing; cannot resume" },
        });
        continue;
      }

      const decision = approval.decision;

      if (decision === "DENIED") {
        const reasonText = approval.reason?.trim() || "denied by reviewer";
        await db.taskRun.update({
          where: { id: taskRun.id },
          data: {
            status: TaskRunStatus.FAILED,
            finishedAt: new Date(),
            errorText: `BLOCKED: ${reasonText}`,
            responsePayload: {
              approvalBlocked: true,
              approvalRequestId: approval.id,
              reason: reasonText,
            },
          },
        });

        await db.task.update({
          where: { id: taskRun.task.id },
          data: {
            status: TaskStatus.FAILED,
          },
        });

        await db.taskEvent.create({
          data: {
            taskId: taskRun.task.id,
            taskRunId: taskRun.id,
            scheduleId: taskRun.task.scheduleId,
            type: "STATUS_CHANGED",
            message: `Task blocked by approval denial: ${reasonText}`,
            metadata: {
              semanticStatus: "BLOCKED",
              approvalRequestId: approval.id,
              decision,
              reason: reasonText,
            },
          },
        });

        await db.approvalRequest.update({
          where: { id: approval.id },
          data: { outcome: `blocked: ${reasonText}` },
        });

        await this.writeApprovalAuditEvent({
          requestId: approval.requestId,
          taskRunId: taskRun.id,
          taskId: taskRun.task.id,
          projectId: taskRun.task.projectId,
          lane: this.extractLane(taskRun.task.instructionsOverride ?? taskRun.task.assembledInstructionsSnapshot),
          role: approval.role,
          trigger: approval.trigger,
          severity: approval.severity,
          decision: "DENIED",
          decisionPath: "MANUAL",
          deciderType: approval.decider || "admin",
          deciderId: approval.decider || null,
          summary: `Approval denied and task blocked: ${reasonText}`,
          decidedAt: approval.decidedAt,
          createdAt: approval.createdAt,
        });
        continue;
      }

      if (taskRun.gatewayRunId) {
        await db.approvalRequest.update({
          where: { id: approval.id },
          data: { outcome: `already dispatched (${taskRun.gatewayRunId})` },
        });
        continue;
      }

      let assembled = taskRun.task.assembledInstructionsSnapshot;
      const agentId = taskRun.task.agentId;

      if (decision === "REVISED") {
        const context =
          approval.context && typeof approval.context === "object" && !Array.isArray(approval.context)
            ? (approval.context as Record<string, unknown>)
            : {};
        const revision = typeof context.revision === "string" ? context.revision.trim() : "";
        if (!revision) {
          await db.approvalRequest.update({
            where: { id: approval.id },
            data: { outcome: "revision missing; cannot redispatch" },
          });
          continue;
        }

        const baseText = assembled || "";
        assembled = `${baseText}\n\n=== REVISION ===\n${revision}`.trim();

        await db.task.update({
          where: { id: taskRun.task.id },
          data: {
            instructionsOverride: revision,
            assembledInstructionsSnapshot: assembled,
          },
        });

        await db.taskEvent.create({
          data: {
            taskId: taskRun.task.id,
            taskRunId: taskRun.id,
            scheduleId: taskRun.task.scheduleId,
            type: "STATUS_CHANGED",
            message: "Approval revised; redispatching with revision",
            metadata: {
              semanticStatus: "REVISED",
              approvalRequestId: approval.id,
              decision,
              revision,
            },
          },
        });
      }

      if (!assembled || !agentId) {
        await db.approvalRequest.update({
          where: { id: approval.id },
          data: { outcome: "missing task snapshot or agentId; cannot resume" },
        });
        continue;
      }

      const agent = await db.agent.findUnique({ where: { id: agentId } });
      if (!agent) {
        await db.approvalRequest.update({
          where: { id: approval.id },
          data: { outcome: "agent missing; cannot resume" },
        });
        continue;
      }

      const dispatchResult = await this.dispatchTaskRunToGateway({
        task: {
          id: taskRun.task.id,
          scheduleId: taskRun.task.scheduleId,
          agentId: taskRun.task.agentId,
        },
        taskRun: {
          id: taskRun.id,
          idempotencyKey: taskRun.idempotencyKey,
        },
        agent: { routingKey: agent.routingKey },
        assembled,
        templateId: taskRun.task.templateId ?? "unknown",
      });

      if (!dispatchResult.ok) {
        await db.approvalRequest.update({
          where: { id: approval.id },
          data: { outcome: `resume failed: ${dispatchResult.errorText}` },
        });
        continue;
      }

      await db.approvalRequest.update({
        where: { id: approval.id },
        data: {
          outcome:
            decision === "REVISED"
              ? `redispatched with revision ${dispatchResult.runId ?? "(no runId)"}`
              : `dispatched ${dispatchResult.runId ?? "(no runId)"}`,
        },
      });

      await this.writeApprovalAuditEvent({
        requestId: approval.requestId,
        taskRunId: taskRun.id,
        taskId: taskRun.task.id,
        projectId: taskRun.task.projectId,
        lane: this.extractLane(taskRun.task.instructionsOverride ?? taskRun.task.assembledInstructionsSnapshot),
        role: approval.role,
        trigger: approval.trigger,
        severity: approval.severity,
        decision: "EXECUTED",
        decisionPath: decision === "APPROVED" ? "MANUAL" : "SYSTEM",
        deciderType: decision === "APPROVED" ? (approval.decider || "admin") : "system:dispatcher",
        deciderId: approval.decider || null,
        summary:
          decision === "REVISED"
            ? `Approval revised and redispatched (${dispatchResult.runId ?? "no-run-id"})`
            : `Approval executed and dispatched (${dispatchResult.runId ?? "no-run-id"})`,
        evidenceRefs: {
          gatewayRunId: dispatchResult.runId,
          taskRunId: taskRun.id,
        },
        decidedAt: approval.decidedAt,
        createdAt: approval.createdAt,
      });
    }
  }
}
