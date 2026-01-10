/**
 * Centralized constants for the MCP Server.
 * 
 * Consolidates magic numbers and configuration defaults to a single location
 * for easier maintenance and configuration.
 * 
 * @module state/constants
 */

// ===== Timeout Constants =====

/** Default timeout for wait_for_prompt (long-polling). 290 seconds. */
export const DEFAULT_PROMPT_TIMEOUT_MS = 290000;

/** Maximum allowed prompt timeout. 500 seconds. */
export const MAX_PROMPT_TIMEOUT_MS = 500000;

/** Default timeout for wait_for_task_completion. 300 seconds. */
export const DEFAULT_TASK_WAIT_TIMEOUT_MS = 300000;

/** Timeout for ACK before task is requeued. 30 seconds. */
export const ACK_TIMEOUT_MS = 30000;

/** Scheduler interval for periodic tasks. 10 seconds. */
export const SCHEDULER_INTERVAL_MS = 10000;

/** Agent considered orphaned after this time offline. 5 minutes. */
export const ORPHAN_TIMEOUT_MS = 5 * 60 * 1000;

/** Task considered stale if no progress update for this long. 15 minutes. */
export const ASSIGNED_TIMEOUT_MS = 15 * 60 * 1000;

// ===== Database Constants =====

/** Default port for the server. */
export const DEFAULT_PORT = 3000;
