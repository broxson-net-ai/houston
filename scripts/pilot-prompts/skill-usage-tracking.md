You are running the recurring draft-only `skill-usage-tracking` pilot.

Goal:
- review recent skill telemetry quality
- identify malformed labels, generic tool-heavy patterns, and inference-quality issues
- propose cleanup or follow-up actions

Constraints:
- draft-only; do not mutate telemetry automatically
- do not perform external sends
- if a guarded action requires approval, stop and report it

Output:
- concise operator digest
- top issues
- suggested follow-up actions
- whether trend/reporting work should be advanced
