import { describe, it, expect } from 'vitest';
import { WAAAHError, toMCPError, isWAAAHError } from '../src/errors';

describe('WAAAHError', () => {
  it('should create an error with code and message', () => {
    const error = new WAAAHError('Test error', 'INTERNAL');
    expect(error.message).toBe('Test error');
    expect(error.code).toBe('INTERNAL');
    expect(error.name).toBe('WAAAHError');
  });

  it('should include details if provided', () => {
    const details = { foo: 'bar' };
    const error = new WAAAHError('Test error', 'INTERNAL', details);
    expect(error.details).toEqual(details);
  });

  describe('Factory methods', () => {
    it('validation() should create VALIDATION error', () => {
      const error = WAAAHError.validation('Invalid input', { field: 'email' });
      expect(error.code).toBe('VALIDATION');
      expect(error.message).toBe('Invalid input');
      expect(error.details).toEqual({ field: 'email' });
    });

    it('notFound() should create NOT_FOUND error', () => {
      const error = WAAAHError.notFound('User', '123');
      expect(error.code).toBe('NOT_FOUND');
      expect(error.message).toContain("User '123' not found");
      expect(error.details).toEqual({ resource: 'User', id: '123' });
    });

    it('notFound() should handle missing id', () => {
      const error = WAAAHError.notFound('Page');
      expect(error.code).toBe('NOT_FOUND');
      expect(error.message).toBe('Page not found');
    });

    it('permission() should create PERMISSION error', () => {
      const error = WAAAHError.permission('Access denied');
      expect(error.code).toBe('PERMISSION');
      expect(error.message).toBe('Access denied');
    });

    it('timeout() should create TIMEOUT error', () => {
      const error = WAAAHError.timeout('Task', 5000);
      expect(error.code).toBe('TIMEOUT');
      expect(error.message).toContain('Task timed out after 5000ms');
      expect(error.details).toEqual({ operation: 'Task', timeoutMs: 5000 });
    });
  });
});

describe('toMCPError', () => {
  it('should convert WAAAHError to MCPErrorResponse', () => {
    const error = new WAAAHError('Something went wrong', 'INTERNAL');
    const mcpError = toMCPError(error);
    expect(mcpError.isError).toBe(true);
    expect(mcpError.content[0].text).toContain('[INTERNAL] Something went wrong');
  });

  it('should convert standard Error to MCPErrorResponse', () => {
    const error = new Error('Standard error');
    const mcpError = toMCPError(error);
    expect(mcpError.isError).toBe(true);
    expect(mcpError.content[0].text).toContain('Error: Standard error');
  });

  it('should convert string/unknown to MCPErrorResponse', () => {
    const mcpError = toMCPError('String error');
    expect(mcpError.isError).toBe(true);
    expect(mcpError.content[0].text).toContain('Error: String error');
  });
});

describe('isWAAAHError', () => {
  it('should return true for WAAAHError', () => {
    const error = new WAAAHError('Test', 'INTERNAL');
    expect(isWAAAHError(error)).toBe(true);
  });

  it('should return false for standard Error', () => {
    expect(isWAAAHError(new Error('Test'))).toBe(false);
  });

  it('should filter by code if provided', () => {
    const error = new WAAAHError('Test', 'INTERNAL');
    expect(isWAAAHError(error, 'INTERNAL')).toBe(true);
    expect(isWAAAHError(error, 'VALIDATION')).toBe(false);
  });
});
