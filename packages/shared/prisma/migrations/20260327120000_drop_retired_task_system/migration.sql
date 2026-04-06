-- Drop retired task/template/schedule/project/pre-instructions/approval tables and enums.

DROP TABLE IF EXISTS "task_logs";
DROP TABLE IF EXISTS "task_events";
DROP TABLE IF EXISTS "task_runs";
DROP TABLE IF EXISTS "task_dependencies";
DROP TABLE IF EXISTS "tasks";
DROP TABLE IF EXISTS "schedules";
DROP TABLE IF EXISTS "templates";
DROP TABLE IF EXISTS "projects";
DROP TABLE IF EXISTS "pre_instructions_versions";
DROP TABLE IF EXISTS "approval_audit_events";
DROP TABLE IF EXISTS "approval_requests";

DROP TYPE IF EXISTS "TaskStatus";
DROP TYPE IF EXISTS "TaskRunStatus";
DROP TYPE IF EXISTS "TaskEventType";
DROP TYPE IF EXISTS "ApprovalSeverity";
DROP TYPE IF EXISTS "ApprovalDecision";
DROP TYPE IF EXISTS "ApprovalDecisionPath";
DROP TYPE IF EXISTS "ApprovalAuditDecision";
