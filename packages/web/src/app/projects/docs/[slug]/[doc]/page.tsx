import fs from "fs";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Nav } from "@/components/nav";
import MarkdownPreview from "@/components/MarkdownPreview";
import { getProject, getProjectDocPath } from "@/lib/projects";

export default async function ProjectDocPage({
  params,
}: {
  params: { slug: string; doc: string };
}) {
  const { slug, doc } = params;
  const project = getProject(slug);
  const docPath = getProjectDocPath(slug, doc);

  if (!project || !docPath || !fs.existsSync(docPath)) {
    notFound();
  }

  const markdown = fs.readFileSync(docPath, "utf8");

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <div className="mx-auto max-w-4xl px-6 py-10">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Project</p>
            <h1 className="text-2xl font-semibold">{project.name}</h1>
          </div>
          <Link
            href={`/projects/${project.slug}`}
            className="text-sm font-medium text-primary hover:underline"
          >
            Back to project
          </Link>
        </div>
        <div className="space-y-4 rounded-lg border bg-card p-6 shadow-sm">
          <MarkdownPreview content={markdown} />
        </div>
      </div>
    </div>
  );
}
