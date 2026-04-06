import { notFound } from "next/navigation";
import { Nav } from "@/components/nav";
import ProjectDetailView from "./ProjectDetailView";
import { getCpProjectBySlug } from "@houston/shared";

type ProjectSummary = {
  slug: string;
  name: string;
  status?: string;
  owner?: string;
  lastUpdated?: string;
  summary?: string;
  tags?: string[];
  links: { project?: string; actionPlan?: string; notes?: string };
  taskCount?: number;
  openTaskCount?: number;
  canArchive?: boolean;
  archiveBlockers?: string[];
  scheduleCount?: number;
  futureScheduleCount?: number;
  pendingActionCount?: number;
};

function mapCpProjectToSummary(project: any): ProjectSummary {
  return {
    slug: project.slug,
    name: project.title,
    status: String(project.status || "").toLowerCase(),
    owner: project.owner ?? undefined,
    lastUpdated: project.updatedAt ? new Date(project.updatedAt).toLocaleString() : undefined,
    summary: project.summary ?? undefined,
    tags: [],
    links: {},
    taskCount: project._count?.workItems ?? 0,
    scheduleCount: 0,
    openTaskCount: (project.workItems ?? []).filter((item: any) => item.status !== "DONE" && item.status !== "ARCHIVED").length,
    futureScheduleCount: 0,
    pendingActionCount: 0,
    canArchive: project.status === "ARCHIVED",
    archiveBlockers: [],
  };
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const cpProject = await getCpProjectBySlug(slug);
  const resolvedProject = cpProject ? mapCpProjectToSummary(cpProject) : undefined;

  if (!resolvedProject) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <div className="mx-auto max-w-5xl px-6 py-10">
        <ProjectDetailView
          project={resolvedProject}
          controlPlaneProject={cpProject ?? undefined}
          controlPlaneProjectId={cpProject?.id}
          updatePath={cpProject ? `/api/v1/projects/${cpProject.id}` : undefined}
        />
      </div>
    </div>
  );
}
