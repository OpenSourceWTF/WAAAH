/**
 * Shared error types for consistent error handling across WAAAH packages.
 */

/**
 * Error codes for categorizing WAAAH errors
 */
export type WAAAHErrorCode =
  | 'VALIDATION'    // Input validation failures
  | 'NOT_FOUND'     // Resource not found
  | 'PERMISSION'    // Authorization/permission denied
  | 'NETWORK'       // Network/connectivity issues
  | 'TIMEOUT'       // Operation timeout
  | 'INTERNAL';     // Internal server errors

/**
 * Custom error class for WAAAH system errors.
 * Provides structured error information for consistent handling.
 */
export class WAAAHError extends Error {
  constructor(
    message: string,
    public readonly code: WAAAHErrorCode,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'WAAAHError';
  }

  /**
   * Create a validation error
   */
  static validation(message: string, details?: Record<string, unknown>): WAAAHError {
    return new WAAAHError(message, 'VALIDATION', details);
  }

  /**
   * Create a not found error
   */
  static notFound(resource: string, id?: string): WAAAHError {
    const message = id ? `${resource} '${id}' not found` : `${resource} not found`;
    return new WAAAHError(message, 'NOT_FOUND', { resource, id });
  }

  /**
   * Create a permission denied error
   */
  static permission(message: string, details?: Record<string, unknown>): WAAAHError {
    return new WAAAHError(message, 'PERMISSION', details);
  }

  /**
   * Create a timeout error
   */
  static timeout(operation: string, timeoutMs: number): WAAAHError {
    return new WAAAHError(`${operation} timed out after ${timeoutMs}ms`, 'TIMEOUT', { operation, timeoutMs });
  }
}

/**
 * Standard MCP tool error response format
 */
export interface MCPErrorResponse {
  content: { type: 'text'; text: string }[];
  isError: true;
}

/**
 * Convert any error to a standard MCP tool error response
 */
export function toMCPError(error: unknown): MCPErrorResponse {
  let message: string;

  if (error instanceof WAAAHError) {
    message = `[${error.code}] ${error.message}`;
  } else if (error instanceof Error) {
    message = error.message;
  } else {
    message = String(error);
  }

  return {
    content: [{ type: 'text', text: `Error: ${message}` }],
    isError: true
  };
}

/**
 * Check if an error is a WAAAHError with a specific code
 */
export function isWAAAHError(error: unknown, code?: WAAAHErrorCode): error is WAAAHError {
  if (!(error instanceof WAAAHError)) return false;
  if (code && error.code !== code) return false;
  return true;
}
