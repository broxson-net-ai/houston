import PgBoss from "pg-boss";

let bossInstance: PgBoss | null = null;
let bossReady: Promise<PgBoss> | null = null;

async function getBoss(): Promise<PgBoss> {
  if (bossInstance) return bossInstance;
  if (bossReady) return bossReady;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL not set");
  }

  bossReady = (async () => {
    const boss = new PgBoss({ connectionString: databaseUrl });
    await boss.start();
    bossInstance = boss;
    return boss;
  })();

  return bossReady;
}

export async function enqueueTaskDispatch(taskId: string, reason = "manual-dispatch") {
  const boss = await getBoss();
  await boss.send("dispatch-task", { taskId, reason });
}
