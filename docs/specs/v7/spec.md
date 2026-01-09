# WAAAH V7 Specification Index

> **Project**: WAAAH Agent Orchestration System
> **Version**: V7 (Spec-Driven, Atomic Assignment)

## Background
WAAAH is an MCP-based agent orchestration system. V7 introduces:
- **Spec-Driven Workflow**: Tasks can include embedded spec text (`tasks.md`)
- **Worktree Management**: Agents manage isolated git worktrees
- **waaah-orc**: Renamed superset agent (formerly "orchestrator")
- **CLI Parallelization**: `waaah assign` breaks specs into parallel tasks
- **Capability-Based Scheduler**: Dispatch by capabilities, not roles
- **Inline Ad-Hoc Planning**: `scaffold_plan` deprecated in favor of agents self-generating specs inline

## Specification Index

| ID | Spec | File | Status |
|----|------|------|--------|
| S1 | Worktree Tools | [01-worktree-tools.md](./01-worktree-tools.md) | DONE |
| S2 | waaah-orc Rename | [02-waaah-orc-rename.md](./02-waaah-orc-rename.md) | DONE |
| S3 | Claude Skills | [03-claude-skills.md](./03-claude-skills.md) | DONE |
| S4 | Schema Updates | [04-schema-updates.md](./04-schema-updates.md) | DONE |
| S5 | Legacy Cleanup | [05-legacy-cleanup.md](./05-legacy-cleanup.md) | DONE |
| S6 | CLI Parallelization | [06-cli-parallelization.md](./06-cli-parallelization.md) | DONE |
| S7 | Capability Scheduler | [07-capability-scheduler.md](./07-capability-scheduler.md) | DONE |
| S8 | CLI Init Templates | [08-cli-init-templates.md](./08-cli-init-templates.md) | DONE |
| S9 | Workflow Cleanup | [09-workflow-cleanup.md](./09-workflow-cleanup.md) | DONE |
| S10 | Task Status Command | [10-waaah-task-command.md](./10-waaah-task-command.md) | DONE |
| S11 | Agent Naming | [11-agent-naming.md](./11-agent-naming.md) | DONE |
| S12 | Workspace Context Inference | [12-workspace-context.md](./12-workspace-context.md) | DONE |
| S13 | Dashboard Task Comments | [13-dashboard-comments.md](./13-dashboard-comments.md) | DONE |
| S14 | Descriptive Task Titles | [14-task-titles.md](./14-task-titles.md) | DONE |
| S15 | Worktree Review Workflow | [12-review-workflow.md](./12-review-workflow.md) | DONE |
| S16 | Workflow State Machine Update | [16-workflow-state-machine-update.md](./16-workflow-state-machine-update.md) | TODO |
| S17 | Spec-Driven Development | [17-spec-driven-development.md](./17-spec-driven-development.md) | TODO |
| S18 | Circular Dependency Detection | [18-circular-dependency-detection.md](./18-circular-dependency-detection.md) | TODO |

## Execution Order (Parallel Safe)
```
S1, S2, S4, S7, S10, S11 can run in parallel.
S9 depends on S2.
S3 depends on S2.
S8 depends on S3 and S9.
S5 depends on S2, S3, S9.
S6 depends on S4.
S12 depends on S7.
S17 depends on S4.
S16 depends on S17.
S18 standalone (can run in parallel with S1-S11).
```
