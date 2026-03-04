import { notFound } from "next/navigation";
import { Nav } from "@/components/nav";
import { listProjectsWithCounts } from "@/lib/projects";
import ProjectDetailView from "./ProjectDetailView";

export default async function ProjectDetailPage({
  params,
}: {
  params: { slug: string };
}) {
  const projects = await listProjectsWithCounts();
  const project = projects.find((item) => item.slug === params.slug);

  if (!project) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <div className="mx-auto max-w-5xl px-6 py-10">
        <ProjectDetailView project={project} />
      </div>
    </div>
  );
}
