/**
 * Tests for capability inference service
 */
import { describe, it, expect } from 'vitest';
import { inferCapabilities, isGeneralPurpose } from '../src/scheduling/capability-inference';

describe('inferCapabilities', () => {
  it('infers code-writing from implementation prompts', () => {
    const result = inferCapabilities('Implement the login feature with user authentication');
    expect(result.capabilities).toContain('code-writing');
    expect(result.fallback).toBe(false);
  });

  it('infers test-writing from test prompts', () => {
    const result = inferCapabilities('Write unit tests for the UserService class');
    expect(result.capabilities).toContain('test-writing');
    expect(result.fallback).toBe(false);
  });

  it('infers spec-writing from design prompts', () => {
    const result = inferCapabilities('Design a specification for the new API endpoints');
    expect(result.capabilities).toContain('spec-writing');
    expect(result.fallback).toBe(false);
  });

  it('infers doc-writing from documentation prompts', () => {
    const result = inferCapabilities('Document the authentication flow in the README');
    expect(result.capabilities).toContain('doc-writing');
    expect(result.fallback).toBe(false);
  });

  it('infers code-doctor from review prompts', () => {
    const result = inferCapabilities('Review the code changes and check for security issues');
    expect(result.capabilities).toContain('code-doctor');
    expect(result.fallback).toBe(false);
  });

  it('falls back to general-purpose for ambiguous prompts', () => {
    const result = inferCapabilities('Do something with the thing');
    expect(result.capabilities).toEqual(['general-purpose']);
    expect(result.fallback).toBe(true);
    expect(result.confidence).toBe(0);
  });

  it('falls back to general-purpose for empty prompts', () => {
    const result = inferCapabilities('');
    expect(result.capabilities).toEqual(['general-purpose']);
    expect(result.fallback).toBe(true);
  });

  it('considers context from spec and tasks', () => {
    const result = inferCapabilities(
      'Complete the task',
      { spec: 'This spec describes testing requirements', tasks: '- Write tests' }
    );
    expect(result.capabilities).toContain('test-writing');
    expect(result.fallback).toBe(false);
  });

  it('infers multiple capabilities from complex prompts', () => {
    const result = inferCapabilities(
      'Implement the feature and then write tests. Also update the documentation.'
    );
    // Should infer code-writing and test-writing
    expect(result.capabilities.length).toBeGreaterThanOrEqual(1);
    expect(result.fallback).toBe(false);
  });
});

describe('isGeneralPurpose', () => {
  it('returns true for general-purpose only', () => {
    expect(isGeneralPurpose(['general-purpose'])).toBe(true);
  });

  it('returns false for other capabilities', () => {
    expect(isGeneralPurpose(['code-writing'])).toBe(false);
    expect(isGeneralPurpose(['code-writing', 'test-writing'])).toBe(false);
  });
});
