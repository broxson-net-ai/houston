import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Create admin user
  const passwordHash = await bcrypt.hash("admin", 12);
  const user = await prisma.user.upsert({
    where: { email: "admin@houston.local" },
    update: {},
    create: {
      email: "admin@houston.local",
      passwordHash,
    },
  });
  console.log("Created user:", user.email);

  // Create agents
  const agent1 = await prisma.agent.upsert({
    where: { routingKey: "researcher-01" },
    update: {},
    create: {
      name: "Researcher",
      routingKey: "researcher-01",
      avatarUrl: null,
      tags: ["research", "analysis"],
      enabled: true,
    },
  });

  const agent2 = await prisma.agent.upsert({
    where: { routingKey: "writer-01" },
    update: {},
    create: {
      name: "Writer",
      routingKey: "writer-01",
      avatarUrl: null,
      tags: ["writing", "content"],
      enabled: true,
    },
  });

  console.log("Created agents:", agent1.name, agent2.name);

  const project = await prisma.cpProject.upsert({
    where: { slug: "example-control-plane-project" },
    update: {},
    create: {
      slug: "example-control-plane-project",
      title: "Example Control Plane Project",
      status: "DRAFT",
      defaultTrustMode: "STRICT",
      docMode: "MANAGED",
      summary: "Seeded example project for the control plane.",
    },
  });

  const existingDoc = await prisma.cpProjectDoc.findFirst({
    where: { projectId: project.id, kind: "PROJECT", isActive: true, archivedAt: null },
  });

  if (!existingDoc) {
    await prisma.cpProjectDoc.create({
      data: {
        projectId: project.id,
        kind: "PROJECT",
        title: "PROJECT",
        contentMarkdown: "# Example Control Plane Project\n\n## Idea\n\nThis is a seeded draft project.",
        version: 1,
        isActive: true,
      },
    });
  }

  console.log("Created control-plane project:", project.title);

  console.log("Seeding complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
