import crypto from "crypto";
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

// Validate that a file path is safe (prevent directory traversal)
function validateSafePath(docPath: string, projectsDir: string): boolean {
  const resolved = fs.realpathSync(docPath);
  const projectsDirResolved = fs.realpathSync(projectsDir);
  return resolved.startsWith(projectsDirResolved);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
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
    const stats = fs.statSync(docPath);
    const mtime = stats.mtimeMs;

    return NextResponse.json({ content, mtime });
  } catch (error) {
    console.error("[projects] Failed to read project doc:", error);
    return NextResponse.json(
      { error: "Failed to load project doc" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
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
    if (!docPath) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Validate file path safety
    const projectsDir = process.env.OPENCLAW_PROJECTS_DIR ||
      `${process.env.HOME || process.env.USERPROFILE}/.openclaw/workspace/memory/projects`;
    if (!validateSafePath(docPath, projectsDir)) {
      console.error("[projects] Invalid file path detected:", docPath);
      return NextResponse.json(
        { error: "Invalid file path" },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { content, expectedMtime } = body;

    if (typeof content !== "string") {
      return NextResponse.json(
        { error: "Content must be a string" },
        { status: 400 }
      );
    }

    // Conflict detection: check if file was modified externally
    let fileExists = fs.existsSync(docPath);
    let conflictDetected = false;

    if (fileExists && typeof expectedMtime === "number") {
      const currentMtime = fs.statSync(docPath).mtimeMs;
      if (currentMtime !== expectedMtime) {
        conflictDetected = true;
        console.warn(
          `[projects] Conflict detected for ${slug}/${doc}: file modified externally ` +
          `(expected ${expectedMtime}, got ${currentMtime})`
        );
      }
    }

    // Write content to file
    fs.writeFileSync(docPath, content, "utf8");

    // Get new mtime for response
    const newMtime = fs.statSync(docPath).mtimeMs;

    if (conflictDetected) {
      return NextResponse.json(
        {
          error: "File was modified externally",
          conflict: true,
          mtime: newMtime,
        },
        { status: 409 }
      );
    }

    return NextResponse.json({ success: true, mtime: newMtime });
  } catch (error) {
    console.error("[projects] Failed to update project doc:", error);
    return NextResponse.json(
      { error: "Failed to update project doc" },
      { status: 500 }
    );
  }
}
