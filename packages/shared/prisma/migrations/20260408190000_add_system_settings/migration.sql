CREATE TABLE IF NOT EXISTS cp_system_settings (
  id TEXT PRIMARY KEY,
  "autonomyPaused" BOOLEAN NOT NULL DEFAULT FALSE,
  "autonomyPausedReason" TEXT,
  "autonomyPausedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
