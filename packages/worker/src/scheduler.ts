import PgBoss from "pg-boss";
import { db, processCpExportSnapshot } from "@houston/shared";

export class HoustonScheduler {
  private boss?: PgBoss;
  private running = false;

  async start(): Promise<void> {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("DATABASE_URL not set");
    }

    this.boss = new PgBoss({ connectionString: databaseUrl });
    await this.boss.start();

    await this.boss.work<{ snapshotId: string }>(
      "control-plane-export",
      { teamSize: 1 },
      async (job) => {
        await processCpExportSnapshot(job.data.snapshotId);
      }
    );

    this.running = true;
    await this.updateSystemStatus();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.boss) {
      await this.boss.stop();
      this.boss = undefined;
    }
    await this.updateSystemStatus();
  }

  private async updateSystemStatus() {
    await db.systemStatus.upsert({
      where: { key: "worker_status" },
      create: {
        key: "worker_status",
        value: {
          status: this.running ? "running" : "stopped",
          mode: "control-plane",
          updatedAt: new Date().toISOString(),
        },
      },
      update: {
        value: {
          status: this.running ? "running" : "stopped",
          mode: "control-plane",
          updatedAt: new Date().toISOString(),
        },
      },
    });
  }
}
