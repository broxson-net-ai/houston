import { NextRequest, NextResponse } from "next/server";
import {
  createProject,
  isValidProjectSlug,
  isValidProjectStatus,
  listProjectsWithCounts,
} from "@/lib/projects";
import { requireAuth } from "@/lib/session";

export async function GET() {
  try {
    const projects = await listProjectsWithCounts();
    return NextResponse.json({ projects });
  } catch {
    return NextResponse.json(
      { error: "Failed to list projects" },
      { status: 500 }
    );
  }
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function POST(req: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const body = await req.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const resolvedName = name || title;
    const rawSlug = typeof body.slug === "string" ? body.slug.trim() : "";
    const slug = rawSlug || slugify(resolvedName);
    const statusRaw = typeof body.status === "string" ? body.status.trim().toLowerCase() : "";

    if (!resolvedName) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    if (!slug || !isValidProjectSlug(slug)) {
      return NextResponse.json({ error: "invalid slug" }, { status: 400 });
    }
    if (statusRaw && !isValidProjectStatus(statusRaw)) {
      return NextResponse.json({ error: "invalid status" }, { status: 400 });
    }
    const status = isValidProjectStatus(statusRaw) ? statusRaw : "draft";

    const result = createProject({
      slug,
      name: resolvedName,
      status,
      owner: typeof body.owner === "string" ? body.owner.trim() : undefined,
      summary: typeof body.summary === "string" ? body.summary.trim() : undefined,
      tags: Array.isArray(body.tags)
        ? body.tags.map(String).map((tag: unknown) => (typeof tag === "string" ? tag.trim() : "")).filter(Boolean)
        : undefined,
    });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ project: result.project }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Failed to create project" },
      { status: 500 }
    );
  }
}
