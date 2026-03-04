import { NextResponse } from "next/server";
import { listProjectsWithCounts } from "@/lib/projects";

export async function GET() {
  const projects = await listProjectsWithCounts();
  return NextResponse.json({ projects });
}
