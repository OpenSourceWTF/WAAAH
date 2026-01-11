# Spec 004: Agent Scheduling Overhaul

**Status:** Ready
**Created:** 2026-01-11

## Problem Statement

The current agent scheduling system has several issues:
1. **Heartbeat unreliable** - Out of date, doesn't reflect actual agent state
2. **No workspace awareness** - Tasks don't specify which workspace to use
3. **No capability inference** - `assign_task` requires manual capability specification
4. **Scheduler matching weak** - Doesn't rank agents by specialization match
5. **General unreliability** - Tasks sometimes not assigned to waiting agents

## Requirements

| Area | Requirement | Details |
|------|-------------|---------|
| **Heartbeat** | **Triggers** | `register`, `wait_for_prompt`, `update_progress`, and ANY mcp tool call. |
| | **Staleness** | Agent considered stale after **5 minutes** (handles long-running chunks). |
| **Workspace** | **Inference** | Detect repo where `waaah` is initiated. Match with connected agents' supported workspaces. |
| | **Usage** | `assign_task` must specify the target workspace. |
| **Capabilities** | **Inference** | Infer required capabilities from task prompt/context (Agentic). |
| | **Defaults** | List basic default capabilities if inference fails. |
| **Scheduler** | **Ranking** | Rank by `(matched_capabilities / total_agent_capabilities)`. **Specialist wins** (e.g., 2/2 > 2/4). |
| | **Matching** | Must match ALL required capabilities first. |
| **Reliability** | **Fix** | Fix issue where tasks sit in QUEUED while agents are marked STALE/WAITING erroneously. |

## Current Score: 8/10

### Refinements (Round 2)
1. **Heartbeat Performance**: Debounce DB writes. Even if tool calls happen every ms, only update `lastSeen` max once per 10s.
2. **Capability Fallback**: If inference fails (score < threshold), default to `['general-purpose']` to avoid orphaned tasks.
3. **Workspace Mismatch UI**: If `queuedTask.workspace` matches NO connected agent, show "⚠️ No Agent for [Workspace]" in Dashboard.

## Implementation Tasks

| ID | Title | Size | Deps | Verify |
|----|-------|------|------|--------|
| T1 | **Heartbeat Overhaul**<br>Centralize heartbeat in MCP middleware. **Debounce updates (10s)**. Timeout: 5m. | M | — | Spam tool calls, check DB writes < calls |
| T2 | **Workspace & Inference**<br>CLI sends workspace. Server infers caps. **Fallback:** `general-purpose`. | M | — | Submit ambiguous task -> `general-purpose` |
| T3 | **Scheduler Ranking**<br>Implement `matched/total` ratio. Specialist (2/2) > Generalist (2/4). | S | T2 | Unit test `findBestAgent` |
| T4 | **Reliability Fixes**<br>Fix "Active Task" vs "Stale Agent". **Add UI Warning** for missing workspace agents. | S | T1,T2 | Disconnect agents, submit task -> UI Warning |


## Verification Tasks (E2E)

| ID | Title | Size | Deps | Verify |
|----|-------|------|------|--------|
| V1 | **E2E: Specialist Assignment**<br>Spin up 2 agents (Specialist, Generalist). Submit task matching specialist. Verify assignment. | M | T3 | `pnpm test -- packages/mcp-server/tests/scheduler.e2e.ts --grep "specialist"` |
| V2 | **E2E: Long Running Task**<br>Agent takes >2m to complete task. Verify it doesn't go stale or get reassigned. | M | T1,T4 | `pnpm test -- packages/mcp-server/tests/heartbeat.e2e.ts --grep "stale"` |
| V3 | **Unit: Debounce Verification** | S | T1 | `pnpm test -- packages/mcp-server/tests/heartbeat.test.ts --grep "debounce"` |
