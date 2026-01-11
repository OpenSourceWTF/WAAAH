import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GracefulShutdown } from './graceful-shutdown.js';
import { SessionManager } from '../session/manager.js';

describe('GracefulShutdown', () => {
  let shutdown: GracefulShutdown;
  let mockSessionManager: SessionManager;
  let mockKillAgent: any;
  let mockGetSessionState: any;
  let mockOnLog: any;

  beforeEach(() => {
    mockSessionManager = {
      save: vi.fn().mockResolvedValue(undefined),
    } as any;

    mockKillAgent = vi.fn().mockResolvedValue(undefined);
    mockGetSessionState = vi.fn().mockReturnValue({ id: 'test-session' });
    mockOnLog = vi.fn();

    shutdown = new GracefulShutdown({
      sessionManager: mockSessionManager,
      killAgent: mockKillAgent,
      getSessionState: mockGetSessionState,
      onLog: mockOnLog,
      killTimeoutMs: 100,
    });
    
    // Mock process.on/removeListener/exit
    vi.spyOn(process, 'on').mockImplementation(() => process);
    vi.spyOn(process, 'removeListener').mockImplementation(() => process);
    vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should install signal handlers', () => {
    shutdown.install();
    expect(process.on).toHaveBeenCalledWith('SIGINT', expect.any(Function));
    expect(process.on).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
  });

  it('should uninstall signal handlers', () => {
    shutdown.install();
    shutdown.uninstall();
    expect(process.removeListener).toHaveBeenCalledWith('SIGINT', expect.any(Function));
    expect(process.removeListener).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
  });

  it('should perform shutdown successfully', async () => {
    const result = await shutdown.performShutdown();
    expect(result.success).toBe(true);
    expect(result.sessionSaved).toBe(true);
    expect(mockSessionManager.save).toHaveBeenCalled();
    expect(mockKillAgent).toHaveBeenCalled();
  });

  it('should handle shutdown failure', async () => {
    mockKillAgent.mockRejectedValue(new Error('Kill failed'));
    const result = await shutdown.performShutdown();
    expect(result.success).toBe(false);
    expect(result.error).toBe('Kill failed');
  });

  it('should handle manual trigger', async () => {
    const result = await shutdown.triggerShutdown();
    expect(result.success).toBe(true);
    expect(shutdown.isShutdownInProgress()).toBe(true);
  });
});
