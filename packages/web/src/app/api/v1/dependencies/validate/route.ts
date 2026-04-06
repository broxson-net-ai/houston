import { NextRequest, NextResponse } from "next/server";
import { validateCpDependencies } from "@houston/shared";
import { requireAuth } from "@/lib/session";
import {
  badRequest,
  conflict,
  controlPlaneDisabledResponse,
  isControlPlaneEnabled,
} from "@/lib/control-plane";

export async function POST(req: NextRequest) {
  if (!isControlPlaneEnabled()) return controlPlaneDisabledResponse();
  const authError = await requireAuth();
  if (authError) return authError;

  const body = await req.json().catch(() => ({}));
  const proposedEdges = Array.isArray(body.proposedEdges) ? body.proposedEdges : [];
  if (proposedEdges.length === 0) {
    return badRequest("proposedEdges is required");
  }

  try {
    await validateCpDependencies(
      proposedEdges.map((edge: Record<string, unknown>) => ({
        fromSubjectType: String(edge.fromSubjectType ?? ""),
        fromSubjectId: String(edge.fromSubjectId ?? ""),
        toSubjectType: String(edge.toSubjectType ?? ""),
        toSubjectId: String(edge.toSubjectId ?? ""),
        edgeType: String(edge.edgeType ?? ""),
        scope: String(edge.scope ?? ""),
        strength: typeof edge.strength === "string" ? edge.strength : undefined,
        reason: typeof edge.reason === "string" ? edge.reason : undefined,
        createdBy: "validation",
      }))
    );
    return NextResponse.json({ data: { valid: true } });
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? (error as { code?: string }).code : undefined;
    if (code === "DEPENDENCY_CYCLE") {
      return conflict("Dependency cycle detected", { valid: false });
    }
    return NextResponse.json({ error: "Dependency validation failed" }, { status: 500 });
  }
}
