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

  // Create initial pre-instructions version
  const preInstructions = await prisma.preInstructionsVersion.create({
    data: {
      version: 1,
      content:
        "You are a helpful AI agent. Complete the assigned task thoroughly and accurately. Always respond with structured output when requested.",
      isActive: true,
    },
  });
  console.log("Created pre-instructions version:", preInstructions.version);

  // Create a template
  const template = await prisma.template.create({
    data: {
      name: "Daily Synthesis",
      defaultAgentId: agent1.id,
      instructions:
        "Synthesize the key events and insights from today. Provide a concise summary with actionable takeaways.",
      tags: ["daily", "synthesis"],
      priority: 0,
      enabled: true,
    },
  });
  console.log("Created template:", template.name);

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
