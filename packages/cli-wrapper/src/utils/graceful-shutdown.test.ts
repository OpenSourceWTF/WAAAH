import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GracefulShutdown, GracefulShutdownOptions } from './graceful-shutdown';
import { SessionManager } from '../session/manager';

// Mock process methods
const originalProcessOn = process.on;
const originalProcessRemoveListener = process.removeListener;
const originalProcessExit = process.exit;

describe('GracefulShutdown', () => {
  let gracefulShutdown: GracefulShutdown;
  let mockSessionManager: SessionManager;
  let mockKillAgent: () => Promise<void>;
  let mockGetSessionState: () => any;
  let mockOnLog: (message: string) => void;
  let exitSpy: any;

  beforeEach(() => {
    mockSessionManager = {
      save: vi.fn().mockResolvedValue(undefined),
    } as any;
    mockKillAgent = vi.fn().mockResolvedValue(undefined);
    mockGetSessionState = vi.fn().mockReturnValue({ id: 'test-session' });
    mockOnLog = vi.fn();

    const options: GracefulShutdownOptions = {
      sessionManager: mockSessionManager,
      killAgent: mockKillAgent,
      getSessionState: mockGetSessionState,
      onLog: mockOnLog,
      killTimeoutMs: 100, // Short timeout for testing
    };

    gracefulShutdown = new GracefulShutdown(options);

    // Mock process
    process.on = vi.fn();
    process.removeListener = vi.fn();
    process.exit = vi.fn() as any;
    exitSpy = process.exit;
  });

  afterEach(() => {
    process.on = originalProcessOn;
    process.removeListener = originalProcessRemoveListener;
    process.exit = originalProcessExit;
    vi.restoreAllMocks();
  });

  it('should install signal handlers', () => {
    gracefulShutdown.install();
    expect(process.on).toHaveBeenCalledWith('SIGINT', expect.any(Function));
    expect(process.on).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
    expect(process.on).toHaveBeenCalledWith('exit', expect.any(Function));
  });

  it('should uninstall signal handlers', () => {
    gracefulShutdown.install();
    gracefulShutdown.uninstall();
    expect(process.removeListener).toHaveBeenCalledWith('SIGINT', expect.any(Function));
    expect(process.removeListener).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
  });

  it('should trigger shutdown manually', async () => {
    const result = await gracefulShutdown.triggerShutdown();
    expect(result.success).toBe(true);
    expect(result.sessionSaved).toBe(true);
    expect(result.sessionId).toBe('test-session');
    expect(mockSessionManager.save).toHaveBeenCalled();
    expect(mockKillAgent).toHaveBeenCalled();
  });

  it('should handle missing session state', async () => {
    mockGetSessionState.mockReturnValue(null);
    const result = await gracefulShutdown.triggerShutdown();
    expect(result.success).toBe(true);
    expect(result.sessionSaved).toBe(false);
    expect(mockKillAgent).toHaveBeenCalled();
  });

  it('should handle kill errors', async () => {
    mockKillAgent.mockRejectedValue(new Error('Kill failed'));
    const result = await gracefulShutdown.triggerShutdown();
    expect(result.success).toBe(false);
    expect(result.error).toBe('Kill failed');
  });
});
