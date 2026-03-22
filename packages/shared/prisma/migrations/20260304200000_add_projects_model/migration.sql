-- Migration: Add Projects model and Task-Project relation

-- Create projects table
CREATE TABLE "projects" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL UNIQUE,
  "title" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- Add projectId column to tasks table
ALTER TABLE "tasks" ADD COLUMN "projectId" TEXT;

-- Create index on projectId for efficient lookups
CREATE INDEX "tasks_projectId_idx" ON "tasks"("projectId");

-- Insert default values for PROJECTS.md registry
-- This ensures the Projects registry is accessible via the API
INSERT INTO "projects" ("id", "slug", "title", "status", "metadata", "createdAt", "updatedAt")
VALUES (
  'openclaw-dashboard',
  'openclaw-dashboard',
  'OpenClaw Dashboard',
  'active',
  '{"description": "Deploy Houston (mission control for OpenClaw agents) and extend with Projects management", "dependencies": ["OpenClaw Gateway", "Projects system"]}',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);
