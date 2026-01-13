/**
 * Routes Index Tests
 *
 * Tests for route module exports.
 */

import { describe, it, expect } from 'vitest';
import * as routes from '../src/routes/index.js';

describe('Routes Index', () => {
  it('exports createTaskRoutes', () => {
    expect(routes.createTaskRoutes).toBeDefined();
    expect(typeof routes.createTaskRoutes).toBe('function');
  });

  it('exports createReviewRoutes', () => {
    expect(routes.createReviewRoutes).toBeDefined();
    expect(typeof routes.createReviewRoutes).toBe('function');
  });

  it('exports createAgentRoutes', () => {
    expect(routes.createAgentRoutes).toBeDefined();
    expect(typeof routes.createAgentRoutes).toBe('function');
  });

  it('exports createSSERoutes', () => {
    expect(routes.createSSERoutes).toBeDefined();
    expect(typeof routes.createSSERoutes).toBe('function');
  });

  it('exports createToolRouter', () => {
    expect(routes.createToolRouter).toBeDefined();
    expect(typeof routes.createToolRouter).toBe('function');
  });

  it('exports all expected route factories', () => {
    const expectedExports = [
      'createTaskRoutes',
      'createReviewRoutes',
      'createAgentRoutes',
      'createSSERoutes',
      'createToolRouter'
    ];

    expectedExports.forEach(name => {
      expect(routes).toHaveProperty(name);
    });
  });
});
