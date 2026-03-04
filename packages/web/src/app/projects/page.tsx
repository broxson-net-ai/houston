import { listProjectsWithCounts } from "@/lib/projects";
import { Nav } from "@/components/nav";
import ProjectsView from "./ProjectsView";

export default async function ProjectsPage() {
  const projects = await listProjectsWithCounts();

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-6 space-y-2">
          <h1 className="text-3xl font-bold">Projects</h1>
          <p className="text-muted-foreground">
            Markdown-backed projects from the OpenClaw workspace.
          </p>
        </div>
        <ProjectsView projects={projects} />
      </div>
    </div>
  );
}
