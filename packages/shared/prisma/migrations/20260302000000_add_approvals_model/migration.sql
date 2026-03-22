-- Migration: add approval_requests + related enums

-- CreateEnum
CREATE TYPE "ApprovalSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('PENDING', 'APPROVED', 'DENIED', 'REVISED');

-- CreateTable
CREATE TABLE "approval_requests" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "severity" "ApprovalSeverity" NOT NULL DEFAULT 'MEDIUM',
    "intent" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "risk" TEXT NOT NULL,
    "rollback" TEXT NOT NULL,
    "budget" JSONB,
    "context" JSONB,
    "decision" "ApprovalDecision" NOT NULL DEFAULT 'PENDING',
    "decider" TEXT,
    "reason" TEXT,
    "outcome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "taskRunId" TEXT,

    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "approval_requests_requestId_key" ON "approval_requests"("requestId");
