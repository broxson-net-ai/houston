import { NextRequest, NextResponse } from "next/server";
import { getProject, listProjectsWithCounts, updateProjectStatus } from "@/lib/projects";
import { requireAuth } from "@/lib/session";

export async function GET(
  _request: Request,
  { params }: { params: { slug: string } }
) {
  const projects = await listProjectsWithCounts();
  const project = projects.find((item) => item.slug === params.slug);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ project });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const authError = await requireAuth();
  if (authError) return authError;

  const body = await req.json();
  const { status } = body;
  if (!status || typeof status !== "string") {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const ok = updateProjectStatus(params.slug, status.trim());
  if (!ok) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const project = getProject(params.slug);
  return NextResponse.json({ project });
}
