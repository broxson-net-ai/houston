import fs from "fs";
import { NextRequest, NextResponse } from "next/server";
import { getProject, getProjectDocPath } from "@/lib/projects";

function normalizeDocQuery(value: string | null) {
  if (!value) return "project";
  const normalized = value.trim().toLowerCase();
  if (normalized === "project") return "project";
  if (normalized === "notes") return "notes";
  if (
    normalized === "actionplan" ||
    normalized === "action-plan" ||
    normalized === "action_plan"
  ) {
    return "action-plan";
  }
  return null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  let slug: string;
  try {
    slug = (await params).slug;
    const project = getProject(slug);
    if (!project) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const doc = normalizeDocQuery(request.nextUrl.searchParams.get("doc"));
    if (!doc) {
      return NextResponse.json(
        { error: "Invalid doc. Allowed: project, actionPlan, notes" },
        { status: 400 }
      );
    }

    const docPath = getProjectDocPath(slug, doc);
    if (!docPath || !fs.existsSync(docPath)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const content = fs.readFileSync(docPath, "utf8");
    return NextResponse.json({ content });
  } catch (error) {
    console.error(`[projects] Failed to read project doc for ${slug}:`, error);
    return NextResponse.json(
      { error: "Failed to load project doc" },
      { status: 500 }
    );
  }
}
