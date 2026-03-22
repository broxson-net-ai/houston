-- Add autoDispatch flag for task scheduler-managed dispatch
ALTER TABLE "tasks"
ADD COLUMN "autoDispatch" BOOLEAN NOT NULL DEFAULT false;

-- Create dependency table for task DAG orchestration
CREATE TABLE "task_dependencies" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "dependsOnTaskId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "task_dependencies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "task_dependencies_taskId_dependsOnTaskId_key"
ON "task_dependencies"("taskId", "dependsOnTaskId");

CREATE INDEX "task_dependencies_taskId_idx"
ON "task_dependencies"("taskId");

CREATE INDEX "task_dependencies_dependsOnTaskId_idx"
ON "task_dependencies"("dependsOnTaskId");

ALTER TABLE "task_dependencies"
ADD CONSTRAINT "task_dependencies_taskId_fkey"
FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "task_dependencies"
ADD CONSTRAINT "task_dependencies_dependsOnTaskId_fkey"
FOREIGN KEY ("dependsOnTaskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
