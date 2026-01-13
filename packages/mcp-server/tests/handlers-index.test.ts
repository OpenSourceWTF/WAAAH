/**
 * Handlers Index Tests
 *
 * Tests for handler module exports.
 */

import { describe, it, expect } from 'vitest';
import * as handlers from '../src/mcp/handlers/index.js';

describe('Handlers Index', () => {
  it('exports AgentHandlers', () => {
    expect(handlers.AgentHandlers).toBeDefined();
    expect(typeof handlers.AgentHandlers).toBe('function');
  });

  it('exports TaskHandlers', () => {
    expect(handlers.TaskHandlers).toBeDefined();
    expect(typeof handlers.TaskHandlers).toBe('function');
  });

  it('exports ReviewHandlers', () => {
    expect(handlers.ReviewHandlers).toBeDefined();
    expect(typeof handlers.ReviewHandlers).toBe('function');
  });

  it('exports all expected handler classes', () => {
    const expectedExports = [
      'AgentHandlers',
      'TaskHandlers',
      'ReviewHandlers'
    ];

    expectedExports.forEach(name => {
      expect(handlers).toHaveProperty(name);
    });
  });

  it('AgentHandlers can be instantiated', () => {
    const mockQueue = { on: () => {}, emit: () => {} };
    const mockRegistry = { register: () => {}, getAll: () => [] };
    const mockScheduler = { tick: () => {} };
    const instance = new handlers.AgentHandlers(mockQueue as any, mockRegistry as any, mockScheduler as any);
    expect(instance).toBeDefined();
  });

  it('TaskHandlers can be instantiated', () => {
    const mockQueue = { enqueue: () => {} };
    const instance = new handlers.TaskHandlers(mockQueue as any);
    expect(instance).toBeDefined();
  });

  it('ReviewHandlers can be instantiated', () => {
    const mockQueue = { updateStatus: () => {} };
    const instance = new handlers.ReviewHandlers(mockQueue as any);
    expect(instance).toBeDefined();
  });
});
