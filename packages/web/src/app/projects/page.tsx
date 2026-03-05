import { listProjectsWithCounts } from "@/lib/projects";
import { Nav } from "@/components/nav";
import ProjectsView from "./ProjectsView";
import Link from "next/link";

export default async function ProjectsPage() {
  const projects = await listProjectsWithCounts();

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-6 flex items-center justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold">Projects</h1>
            <p className="text-muted-foreground">
              Markdown-backed projects from the OpenClaw workspace.
            </p>
          </div>
          <Link
            href="/projects/new"
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90"
          >
            + New Project
          </Link>
        </div>
        <ProjectsView projects={projects} />
      </div>
    </div>
  );
}
