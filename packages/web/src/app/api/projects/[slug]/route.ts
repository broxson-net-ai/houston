import { NextRequest, NextResponse } from "next/server";
import {
  deleteProject,
  getProject,
  isValidProjectStatus,
  listProjectsWithCounts,
  updateProjectStatus,
} from "@/lib/projects";
import { requireAuth } from "@/lib/session";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const projects = await listProjectsWithCounts();
    const project = projects.find((item) => item.slug === slug);
    if (!project) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ project });
  } catch {
    return NextResponse.json(
      { error: "Failed to get project" },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const { slug } = await params;
    const body = await req.json();
    const rawStatus = typeof body.status === "string" ? body.status.trim().toLowerCase() : "";
    if (!rawStatus || !isValidProjectStatus(rawStatus)) {
      return NextResponse.json(
        { error: "Invalid status. Allowed: active, paused, done, draft" },
        { status: 400 }
      );
    }

    const ok = updateProjectStatus(slug, rawStatus);
    if (!ok) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const project = getProject(slug);
    return NextResponse.json({ project });
  } catch {
    return NextResponse.json(
      { error: "Failed to update project status" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  return PUT(req, context);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const { slug } = await params;
    const ok = deleteProject(slug);
    if (!ok) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to delete project" },
      { status: 500 }
    );
  }
}
